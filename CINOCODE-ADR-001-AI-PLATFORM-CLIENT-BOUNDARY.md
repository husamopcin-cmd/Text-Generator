# ADR-001: CinoCode as a Compatibility-Preserving Cino AI Platform Client

## Status

**Proposed** — requires project-owner approval before production migration.

## Date

2026-08-04

## Context

CinoCode currently mixes AI orchestration across two boundaries:

- `assets/js/main.js` performs intent routing, prompt composition, model selection, direct-provider execution for some user-configured providers, fallback logic, stream parsing, persistence, and rendering.
- `netlify/functions/ai-chat.js` performs managed-provider model parsing, provider payload construction, fallback execution, access control, and normalized non-streaming responses.

This duplication makes provider policy inconsistent and keeps some provider credentials in browser storage. At the same time, the browser legitimately owns UI behavior, local state, media capture, local persistence, and browser-generated artifacts.

## Decision

CinoCode will become a client of Cino AI Platform through a compatibility adapter introduced at the existing API boundary.

The approved responsibility boundary is:

- CinoCode retains UI, rendering, local persistence, browser capabilities, and explicit local-only integrations.
- Cino AI Platform owns managed-provider credentials, provider execution, provider capability metadata, timeout/fallback policy, normalized AI errors, and approved prompt/stream execution.
- Existing public endpoints and client data models remain available through adapters during migration.
- Migration occurs capability by capability, beginning with managed-provider text chat.
- Legacy provider code is removed only after parity tests, production acceptance, and rollback criteria are satisfied.

This ADR does not select a platform language, framework, deployment runtime, physical URL, or streaming transport.

## Decision Drivers

- Preserve UI and public contracts.
- Remove managed-provider credentials from browser execution.
- Eliminate duplicated provider routing after parity is achieved.
- Make provider behavior testable independently of UI rendering.
- Keep browser-only features in the browser.
- Maintain a reversible migration path.

## Consequences

### Positive

- One managed-provider execution policy.
- Clear ownership of credentials, retries, timeouts, and fallbacks.
- Smaller long-term responsibility for `assets/js/main.js`.
- Contract-level testing becomes possible.
- CinoCode can validate the platform without a full product rewrite.

### Negative

- Temporary adapters and duplicated paths remain during migration.
- Streaming parity requires an additional approved contract.
- Existing browser user-key behavior needs an explicit product decision.
- Platform outages become a direct dependency for managed-provider features.

### Risks

- Behavior drift in prompts, model selection, errors, or streaming.
- Accidental removal of local Ollama or user-key workflows.
- Duplicate requests during retry/cutover.
- Local data incompatibility if client models change unnecessarily.

## Rejected Alternatives

### Rewrite CinoCode Around a New Framework

Rejected because it expands scope, risks UI regressions, and is not required to establish the platform boundary.

### Keep Provider Execution Split Permanently

Rejected as the target architecture because it preserves duplicated policy and browser credential risk. It may remain temporarily for compatibility.

### Move All Browser Features to the Platform

Rejected because camera, microphone, speech synthesis, local persistence, Canvas, and MediaRecorder are client responsibilities.

### Remove Legacy Endpoints Immediately

Rejected because it violates backward compatibility and removes rollback capability.

## Required Follow-Up Decisions

- Streaming protocol ADR
- Direct user-key support ADR
- Local Ollama support ADR
- Platform deployment and versioning ADR
- Observability/privacy ADR

## Compliance

An implementation conforms to this ADR only if:

- It introduces or uses a compatibility adapter.
- It does not alter existing UI or storage contracts without migration support.
- It keeps managed-provider secrets out of browser-delivered code and storage.
- It includes focused parity and rollback validation.
- It does not claim physical platform architecture that is still marked TBD.
