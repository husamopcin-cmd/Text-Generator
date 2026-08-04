# CinoCode Phase 1 Technical Debt Report

## Rating Method

- **Critical:** Security, data-loss, or migration-blocking risk.
- **High:** Major reliability/maintainability risk that must be addressed before legacy removal.
- **Medium:** Important but can follow provider boundary extraction.
- **Low:** Localized cleanup with limited runtime risk.
- Effort estimates are engineering person-days including focused tests, not calendar commitments.

## Resolved During Phase 1 Acceptance

| Debt | Resolution | Validation |
|---|---|---|
| Browser-loaded document module contained two loop-external `continue` statements | The extracted single-file parser now uses a single-pass loop, preserving the former multi-file skip behavior and common project-state cleanup | `node --check assets/js/modules/documents.js`; 396 Node tests; 22 Playwright tests |

## Critical

| Debt | Evidence | Impact | Estimated effort | Exit evidence |
|---|---|---|---:|---|
| Managed and direct provider execution coexist in the browser | `assets/js/main.js:8430`, `assets/js/main.js:8467`, `assets/js/main.js:8500`, `assets/js/main.js:8529` | Browser-held secrets, inconsistent validation and observability | 8–15 days plus ADR decisions | No managed-provider credential read or managed-provider direct URL remains in browser execution; compatibility decision recorded |
| `sendMessage` mixes UI, prompt, routing, execution, streaming, persistence, and TTS | `assets/js/main.js:7650` | Any extraction can break multiple unrelated user flows | 10–20 days across Phases 2–4 | Characterized stages, adapters, parity tests, and production rollout evidence |
| No approved platform streaming transport/event contract | `assets/js/main.js:8844`, `CINOCODE-AI-ENGINE-SPEC.md` | Direct streams cannot be safely replaced; cancellation semantics undefined | 3–6 days for ADR/spec/tests | Accepted streaming ADR and executable contract tests |
| Prompt behavior is embedded in UI orchestration | Request assembly in `assets/js/main.js:8076` onward | Safety/persona/style behavior can silently drift during extraction | 5–10 days | Versioned prompt inputs/outputs and snapshots for critical modes |

## High

| Debt | Evidence | Impact | Estimated effort | Exit evidence |
|---|---|---|---:|---|
| Provider parsing and fallback are duplicated | `assets/js/main.js:8175`, `assets/js/main.js:8252`, `netlify/functions/ai-chat.js:95`, `netlify/functions/ai-chat.js:438` | Different provider order/capability behavior | 5–8 days | One managed registry/orchestrator with parity tests |
| Buffered managed chat and streamed direct chat have different response paths | `assets/js/main.js:8590`, `assets/js/main.js:8844` | Inconsistent finish reasons, TTS timing, continuation handling | 4–8 days | One normalized result/stream consumption layer |
| Workspace storage is global-script state with dual IDB/localStorage behavior | `assets/js/main.js:437`, `assets/js/main.js:3394`, `assets/js/main.js:3400` | Data-loss risk during modularization | 4–7 days | Storage adapter tests cover read, write, migration, fallback, rename, delete |
| Image execution is split between direct Runware and server chain | `assets/js/main.js:1217`, `netlify/functions/generate-image.js:522` | Duplicate credential/quota/error behavior | 3–6 days plus user-key decision | Approved path and response parity evidence |
| Global mutable state controls active generation | `assets/js/main.js:7053`, `assets/js/main.js:7127` | Race conditions across stop/retry/new messages | 3–5 days | Generation lifecycle tests and isolated controller |

## Medium

| Debt | Evidence | Impact | Estimated effort | Exit evidence |
|---|---|---|---:|---|
| `main.js` is approximately 500 KB and loaded as one global script | `assets/js/main.js` | Parse cost and difficult ownership | 10–18 days incremental | Approved client modules with unchanged script/public behavior |
| Netlify/Vercel exposure is duplicated | `netlify.toml`, `vercel.json`, `api/*` | Deployment parity can drift | 2–4 days | Deployment authority ADR and parity tests |
| Vendor parsing libraries are CDN-loaded | `cinocode_chat.html:11` through `cinocode_chat.html:23` | Availability/version integrity dependency | 2–4 days | Approved vendoring/SRI/fallback policy |
| Voice workflow contains browser and optional server fallback complexity | `assets/js/tts-core.js`, `server.py` | Device-specific failures and hard-to-reproduce routing | 3–6 days | Voice route characterization matrix |
| Dynamic storage keys are not centrally cataloged in code | `assets/js/main.js:6777`, `assets/js/main.js:6836` | Migration and deletion completeness is hard to prove | 2–3 days | Versioned storage key registry without changing existing key values |

## Low

| Debt | Evidence | Impact | Estimated effort | Exit evidence |
|---|---|---|---:|---|
| Compatibility contracts are descriptors rather than compile-time types | `src/contracts/*` | Drift is caught by tests rather than a JS type system | 1–3 days if TypeScript/JSDoc compiler is approved | Real checkJs/TypeScript validation in CI |
| Adapter skeletons intentionally contain no dependency injection contract yet | `src/adapters/*` | Phase 2 implementation choices remain open | 1–2 days after ADRs | Accepted constructor/dependency contract |
| Some settings preserve legacy provider fields no longer used for managed paths | `assets/js/main.js:2690`, `assets/js/main.js:3122` | UI/config confusion | 1–3 days after deprecation approval | Usage evidence and approved removal checklist |

## Total Phase 2 Preparation Estimate

Provider extraction, prompt characterization, and streaming contract work are estimated at **20–40 person-days**, depending primarily on decisions for streaming, direct user keys, and local Ollama. This estimate does not include production traffic migration or legacy removal.
