# CinoCode Legacy Removal Migration Checklist

## Rule

Legacy code MUST NOT be removed until every applicable item is checked with durable evidence. “Looks correct” is not evidence. Each item specifies an objective verification artifact.

## Governance and Decisions

- [ ] Master Context and SRS are explicitly approved. **Evidence:** approval record names document versions/hashes.
- [ ] ADR-001 is accepted. **Evidence:** status is `Accepted` with approver/date.
- [ ] Platform runtime/base URL/versioning decision is accepted. **Evidence:** accepted ADR resolves `MC-TBD-001`, `MC-TBD-002`, and `ENGINE-TBD-001`.
- [ ] Streaming contract is accepted. **Evidence:** accepted ADR/API delta resolves `MC-TBD-003` and `ENGINE-TBD-003` with executable event fixtures.
- [ ] Direct user-key policy is accepted. **Evidence:** accepted ADR resolves `MC-TBD-004` and `ENGINE-TBD-005`.
- [ ] Local Ollama policy is accepted. **Evidence:** accepted ADR resolves `MC-TBD-005` and `ENGINE-TBD-006`.
- [ ] Telemetry/privacy/retention policy is accepted. **Evidence:** accepted ADR resolves `MC-TBD-007` and `ENGINE-TBD-008`.

## Contract Parity

- [ ] Current chat requests map without field loss. **Evidence:** tests cover `taskType`, `messages`, `images`, `selectedModel`, `temperature`, and `maxTokens`.
- [ ] Current chat success response remains compatible. **Evidence:** contract test asserts `ok`, `provider`, `model`, and `content`.
- [ ] Every current chat failure has a stable mapping. **Evidence:** tests cover bad JSON, empty messages, auth, guest, quota, 401/402/403/413/429, timeout, network, and all-provider failure.
- [ ] Image request/response parity is proven. **Evidence:** tests cover prompt, dimensions, forced provider, attempts, safety, provider failure, and successful data URI.
- [ ] Search response parity is proven. **Evidence:** web/image search tests cover empty, unsafe, timeout, provider error, safe URL, attribution, and empty safe results.
- [ ] Auth/guest headers remain accepted during the compatibility window. **Evidence:** integration tests pass for bearer and signed guest flows.
- [ ] Vercel and Netlify routes return equivalent status/body/header behavior. **Evidence:** deployment adapter parity tests.

## Provider Extraction

- [ ] Every managed provider has tested metadata. **Evidence:** provider ID, env key, default model, vision model, tasks, and endpoint fixtures.
- [ ] Provider payload builders are independently tested. **Evidence:** golden tests for each provider family.
- [ ] Provider response normalization is independently tested. **Evidence:** success/malformed/error fixtures.
- [ ] Fallback order matches the approved behavior. **Evidence:** deterministic chat/PDF/vision ordering tests.
- [ ] One total deadline bounds fallback. **Evidence:** fake-timer test proves no attempt starts after budget exhaustion.
- [ ] Managed credentials are absent from browser execution. **Evidence:** repository search and security test show no managed-key reads/direct managed URLs in shipped browser files.
- [ ] Raw provider error bodies are redacted. **Evidence:** tests inject secrets into upstream responses and assert they do not appear in public output/log fixtures.

## Prompt Parity

- [ ] Default chat prompt is characterized. **Evidence:** approved snapshot.
- [ ] Persona variants are characterized. **Evidence:** snapshot matrix.
- [ ] Safe/Balanced/Free styles are characterized. **Evidence:** snapshot matrix.
- [ ] PDF/document prompt order and bounds are characterized. **Evidence:** snapshots plus size tests.
- [ ] Vision prompt and attachment mapping are characterized. **Evidence:** snapshots plus capability tests.
- [ ] Memory/history summary insertion order is preserved. **Evidence:** existing history tests and prompt snapshot.
- [ ] Web-search context insertion is preserved. **Evidence:** prompt snapshot with safe search results.
- [ ] Prompt version appears in test/operation metadata. **Evidence:** contract test.

## Streaming and Cancellation

- [ ] OpenAI-compatible SSE fixtures produce ordered deltas. **Evidence:** stream adapter tests.
- [ ] Ollama JSON-line fixtures produce ordered deltas. **Evidence:** stream adapter tests.
- [ ] UTF-8 characters split across chunks are preserved. **Evidence:** chunk-boundary test.
- [ ] Exactly one terminal success/error event is emitted. **Evidence:** terminal-event tests.
- [ ] User cancellation aborts client transport. **Evidence:** cancellation test.
- [ ] User cancellation cancels upstream work when supported. **Evidence:** platform integration trace/test.
- [ ] Partial output is not persisted twice. **Evidence:** interruption/retry browser test.
- [ ] Premature EOF preserves current recovery behavior. **Evidence:** incomplete-stream browser test.
- [ ] Stop button and generation UI recover on every terminal path. **Evidence:** Playwright success/error/abort cases.

