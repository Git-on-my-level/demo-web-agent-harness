import { state } from "./harness/config/state.js";
import { createLogger } from "./harness/logging.js";
import { createLLMClient } from "./harness/llm.js";
import { createToolRunner } from "./harness/tools.js";
import { createAgentLoop } from "./harness/agent-loop.js";
import { worldSeedHtml, initializeWorldSeed } from "./seed/world-seed.js";
import {
  saveSettings,
  loadSettings,
  loadAgentState,
  saveAll
} from "./harness/persistence.js";
import {
  createClearLogHandler,
  createModelInputHandler,
  createPromptKeydownHandler,
  createPromptSubmitHandler,
  createSettingsToggle,
  createStopHandler,
  createMobileNavHandler,
  bindEventListeners,
  getApiEndpoint,
  getDomElements,
  getSelectedModel
} from "./harness/ui.js";

function restoreSettings(refs) {
  const saved = loadSettings();
  if (saved.apiKey) refs.apiKeyInput.value = saved.apiKey;
  if (saved.model) refs.modelInput.value = saved.model;
  if (saved.apiEndpoint) refs.apiEndpointInput.value = saved.apiEndpoint;
}

function restoreAgentState(refs) {
  const saved = loadAgentState();
  if (saved.worldHtml) {
    refs.agentWorld.innerHTML = saved.worldHtml;
    initializeWorldSeed(refs.agentWorld);
  }
  if (saved.conversationHistory && saved.conversationHistory.length > 0) {
    state.conversationHistory = saved.conversationHistory;
  }
  return saved;
}

function wireSettingsAutoSave(refs) {
  const save = () =>
    saveSettings({
      apiKey: refs.apiKeyInput.value.trim(),
      model: refs.modelInput.value.trim(),
      apiEndpoint: refs.apiEndpointInput.value.trim()
    });

  refs.apiKeyInput.addEventListener("input", save);
  refs.modelInput.addEventListener("input", save);
  refs.apiEndpointInput.addEventListener("input", save);
}

export function bootstrapHarness() {
  const refs = getDomElements();

  restoreSettings(refs);
  const hasRestoredWorld = restoreAgentState(refs);

  if (!hasRestoredWorld.worldHtml && !refs.agentWorld.innerHTML.trim()) {
    refs.agentWorld.innerHTML = worldSeedHtml.trim();
    initializeWorldSeed(refs.agentWorld);
  }

  wireSettingsAutoSave(refs);

  const logger = createLogger({
    outputLog: refs.outputLog,
    runtimeStatus: refs.runtimeStatus
  });

  const getModel = () => getSelectedModel(refs.modelInput);
  const getEndpoint = () => getApiEndpoint(refs.apiEndpointInput);

  const llmClient = createLLMClient({
    getApiKey: () => refs.apiKeyInput.value.trim(),
    getSelectedModel: getModel,
    getApiEndpoint: getEndpoint
  });

  const toolRunner = createToolRunner({
    agentWorld: refs.agentWorld,
    logger
  });

  const agentLoop = createAgentLoop({
    logger,
    llmClient,
    toolRunner,
    submitButton: refs.submitButton,
    agentWorld: refs.agentWorld
  });

  const handleModelInput = createModelInputHandler(refs.modelBadge, refs.modelInput);
  const handleSubmitClick = createPromptSubmitHandler({
    state,
    promptInput: refs.promptInput,
    logger,
    agentLoop
  });
  const handleStopClick = createStopHandler(agentLoop);
  const handleClearLogClick = createClearLogHandler({
    state,
    outputLog: refs.outputLog,
    agentWorld: refs.agentWorld,
    logger,
    worldSeedHtml
  });
  const handlePromptKeydown = createPromptKeydownHandler(refs.submitButton);
  const handleMobileNavClick = createMobileNavHandler({
    agentControl: refs.agentControl,
    agentWorld: refs.agentWorld,
    mobileNav: refs.mobileNav
  });
  const toggleSettings = createSettingsToggle({
    apiEndpointInput: refs.apiEndpointInput,
    modelInput: refs.modelInput,
    settingsToggle: refs.settingsToggle,
    settingsBody: refs.settingsBody,
    settingsSummary: refs.settingsSummary,
    settingsChevron: refs.settingsChevron
  });

  bindEventListeners({
    settingsToggle: refs.settingsToggle,
    modelInput: refs.modelInput,
    clearLogButton: refs.clearLogButton,
    submitButton: refs.submitButton,
    stopButton: refs.stopButton,
    promptInput: refs.promptInput,
    mobileNav: refs.mobileNav,
    toggleSettings,
    handleModelInput,
    handleClearLogClick,
    handleSubmitClick,
    handleStopClick,
    handlePromptKeydown,
    handleMobileNavClick
  });

  handleModelInput();

  window.addEventListener("beforeunload", () => {
    if (!state.isRunning) {
      saveAll({ state, agentWorld: refs.agentWorld });
    }
  });

  return {
    state,
    refs,
    run: agentLoop.runAgentLoop,
    stop: agentLoop.requestStop
  };
}

if (typeof window !== "undefined") {
  window.bootstrapHarness = bootstrapHarness;
}
