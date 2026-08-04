# CinoCode Phase 2 Engineering TODO

## Entry Conditions

- Phase 1 tests are green: 396 Node tests and 22 Playwright tests.
- The former `assets/js/modules/documents.js` syntax blocker is fixed and guarded by frontend syntax validation.
- Governing baseline is accepted in `PHASE1-ACCEPTANCE.md`.
- Phase 2 does not migrate production traffic or remove legacy paths.
- Any task blocked by a `TBD` decision stops at characterization/interface work.

## P2-001: Freeze Managed Provider Metadata

- **Goal:** Represent the existing server provider IDs, default models, vision models, and configured-key names as tested compatibility metadata.
- **Affected files:** `netlify/functions/ai-chat.js`, `src/contracts/provider-metadata.js`, new internal provider metadata module, tests.
- **Risk:** Metadata can drift from actual provider payload execution.
- **Rollback:** Remove the unused metadata module; keep existing constants in `ai-chat.js` authoritative.
- **Tests:** Every current provider/default/vision mapping equals the existing handler values; no production import yet.
- **Dependencies:** None.

## P2-002: Define Provider Adapter Interface

- **Goal:** Replace the throwing `ProviderRegistry`/`ExecutionAdapter` skeleton signatures with an approved internal interface while keeping production routing unchanged.
- **Affected files:** `src/adapters/provider-registry.js`, `src/adapters/execution-adapter.js`, contract tests.
- **Risk:** Interface may prematurely encode a runtime or transport decision.
- **Rollback:** Restore Phase 1 throwing skeletons.
- **Tests:** Interface conformance fixtures for request, result, timeout, and normalized error.
- **Dependencies:** P2-001; physical module layout decision if implementation leaves the current repository.

## P2-003: Extract Provider Payload Builders

- **Goal:** Move provider-specific payload transformation into pure, independently tested functions without changing the handler response.
- **Affected files:** `netlify/functions/ai-chat.js`, new provider adapter modules, `tests/ai-chat.test.js`.
- **Risk:** Headers, model IDs, vision payloads, or token fields can change.
- **Rollback:** Revert handler imports and restore existing switch implementation.
- **Tests:** Golden payload tests for OpenAI-compatible, Gemini, and Anthropic formats; existing provider tests remain green.
- **Dependencies:** P2-001, P2-002.

## P2-004: Extract Provider Response Normalization

- **Goal:** Isolate current provider content extraction and failure classification behind compatibility functions.
- **Affected files:** `netlify/functions/ai-chat.js`, provider adapter modules, error contracts.
- **Risk:** Empty content or provider-specific finish metadata can be misclassified.
- **Rollback:** Restore inline `extractContent` and existing error branches.
- **Tests:** Success, malformed JSON, 401, 402, 403, 413, 429, timeout, and network fixtures per provider family.
- **Dependencies:** P2-002, P2-003.

## P2-005: Extract Managed Fallback Orchestrator

- **Goal:** Move current configured-provider filtering, preferred-provider-first ordering, total deadline, and continuation rules into a pure orchestrator.
- **Affected files:** `netlify/functions/ai-chat.js`, `src/adapters/execution-adapter.js`, orchestrator tests.
- **Risk:** Provider order, deadline, or terminal status changes.
- **Rollback:** Route handler back through current inline loop.
- **Tests:** Chat/PDF/vision orders, selected provider first, capability filtering, timeout budget, 413 termination, all-provider failure.
- **Dependencies:** P2-001 through P2-004.

## P2-006: Characterize Prompt Inputs

- **Goal:** Inventory every value that influences prompt assembly: persona, tone, style, task, memory, summary, document, web context, and media rules.
- **Affected files:** `assets/js/main.js`, `assets/js/dil-kocu-core.js`, `assets/js/modules/documents.js`, prompt test fixtures.
- **Risk:** Hidden global state is omitted.
- **Rollback:** Test-only work; remove fixtures if invalid.
- **Tests:** Input matrix proves each setting changes or preserves the characterized prompt at its current insertion point.
- **Dependencies:** None.

## P2-007: Extract Pure Prompt Composition Helpers

