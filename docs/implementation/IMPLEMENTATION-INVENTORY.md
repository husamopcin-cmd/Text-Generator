# CinoCode Phase 1 Implementation Inventory

## Document Control

- **Status:** Phase 1 evidence baseline
- **Date:** 2026-08-04
- **Scope:** Current repository plus Phase 1 contracts and adapter skeletons
- **Method:** Static source inspection and characterization tests
- **Rule:** Every implementation statement below names the source that proves it.

## Runtime Topology

1. `cinocode_chat.html` loads vendor libraries and browser scripts directly; no bundle step is required (`cinocode_chat.html:9`, `cinocode_chat.html:1156`).
2. The browser invokes Netlify Functions under `/.netlify/functions/*`; Netlify aliases `/api/*` to the same functions (`netlify.toml`).
3. Vercel adapters under `api/` forward the corresponding operations to Netlify-compatible handlers (`api/_netlify-adapter.js`, `api/ai-chat.js`, `api/generate-image.js`, `api/guest-session.js`, `api/image-search.js`, `api/web-search.js`).
4. Protected chat and image operations accept Supabase bearer access or a signed guest session (`assets/js/main.js:210`, `netlify/functions/_access-control.js:251`).
5. Conversations remain browser-local in IndexedDB with a localStorage fallback (`assets/js/main.js:437`, `assets/js/main.js:3394`, `assets/js/main.js:3400`).

## Current Modules and Responsibilities

| Source | Current responsibility |
|---|---|
| `cinocode_chat.html` | Application shell, UI markup, vendor script loading, browser entry sequence, inline profile/project helpers |
| `assets/css/main.css` | Product layout, responsive behavior, component styling |
| `assets/js/main.js` | Guest access client, composer, chat state, intent routing, prompt assembly, provider/model selection, direct and proxy AI calls, streaming, rendering, image/video workflows, settings, persistence, projects/sidebar coordination |
| `assets/js/auth-core.js` | Local profiles, Supabase client configuration, cloud session initialization, access-token retrieval, sign-in/sign-up/reset/logout UI (`assets/js/auth-core.js:112`, `assets/js/auth-core.js:167`) |
| `assets/js/dil-kocu-core.js` | Language-coach prompt and interaction helpers |
| `assets/js/tts-core.js` | Browser/server TTS selection, voice persistence, language splitting, playback, fallback, stop controls (`assets/js/tts-core.js:759`, `assets/js/tts-core.js:1031`) |
| `assets/js/professions.js` | Profession/persona selection and custom profession persistence |
| `assets/js/sinavkocu.js` | Exam-coach UI, local profile operations, scoped memory/database rename/export/delete behavior (`assets/js/sinavkocu.js:664`) |
| `assets/js/modules/audio.js` | Microphone permission UX and audio warning state |
| `assets/js/modules/documents.js` | PDF/Office/ZIP/text parsing, safety limits, chunk selection; former multi-file skip semantics are preserved by a syntax-valid single-pass parser loop |
| `assets/js/modules/memory-core.js` | Memory UI and memory-state helpers exposed through `window.CinoCodeMemory` |
| `assets/js/modules/projects.js` | Project lookup/filter helper boundary exposed through `window.CinoCodeProjects` |
| `netlify/functions/ai-chat.js` | Managed chat/vision provider keys, model resolution, provider payloads, fallback, access control, normalized buffered response (`netlify/functions/ai-chat.js:227`, `netlify/functions/ai-chat.js:438`, `netlify/functions/ai-chat.js:448`) |
| `netlify/functions/generate-image.js` | Image safety, provider chain, timeouts, response validation, image result normalization (`netlify/functions/generate-image.js:522`, `netlify/functions/generate-image.js:532`) |
| `netlify/functions/image-search.js` | Safe Openverse image search and attribution normalization (`netlify/functions/image-search.js:60`) |
| `netlify/functions/web-search.js` | Server-side web search and safe result URL normalization (`netlify/functions/web-search.js:51`) |
| `netlify/functions/guest-session.js` | Turnstile verification and signed guest-token issuance (`netlify/functions/guest-session.js:36`) |
| `netlify/functions/auth-config.js` | Public Supabase/Turnstile client configuration (`netlify/functions/auth-config.js:16`) |
| `netlify/functions/_security.js` | CORS/security headers, origin check, body guard, in-instance IP rate limiting (`netlify/functions/_security.js:118`) |
| `netlify/functions/_access-control.js` | Supabase bearer verification, guest verification, quota identity and quota consumption (`netlify/functions/_access-control.js:251`) |
| `server.py` | Optional TTS service and voice-provider fallbacks |
| `cinocode.py` | Separate local Ollama command-line client; not part of the browser runtime |
| `src/contracts/*` | Phase 1 compatibility-only contract descriptors; no production imports |
| `src/adapters/*` | Phase 1 fail-closed adapter skeletons; no production imports |

