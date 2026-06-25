import { safeJSONStringify } from "./config/state.js";
import { SYSTEM_PROMPT, TOOL_SCHEMA } from "./config/state.js";

export function contentPartsToText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      if (typeof part.text === "string") {
        return part.text;
      }

      if (part.type === "text" && typeof part.text === "string") {
        return part.text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function extractMessageEnvelope(result) {
  if (!result || !result.payload) {
    return null;
  }

  const payload = result.payload;

  if (payload.choices && payload.choices[0] && payload.choices[0].message) {
    return payload.choices[0].message;
  }

  if (payload.message) {
    return payload.message;
  }

  return null;
}

export function normalizeAssistantReply(result) {
  const message = extractMessageEnvelope(result);
  const rawPayload = result && result.payload ? result.payload : null;
  const rawText = result && result.rawText ? result.rawText : "";

  if (!message) {
    return {
      text: rawText || safeJSONStringify(rawPayload),
      toolCalls: [],
      rawAssistant: rawText || safeJSONStringify(rawPayload),
      originalMessage: null
    };
  }

  const text = contentPartsToText(message.content);
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls
    : Array.isArray(message.toolCalls)
      ? message.toolCalls
      : [];

  const normalizedCalls = toolCalls.map((call, index) => {
    const fn = call && call.function ? call.function : call || {};

    return {
      id: call && call.id ? call.id : "tool_" + Date.now() + "_" + index,
      name: fn.name || call.name || "",
      rawArgs: fn.arguments !== undefined ? fn.arguments : call.arguments,
      original: call
    };
  });

  return {
    text: text || "",
    toolCalls: normalizedCalls,
    rawAssistant: rawText || safeJSONStringify(rawPayload),
    originalMessage: message
  };
}

export function parseToolArguments(rawArgs) {
  if (rawArgs && typeof rawArgs === "object") {
    return { ok: true, value: rawArgs };
  }

  if (typeof rawArgs !== "string") {
    return { ok: true, value: {} };
  }

  const trimmed = rawArgs.trim();

  if (!trimmed) {
    return { ok: true, value: {} };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(trimmed)
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

export function createLLMClient({ getApiKey, getSelectedModel, getApiEndpoint }) {
  async function callLLM(messages) {
    const apiKey = getApiKey().trim();
    const model = getSelectedModel();
    const endpoint = getApiEndpoint();

    if (!apiKey) {
      throw new Error("API key is required.");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages
        ],
        tools: TOOL_SCHEMA,
        tool_choice: "auto"
      })
    });

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (error) {
      return {
        ok: false,
        error: "Malformed JSON response from API.",
        rawText: responseText
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: (data && data.error && data.error.message) || ("Request failed with status " + response.status + "."),
        rawText: responseText,
        payload: data
      };
    }

    return {
      ok: true,
      payload: data,
      rawText: responseText
    };
  }

  // Streaming variant. Honors an AbortSignal for cancellation. Yields normalized
  // deltas; consumers feed them to createStreamAccumulator() and call finalize()
  // to get the same shape normalizeAssistantReply returns.
  async function* callLLMStream(messages, { signal } = {}) {
    const apiKey = getApiKey().trim();
    const model = getSelectedModel();
    const endpoint = getApiEndpoint();

    if (!apiKey) {
      throw new Error("API key is required.");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages
        ],
        tools: TOOL_SCHEMA,
        tool_choice: "auto"
      }),
      signal
    });

    if (!response.ok || !response.body) {
      let responseText = "";
      try {
        responseText = await response.text();
      } catch (e) {
        // ignore body read failure
      }
      const err = new Error("Request failed with status " + response.status + ".");
      err.rawText = responseText;
      err.status = response.status;
      throw err;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let sawDone = false;

    try {
      while (!sawDone) {
        if (signal && signal.aborted) {
          throw Object.assign(new Error("Aborted"), { name: "AbortError" });
        }

        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        // Normalize CRLF so chunk boundaries inside "\r\n" don't break parsing.
        buffer = buffer.replace(/\r\n/g, "\n");

        const { events, remainder } = parseSSEBuffer(buffer);
        buffer = remainder;

        for (const evt of events) {
          const delta = deltaFromChunk(evt);
          if (!delta) {
            continue;
          }
          if (delta.done) {
            sawDone = true;
            break;
          }
          yield delta;
        }
      }
    } finally {
      // Release the reader lock if the consumer abandons the iterator early
      // (e.g. via break) so the underlying body stream isn't held open.
      try {
        reader.releaseLock();
      } catch (e) {
        // already released or stream errored — nothing to do
      }
    }
  }

  return {
    callLLM,
    callLLMStream,
    normalizeAssistantReply,
    parseToolArguments
  };
}

