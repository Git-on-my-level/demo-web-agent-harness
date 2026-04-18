import { DEFAULT_API_ENDPOINT, DEFAULT_MODEL } from "./config/state.js";
import { clearAgentState } from "./persistence.js";
import { initializeWorldSeed } from "../seed/world-seed.js";

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
    agentControl: document.getElementById("agent-control"),
    mobileNav: document.getElementById("mobile-toggle"),
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
  function toggleSettings() {
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
  }

  toggleSettings.isOpen = function() {
    return settingsBody && settingsBody.style.display !== "none";
  };

  toggleSettings.ensureOpen = function() {
    if (settingsBody && settingsBody.style.display === "none") {
      toggleSettings();
    }
  };

  return toggleSettings;
}

export function bindEventListeners(deps) {
  const {
    settingsToggle,
    modelInput,
    clearLogButton,
    submitButton,
    stopButton,
    promptInput,
    mobileNav,
    toggleSettings,
    handleModelInput,
    handleClearLogClick,
    handleSubmitClick,
    handleStopClick,
    handlePromptKeydown,
    handleMobileNavClick
  } = deps;

  settingsToggle.addEventListener("click", toggleSettings);
  modelInput.addEventListener("input", handleModelInput);
  clearLogButton.addEventListener("click", handleClearLogClick);
  submitButton.addEventListener("click", handleSubmitClick);
  stopButton.addEventListener("click", handleStopClick);
  promptInput.addEventListener("keydown", handlePromptKeydown);
  if (mobileNav) {
    handleMobileNavClick();
  }
}

export function createModelInputHandler(modelBadge, modelInput) {
  return function handleModelInput() {
    modelBadge.textContent = getSelectedModel(modelInput);
  };
}

export function createPromptSubmitHandler({ state, promptInput, logger, agentLoop, getApiKey, settingsToggle }) {
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

    if (!getApiKey()) {
      settingsToggle.ensureOpen();
      logger.addLogEntry("error", "API Key is required. Please enter your API key in Settings.", { label: "validation" });
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

export function createClearLogHandler({ state, outputLog, agentWorld, logger, worldSeedHtml }) {
  return function handleClearLogClick() {
    state.conversationHistory = [];
    clearAgentState();
    outputLog.innerHTML = "";
    agentWorld.innerHTML = worldSeedHtml.trim();
    initializeWorldSeed(agentWorld);
    logger.addLogEntry("status", "Session reset. World restored to seed.", { label: "reset" });
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

export function createMobileNavHandler({ agentControl, agentWorld, mobileNav }) {
  if (!mobileNav || !agentControl || !agentWorld) return function() {};

  var currentView = "agent-control";
  var SIZE = 52;

  function switchView(targetId) {
    currentView = targetId;
    agentControl.classList.toggle("mobile-hidden", targetId !== "agent-control");
    agentWorld.classList.toggle("mobile-hidden", targetId !== "agent-world");

    var icon = mobileNav.querySelector("#toggle-icon");
    var label = mobileNav.querySelector("#toggle-label");
    if (targetId === "agent-control") {
      if (icon) icon.textContent = "\u21C4";
      if (label) label.textContent = "preview";
    } else {
      if (icon) icon.textContent = "\u21C4";
      if (label) label.textContent = "control";
    }
  }

  var isDragging = false;
  var hasMoved = false;
  var startX = 0;
  var startY = 0;

  function setPositionFromTouch(touch) {
    var x = touch.clientX - SIZE / 2;
    var y = touch.clientY - SIZE / 2;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    x = Math.max(4, Math.min(vw - SIZE - 4, x));
    y = Math.max(4, Math.min(vh - SIZE - 4, y));
    mobileNav.style.left = x + "px";
    mobileNav.style.top = y + "px";
    mobileNav.style.right = "auto";
    mobileNav.style.bottom = "auto";
  }

  function positionDefault() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var x = vw - SIZE - 16;
    var y = vh - SIZE - 32;
    mobileNav.style.left = x + "px";
    mobileNav.style.top = y + "px";
    mobileNav.style.right = "auto";
    mobileNav.style.bottom = "auto";
  }

  function onTouchStart(e) {
    var touch = e.touches[0];
    isDragging = true;
    hasMoved = false;
    startX = touch.clientX;
    startY = touch.clientY;
    mobileNav.classList.add("dragging");
  }

  function onTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    var touch = e.touches[0];
    var dx = touch.clientX - startX;
    var dy = touch.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasMoved = true;
    if (!hasMoved) return;
    setPositionFromTouch(touch);
    startX = touch.clientX;
    startY = touch.clientY;
  }

  function onTouchEnd() {
    if (!isDragging) return;
    isDragging = false;
    mobileNav.classList.remove("dragging");
    if (!hasMoved) {
      var next = currentView === "agent-control" ? "agent-world" : "agent-control";
      switchView(next);
    }
  }

  mobileNav.addEventListener("touchstart", onTouchStart, { passive: true });
  mobileNav.addEventListener("touchmove", onTouchMove, { passive: false });
  mobileNav.addEventListener("touchend", onTouchEnd);
  mobileNav.addEventListener("touchcancel", onTouchEnd);

  mobileNav.addEventListener("click", function(e) {
    e.preventDefault();
    if (hasMoved) return;
    var next = currentView === "agent-control" ? "agent-world" : "agent-control";
    switchView(next);
  });

  var mql = window.matchMedia("(max-width: 1023px)");
  function onBreakpoint() {
    if (mql.matches) {
      switchView("agent-control");
      positionDefault();
    } else {
      agentControl.classList.remove("mobile-hidden");
      agentWorld.classList.remove("mobile-hidden");
    }
  }
  mql.addEventListener("change", onBreakpoint);

  if (mql.matches) {
    switchView("agent-control");
    positionDefault();
  }

  return function handleMobileNavClick() {};
}
