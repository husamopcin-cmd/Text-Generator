# CinoCode

A multi-provider AI chat application built as a single-file web app, with text, voice, image, and video generation, document understanding, and a persona/tone system — deployed on Netlify.

> **Note:** The product UI and prompts are in Turkish (built for Turkish-speaking users), but the code, architecture, and this README are documented for a general technical audience.

**Live demo:** (demo linki yakında eklenecek)
**Repo:** https://github.com/husamopcin-cmd/Text-Generator

---

## What it does

CinoCode is a ChatGPT-style assistant with a few things layered on top that most single-provider wrappers don't have:

- **Multi-provider routing** — automatically picks between OpenAI, Groq, Gemini, DeepSeek, Mistral, OpenRouter, xAI (Grok), and local Ollama models depending on task type (code, vision, general chat), with manual override.
- **Persona + Tone system** — separate, composable layers for *who* the assistant is (Standard, Expert Coder, Exam Coach, Language Coach, Deep Research) and *how* it talks (Casual, Formal, Short, Regional dialects), instead of collapsing both into one dropdown.
- **Safety-mode governor** — a "Safe / Balanced / Free" style-mode system where the safe mode's restrictions are structurally guaranteed to be non-overridable by tone or persona choices, enforced at the system-prompt composition layer, not just via post-hoc filtering.
- **Text-to-Speech** — multiple voice options (device-native, server-based HD voices), with race-condition-safe playback (no double-reads) and voiceURI-based resolution instead of fragile index lookups.
- **Document understanding** — reads and summarizes PDF, DOCX (via mammoth.js), and plain text uploads inline in the conversation.
- **Image & video generation** — a provider fallback chain (Runware → Fal → Replicate → Stability → Hugging Face → Pollinations) so generation degrades gracefully instead of failing outright when one provider is out of credits or down.
- **Hybrid suggestion chips** — a fixed set of always-useful actions (Shorten / Expand / Simplify) combined with context-generated follow-up suggestions, rather than either fully static or fully AI-guessed options.
- **Message action bar** — copy, regenerate, read-aloud, shorten, and "continue from here" (branch a new conversation from any past message) on every response.

## Architecture

```
Browser (cinocode_chat.html — single file: HTML + CSS + vanilla JS)
        │
        ▼
Netlify Functions (serverless proxy layer)
        │
        ├──► OpenAI / Groq / Gemini / DeepSeek / Mistral / OpenRouter / xAI
        ├──► Runware / Fal / Replicate / Stability / HF / Pollinations (images)
        └──► Render-hosted Flask server (Google Cloud TTS / Wavenet voices)

localStorage — chat history, favorites, per-voice custom names, preferences
```

**Why this shape:**
- **No framework, one file.** The entire client is `cinocode_chat.html` (~9,000+ lines: HTML skeleton, CSS, and JS in one place). No build step — open the file, it runs. Deliberate tradeoff for a solo project: fast iteration, zero tooling overhead, at the cost of file size and no component isolation.
- **Serverless proxy for every external call.** API keys never touch the browser. All third-party requests go through Netlify Functions, which read keys from environment variables server-side.
- **Fallback chains everywhere that can fail.** Both the LLM provider selection and the image generation pipeline are designed so that a single provider's outage or exhausted credits degrades service quality rather than breaking the feature.

## Tech stack

- **Frontend:** Vanilla JavaScript, HTML, CSS — no framework
- **Backend:** Netlify Functions (Node.js serverless)
- **TTS:** Google Cloud TTS via a separate Flask server on Render, Web Speech API as local fallback
- **Document parsing:** PDF.js, mammoth.js (DOCX)
- **Deployment:** Netlify (frontend + functions), Render (TTS server)
- **Local dev:** `netlify dev` (serves functions + static file together with live env vars)

## Getting started locally

```bash
git clone <repo-url>
cd cinocode
netlify dev
```

Then open `http://localhost:8888/cinocode_chat.html`.

You'll need your own API keys for whichever providers you want active — set them as environment variables (see `.env.example` if present, or the in-app Settings panel for local-only keys like a personal Runware key).

## Tests

```bash
npm test
npm run check:serverless
```

The smoke suite uses Node's built-in test runner. It validates style-mode prompt composition, image-provider errors, and chat-provider fallback order without real API calls, API keys, or usage charges. The older root-level provider scripts remain manual integration probes and are not part of `npm test`.

## What I'd do differently / known limitations

Being upfront about this, since it's more useful to a reviewer than pretending it's flawless:

- The smoke suite covers prompt contracts and serverless provider routing, but browser-level end-to-end coverage is not implemented yet.
- Single massive HTML file trades maintainability for zero-build-step simplicity. Past a certain size, this should be componentized (even without a framework, via ES modules).
- XLSX/PPTX document support isn't implemented yet — only PDF, DOCX, and plain text.
- The real "web search" integration is a placeholder, not a live search API, in the current version.

## Why I built this

This was a learning project to go deep on things that don't show up in typical coursework: multi-provider API orchestration, serverless proxy patterns for key security, TTS/STT integration, prompt engineering for safety and persona composition, and shipping something that's actually deployed and usable — not just a local script.