## Duplicated Responsibilities

| Responsibility | Browser implementation | Server implementation | Evidence |
|---|---|---|---|
| Provider/model parsing | Nested `parseModelLabel` and provider checks | `parseModelLabel`, `resolveModelId` | `assets/js/main.js:8175`, `netlify/functions/ai-chat.js:95` |
| Fallback construction | Browser task-specific `fallbackQueue` plus health/cooldown filtering | `getFallbackOrder` plus configured-key filtering | `assets/js/main.js:8252`, `netlify/functions/ai-chat.js:438` |
| Provider payload building | Direct OpenRouter, xAI, Groq, NVIDIA, Ollama payloads | Managed provider payload switch | `assets/js/main.js:8430`, `netlify/functions/ai-chat.js:227` |
| Provider error classification | Browser HTTP/network/timeout messages and cooldowns | Backend status classification and generic errors | `assets/js/main.js:8715`, `netlify/functions/ai-chat.js:560` |
| Image provider selection | Direct Runware path plus protected endpoint fallback | Full server provider chain | `assets/js/main.js:1217`, `netlify/functions/generate-image.js:522` |
| Deployment endpoint exposure | Netlify functions and rewrites | Vercel adapter files | `netlify.toml`, `vercel.json`, `api/_netlify-adapter.js` |
| Profile-scoped database handling | Main workspace persistence | Exam-coach profile rename/export/delete helpers | `assets/js/main.js:3394`, `assets/js/sinavkocu.js:686` |

## Public APIs

| Operation | Public compatibility routes | Protection | Handler |
|---|---|---|---|
| Chat/vision/PDF completion | `POST /.netlify/functions/ai-chat`, `POST /api/ai-chat` | Bearer or guest token; chat quota | `netlify/functions/ai-chat.js:448` |
| Image generation | `POST /.netlify/functions/generate-image`, `POST /api/generate-image` | Bearer or guest token; image quota | `netlify/functions/generate-image.js:532` |
| Image search | `POST /.netlify/functions/image-search`, `POST /api/image-search` | Origin/body/rate guards | `netlify/functions/image-search.js:60` |
| Web search | `POST /.netlify/functions/web-search`, `POST /api/web-search` | Origin/body/rate guards | `netlify/functions/web-search.js:51` |
| Guest session | `POST /.netlify/functions/guest-session`, `POST /api/guest-session` | Turnstile outside trusted local dev | `netlify/functions/guest-session.js:36` |
| Public auth configuration | `POST /.netlify/functions/auth-config`, `POST /api/auth-config` | Origin/body/rate guards | `netlify/functions/auth-config.js:16` |
| Optional TTS service | `POST /tts` and health/config routes implemented by Flask | Configured CORS/origin controls | `server.py` |

The exact request/response compatibility fields and limits are frozen in `CINOCODE-API-SPEC.md` and mirrored by `src/contracts/*`.

## Storage Inventory

### IndexedDB

| Database/store/key | Data | Evidence |
|---|---|---|
| `CinoCodeDB` / `workspaces` / `cinocode_db_{user}` | `{ sessions, currentChatId, projects }` | `assets/js/main.js:437`, `assets/js/main.js:3368` |

### Session Storage

| Key | Data | Evidence |
|---|---|---|
| `cinocode_guest_session_v1` | Guest token and expiry | `assets/js/main.js:22`, `assets/js/main.js:50`, `assets/js/main.js:178` |
| `cinocode_mic_warning_dismissed` | Per-session microphone warning dismissal | `assets/js/modules/audio.js:9` |

### Local Storage: Identity and Auth

| Key | Data | Evidence |
|---|---|---|
| `cinocode_user` | Active local/cloud display name | `assets/js/auth-core.js:28`, `assets/js/auth-core.js:188` |
| `cinocode_user_age` | Optional user age | `assets/js/auth-core.js:194`, `assets/js/main.js:597` |
| `cinocode_auth_mode` | `local`, `cloud`, or pending cloud mode | `assets/js/auth-core.js:9` |
| `cinocode_cloud_auth_v1` | Legacy cloud auth marker cleared by auth code | `assets/js/auth-core.js:10`, `assets/js/auth-core.js:235` |
| `cinocode_auth_user_id`, `cinocode_auth_email`, `cinocode_auth_first_name`, `cinocode_auth_last_name` | Cloud account display metadata | `assets/js/auth-core.js:190` |
| `cinocode_local_profiles_v1` | Remembered local profile names | `assets/js/auth-core.js:38`, `assets/js/sinavkocu.js:664` |
| `cinocode_guest_device_v1` | Generated guest device identifier | `assets/js/main.js:23`, `assets/js/main.js:31` |

