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

  return {
    callLLM,
    normalizeAssistantReply,
    parseToolArguments
  };
}