- **Goal:** Move only characterized prompt string composition into pure functions with versioned outputs; keep `sendMessage` as the caller.
- **Affected files:** `assets/js/main.js`, `src/adapters/prompt-engine.js`, new prompt module, prompt snapshots.
- **Risk:** Whitespace/order changes alter model behavior.
- **Rollback:** Restore inline prompt composition; snapshots remain as evidence.
- **Tests:** Byte-for-byte snapshots for default, Safe/Balanced/Free, persona, PDF, vision, web-search, and summary flows.
- **Dependencies:** P2-006.

## P2-008: Decide Streaming Contract

- **Goal:** Produce the minimum required streaming ADR/API delta covering transport, events, terminal state, cancellation, reconnect, and partial persistence.
- **Affected files:** `CINOCODE-ADR-*.md`, `CINOCODE-API-SPEC.md`, `CINOCODE-AI-ENGINE-SPEC.md` only if a delta is required.
- **Risk:** Choosing transport without deployment/runtime evidence.
- **Rollback:** Keep proposal unaccepted and retain current streams.
- **Tests:** Executable event fixtures for delta, done, error, cancellation, and malformed stream.
- **Dependencies:** Project-owner decision for `MC-TBD-003` / `ENGINE-TBD-003`.

## P2-009: Implement Stream Adapter Off Production Path

- **Goal:** Normalize captured OpenAI SSE and Ollama JSON-line fixtures into the approved stream events without changing `sendMessage` routing.
- **Affected files:** `src/adapters/stream-adapter.js`, new stream parser module, characterization tests.
- **Risk:** Chunk-boundary, Unicode, or terminal-event loss.
- **Rollback:** Remove unused adapter; current parser remains authoritative.
- **Tests:** Split UTF-8 chunks, split JSON lines, `[DONE]`, finish reason, malformed lines, abort, premature EOF.
- **Dependencies:** P2-008.

## P2-010: Define PlatformClient Compatibility Mapping

- **Goal:** Map current `ChatRequest`, `ChatResponse`, `ImageRequest`, `ImageResponse`, and legacy errors to logical engine contracts without network routing.
- **Affected files:** `src/adapters/platform-client.js`, `src/contracts/*`, mapping tests.
- **Risk:** Legacy error/status information is lost.
- **Rollback:** Restore throwing skeleton.
- **Tests:** Round-trip fixtures for success and every normalized error class.
- **Dependencies:** P2-002, P2-004, P2-008 for stream mapping.

## P2-011: Decide Direct User-Key Policy

- **Goal:** Resolve whether direct Runware/OpenRouter/xAI/Groq/NVIDIA keys remain, migrate, or deprecate.
- **Affected files:** New ADR; eventual `assets/js/main.js` and settings UI changes are out of scope until accepted.
- **Risk:** Security exposure versus breaking user-controlled workflows.
- **Rollback:** Retain current behavior.
- **Tests:** Decision-dependent; inventory tests must prove no unapproved key path changed.
- **Dependencies:** `MC-TBD-004`, `ENGINE-TBD-005` owner decision.

## P2-012: Decide Local Ollama Boundary

- **Goal:** Specify whether local Ollama remains a client-only opt-in adapter and how it interacts with platform fallback.
- **Affected files:** New ADR; `src/adapters/platform-client.js`; no production routing until accepted.
- **Risk:** Local privacy/offline workflow loss or accidental vision routing.
- **Rollback:** Keep existing `isOllamaFallbackEnabled` path.
- **Tests:** Existing `tests/ollama-fallback.test.js` plus adapter ordering fixtures.
- **Dependencies:** `MC-TBD-005`, `ENGINE-TBD-006` owner decision.

## P2-013: Add Shadow/Parity Harness

- **Goal:** Compare extracted provider/prompt/stream modules with current functions using fixtures without sending duplicate paid requests.
- **Affected files:** Test helpers, fixtures, CI scripts.
- **Risk:** Fixtures miss production-only provider behavior.
- **Rollback:** Remove harness; existing tests remain.
- **Tests:** Deterministic parity assertions across all captured flows.
- **Dependencies:** P2-003 through P2-010.

## P2-014: Phase 2 Exit Review

- **Goal:** Prove extracted modules are unused or behavior-identical and identify the first reversible Phase 3 integration point.
- **Affected files:** `MIGRATION-CHECKLIST.md`, migration notes, test evidence.
- **Risk:** Premature traffic routing.
- **Rollback:** No runtime change is authorized by this task.
- **Tests:** Full `npm test`, `npm run lint`, `npm run typecheck`, and Playwright acceptance.
- **Dependencies:** All unblocked Phase 2 tasks.
