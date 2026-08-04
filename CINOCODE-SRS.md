# CinoCode Software Requirements Specification

## Document Control

- **Status:** Proposed baseline v0.1
- **Date:** 2026-08-04
- **Product:** CinoCode
- **Migration objective:** First client of Cino AI Platform

## 1. Purpose

This SRS defines observable requirements that CinoCode must satisfy before, during, and after migration to Cino AI Platform. Requirements preserve current product behavior unless an accepted ADR explicitly changes it.

## 2. Definitions

- **Client:** The CinoCode browser application.
- **Platform:** Cino AI Platform, responsible for approved server-side AI execution.
- **Managed provider:** A third-party provider whose credential is owned by the deployment/platform.
- **Local provider:** A user-controlled provider reachable from the browser, currently Ollama.
- **Legacy API:** Existing `/.netlify/functions/*` and `/api/*` compatibility routes.
- **Artifact:** Generated or imported image, video, code, or file retained by the client.
- **Approved:** Explicitly accepted by the project owner; proposed documents are not self-approving.

## 3. Actors

- Guest user
- Authenticated user
- CinoCode client
- Cino AI Platform
- Managed AI provider
- Optional local Ollama provider
- Deployment operator

## 4. Functional Requirements

### 4.1 Chat

- **FR-CHAT-001:** The system MUST accept chat, PDF/document, and vision task requests.
- **FR-CHAT-002:** The client MUST preserve system/persona instructions when conversation history is bounded.
- **FR-CHAT-003:** The system MUST return assistant content plus the selected provider and model when available.
- **FR-CHAT-004:** The client MUST preserve current automatic and explicit model-selection behavior until a replacement model contract is approved.
- **FR-CHAT-005:** The client MUST support stop/cancel behavior for active generation.
- **FR-CHAT-006:** The client MUST persist completed assistant messages using the existing conversation data model or a backward-compatible migration.
- **FR-CHAT-007:** Non-blocking title generation and deterministic offline title fallback MUST remain available.

### 4.2 Provider Routing

- **FR-PROV-001:** Managed-provider credentials MUST remain outside browser-delivered source and storage.
- **FR-PROV-002:** Provider selection, capability checks, timeouts, fallback order, and normalized provider errors MUST be owned by one approved execution boundary after migration.
- **FR-PROV-003:** A selected provider/model SHOULD be attempted before fallback providers when configured and compatible with the task.
- **FR-PROV-004:** Authentication, credit, rate-limit, timeout, request-size, and network failures MUST be distinguishable through stable error codes or metadata.
- **FR-PROV-005:** Legacy direct-provider behavior MUST remain available until its deprecation or compatibility policy is approved.

### 4.3 Prompt Engine

- **FR-PROMPT-001:** Prompt composition MUST support persona, tone, response style, safety mode, task type, attachment context, and relevant conversation context.
- **FR-PROMPT-002:** Prompt behavior MUST be versionable and testable without rendering the UI.
- **FR-PROMPT-003:** Critical prompt outputs MUST have characterization or snapshot coverage before extraction.
- **FR-PROMPT-004:** The platform MUST NOT silently add a product behavior that conflicts with approved CinoCode prompt rules.

### 4.4 Memory and Projects

- **FR-MEM-001:** Existing device-local conversations and projects MUST remain readable after migration.
- **FR-MEM-002:** Existing local profiles, preferences, summaries, drafts, favorites, and branches MUST not be silently discarded.
- **FR-MEM-003:** Authentication MUST NOT be represented as conversation synchronization unless sync is separately implemented and approved.
- **FR-MEM-004:** History bounding and background summary behavior MUST remain compatible.

### 4.5 Streaming

- **FR-STREAM-001:** The client MUST render progressive output when the approved execution path supports streaming.
- **FR-STREAM-002:** Streaming MUST expose a terminal success or error state.
- **FR-STREAM-003:** Cancellation MUST stop client rendering and SHOULD cancel upstream work when transport support exists.
- **FR-STREAM-004:** Partial output MUST be handled without duplicating persisted content.
- **FR-STREAM-005:** The migration MUST preserve incomplete-stream recovery behavior or replace it through an accepted ADR.

### 4.6 Image Generation and Search

- **FR-IMG-001:** Image generation MUST accept a prompt and bounded dimensions.
- **FR-IMG-002:** Image safety validation MUST execute before a managed provider request.
- **FR-IMG-003:** Image generation MUST return provider identity, one or more image references, and failed-attempt metadata when available.
- **FR-IMG-004:** Licensed image search MUST preserve attribution fields and reject unsafe queries/results.
- **FR-IMG-005:** Existing image artifacts and history MUST remain usable.

### 4.7 Video

- **FR-VIDEO-001:** Current Video Studio behavior MUST remain identified as browser-generated storyboard/slideshow output.
- **FR-VIDEO-002:** Queueing, progress, cancellation, regeneration, download, and local artifact behavior MUST remain available.
- **FR-VIDEO-003:** A generative-video provider MUST NOT be added without an approved video API specification and ADR.

### 4.8 Voice and Audio

- **FR-VOICE-001:** Existing browser speech synthesis and optional TTS-service fallback MUST remain available.
- **FR-VOICE-002:** Voice selection, custom labels, speed, and relevant preferences MUST remain locally persistent.
- **FR-VOICE-003:** Microphone permission denial or unavailable browser APIs MUST degrade safely.
- **FR-VOICE-004:** Audio attachment analysis MUST NOT be claimed as supported until implemented and specified.

### 4.9 Vision and Documents

