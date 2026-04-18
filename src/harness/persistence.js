const PREFIX = "agent-harness:";

const KEYS = {
  apiKey: PREFIX + "api-key",
  model: PREFIX + "model",
  apiEndpoint: PREFIX + "api-endpoint",
  conversationHistory: PREFIX + "conversation-history",
  worldHtml: PREFIX + "world-html"
};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    if (raw === "") return "";
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function saveSettings({ apiKey, model, apiEndpoint }) {
  if (apiKey !== undefined) write(KEYS.apiKey, apiKey);
  if (model !== undefined) write(KEYS.model, model);
  if (apiEndpoint !== undefined) write(KEYS.apiEndpoint, apiEndpoint);
}

export function loadSettings() {
  return {
    apiKey: read(KEYS.apiKey) || "",
    model: read(KEYS.model) || null,
    apiEndpoint: read(KEYS.apiEndpoint) || null
  };
}

export function saveAgentState({ conversationHistory, worldHtml }) {
  if (conversationHistory !== undefined) {
    write(KEYS.conversationHistory, conversationHistory);
  }
  if (worldHtml !== undefined) {
    write(KEYS.worldHtml, worldHtml);
  }
}

export function loadAgentState() {
  const conversationHistory = read(KEYS.conversationHistory);
  const worldHtml = read(KEYS.worldHtml);
  return {
    conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : null,
    worldHtml: typeof worldHtml === "string" ? worldHtml : null
  };
}

export function clearAgentState() {
  try {
    localStorage.removeItem(KEYS.conversationHistory);
    localStorage.removeItem(KEYS.worldHtml);
  } catch {
    // silently ignore
  }
}

export function saveAll({ state, agentWorld }) {
  const historyOk = write(KEYS.conversationHistory, state.conversationHistory);
  const worldOk = write(KEYS.worldHtml, agentWorld ? agentWorld.innerHTML : "");
  return historyOk && worldOk;
}
