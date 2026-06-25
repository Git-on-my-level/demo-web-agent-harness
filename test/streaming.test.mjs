// Self-contained tests for the streaming SSE layer. No network, no DOM.
// Run with: node test/streaming.test.mjs
import assert from "node:assert/strict";
import { parseSSEBuffer, deltaFromChunk, createStreamAccumulator } from "../src/harness/llm.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  \u2713 " + name);
  } catch (error) {
    failed += 1;
    console.log("  \u2717 " + name);
    console.log("      " + (error && error.stack ? error.stack.split("\n").slice(0, 4).join("\n      ") : error));
  }
}

function eq(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message);
}

// ─── parseSSEBuffer ──────────────────────────────────────────────────────────

test("parseSSEBuffer: empty input yields no events", () => {
  eq(parseSSEBuffer(""), { events: [], remainder: "" });
  eq(parseSSEBuffer(null), { events: [], remainder: "" });
});

test("parseSSEBuffer: single complete event", () => {
  const buf = 'data: {"hello":1}\n\n';
  const { events, remainder } = parseSSEBuffer(buf);
  eq(events, ['{"hello":1}']);
  eq(remainder, "");
});

test("parseSSEBuffer: multiple events in one buffer", () => {
  const buf = 'data: {"a":1}\n\ndata: {"b":2}\n\n';
  const { events, remainder } = parseSSEBuffer(buf);
  eq(events, ['{"a":1}', '{"b":2}']);
  eq(remainder, "");
});

test("parseSSEBuffer: partial trailing event kept as remainder", () => {
  const buf = 'data: {"a":1}\n\ndata: {"b":2';
  const { events, remainder } = parseSSEBuffer(buf);
  eq(events, ['{"a":1}']);
  eq(remainder, 'data: {"b":2');
});

test("parseSSEBuffer: handles [DONE] payload", () => {
  const buf = "data: [DONE]\n\n";
  const { events } = parseSSEBuffer(buf);
  eq(events, ["[DONE]"]);
});

test("parseSSEBuffer: multiple data lines concatenate with newline", () => {
  const buf = "data: line1\ndata: line2\n\n";
  const { events } = parseSSEBuffer(buf);
  eq(events, ["line1\nline2"]);
});

test("parseSSEBuffer: tolerates leading space after data:", () => {
  const buf = 'data: {"x":true}\n\n';
  const { events } = parseSSEBuffer(buf);
  eq(events, ['{"x":true}']);
});

test("parseSSEBuffer: ignores non-data lines (comments/event tags)", () => {
  const buf = ": ping\n\nevent: chunk\ndata: {\"ok\":1}\n\n";
  const { events } = parseSSEBuffer(buf);
  eq(events, ['{"ok":1}']);
});

// ─── deltaFromChunk ──────────────────────────────────────────────────────────

test("deltaFromChunk: [DONE] sentinel", () => {
  eq(deltaFromChunk("[DONE]"), { done: true });
});

test("deltaFromChunk: empty / non-string returns null", () => {
  eq(deltaFromChunk(""), null);
  eq(deltaFromChunk("   "), null);
  eq(deltaFromChunk(null), null);
  eq(deltaFromChunk(undefined), null);
});

test("deltaFromChunk: text content delta", () => {
  const payload = JSON.stringify({ choices: [{ index: 0, delta: { content: "Hello" } }] });
  eq(deltaFromChunk(payload), { textDelta: "Hello" });
});

test("deltaFromChunk: empty content string produces no textDelta", () => {
  const payload = JSON.stringify({ choices: [{ index: 0, delta: { content: "" } }] });
  eq(deltaFromChunk(payload), {});
});

test("deltaFromChunk: tool-call start (id + name + empty args)", () => {
  const payload = JSON.stringify({
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            { index: 0, id: "call_1", type: "function", function: { name: "set_world", arguments: "" } }
          ]
        }
      }
    ]
  });
  eq(deltaFromChunk(payload), {
    toolCallDeltas: [{ index: 0, id: "call_1", nameDelta: "set_world", argsDelta: "" }]
  });
});

