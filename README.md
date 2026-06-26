# BYOK Chat — The Multi-Model AI Workspace You Own

> **Bring your own keys. Run every frontier model in one place. Keep your data on your device.**

BYOK Chat is a privacy-first, browser-native chat workspace that connects directly to the AI providers you already pay for — **OpenAI, Anthropic, Google, Mistral, Groq, Cohere, Together AI, Kimi, OpenRouter, and local Ollama** — with **no middleman server, no markup, and no data leaving your machine.** Your API keys are encrypted in your browser; your conversations live in local storage. It's the power of a commercial AI platform with the control of self-hosting.

---

## Why teams choose BYOK Chat

| | |
|---|---|
| 🔐 **You own your keys & data** | Keys are encrypted client-side in an in-browser vault. Requests go **straight from your browser to the provider** — we never see your traffic, prompts, or keys. |
| 🌐 **Every major model, one interface** | 10 providers and 40+ models behind a single, consistent UI. Switch from GPT-5.5 to Claude Opus to Gemini to a free OpenRouter model without changing tools. |
| ⚖️ **Compare models side-by-side** | Fire one prompt at multiple models at once and judge speed, quality, and cost in real time. |
| 💸 **Zero platform fees** | You pay providers their list price — nothing more. Free models (like Nex N2 Pro on OpenRouter) cost you exactly $0. |
| 🧩 **Reusable Skills & system prompts** | Package expertise into Skills and prompt templates you can apply to any model on demand. |
| 🧠 **Agent Swarm (preview)** | Decompose a complex task into a graph of specialist sub-agents that run in parallel and synthesize one answer — entirely client-side. |

---

## Key capabilities

- **Streaming chat** with live token-by-token output, reasoning/thinking blocks, tool calls, and web-search citations.
- **Side-by-side comparison** of multiple models on the same prompt, with per-model cost and latency.
- **Encrypted BYOK vault** — add, validate, and manage keys for each provider locally.
- **Skills library** — author and reuse specialist personas and instruction sets.
- **System-prompt templates**, parameter controls (temperature, top-p, penalties, seed, reasoning effort), and a fast **command palette**.
- **Canvas & sandbox** surfaces for working with generated artifacts.
- **Cost transparency** — real-time token and spend tracking per message and per model.
- **Local-first persistence** via IndexedDB — your history survives refreshes without a backend.

---

## Supported providers & models

OpenAI · Anthropic · Google · Mistral · Groq · Cohere · Together AI · Kimi (Moonshot) · OpenRouter · Ollama (local)

> Includes flagship models (GPT-5.5, Claude Opus 4.8, Gemini 3.1 Pro), fast/cheap workhorses, and **free** routed models. New models are added by a single registry entry — no architectural changes required.

### Adding an OpenAI-compatible / OpenRouter model

OpenRouter exposes an OpenAI-compatible API, so any OpenRouter model "just works":

1. Open the **Vault** and paste your OpenRouter key (`sk-or-...`).
2. Pick the model from the model selector (e.g. **Nex N2 Pro (Free)** → `nex-agi/nex-n2-pro:free`).
3. Start chatting — requests route to `https://openrouter.ai/api/v1` automatically.

---

## Tech stack

**React 18 · TypeScript (strict) · Vite · Zustand (Immer) · Tailwind CSS · shadcn-ui · Framer Motion · IndexedDB (idb) · Zod · Vitest**

The architecture is **types-first and provider-agnostic**: a single adapter registry normalizes every provider behind one streaming interface, so capabilities, pricing, and routing are declared as data — not hard-coded logic.

---

## Quick start

Requires Node.js & npm ([install via nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
# 1. Clone
git clone <YOUR_GIT_URL> && cd <YOUR_PROJECT_NAME>

# 2. Install
npm install

# 3. Run (hot-reload dev server)
npm run dev
```

Then open the app, go to the **Vault**, paste a provider key, and start chatting.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint the codebase |
| `npm test` | Run the test suite (Vitest) |

---

## Security & privacy

- API keys are **encrypted in the browser** and never transmitted to any BYOK Chat server.
- All model traffic is **direct browser → provider**.
- Conversations and settings persist **locally** in IndexedDB.

---

## Roadmap

The **Agent Swarm** system (multi-agent decomposition, smart skill routing, shared memory, and persistence) is under active development.

---

**BYOK Chat — your models, your keys, your data.**
