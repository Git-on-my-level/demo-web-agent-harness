export function containsForbiddenHtml(html) {
  return typeof html === "string" && html.toLowerCase().includes("agent-control");
}

export function containsForbiddenJs(js) {
  if (typeof js !== "string" || js.trim() === "") {
    return false;
  }

  const forbiddenPatterns = [
    /document\s*\.\s*body/i,
    /document\s*\.\s*documentElement/i,
    /document\s*\.\s*getElementById\(\s*[\"']agent-control[\"']\s*\)/i,
    /document\s*\.\s*querySelector\(\s*[\"']#agent-control[\"']\s*\)/i,
    /(?:window|globalThis)\s*\.\s*(?:fetch|applyTool|callLLM|agentLoop|conversationHistory|interrupted|SYSTEM_PROMPT|TOOL_SCHEMA)\s*=/i,
    /(?:let|const|var)\s+(?:applyTool|callLLM|agentLoop|conversationHistory|interrupted|SYSTEM_PROMPT|TOOL_SCHEMA)\b/i
  ];

  return forbiddenPatterns.some((pattern) => pattern.test(js));
}

export function validateToolCall(toolName, args, onRejected) {
  const html = args && typeof args.html === "string" ? args.html : "";
  const js = args && typeof args.js === "string" ? args.js : "";

  if (containsForbiddenHtml(html)) {
    const message = "Forbidden: control plane modification";
    if (onRejected) {
      onRejected(message, toolName + " rejected");
    }
    throw new Error(message);
  }

  if (containsForbiddenJs(js)) {
    const message = "Forbidden: unsafe JavaScript reference";
    if (onRejected) {
      onRejected(message, toolName + " rejected");
    }
    throw new Error(message);
  }
}
