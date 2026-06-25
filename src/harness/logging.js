import { state } from "./config/state.js";

function timestamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getKindIcon(kind) {
  const icons = {
    user: "\u2709",
    assistant: "\u2726",
    tool: "\u2699",
    error: "\u26A0",
    status: "\u25CF"
  };

  return icons[kind] || "\u25CF";
}

function appendLogEntry(outputLog, entry) {
  const isNearBottom = outputLog.scrollHeight - outputLog.scrollTop - outputLog.clientHeight < 100;
  outputLog.appendChild(entry);

  if (isNearBottom) {
    outputLog.scrollTop = outputLog.scrollHeight;
  }

  return entry;
}

export function createLogger({ outputLog, runtimeStatus }) {
  function setStatus(label, className) {
    runtimeStatus.textContent = label;
    runtimeStatus.className = "status-pill " + className;
  }

  function scrollLogToBottom() {
    outputLog.scrollTop = outputLog.scrollHeight;
  }

  function showTypingIndicator() {
    if (state.typingIndicator) {
      return;
    }

    state.typingIndicator = document.createElement("div");
    state.typingIndicator.className = "typing-indicator";
    state.typingIndicator.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
    const isNearBottom = outputLog.scrollHeight - outputLog.scrollTop - outputLog.clientHeight < 100;
    outputLog.appendChild(state.typingIndicator);

    if (isNearBottom) {
      scrollLogToBottom();
    }
  }

  function hideTypingIndicator() {
    if (state.typingIndicator && state.typingIndicator.parentNode) {
      state.typingIndicator.parentNode.removeChild(state.typingIndicator);
    }

    state.typingIndicator = null;
  }

  function addLogEntry(kind, content, options = {}) {
    hideTypingIndicator();

    const entry = document.createElement("div");
    entry.className = "log-entry " + kind;

    const topline = document.createElement("div");
    topline.className = "log-topline";

    const label = document.createElement("div");
    label.className = "log-kind";

    const icon = document.createElement("span");
    icon.className = "log-kind-icon";
    icon.textContent = getKindIcon(options.label || kind);

    const labelText = document.createElement("span");
    labelText.textContent = options.label || kind;

    label.appendChild(icon);
    label.appendChild(labelText);

    const time = document.createElement("div");
    time.className = "log-time";
    time.textContent = timestamp();

    topline.appendChild(label);
    topline.appendChild(time);
    entry.appendChild(topline);

    if (options.summary && options.details) {
      const details = document.createElement("details");
      details.className = "tool-details";

      if (options.open) {
        details.open = true;
      }

      const summary = document.createElement("summary");
      summary.textContent = options.summary;
      details.appendChild(summary);

      const pre = document.createElement("pre");
      pre.textContent = options.details;
      details.appendChild(pre);
      entry.appendChild(details);
    }

    if (content !== undefined && content !== null && content !== "") {
      const body = document.createElement("div");
      body.className = "log-content";
      body.textContent = content;
      entry.appendChild(body);
    }

    const appended = appendLogEntry(outputLog, entry);
    const log = document.getElementById("output-log");
    const isNearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 100;

    if (isNearBottom) {
      log.scrollTop = log.scrollHeight;
    }

    return appended;
  }

  function logToolCall(name, args) {
    hideTypingIndicator();

    const entry = document.createElement("div");
    entry.className = "log-entry tool";

    const topline = document.createElement("div");
    topline.className = "log-topline";

    const label = document.createElement("div");
    label.className = "log-kind";

    const icon = document.createElement("span");
    icon.className = "log-kind-icon";
    icon.textContent = getKindIcon("tool");

    const labelText = document.createElement("span");
    labelText.textContent = "tool call";

    label.appendChild(icon);
    label.appendChild(labelText);

    const time = document.createElement("div");
    time.className = "log-time";
    time.textContent = timestamp();

    topline.appendChild(label);
    topline.appendChild(time);
    entry.appendChild(topline);

    const meta = document.createElement("div");
    meta.className = "tool-call-meta";

    const badge = document.createElement("span");
    badge.className = "tool-name-badge";
    badge.textContent = name || "unknown_tool";
    meta.appendChild(badge);

    const note = document.createElement("span");
    note.className = "tool-call-note";
    note.textContent = "Arguments captured from the model request.";
    meta.appendChild(note);

    entry.appendChild(meta);

    const argText = JSON.stringify(args || {}, null, 2);
    const lineCount = argText.split("\n").length;
    const details = document.createElement("details");
    details.className = "tool-details";
    details.open = lineCount <= 14 && argText.length <= 700;

    const summary = document.createElement("summary");

    const summaryLabel = document.createElement("span");
    summaryLabel.textContent = "View tool arguments";
    summary.appendChild(summaryLabel);

    const summaryMeta = document.createElement("span");
    summaryMeta.className = "tool-arg-summary";
    summaryMeta.textContent = lineCount + " lines";
    summary.appendChild(summaryMeta);

    details.appendChild(summary);

    const pre = document.createElement("pre");
    pre.className = "tool-args";
    pre.textContent = argText;
    details.appendChild(pre);

    entry.appendChild(details);
    appendLogEntry(outputLog, entry);
  }

  function logToolResult(name, result) {
    addLogEntry("status", result, {
      label: name + " result"
    });
  }

  // Creates a live assistant log entry whose text body can be appended to as
  // tokens stream in. Used by the streaming agent loop to render text deltas in
  // real time instead of waiting for the full response. Returns a handle with
  // appendText(delta) and finalize() (currently a no-op placeholder for symmetry).
  function startStreamingEntry(options = {}) {
    const label = options.label || "assistant";
    const kind = options.kind || "assistant";

    const entry = document.createElement("div");
    entry.className = "log-entry " + kind;

    const topline = document.createElement("div");
    topline.className = "log-topline";

    const labelEl = document.createElement("div");
    labelEl.className = "log-kind";

    const icon = document.createElement("span");
    icon.className = "log-kind-icon";
    icon.textContent = getKindIcon(label);

    const labelText = document.createElement("span");
    labelText.textContent = label;

    labelEl.appendChild(icon);
    labelEl.appendChild(labelText);

    const time = document.createElement("div");
    time.className = "log-time";
    time.textContent = timestamp();

    topline.appendChild(labelEl);
    topline.appendChild(time);
    entry.appendChild(topline);

    const body = document.createElement("div");
    body.className = "log-content";
    entry.appendChild(body);

    appendLogEntry(outputLog, entry);

    function appendText(delta) {
      if (!delta) {
        return;
      }
      body.textContent += delta;
      const isNearBottom = outputLog.scrollHeight - outputLog.scrollTop - outputLog.clientHeight < 100;
      if (isNearBottom) {
        outputLog.scrollTop = outputLog.scrollHeight;
      }
    }

    function finalize() {
      return entry;
    }

    return {
      appendText,
      finalize,
      getElement: () => entry
    };
  }

  return {
    setStatus,
    addLogEntry,
    showTypingIndicator,
    hideTypingIndicator,
    startStreamingEntry,
    logToolCall,
    logToolResult
  };
}
