import { state } from "./config/state.js";
import { safeJSONStringify } from "./config/state.js";
import { validateToolCall } from "./guardrails.js";
import { manageMusicTracks } from "../seed/music-player.js";
import { initializeWorldSeed } from "../seed/world-seed.js";

function getWorldStyleElement(agentWorld) {
  let styleElement = agentWorld.querySelector('style[data-agent-style="active"]');

  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.setAttribute("data-agent-style", "active");
    agentWorld.insertBefore(styleElement, agentWorld.firstChild);
  }

  return styleElement;
}

function upsertWorldStyle(agentWorld, css) {
  const styleElement = getWorldStyleElement(agentWorld);
  styleElement.textContent = typeof css === "string" ? css : "";
}

function executeWorldJs(logger, js) {
  if (typeof js !== "string" || js.trim() === "") {
    return "No JavaScript executed.";
  }

  try {
    const runner = new Function('"use strict";\n' + js);
    runner();
    return "JavaScript executed.";
  } catch (error) {
    const message = "World JS error: " + error.message;
    logger.addLogEntry("error", message, { label: "run_js error" });
    return message;
  }
}

export function createToolRunner({ agentWorld, logger }) {
  function applyTool(call) {
    if (state.interrupted) {
      throw new Error("Interrupted");
    }

    const toolName = call && call.name ? call.name : "";
    const args = call && typeof call.args === "object" && call.args !== null ? call.args : {};

    validateToolCall(toolName, args, (message, label) => {
      logger.addLogEntry("error", message, { label });
    });

    switch (toolName) {
      case "set_world": {
        const html = typeof args.html === "string" ? args.html : "";
        const css = typeof args.css === "string" ? args.css : "";
        const js = typeof args.js === "string" ? args.js : "";

        agentWorld.innerHTML = html;
        upsertWorldStyle(agentWorld, css);

        const jsResult = executeWorldJs(logger, js);
        initializeWorldSeed(agentWorld);
        return "World replaced. CSS updated. " + jsResult;
      }

      case "append_html": {
        const html = typeof args.html === "string" ? args.html : "";
        agentWorld.insertAdjacentHTML("beforeend", html);
        return "HTML appended.";
      }

      case "set_css": {
        const css = typeof args.css === "string" ? args.css : "";
        upsertWorldStyle(agentWorld, css);
        return "CSS updated.";
      }

      case "run_js": {
        const js = typeof args.js === "string" ? args.js : "";
        return executeWorldJs(logger, js);
      }

      case "read_world": {
        return agentWorld ? agentWorld.innerHTML : "<empty>";
      }

      case "verify_world": {
        if (!agentWorld) {
          return "<empty>";
        }

        const selector = call.args && typeof call.args.selector === "string" ? call.args.selector : "";

        if (selector) {
          const element = agentWorld.querySelector(selector);

          if (!element) {
            return "Element not found: " + selector;
          }

          const computed = window.getComputedStyle(element);
          return JSON.stringify(
            {
              tag: element.tagName,
              id: element.id,
              className: element.className,
              textContent: element.textContent ? element.textContent.substring(0, 500) : "",
              innerHTML: element.innerHTML ? element.innerHTML.substring(0, 2000) : "",
              computedStyles: {
                display: computed.display,
                color: computed.color,
                backgroundColor: computed.backgroundColor,
                fontSize: computed.fontSize,
                visibility: computed.visibility
              }
            },
            null,
            2
          );
        }

        return JSON.stringify(
          {
            childCount: agentWorld.children.length,
            textLength: agentWorld.textContent ? agentWorld.textContent.length : 0,
            innerHTML_preview: agentWorld.innerHTML ? agentWorld.innerHTML.substring(0, 3000) : ""
          },
          null,
          2
        );
      }

      case "manage_music_tracks": {
        return manageMusicTracks(agentWorld, call.args);
      }

      default:
        throw new Error("Unknown tool: " + toolName);
    }
  }

  return {
    applyTool,
    safeJSONStringify,
    upsertWorldStyle
  };
}
