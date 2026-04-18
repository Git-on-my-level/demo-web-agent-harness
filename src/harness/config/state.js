export const SYSTEM_PROMPT = [
  "You are an agent that modifies a web page via tools.",
  "You control ONLY the contents of the element with id=\"agent-world\".",
  "STRICT RULES:",
  "- Never modify #agent-control unless explicitly requested",
  "- Never overwrite the full document or body",
  "- Do not break the system's ability to run",
  "GUIDELINES:",
  "- Prefer incremental edits",
  "- Write valid HTML/CSS/JS",
  "- Avoid infinite loops",
  "- You may build tools and UI inside the world",
  "Your goal is to iteratively improve the page based on user instructions."
].join("\n");

export const DEFAULT_MODEL = "glm-5.1";
export const DEFAULT_API_ENDPOINT = "https://api.z.ai/api/coding/paas/v4";

export const state = {
  interrupted: false,
  isRunning: false,
  conversationHistory: [],
  typingIndicator: null
};

export function safeJSONStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

export const TOOL_SCHEMA = [
  {
    type: "function",
    function: {
      name: "set_world",
      description: "Replace the entire contents of #agent-world with new HTML, CSS, and optional JavaScript for the mutable world.",
      parameters: {
        type: "object",
        properties: {
          html: {
            type: "string",
            description: "Complete HTML markup for the mutable world area only. Do not include document, html, head, body, or #agent-control."
          },
          css: {
            type: "string",
            description: "CSS rules scoped to the content inside #agent-world. This is injected into a style element inside the world."
          },
          js: {
            type: "string",
            description: "Optional JavaScript to enhance only #agent-world behavior. Avoid global mutations and infinite loops."
          }
        },
        required: ["html"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "append_html",
      description: "Append new HTML to the existing contents of #agent-world without replacing the full world.",
      parameters: {
        type: "object",
        properties: {
          html: {
            type: "string",
            description: "HTML fragment to append inside #agent-world."
          }
        },
        required: ["html"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_css",
      description: "Add or replace the active style element inside #agent-world.",
      parameters: {
        type: "object",
        properties: {
          css: {
            type: "string",
            description: "CSS rules that should apply to the current contents of #agent-world."
          }
        },
        required: ["css"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_js",
      description: "Execute JavaScript to enhance the mutable world without replacing the full world.",
      parameters: {
        type: "object",
        properties: {
          js: {
            type: "string",
            description: "JavaScript that should only operate on content inside #agent-world."
          }
        },
        required: ["js"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_world",
      description: "Read the current HTML contents of #agent-world. Use this to inspect the current state before making changes.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "verify_world",
      description: "Verify the current state of #agent-world after making changes. Returns the current HTML and a summary of computed styles for key elements. Use this to confirm your changes were applied correctly.",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "Optional CSS selector to check a specific element. If omitted, returns a summary of the full world."
          }
        },
        required: [],
        additionalProperties: false
      }
    }
  }
];