### Local Storage: Workspace and Artifacts

| Key | Data | Evidence |
|---|---|---|
| `cinocode_db_{user}` | Workspace fallback and retained IndexedDB migration backup | `assets/js/main.js:3368`, `assets/js/main.js:3401` |
| `cinocode_memory_{user}` | Profile-scoped memory text | `assets/js/main.js:4407`, `assets/js/sinavkocu.js:657` |
| `cinocode_composer_draft` | Composer draft and attachment metadata | `assets/js/main.js:252`, `assets/js/main.js:289` |
| `cinocode_library` | Saved image/video/code/file artifacts | `assets/js/main.js:5189`, `assets/js/main.js:5970` |
| `cinocode_video_data_cache` | Small persisted video data URLs | `assets/js/main.js:1143`, `assets/js/main.js:1169` |
| `cinocode_suggestion_history_{type}` | Recent media/game suggestions | `assets/js/main.js:1818`, `assets/js/main.js:1835` |

### Local Storage: Provider and Model State

| Key | Data | Evidence |
|---|---|---|
| `{provider}_api_key` | Legacy direct-provider keys selected by `getProviderApiKey` | `assets/js/main.js:8193` |
| `groq_api_key`, `nvidia_api_key`, `openrouter_api_key`, `runware_api_key`, `xai_api_key` | Explicit settings fields for direct calls | `assets/js/main.js:2701`, `assets/js/main.js:3143` |
| `cinocode_runware_api_key` | Older Runware key alias | `assets/js/main.js:1218` |
| `cloudflare_account_id`, `cloudflare_api_token` | Legacy Cloudflare settings fields | `assets/js/main.js:2711` |
| `ollama_ip` | Local Ollama base URL | `assets/js/main.js:2714`, `assets/js/main.js:7162` |
| `ollama_fallback_enabled` | Explicit local fallback opt-in | `assets/js/main.js:3163`, `assets/js/main.js:7170` |
| `ollama_fallback_model` | Local fallback model | `assets/js/main.js:3164`, `assets/js/main.js:7174` |
| `cinocode_model_cooldowns` | Model retry cooldown expiry map | `assets/js/main.js:8218` |
| `cinocode_model_health` | Client model health scores | `assets/js/main.js:8258` |

### Local Storage: UI, Behavior, and Voice

| Key/group | Data | Evidence |
|---|---|---|
| `cinocode_sidebar_collapsed` | Sidebar collapsed state | `assets/js/main.js:435` |
| `cinocode_style_mode_v2`, `cinocode_speech_style_v2`, `cinocode_smart_suggestions_v2`, `cinocode_new_project_v2`, `cinocode_provider_view_v2`, `cinocode_live_search_v2` | Feature preferences | `assets/js/main.js:509` |
| `free_content_mode`, `cinocode_behavior_version`, `cinocode_response_length_mode` | Response behavior preferences | `assets/js/main.js:736`, `assets/js/main.js:2083` |
| `cinocodeUiMode`, `cinocode_media_source`, `cinocode_theme`, `ui_prefs`, `fz22_color_prefs` | UI/theme/media preferences | `assets/js/main.js:263`, `assets/js/main.js:2508`, `assets/js/main.js:6283` |
| `video_mode`, `video_quality` | Browser video settings | `assets/js/main.js:2734`, `assets/js/main.js:3179` |
| `cinocode_voice_idx`, `cinocode_voice_custom_names`, `cinocode_tts_voice_lock_enabled`, `cinocode_tts_read_emojis`, `fz19_tts_speed` | TTS preferences | `assets/js/tts-core.js:25`, `assets/js/tts-core.js:334`, `assets/js/tts-core.js:706` |
| `tts_url`, `azure_speech_key`, `azure_speech_region` | Optional TTS endpoint and legacy Azure settings | `assets/js/main.js:2722`, `assets/js/main.js:3167` |
| `cinocode_custom_professions`, `fz19_tour_seen`, `cinocode_usage_role`, `cinocode_skp_source` | Persona/tour/role/coach preferences | `assets/js/professions.js:32`, `assets/js/main.js:6917`, `assets/js/sinavkocu.js:264` |

