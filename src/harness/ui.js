import { DEFAULT_API_ENDPOINT, DEFAULT_MODEL } from "./config/state.js";

export function getDomElements() {
  return {
    settingsToggle: document.getElementById("settings-toggle"),
    outputLog: document.getElementById("output-log"),
    runtimeStatus: document.getElementById("runtime-status"),
    apiKeyInput: document.getElementById("api-key"),
    modelInput: document.getElementById("model-select"),
    apiEndpointInput: document.getElementById("api-endpoint"),
    promptInput: document.getElementById("prompt-input"),
    submitButton: document.getElementById("submit-button"),
    stopButton: document.getElementById("stop-button"),
    clearLogButton: document.getElementById("clear-log-btn"),
    agentWorld: document.getElementById("agent-world"),
    modelBadge: document.getElementById("model-badge"),
    settingsBody: document.getElementById("settings-body"),
    settingsSummary: document.getElementById("settings-summary"),
    settingsChevron: document.getElementById("settings-chevron")
  };
}

export function getSelectedModel(modelInput) {
  return modelInput.value.trim() || DEFAULT_MODEL;
}

export function getApiEndpoint(apiEndpointInput) {
  const raw = apiEndpointInput.value.trim() || DEFAULT_API_ENDPOINT;

  return /\/chat\/completions\/?$/.test(raw)
    ? raw
    : raw.replace(/\/+$/, "") + "/chat/completions";
}

export function createSettingsToggle({ apiEndpointInput, modelInput, settingsBody, settingsSummary, settingsChevron }) {
  return function toggleSettings() {
    if (!settingsBody || !settingsSummary || !settingsChevron) {
      return;
    }

    let endpointHost = "api.z.ai";

    try {
      endpointHost = new URL(apiEndpointInput.value.trim() || DEFAULT_API_ENDPOINT).host || endpointHost;
    } catch (error) {
      endpointHost = "api.z.ai";
    }

    settingsSummary.textContent = "\u2699 " + getSelectedModel(modelInput) + " \u00B7 " + endpointHost;

    const isOpen = settingsBody.style.display !== "none";
    settingsBody.style.display = isOpen ? "none" : "grid";
    settingsChevron.textContent = isOpen ? "\u25BE" : "\u25B4";
  };
}

export function bindEventListeners(deps) {
  const {
    settingsToggle,
    modelInput,
    clearLogButton,
    submitButton,
    stopButton,
    promptInput,
    toggleSettings,
    handleModelInput,
    handleClearLogClick,
    handleSubmitClick,
    handleStopClick,
    handlePromptKeydown
  } = deps;

  settingsToggle.addEventListener("click", toggleSettings);
  modelInput.addEventListener("input", handleModelInput);
  clearLogButton.addEventListener("click", handleClearLogClick);
  submitButton.addEventListener("click", handleSubmitClick);
  stopButton.addEventListener("click", handleStopClick);
  promptInput.addEventListener("keydown", handlePromptKeydown);
}

export function createModelInputHandler(modelBadge, modelInput) {
  return function handleModelInput() {
    modelBadge.textContent = getSelectedModel(modelInput);
  };
}

export function createPromptSubmitHandler({ state, promptInput, logger, agentLoop }) {
  return async function handleSubmitClick() {
    if (state.isRunning) {
      logger.addLogEntry("error", "Agent is already running.", { label: "state" });
      return;
    }

    const prompt = promptInput.value.trim();

    if (!prompt) {
      logger.addLogEntry("error", "Prompt is required.", { label: "validation" });
      return;
    }

    state.interrupted = false;
    state.conversationHistory.push({
      role: "user",
      content: prompt
    });
    logger.addLogEntry("user", prompt, { label: "user" });
    promptInput.value = "";
    await agentLoop.runAgentLoop();
  };
}

export function createStopHandler(agentLoop) {
  return function handleStopClick() {
    agentLoop.requestStop();
  };
}

export function createClearLogHandler(outputLog) {
  return function handleClearLogClick() {
    outputLog.innerHTML = "";
  };
}

export function createPromptKeydownHandler(submitButton) {
  return function handlePromptKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submitButton.click();
    }
  };
}
