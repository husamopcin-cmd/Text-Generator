# CinoCode AI Engine Specification

## Document Control

- **Status:** Proposed boundary specification v0.1
- **Date:** 2026-08-04
- **Scope:** AI execution required by CinoCode
- **Not specified:** Platform language, framework, repository layout, runtime, deployment topology, or physical endpoint paths

## 1. Purpose

The CinoCode AI Engine is the approved server-side execution boundary for managed AI providers. It normalizes client requests, applies prompt and access policy, selects a capable provider/model, executes within a bounded budget, and returns provider-neutral results or stream events.

This specification defines responsibilities and contracts without inventing platform implementation architecture.

## 2. Goals

- Remove managed-provider execution policy from the browser.
- Centralize model capabilities, credentials, timeout, retry, and fallback behavior.
- Preserve CinoCode request/response and UI behavior through adapters.
- Make prompt composition and provider behavior independently testable.
- Support incremental and reversible migration.

## 3. Non-Goals

- UI rendering or browser state management
- Browser storage or cloud conversation sync
- Camera, microphone, speech synthesis, Canvas, or MediaRecorder orchestration
- A generic tool-calling framework
- Generative-video execution
- Selection of platform infrastructure not defined by an accepted ADR

## 4. Logical Components

Logical components define responsibilities, not mandatory files or deployable services.

### 4.1 Compatibility Adapter

Responsibilities:

- Accept existing CinoCode API payloads.
- Map legacy fields to engine contracts.
- Map engine results/errors back to legacy response shapes.
- Preserve endpoint-specific status behavior during migration.

### 4.2 Contract Validator

Responsibilities:

- Validate task type, messages, attachments, options, and size limits.
- Normalize defaults.
- Reject unsupported or malformed requests before provider execution.
- Preserve required system messages when bounding history.

### 4.3 Access Policy

Responsibilities:

- Verify authenticated or guest identity.
- Consume usage quota before paid provider execution.
- Apply origin, body-size, and rate-limit guards.
- Fail closed when access or quota cannot be verified.

### 4.4 Prompt Engine

Responsibilities:

- Compose approved persona, tone, response style, safety mode, task, and attachment context.
- Produce a versioned prompt result.
- Avoid UI-specific rendering logic.
- Support deterministic tests for critical prompt combinations.

### 4.5 Capability Registry

Responsibilities:

- Describe provider/model support for chat, vision, document context, and streaming.
- Define approved model identifiers and aliases.
- Prevent task routing to incompatible models.
- Expose only capability metadata approved for clients.

### 4.6 Provider Adapter

Responsibilities:

- Convert normalized requests to provider-specific payloads.
- Keep provider credentials server-side.
- Normalize provider content, usage metadata, and errors.
- Respect cancellation and timeout signals where supported.

### 4.7 Execution Orchestrator

Responsibilities:

- Resolve requested model/provider intent.
- Build a bounded fallback plan from configured capable providers.
- Execute attempts within one total request deadline.
- Stop on success and return terminal failure after the plan is exhausted.
- Avoid retries that can duplicate externally visible side effects.

### 4.8 Stream Normalizer

Responsibilities:

- Convert provider-specific streams to the approved platform event contract.
- Emit one terminal event.
- Preserve partial text ordering.
- Propagate cancellation and normalized errors.

Streaming transport and event schema are **TBD**.

### 4.9 Observability Boundary

Responsibilities:

- Generate or propagate a correlation identifier.
- Record task, selected provider/model, attempt count, timing, and terminal status.
- Redact credentials, tokens, and sensitive content.
- Apply an approved retention policy.

Retention, storage, and telemetry provider are **TBD**.

## 5. Core Contracts

The examples below are logical schemas. Physical serialization and endpoint paths are governed by the approved API specification.

### 5.1 `AIRequest`

```json
{
  "requestId": "optional-client-id",
  "task": "chat",
  "messages": [
    {
      "role": "system",
      "content": "instruction",
      "attachments": []
    },
    {
      "role": "user",
      "content": "question",
      "attachments": [
        {
          "type": "image",
          "mediaType": "image/jpeg",
          "data": "data-or-approved-reference"
        }
      ]
    }
  ],
  "modelPreference": {
    "provider": "groq",
    "model": "model-id"
  },
  "generation": {
    "temperature": 0.7,
    "maxTokens": 1024
  },
  "promptContext": {
    "persona": "default",
    "tone": "default",
    "responseStyle": "balanced",
    "promptVersion": "cinocode-v1"
  }
}
```

### 5.2 `AIResult`

```json
{
  "ok": true,
  "requestId": "correlation-id",
  "task": "chat",
  "provider": "groq",
  "model": "resolved-model-id",
  "content": "assistant response",
  "finishReason": "stop",
  "usage": {
    "inputTokens": null,
    "outputTokens": null
  },
  "promptVersion": "cinocode-v1",
  "attempts": 1
}
```

Only fields available from the provider are populated. Legacy adapters MAY omit fields not present in current responses.

### 5.3 `AIError`

