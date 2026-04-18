import { state } from "./harness/config/state.js";
import { createLogger } from "./harness/logging.js";
import { createLLMClient } from "./harness/llm.js";
import { createToolRunner } from "./harness/tools.js";
import { createAgentLoop } from "./harness/agent-loop.js";
import { worldSeedHtml, initializeWorldSeed } from "./seed/world-seed.js";
import {
  createClearLogHandler,
  createModelInputHandler,
  createPromptKeydownHandler,
  createPromptSubmitHandler,
  createSettingsToggle,
  createStopHandler,
  bindEventListeners,
  getApiEndpoint,
  getDomElements,
  getSelectedModel
} from "./harness/ui.js";

export function bootstrapHarness() {
  const refs = getDomElements();

  if (!refs.agentWorld.innerHTML.trim()) {
    refs.agentWorld.innerHTML = worldSeedHtml.trim();
    initializeWorldSeed(refs.agentWorld);
  }

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
    submitButton: refs.submitButton
  });

  const handleModelInput = createModelInputHandler(refs.modelBadge, refs.modelInput);
  const handleSubmitClick = createPromptSubmitHandler({
    state,
    promptInput: refs.promptInput,
    logger,
    agentLoop
  });
  const handleStopClick = createStopHandler(agentLoop);
  const handleClearLogClick = createClearLogHandler(refs.outputLog);
  const handlePromptKeydown = createPromptKeydownHandler(refs.submitButton);
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
    toggleSettings,
    handleModelInput,
    handleClearLogClick,
    handleSubmitClick,
    handleStopClick,
    handlePromptKeydown
  });

  handleModelInput();

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
