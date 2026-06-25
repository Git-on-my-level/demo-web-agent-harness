import { state, safeJSONStringify } from "./config/state.js";
import { saveAll } from "./persistence.js";
import { createStreamAccumulator } from "./llm.js";

export function createAgentLoop({ logger, llmClient, toolRunner, submitButton, agentWorld }) {
  const { callLLMStream, parseToolArguments } = llmClient;
  let currentAbort = null;

  function toolInput(call) {
    return {
      id: call.id,
      type: "function",
      function: {
        name: call.name,
        arguments: typeof call.rawArgs === "string" ? call.rawArgs : safeJSONStringify(call.rawArgs)
      }
    };
  }

  function isAbortError(error) {
    return (
      state.interrupted ||
      (error && (error.name === "AbortError" || error.code === 20))
    );
  }

  async function runAgentLoop() {
    state.interrupted = false;
    state.isRunning = true;
    submitButton.disabled = true;
    submitButton.textContent = "Running...";
    submitButton.classList.add("running");
    logger.setStatus("Running", "running");
    logger.addLogEntry("status", "Agent loop started.", { label: "status" });
    currentAbort = new AbortController();

    try {
      while (!state.interrupted) {
        logger.showTypingIndicator();

        const accumulator = createStreamAccumulator();
        let textEntry = null;
        let streamError = null;

        try {
          for await (const delta of callLLMStream(state.conversationHistory, { signal: currentAbort.signal })) {
            if (state.interrupted) {
              break;
            }
            accumulator.addDelta(delta);
            if (delta.textDelta) {
              if (!textEntry) {
                logger.hideTypingIndicator();
                textEntry = logger.startStreamingEntry({ label: "assistant" });
              }
              textEntry.appendText(delta.textDelta);
            }
          }
        } catch (error) {
          if (isAbortError(error)) {
            // Graceful stop; loop condition will break below.
          } else {
            streamError = error;
          }
        }

        logger.hideTypingIndicator();
        if (textEntry) {
          textEntry.finalize();
        }

        if (state.interrupted) {
          break;
        }

        if (streamError) {
          logger.addLogEntry("error", streamError.message || "Unknown API error.", { label: "api error" });

          if (streamError.rawText) {
            logger.addLogEntry("assistant", streamError.rawText, { label: "raw response" });
          }

          break;
        }

        const assistantReply = accumulator.finalize();
        const streamedText = !!textEntry;

        if (assistantReply.toolCalls.length > 0) {
          const assistantHistoryEntry = {
            role: "assistant",
            content: assistantReply.text || "",
            tool_calls: assistantReply.originalMessage && Array.isArray(assistantReply.originalMessage.tool_calls)
              ? assistantReply.originalMessage.tool_calls
              : assistantReply.toolCalls.map(toolInput)
          };

          state.conversationHistory.push(assistantHistoryEntry);

          if (assistantReply.text && !streamedText) {
            logger.addLogEntry("assistant", assistantReply.text, { label: "assistant" });
          }

          const parsedCalls = [];
          let parseFailed = false;

          for (const call of assistantReply.toolCalls) {
            const parsed = parseToolArguments(call.rawArgs);

            if (!parsed.ok || !call.name) {
              parseFailed = true;
              logger.addLogEntry("error", "Tool call parsing failed. Falling back to raw response text.", {
                label: "parser"
              });
              logger.addLogEntry("assistant", assistantReply.rawAssistant, { label: "raw response" });
              break;
            }

            parsedCalls.push({
              id: call.id,
              name: call.name,
              args: parsed.value
            });
          }

          if (parseFailed) {
            break;
          }

          for (const call of parsedCalls) {
            if (state.interrupted) {
              break;
            }

            logger.logToolCall(call.name, call.args);

            try {
              const result = toolRunner.applyTool(call);
              logger.logToolResult(call.name, result);
              state.conversationHistory.push({
                role: "tool",
                tool_call_id: call.id,
                content: safeJSONStringify({
                  ok: true,
                  result
                })
              });
            } catch (error) {
              logger.addLogEntry("error", error.message, { label: call.name + " failed" });
              state.conversationHistory.push({
                role: "tool",
                tool_call_id: call.id,
                content: safeJSONStringify({
                  ok: false,
                  error: error.message
                })
              });
            }
          }

          continue;
        }

        if (assistantReply.text) {
          if (!streamedText) {
            logger.addLogEntry("assistant", assistantReply.text, { label: "assistant" });
          }
          state.conversationHistory.push({
            role: "assistant",
            content: assistantReply.text
          });
          break;
        }

        logger.addLogEntry("status", "No assistant text or tool call returned. Stopping loop.", { label: "status" });
        break;
      }
    } catch (error) {
      logger.hideTypingIndicator();
      logger.addLogEntry("error", error.message, { label: "runtime error" });
    } finally {
      currentAbort = null;
      state.isRunning = false;
      submitButton.disabled = false;
      submitButton.textContent = "Run Agent";
      submitButton.classList.remove("running");
      saveAll({ state, agentWorld }) || logger.addLogEntry("error", "Failed to save state — localStorage may be full.", { label: "persistence" });

      if (state.interrupted) {
        logger.setStatus("Interrupted", "interrupted");
        logger.addLogEntry("status", "Interrupted.", { label: "status" });
      } else {
        logger.setStatus("Idle", "idle");
        logger.addLogEntry("status", "Agent loop finished.", { label: "status" });
      }
    }
  }

  function requestStop() {
    state.interrupted = true;

    if (currentAbort) {
      try {
        currentAbort.abort();
      } catch (error) {
        // ignore — abort is best-effort
      }
    }

    if (state.isRunning) {
      logger.hideTypingIndicator();
      logger.setStatus("Interrupted", "interrupted");
      logger.addLogEntry("status", "Stop requested. The current loop will halt before the next tool or model step.", {
        label: "status"
      });
    } else {
      logger.addLogEntry("status", "Stop requested, but no agent loop is running.", { label: "status" });
    }
  }

  return {
    runAgentLoop,
    requestStop
  };
}
