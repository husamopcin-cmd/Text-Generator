# CinoCode Implementation Plan

## Scope

Prepare CinoCode to become the first client of Cino AI Platform without redesigning the product, changing public contracts, removing features, or breaking the UI. Governing drafts are maintained in `CINOCODE-MASTER-CONTEXT.md`, `CINOCODE-SRS.md`, `CINOCODE-ADR-001-AI-PLATFORM-CLIENT-BOUNDARY.md`, `CINOCODE-API-SPEC.md`, and `CINOCODE-AI-ENGINE-SPEC.md`. Production migration and legacy removal require explicit approval of the relevant documents and open decisions.

## Phase 1

### Audit

- Freeze current browser and serverless request/response shapes, stream formats, storage keys, and feature behavior as compatibility baselines.
- Map all direct provider calls, user-key paths, and local Ollama behavior.
- Record current test coverage and add characterization tests only where a migration boundary lacks coverage.

### Clean Architecture Boundaries

- Separate client UI/state, browser capabilities, persistence, platform API access, prompt composition, and provider execution responsibilities.
- Preserve existing global script loading and UI contracts while boundaries are introduced behind adapters.

### Extract Contracts

- Define versioned contracts for chat requests, attachments, model selection, capabilities, stream events, results, and errors.
- Define compatibility mappings from current browser and Netlify payloads to these contracts.
- Do not change live endpoint payloads until compatibility adapters and tests exist.

## Phase 2

### Extract Provider Layer

- Move provider registry, capability metadata, model parsing, timeout, retry, and fallback policy behind an AI Engine provider interface.
- Keep credentials server/platform-side for managed providers.
- Preserve opt-in local Ollama through a documented client compatibility adapter if the approved specification requires it.

### Extract Prompt Engine

- Move task, persona, tone, response-style, safety, media, and attachment prompt composition into a versioned prompt engine.
- Snapshot prompt outputs for critical existing flows to prevent behavior drift.

### Extract Streaming

- Normalize provider streams into approved platform stream events.
- Keep token rendering, stop control, partial response recovery, and final conversation persistence behavior unchanged in the client.
- Validate cancellation, timeout, fallback, and incomplete-stream cases.

## Phase 3

### Extract AI Engine

- Compose contracts, prompt engine, provider layer, access control, execution, streaming, and observability into the approved AI Engine boundary.
- Implement a CinoCode platform client adapter that preserves current client models and API behavior.
- Gate rollout per capability and retain a tested rollback path.

## Phase 4

### Replace Browser Provider Calls

- Route managed-provider chat and vision traffic through the platform client adapter.
- Eliminate browser-held managed-provider credentials only after equivalent platform paths are accepted.
- Retain documented migration handling for existing user preferences and local-only integrations.

### Platform API Migration

- Migrate image generation after chat/stream parity is stable.
- Migrate voice or video only when their platform API contracts are approved; do not treat the current storyboard/slideshow feature as generative video.
- Version endpoints and maintain legacy adapters until compatibility exit criteria are approved.

## Phase 5

### Cleanup

- Remove duplicated provider code only after all consumers run through the platform contract and rollback windows have closed.
- Reduce `main.js` by moving approved client responsibilities into dedicated modules without changing global public behavior.
- Consolidate deployment adapters only after the production runtime authority is confirmed.

### Testing

- Run contract, unit, integration, security, and browser acceptance tests for each migrated capability.
- Include streaming parity, fallback ordering, stop/cancel, local storage migration, desktop/mobile UI, and degraded-provider cases.
- Require a manual production acceptance pass for configured third-party services.

### Documentation

- Update architecture, API compatibility, provider ownership, local development, rollout, rollback, and operational runbooks.
- Record every approved architecture decision as an ADR and keep the implementation aligned with it.

## Exit Criteria

- Existing user journeys, UI behavior, endpoints, and stored local data remain compatible.
- Managed provider credentials do not execute from browser storage.
- Platform chat, vision, and image paths meet agreed streaming, error, latency, and security acceptance criteria.
- All approved migration tests pass and the rollback procedure is validated.