/**
 * Parse an accumulated SSE byte-buffer (as a string) into complete events plus a
 * leftover remainder. Pure and side-effect free so it can be unit tested without
 * a network or DOM. Events are separated by a blank line; each event may carry
 * one or more "data:" lines which concatenate with "\n" per the SSE spec.
 */
export function parseSSEBuffer(buffer) {
  const events = [];

  if (typeof buffer !== "string" || buffer.length === 0) {
    return { events, remainder: "" };
  }

  const sepIndex = buffer.lastIndexOf("\n\n");
  let completeBlock;
  let remainder;

  if (sepIndex === -1) {
    completeBlock = "";
    remainder = buffer;
  } else {
    completeBlock = buffer.slice(0, sepIndex);
    remainder = buffer.slice(sepIndex + 2);
  }

  if (completeBlock) {
    const blocks = completeBlock.split("\n\n");
    for (const block of blocks) {
      const dataLines = [];
      const lines = block.split("\n");
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (dataLines.length > 0) {
        events.push(dataLines.join("\n"));
      }
    }
  }

  return { events, remainder };
}

/**
 * Convert one parsed SSE data payload into a normalized delta (or null to skip).
 * Pure function. Returns one of:
 *   { done: true }                                  when payload is "[DONE]"
 *   { parseError, raw }                             when JSON could not be parsed
 *   { textDelta?, toolCallDeltas?, finishReason?, usage? }  a streamed delta
 *   null                                            for empty/whitespace payloads
 */
export function deltaFromChunk(dataString) {
  if (typeof dataString !== "string") {
    return null;
  }

  const trimmed = dataString.trim();

  if (trimmed === "[DONE]") {
    return { done: true };
  }

  if (!trimmed) {
    return null;
  }

  let chunk;
  try {
    chunk = JSON.parse(trimmed);
  } catch (error) {
    return { parseError: error.message, raw: trimmed };
  }

  const choice = chunk && Array.isArray(chunk.choices) && chunk.choices.length > 0 ? chunk.choices[0] : null;
  const delta = choice && choice.delta ? choice.delta : {};
  const out = {};

  if (typeof delta.content === "string" && delta.content.length > 0) {
    out.textDelta = delta.content;
  }

  if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
    out.toolCallDeltas = delta.tool_calls.map((tc) => ({
      index: tc && typeof tc.index === "number" ? tc.index : 0,
      id: tc && tc.id ? tc.id : undefined,
      nameDelta: tc && tc.function && typeof tc.function.name === "string" ? tc.function.name : undefined,
      argsDelta: tc && tc.function && typeof tc.function.arguments === "string" ? tc.function.arguments : undefined
    }));
  }

  if (choice && choice.finish_reason) {
    out.finishReason = choice.finish_reason;
  }

  if (chunk && chunk.usage) {
    out.usage = chunk.usage;
  }

  return out;
}

/**
 * Mutable accumulator for streamed deltas. finalize() returns a shape identical
 * to normalizeAssistantReply() so the agent loop can treat both paths uniformly:
 *   { text, toolCalls: [{ id, name, rawArgs, original }], rawAssistant, originalMessage, finishReason?, usage? }
 */
export function createStreamAccumulator() {
  let text = "";
  const toolCalls = new Map();
  let finishReason = null;
  let usage = null;

  function addDelta(delta) {
    if (!delta || delta.done) {
      return;
    }

    if (delta.textDelta) {
      text += delta.textDelta;
    }

    if (Array.isArray(delta.toolCallDeltas)) {
      for (const tcd of delta.toolCallDeltas) {
        const index = typeof tcd.index === "number" ? tcd.index : 0;
        let entry = toolCalls.get(index);
        if (!entry) {
          entry = { id: null, name: "", rawArgs: "" };
          toolCalls.set(index, entry);
        }
        if (tcd.id) {
          entry.id = tcd.id;
        }
        if (tcd.nameDelta) {
          entry.name += tcd.nameDelta;
        }
        if (tcd.argsDelta) {
          entry.rawArgs += tcd.argsDelta;
        }
      }
    }

    if (delta.finishReason) {
      finishReason = delta.finishReason;
    }

    if (delta.usage) {
      usage = delta.usage;
    }
  }

  function finalize() {
    const sortedIndices = [...toolCalls.keys()].sort((a, b) => a - b);
    const normalizedCalls = sortedIndices.map((index, i) => {
      const entry = toolCalls.get(index);
      const id = entry.id || ("stream_tool_" + Date.now() + "_" + i);
      return {
        id,
        name: entry.name,
        rawArgs: entry.rawArgs,
        original: {
          id: entry.id || null,
          type: "function",
          function: { name: entry.name, arguments: entry.rawArgs }
        }
      };
    });

    return {
      text,
      toolCalls: normalizedCalls,
      rawAssistant: text,
      originalMessage: null,
      finishReason,
      usage
    };
  }

  return { addDelta, finalize };
}