- **FR-VISION-001:** Vision requests MUST accept supported image data from uploads or camera capture.
- **FR-VISION-002:** Vision requests MUST route only to models/providers with approved vision capability.
- **FR-DOC-001:** Existing supported document formats, size limits, archive-safety limits, and parsing timeouts MUST remain enforced.
- **FR-DOC-002:** Document context MUST remain bounded according to task and model constraints.

### 4.10 Search and Tool-Like Capabilities

- **FR-SEARCH-001:** Web search MUST accept a bounded query and return safe URL/title/snippet results.
- **FR-SEARCH-002:** Image search MUST return attribution and license metadata when provided by the source.
- **FR-TOOL-001:** Existing capability routing MAY remain client-intent based.
- **FR-TOOL-002:** A generic tool-calling protocol MUST NOT be introduced until separately specified.

### 4.11 Authentication, Guest Access, and Quotas

- **FR-AUTH-001:** Protected managed AI operations MUST require either a valid authenticated bearer token or a valid guest session.
- **FR-AUTH-002:** Guest sessions MUST require Turnstile verification outside trusted local development.
- **FR-AUTH-003:** Guest tokens MUST be short-lived and device-bound.
- **FR-AUTH-004:** Chat and image usage MUST consume the applicable quota before provider execution.
- **FR-AUTH-005:** Quota-service failure MUST fail closed for paid managed-provider execution.
- **FR-AUTH-006:** The client MUST retry a protected request once after refreshing an expired guest session.

## 5. External Interface Requirements

### 5.1 Browser UI

- **IR-UI-001:** Desktop and mobile layouts MUST preserve current core workflows.
- **IR-UI-002:** Migration errors MUST be displayed using existing user-facing error patterns.
- **IR-UI-003:** Provider/platform changes MUST NOT require a redesign of the chat composer or response renderer.

### 5.2 API

- **IR-API-001:** Existing `/.netlify/functions/*` routes and `/api/*` aliases MUST remain compatible during migration.
- **IR-API-002:** JSON operations MUST use `Content-Type: application/json`.
- **IR-API-003:** Protected requests MUST support `Authorization: Bearer <token>` or the existing guest-token headers.
- **IR-API-004:** Errors MUST use a stable machine-readable identifier and MAY include a user-readable message and structured details.

### 5.3 Storage

- **IR-STO-001:** Existing storage keys and record shapes MUST remain readable until a versioned migration is implemented.
- **IR-STO-002:** Storage migration MUST be idempotent and recoverable.
- **IR-STO-003:** Managed-provider secrets MUST NOT be added to browser storage.

## 6. Non-Functional Requirements

### 6.1 Security

- **NFR-SEC-001:** Requests MUST enforce allowed-origin policy, request-size limits, and rate limits.
- **NFR-SEC-002:** Provider responses and external URLs MUST be treated as untrusted input.
- **NFR-SEC-003:** Rendered model content MUST preserve existing sanitization controls.
- **NFR-SEC-004:** Logs MUST NOT contain provider secrets, bearer tokens, guest tokens, or full sensitive document content.
- **NFR-SEC-005:** Production traffic MUST use HTTPS.

### 6.2 Reliability

- **NFR-REL-001:** Provider failure MUST not corrupt conversation state.
- **NFR-REL-002:** Fallback execution MUST have a bounded total deadline.
- **NFR-REL-003:** Retry behavior MUST be bounded and MUST avoid duplicate persistence.
- **NFR-REL-004:** A migration rollout MUST have a tested rollback path.

### 6.3 Performance

- **NFR-PERF-001:** Chat provider execution MUST remain within the current serverless function budget unless an ADR changes the runtime.
- **NFR-PERF-002:** Progressive rendering MUST remain responsive during long responses.
- **NFR-PERF-003:** Browser video and document processing MUST avoid unbounded memory growth.
- **NFR-PERF-004:** Fallback attempts MUST share a total latency budget.

### 6.4 Compatibility

- **NFR-COMP-001:** Existing automated tests MUST continue to pass unless an approved requirement changes them.
- **NFR-COMP-002:** Public endpoint and storage changes MUST be versioned or adapted.
- **NFR-COMP-003:** Current Netlify deployment MUST remain operational until a replacement deployment is accepted.

### 6.5 Observability

- **NFR-OBS-001:** Platform execution SHOULD expose request correlation, selected provider/model, timing, fallback count, and terminal status.
- **NFR-OBS-002:** Observability fields MUST avoid sensitive prompt or document retention by default.
- **NFR-OBS-003:** Exact telemetry storage and retention are **TBD**.

## 7. Acceptance Requirements

- **AR-001:** Contract tests cover legacy chat, image generation, search, auth configuration, guest session, and quota errors.
- **AR-002:** Browser acceptance covers chat send/stop, progressive response, history persistence, image flow, documents, voice settings, projects, and mobile navigation.
- **AR-003:** Security tests cover origin rejection, body limits, rate limits, auth failure, guest verification, quota failure, and unsafe rendering.
- **AR-004:** Migration parity is demonstrated before a legacy execution path is removed.
- **AR-005:** Production third-party integrations receive a manual acceptance pass because automated tests use mocks.

## 8. Open Requirements

- **SRS-TBD-001:** Platform physical API paths and versioning
- **SRS-TBD-002:** Streaming protocol and reconnect semantics
- **SRS-TBD-003:** Long-term direct user-key support
- **SRS-TBD-004:** Long-term local Ollama support
- **SRS-TBD-005:** Service-level latency and availability targets
- **SRS-TBD-006:** Telemetry and retention policy
- **SRS-TBD-007:** Cloud conversation synchronization, if ever in scope
