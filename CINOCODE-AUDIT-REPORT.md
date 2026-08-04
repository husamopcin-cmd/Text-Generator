# CinoCode Audit Report

## Executive Summary

CinoCode is a framework-free, Turkish-first AI workspace. It already exposes the product capabilities expected of a first platform client, but its AI orchestration is split between the browser and Netlify Functions. The migration target should therefore be a compatibility-preserving extraction: define contracts first, move provider and prompt execution behind them, then replace browser-side provider calls without changing UI behavior.

## Current Architecture

The browser entry point is `cinocode_chat.html`. It loads feature modules and the large `assets/js/main.js` coordinator. Netlify Functions provide chat, image, search, guest-session, and auth configuration endpoints; Supabase provides authentication and quota-related functions. Browser storage retains conversations, preferences, and media artifacts.

## Chat Pipeline

`sendMessage` in `assets/js/main.js` classifies intent, constructs request messages, adds prompt rules and attachments, selects/falls back between models, reads streamed responses, persists conversation state, and renders the result. The Netlify `ai-chat` function separately normalizes a model selection, builds provider-specific payloads, applies access controls, and executes fallback routing. This duplicated orchestration is the primary extraction candidate.

## Provider System

Server-side chat supports OpenAI-compatible providers, Gemini, Groq, OpenRouter, Anthropic, and optional Ollama fallback. Image generation also implements a provider chain. The browser retains direct-provider branches for some configured user keys and local Ollama, so provider selection, model parsing, retry policy, cooldowns, and health tracking are currently not centralized.

## Prompt Engine

Prompt construction, personas, tone, response-style controls, media intent normalization, document context, and safety guidance are concentrated in `assets/js/main.js`. These rules should become a versioned prompt contract with inputs and outputs that the client can continue to render unchanged.

## Memory System

Conversation data, summaries, projects, drafts, profile preferences, and media cache are retained locally through IndexedDB, `localStorage`, and `sessionStorage`. `assets/js/modules/memory-core.js` and `projects.js` isolate some behavior, but conversation orchestration remains coupled to UI state. Authentication does not imply chat sync.

## Streaming

The browser consumes streamed chat data and handles provider-specific line formats, stop actions, partial response recovery, and final persistence. The serverless chat endpoint returns normalized non-streaming results. A platform stream contract must preserve progressive rendering, cancellation, final metadata, and incomplete-stream handling before browser routes are migrated.

## Image Pipeline

The client normalizes image prompts and calls the serverless generation endpoint. `netlify/functions/generate-image.js` owns provider selection, timeout, image validation, and fallbacks. This is a strong candidate for a platform-owned media-generation contract, while existing UI and artifact storage stay client-side.

## Video Pipeline

Video Studio currently creates a browser-side storyboard/slideshow WebM from generated scene images using `MediaRecorder`; it explicitly does not connect to a generative-video provider. Queueing, cancellation, caching, and progress are coupled to the page. Treat this as a client artifact workflow until a platform video API is specified.

## Voice System

`assets/js/tts-core.js` supports browser speech synthesis plus an optional TTS service; `assets/js/modules/audio.js` handles microphone-oriented UI. Voice settings are local. The optional TTS backend has its own CORS and provider behavior, so it should remain an adapter until a platform voice contract exists.

## Vision

The client captures images from uploads or camera APIs and routes vision requests through the chat selection flow. The serverless chat function has a vision model allowlist and provider fallback. Audio/video attachment analysis is intentionally not connected.

## Tool Calling

There is no generic, documented tool-calling protocol. Product capabilities such as image generation, web search, document parsing, video storyboard creation, and app/game helpers are dispatched through client intent logic and dedicated endpoints. Do not introduce a generic tool framework until the AI Engine specification defines one.

## Browser APIs

The application depends on `fetch`, `ReadableStream`, IndexedDB, `localStorage`, `sessionStorage`, camera/microphone `getUserMedia`, Web Speech, Web Audio, Canvas, and `MediaRecorder`. These client capabilities are product concerns and must not be moved into a server platform migration.

## Local Storage

Storage contains user preferences, session state, cooldowns, provider health, voice settings, drafts, project/conversation data, artifacts, and—where users configure direct access—provider API keys. Client-side API keys are not suitable for a managed production-provider model and need a backward-compatible retirement path.

## Provider Abstraction

`netlify/functions/ai-chat.js` has the closest existing provider abstraction through selection parsing, payload builders, content extraction, timeout, and fallback behavior. Its internal contract is not reusable by the browser, while the browser duplicates routing. Extract provider-neutral request, streaming event, response, error, and capability contracts before moving providers.

## Technical Debt

- `assets/js/main.js` combines UI, state, persistence, prompt composition, intent routing, provider calls, streaming, and media workflows.
- Chat provider behavior exists in both browser and serverless code.
- Several functions are global-script based, making dependency boundaries implicit.
- Deployment adapters exist under both `api/` and `netlify/functions/`; the canonical runtime path needs to be documented before consolidation.

## Security Risks

- Direct browser provider support can retain user API keys in `localStorage`.
- Client routing increases the risk of inconsistent request validation and telemetry between providers.
- CDN-loaded document/rendering libraries require integrity, availability, and dependency-review discipline.
- Local conversation and artifact data is device-resident; users need clear expectations about retention and sync.

## Performance Risks

- The large eager-loaded `main.js` increases parse and initialization cost.
- Streaming parsing, rendering, persistence, and media processing compete on the browser main thread.
- Browser-side video slideshow generation can be CPU/memory intensive.
- Multiple provider fallback attempts can increase latency without a shared budget or trace.

## Duplicate Code

- Browser and `ai-chat` each parse provider/model selections and perform fallback execution.
- Browser and serverless layers each carry provider-specific response handling.
- `api/` and `netlify/functions/` expose overlapping deployment-adapter concerns.
- Security/header concerns appear in deployment configuration and serverless utilities.

## Candidate AI Engine Modules

1. **Contracts:** chat request, attachment, generation options, stream event, response, error, and capabilities.
2. **Provider registry:** model catalog, capability metadata, credential ownership, selection, timeout, retry, and fallback policy.
3. **Prompt engine:** persona, tone, safety, task, and attachment-context composition with versioning.
4. **Chat orchestrator:** quota/access checks, provider execution, stream normalization, observability, and cancellation.
5. **Media adapters:** image generation first; voice and video only after their API specifications are approved.

## Candidate Client Modules

1. Chat controller and rendering, separated from provider execution.
2. Conversation/project persistence adapter around the current local data schema.
3. Browser media capture and artifact managers.
4. Voice and document UI adapters.
5. A platform API client that maps new contracts to the existing UI models.

## Migration Readiness

Readiness is **conditional**. The app can become the first client once authoritative Master Context, SRS, ADRs, API Spec, and AI Engine Spec define the target contracts. The safest first cut is chat text generation through an adapter that preserves current endpoints, payloads, streaming UX, and fallback behavior. Media, browser-local Ollama, and direct user-key paths require explicit compatibility decisions.

## Final Recommendations

1. Freeze and document current public browser/server request-response behavior before refactoring.
2. Define platform contracts and capability metadata before extracting implementation.
3. Make server/platform execution the default for managed providers; retain local Ollama only through an explicit compatibility adapter.
4. Migrate one chat path behind a feature flag, validate stream parity, then remove duplicated provider logic only after acceptance tests pass.
5. Keep UI, storage schemas, feature behavior, and existing endpoints backward compatible throughout the migration.