Dynamic usage/streak keys are assembled at runtime in `assets/js/main.js:6777` and `assets/js/main.js:6836`; their final key strings depend on the selected action/date scope.

## Provider Entry Points

### Server-Managed Chat and Vision

`netlify/functions/ai-chat.js:18` reads managed credentials for OpenAI, Cerebras, DeepSeek, Mistral, OpenRouter, Gemini, Groq, Fireworks, Together, xAI, and Anthropic. Provider HTTP payloads are built in `buildProviderPayload` (`netlify/functions/ai-chat.js:227`).

### Browser Direct/Local Paths

| Provider/path | Entry point | Evidence |
|---|---|---|
| Runware image | Direct `https://api.runware.ai/v1` when a browser key exists | `assets/js/main.js:1217`, `assets/js/main.js:1235` |
| OpenRouter chat | Direct OpenAI-compatible stream | `assets/js/main.js:8467` |
| xAI chat | Direct OpenAI-compatible stream | `assets/js/main.js:8500` |
| Groq chat | Direct OpenAI-compatible stream when a legacy browser key is used | `assets/js/main.js:8529` |
| NVIDIA chat/vision | Direct OpenAI-compatible stream | `assets/js/main.js:8430` |
| Ollama | Local `/api/chat` stream | `assets/js/main.js:7162`, `assets/js/main.js:7182`, `assets/js/main.js:8568` |
| Managed cloud proxy | Protected `/.netlify/functions/ai-chat` | `assets/js/main.js:8415`, `assets/js/main.js:8590` |

### Server-Managed Image Providers

The image chain is OpenAI, Stability, Runware, Fal, Replicate, Hugging Face, and Pollinations (`netlify/functions/generate-image.js:522`).

## Streaming Entry Points

| Entry | Format/responsibility | Evidence |
|---|---|---|
| Direct OpenAI-compatible providers | SSE `data:` lines and `[DONE]` | `assets/js/main.js:8874` |
| Local Ollama | JSON lines with `message.content` and `done` | `assets/js/main.js:8874` |
| Stream read loop | `response.body.getReader()`, `TextDecoder`, line buffer | `assets/js/main.js:8844`, `assets/js/main.js:8913` |
| Cancellation | `window.activeGenerationController.abort()` | `assets/js/main.js:7138` |
| Managed `ai-chat` | Complete buffered JSON; not streaming | `assets/js/main.js:8590`, `netlify/functions/ai-chat.js:566` |
| Browser video | `MediaRecorder` receives Canvas/audio stream | `assets/js/main.js:4955` |
| TTS | Browser SpeechSynthesis and server audio playback | `assets/js/tts-core.js:759`, `assets/js/tts-core.js:950` |

## Browser-Only Features

- DOM rendering, composer, responsive sidebar, message actions (`cinocode_chat.html`, `assets/js/main.js`).
- IndexedDB/localStorage/sessionStorage persistence (`assets/js/main.js:437`, `assets/js/main.js:3394`).
- Camera and microphone capture (`assets/js/main.js:1461`, `assets/js/main.js:7614`).
- Browser speech synthesis (`assets/js/tts-core.js:950`).
- Canvas/Web Audio/MediaRecorder storyboard production (`assets/js/main.js:4702`, `assets/js/main.js:4955`).
- Local Ollama connectivity (`assets/js/main.js:7162`, `assets/js/main.js:7182`).
- Client-side document parsing through PDF.js, Mammoth, XLSX, and JSZip (`cinocode_chat.html:15`, `assets/js/modules/documents.js`).

## Server-Only Features

- Managed-provider secret ownership and provider HTTP execution (`netlify/functions/ai-chat.js:18`, `netlify/functions/generate-image.js`).
- Supabase bearer verification and atomic quota consumption (`netlify/functions/_access-control.js:251`).
- Turnstile verification and guest-token signing (`netlify/functions/guest-session.js:36`).
- Origin, body-size, and rate-limit guards (`netlify/functions/_security.js:118`).
- Safe Openverse and web-search requests (`netlify/functions/image-search.js:60`, `netlify/functions/web-search.js:51`).
- Optional server TTS provider execution (`server.py`).

## Phase 1 Additions

- Compatibility contracts: `src/contracts/*`.
- Fail-closed, unconnected skeletons: `src/adapters/*`.
- Contract and no-routing tests: `tests/phase1-contracts.test.js`.
- Characterization tests for chat payloads, provider routing/fallback, storage migration, stream parsing, and cancellation: `tests/phase1-characterization.test.js`.

No production source imports a Phase 1 contract or adapter. `tests/phase1-contracts.test.js` enforces that boundary.