## Storage and User Data

- [ ] Existing `cinocode_db_{user}` localStorage records load. **Evidence:** fixture test.
- [ ] Existing IndexedDB `CinoCodeDB/workspaces` records load. **Evidence:** browser fixture test.
- [ ] localStorage-to-IndexedDB migration is idempotent and retains the approved backup behavior. **Evidence:** repeated migration test.
- [ ] Projects, branches, favorites, summaries, titles, and timestamps survive migration. **Evidence:** storage fixture comparison.
- [ ] Profile rename moves scoped database and memory exactly once. **Evidence:** test for `sinavkocu.js` behavior.
- [ ] Account deletion removes every approved scoped key/store. **Evidence:** deletion inventory test.
- [ ] No production change writes managed-provider secrets to browser storage. **Evidence:** security test and repository scan.
- [ ] Rollback reads data written during the migration window. **Evidence:** forward/backward compatibility fixture.

## UI and Browser Features

- [x] Every currently inventoried browser entry/module passes the configured syntax validation. **Evidence:** `npm run lint` includes `assets/js/modules/documents.js`; acceptance run passed.
- [x] Desktop chat acceptance passes. **Evidence:** 11 desktop Chromium Playwright cases passed during Phase 1 acceptance.
- [x] Mobile chat acceptance passes. **Evidence:** 11 Pixel 7 Playwright cases passed during Phase 1 acceptance.
- [x] Documents, images, projects, settings, account UI, and Studios navigation pass. **Evidence:** 22-case Playwright acceptance report.
- [ ] Browser TTS and configured server TTS pass manual acceptance. **Evidence:** device/browser acceptance record.
- [ ] Camera/microphone denial degrades safely. **Evidence:** permission-denial browser test.
- [ ] Storyboard/slideshow remains labeled as non-generative video. **Evidence:** UI assertion.
- [ ] Local Ollama behavior matches the accepted ADR. **Evidence:** automated and manual local acceptance.

## Security and Operations

- [ ] Origin, body-size, and rate-limit tests pass. **Evidence:** security suite output.
- [ ] Auth and guest abuse controls pass. **Evidence:** access-control and guest-session suite output.
- [ ] Quota failure prevents paid provider execution. **Evidence:** provider-call spy test.
- [ ] Logs redact credentials/tokens/data URLs/sensitive documents. **Evidence:** redaction tests.
- [ ] Correlation ID, selected provider/model, attempts, duration, and terminal status are observable. **Evidence:** sanitized trace fixture.
- [ ] Availability and latency objectives are accepted and met. **Evidence:** approved SLO plus production measurement window.
- [ ] Provider configuration runbook is current. **Evidence:** operator dry run.

## Rollout and Rollback

- [ ] New routing is disabled by default before rollout. **Evidence:** configuration test.
- [ ] Rollout can be enabled for a bounded cohort/capability. **Evidence:** feature-routing test.
- [ ] Rollback requires configuration only, not a code rebuild. **Evidence:** staging rollback drill.
- [ ] Rollback restores current endpoints and UI behavior. **Evidence:** post-rollback acceptance suite.
- [ ] No duplicate paid request occurs during shadow/parity validation. **Evidence:** request-count test/trace.
- [ ] Production provider smoke tests pass with real configured accounts. **Evidence:** dated acceptance record.
- [ ] Error rate, latency, quota consumption, and fallback rate stay within approved limits for the rollout window. **Evidence:** rollout report.
- [ ] Project owner explicitly approves legacy removal. **Evidence:** signed/recorded approval naming exact files and commit.

## Final Removal Verification

- [ ] Repository search proves removed legacy symbols have no call sites. **Evidence:** saved `rg` output in migration notes.
- [ ] Full unit suite passes after removal. **Evidence:** `npm test` output.
- [ ] Lint/syntax validation passes. **Evidence:** `npm run lint` output.
- [ ] Contract source validation passes. **Evidence:** `npm run typecheck` output; replace syntax-only check with approved checkJs/TypeScript when adopted.
- [ ] Full browser suite passes after removal. **Evidence:** `npm run test:e2e` report.
- [ ] Production build contains no removed direct-provider path. **Evidence:** built-artifact repository scan.
- [ ] Rollback tag/artifact is retained for the approved retention window. **Evidence:** release record.