test("deltaFromChunk: tool-call args fragment only", () => {
  const payload = JSON.stringify({
    choices: [
      { index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"html":"<div' } }] } }
    ]
  });
  eq(deltaFromChunk(payload), {
    toolCallDeltas: [{ index: 0, id: undefined, nameDelta: undefined, argsDelta: '{"html":"<div' }]
  });
});

test("deltaFromChunk: captures finish_reason and usage", () => {
  const payload = JSON.stringify({
    choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
    usage: { prompt_tokens: 10, completion_tokens: 5 }
  });
  eq(deltaFromChunk(payload), {
    finishReason: "tool_calls",
    usage: { prompt_tokens: 10, completion_tokens: 5 }
  });
});

test("deltaFromChunk: malformed JSON returns parseError", () => {
  const out = deltaFromChunk("{not json");
  assert.ok(out && out.parseError, "expected parseError");
  eq(out.raw, "{not json");
});

test("deltaFromChunk: missing choices yields empty delta", () => {
  eq(deltaFromChunk(JSON.stringify({})), {});
});

// ─── createStreamAccumulator ─────────────────────────────────────────────────

test("accumulator: text deltas concatenate", () => {
  const acc = createStreamAccumulator();
  acc.addDelta({ textDelta: "Hello" });
  acc.addDelta({ textDelta: ", " });
  acc.addDelta({ textDelta: "world!" });
  const final = acc.finalize();
  eq(final.text, "Hello, world!");
  eq(final.toolCalls, []);
  eq(final.originalMessage, null);
});

test("accumulator: tool call args accumulate across fragments", () => {
  const acc = createStreamAccumulator();
  acc.addDelta({ toolCallDeltas: [{ index: 0, id: "call_1", nameDelta: "set_world" }] });
  acc.addDelta({ toolCallDeltas: [{ index: 0, argsDelta: '{"html":"<div' }] });
  acc.addDelta({ toolCallDeltas: [{ index: 0, argsDelta: ' class=\\"x\\">hi</div>"}' }] });
  const final = acc.finalize();
  eq(final.toolCalls.length, 1);
  eq(final.toolCalls[0].id, "call_1");
  eq(final.toolCalls[0].name, "set_world");
  eq(final.toolCalls[0].rawArgs, '{"html":"<div class=\\"x\\">hi</div>"}');
  // rawArgs must be valid JSON (the whole point of fragment accumulation)
  const parsed = JSON.parse(final.toolCalls[0].rawArgs);
  eq(parsed.html, '<div class="x">hi</div>');
});

test("accumulator: multiple tool calls keyed by index, ordered stably", () => {
  const acc = createStreamAccumulator();
  acc.addDelta({ toolCallDeltas: [{ index: 1, id: "b", nameDelta: "tool_b" }] });
  acc.addDelta({ toolCallDeltas: [{ index: 0, id: "a", nameDelta: "tool_a" }] });
  acc.addDelta({ toolCallDeltas: [{ index: 0, argsDelta: "{}" }] });
  acc.addDelta({ toolCallDeltas: [{ index: 1, argsDelta: "{}" }] });
  const final = acc.finalize();
  eq(final.toolCalls.length, 2);
  eq(final.toolCalls[0].name, "tool_a");
  eq(final.toolCalls[1].name, "tool_b");
});

test("accumulator: synthesizes an id when the stream omits one", () => {
  const acc = createStreamAccumulator();
  acc.addDelta({ toolCallDeltas: [{ index: 0, nameDelta: "run_js", argsDelta: "{}" }] });
  const final = acc.finalize();
  assert.ok(final.toolCalls[0].id, "expected a synthesized id");
  assert.match(final.toolCalls[0].id, /^stream_tool_/);
});

test("accumulator: captures finishReason and usage", () => {
  const acc = createStreamAccumulator();
  acc.addDelta({ textDelta: "done" });
  acc.addDelta({ finishReason: "stop" });
  acc.addDelta({ usage: { prompt_tokens: 3, completion_tokens: 1 } });
  const final = acc.finalize();
  eq(final.finishReason, "stop");
  eq(final.usage, { prompt_tokens: 3, completion_tokens: 1 });
});

test("accumulator: ignores done/empty deltas", () => {
  const acc = createStreamAccumulator();
  acc.addDelta({ done: true });
  acc.addDelta(null);
  acc.addDelta({});
  eq(acc.finalize().text, "");
});

test("accumulator: finalize shape matches normalizeAssistantReply contract", () => {
  const acc = createStreamAccumulator();
  acc.addDelta({ textDelta: "hi" });
  acc.addDelta({ toolCallDeltas: [{ index: 0, id: "c1", nameDelta: "read_world", argsDelta: "{}" }] });
  const final = acc.finalize();
  assert.ok(typeof final.text === "string");
  assert.ok(Array.isArray(final.toolCalls));
  assert.ok(final.toolCalls[0].original && final.toolCalls[0].original.function);
  eq(final.toolCalls[0].original.function.name, "read_world");
});

// ─── Integration: realistic stream fed in arbitrary chunk sizes ───────────────

// Builds a realistic OpenAI/z.ai-style SSE byte stream: text preamble + a tool
// call whose arguments arrive as multiple fragments + finish_reason + [DONE].
function buildRealisticStream() {
  const chunks = [
    { choices: [{ index: 0, delta: { role: "assistant", content: "Sure, " } }] },
    { choices: [{ index: 0, delta: { content: "updating the world now." } }] },
    {
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              { index: 0, id: "call_abc", type: "function", function: { name: "set_world", arguments: "" } }
            ]
          }
        }
      ]
    },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"html":' } }] } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"<h1>Hi</h1>"' } }] } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: ",\"css\":\"body{color:red}\"}" } }] } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }
  ];
  let s = "";
  for (const c of chunks) s += "data: " + JSON.stringify(c) + "\n\n";
  s += "data: [DONE]\n\n";
  return s;
}

