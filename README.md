# Demo Web Agent Harness

An agent harness that's easy and fun to demo for a live audience! Watch the agent modify a retro style social media page, just like we used to write custom HTML and CSS for our Myspace sites!

Tool calls and agent activity is streamed live on screen. The agent literally modifies the web page that it lives on. If you're really feeling brave you can even ask the agent to modify itself! Try adding a new tool!

## Structure

- `index.html`: shell UI and protected control plane markup.
- `src/app.js`: bootstrap entrypoint.
- `src/harness/`: core agent runtime.
- `src/seed/world-seed.js`: default mutable-world seed markup and setup.
- `styles/world-seed.css`: default retro seed styling.

## Core Runtime

- `src/harness/config/state.js`: defaults, runtime state, system prompt, and tool schema.
- `src/harness/logging.js`: transcript rendering and status updates.
- `src/harness/guardrails.js`: rejects tool calls that escape `#agent-world`.
- `src/harness/tools.js`: local tool execution against the DOM.
- `src/harness/llm.js`: API request/response handling and tool-call parsing.
- `src/harness/agent-loop.js`: orchestration loop between model steps and local tools.
- `src/harness/ui.js`: DOM references and control-plane event wiring.

## Running

Because the harness uses browser ES modules, serve it over HTTP instead of opening `index.html` directly as a `file://` URL.

```bash
cd /Users/dazheng/car-workspace/demo-web-agent-harness
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