```json
{
  "ok": false,
  "requestId": "correlation-id",
  "error": {
    "code": "provider_rate_limited",
    "message": "Stable user-readable message",
    "retryable": true,
    "provider": "groq",
    "model": "resolved-model-id",
    "status": 429
  }
}
```

Required normalized error categories:

- `invalid_request`
- `request_too_large`
- `unsupported_task`
- `unsupported_model`
- `authentication_required`
- `quota_exceeded`
- `provider_not_configured`
- `provider_unauthorized`
- `provider_payment_required`
- `provider_rate_limited`
- `provider_timeout`
- `provider_network_error`
- `provider_error`
- `all_providers_failed`
- `cancelled`
- `internal_error`

### 5.4 `Capability`

```json
{
  "provider": "groq",
  "model": "model-id",
  "tasks": ["chat", "vision"],
  "streaming": true,
  "enabled": true
}
```

Client-visible cost, quota, context-window, and model-lifecycle fields are **TBD**.

## 6. Prompt Engine Requirements

- Prompt inputs MUST be explicit and typed/versioned.
- Prompt output MUST be deterministic for the same inputs and prompt version, excluding explicitly dynamic context.
- Product safety and response-style rules MUST remain compatible with characterized CinoCode behavior.
- Attachment/document context MUST be bounded before provider execution.
- Prompt versions MUST be observable in test output and SHOULD be present in platform metadata.
- Prompt changes that alter observable behavior require tests and release notes.

## 7. Provider Selection Requirements

- The requested configured provider/model is attempted first when capable.
- Fallback candidates include only configured, enabled, task-capable providers.
- Vision requests route only to vision-capable models.
- The orchestrator MUST use a single total execution deadline.
- Authentication, payment, rate-limit, timeout, and transient network failures MAY continue to the next approved provider.
- Request-too-large failures SHOULD terminate the fallback chain unless the engine has an approved safe reduction strategy.
- Provider response bodies MUST NOT be exposed unredacted to clients.

The exact provider order and model catalog remain configuration owned and MUST preserve current behavior until approved changes exist.

## 8. Streaming Requirements

Before browser direct streaming is replaced, the approved streaming contract MUST define:

- Transport
- Authentication
- Event identifiers and ordering
- Text delta events
- Provider/model metadata
- Terminal success and error events
- Cancellation semantics
- Reconnect/resume behavior
- Partial-output persistence rules
- Timeouts and heartbeats

No stream transport is selected by this specification.

## 9. Security Requirements

- Managed-provider credentials MUST never be returned to the client.
- Identity and quota MUST be validated before managed-provider execution.
- Prompt, attachment, and provider response sizes MUST be bounded.
- External URLs and provider payloads MUST be validated according to operation risk.
- Logs MUST redact tokens, credentials, full data URLs, and sensitive document content.
- Error responses MUST avoid leaking raw provider secrets or internal stack traces.
- Server-side fetches MUST use bounded timeouts and approved destinations.

## 10. Compatibility Requirements

- The compatibility adapter MUST support current `taskType`, `messages`, `selectedModel`, `temperature`, and `maxTokens` fields.
- Current chat success fields `ok`, `provider`, `model`, and `content` MUST remain available.
- Existing protected-request headers MUST remain accepted during migration.
- Existing browser storage and UI models MUST not depend on the internal engine schema.
- Legacy response errors MUST be mapped from normalized engine errors without losing status or retry meaning.

## 11. Testing Requirements

### Contract Tests

- Legacy request mapping
- Legacy response and error mapping
- Authenticated and guest authorization
- Quota and rate-limit behavior
- Message/history bounding
- Vision attachment mapping

### Provider Adapter Tests

- Payload transformation
- Content extraction
- Error normalization
- Timeout and cancellation
- Credential redaction

### Orchestrator Tests

- Preferred provider first
- Capability filtering
- Bounded fallback order
- Total deadline exhaustion
- Terminal success/error uniqueness

### Prompt Tests

- Persona/tone/style combinations
- Chat/PDF/vision task composition
- Safety mode compatibility
- Attachment context bounds
- Prompt version changes

### Migration Tests

- Existing CinoCode unit suite
- Browser acceptance suite
- Production provider smoke pass
- Rollback route validation

## 12. Rollout Requirements

1. Characterize legacy behavior.
2. Introduce the compatibility adapter with no traffic change.
3. Validate contract parity in tests.
4. Route an approved capability through the engine behind reversible configuration.
5. Compare success, latency, error, and fallback behavior.
6. Complete production acceptance.
7. Expand traffic only with approval.
8. Remove legacy execution only after a documented rollback window.

## 13. Open Decisions

- **ENGINE-TBD-001:** Runtime and deployment topology
- **ENGINE-TBD-002:** Physical module/package boundaries
- **ENGINE-TBD-003:** Streaming transport and event schema
- **ENGINE-TBD-004:** Model catalog source and lifecycle
- **ENGINE-TBD-005:** Direct user-key policy
- **ENGINE-TBD-006:** Local Ollama boundary
- **ENGINE-TBD-007:** Idempotency and request correlation contract
- **ENGINE-TBD-008:** Telemetry storage and retention
- **ENGINE-TBD-009:** Formal latency/availability objectives