// Feeds the full stream through parseSSEBuffer + deltaFromChunk + accumulator in
// fixed-size slices, proving the parser is robust to arbitrary chunk splits.
// CRLF is normalized the same way callLLMStream does it before parsing.
function simulateStream(fullStream, chunkSize) {
  const acc = createStreamAccumulator();
  let buffer = "";
  for (let i = 0; i < fullStream.length; i += chunkSize) {
    buffer += fullStream.slice(i, i + chunkSize);
    buffer = buffer.replace(/\r\n/g, "\n");
    const { events, remainder } = parseSSEBuffer(buffer);
    buffer = remainder;
    for (const evt of events) {
      const delta = deltaFromChunk(evt);
      if (!delta || delta.done) continue;
      acc.addDelta(delta);
    }
  }
  // flush any remainder (trailing partial without \n\n) — real streams end clean
  return acc.finalize();
}

for (const size of [1, 3, 7, 13, 50, 100, 1000]) {
  test("end-to-end stream reconstruction at chunk size " + size, () => {
    const final = simulateStream(buildRealisticStream(), size);
    eq(final.text, "Sure, updating the world now.");
    eq(final.toolCalls.length, 1);
    eq(final.toolCalls[0].id, "call_abc");
    eq(final.toolCalls[0].name, "set_world");
    eq(final.finishReason, "tool_calls");
    // Reassembled args must be valid JSON with both fields intact.
    const args = JSON.parse(final.toolCalls[0].rawArgs);
    eq(args.html, "<h1>Hi</h1>");
    eq(args.css, "body{color:red}");
  });
}

test("end-to-end: different chunk sizes produce identical results", () => {
  const stream = buildRealisticStream();
  const baseline = JSON.stringify(simulateStream(stream, 1000));
  for (const size of [1, 2, 5, 17, 64]) {
    assert.strictEqual(JSON.stringify(simulateStream(stream, size)), baseline, "size " + size + " diverged");
  }
});

test("end-to-end: CRLF line endings parse identically to LF", () => {
  const lf = buildRealisticStream();
  const crlf = lf.replace(/\n/g, "\r\n");
  eq(JSON.stringify(simulateStream(lf, 7)), JSON.stringify(simulateStream(crlf, 7)));
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("------------------");
const total = passed + failed;
console.log(passed + "/" + total + " passed");
if (failed > 0) {
  process.exit(1);
}
