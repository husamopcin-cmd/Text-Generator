# CinoCode Master Context

## Document Control

- **Status:** Proposed baseline v0.1
- **Date:** 2026-08-04
- **Scope:** CinoCode only
- **Approval required for:** Platform-wide architecture, physical platform endpoints, deployment topology, provider policy, and removal of legacy behavior
- **Evidence sources:** Current repository behavior, `README.md`, `CINOCODE-AUDIT-REPORT.md`, and `CINOCODE-IMPLEMENTATION-PLAN.md`

## Purpose

This document defines the stable product context and non-negotiable boundaries for preparing CinoCode to become the first client of Cino AI Platform. It describes what CinoCode is, what behavior must remain compatible, and which decisions are not yet authorized.

## Product Identity

CinoCode is a Turkish-first AI workspace for:

- Multi-provider conversational AI
- Documents and source-code inputs
- Image generation and licensed image search
- Browser-produced video storyboards/slideshows
- Text-to-speech and microphone interaction
- Vision through image upload and camera capture
- Small app/game helpers
- Projects, favorites, branching, summaries, and local conversation history
- Local profiles and optional Supabase authentication

## Primary Goal

Prepare CinoCode to consume Cino AI Platform capabilities through stable contracts while preserving all existing user-facing behavior and backward compatibility.

## Current System Boundary

### Client

- Entry point: `cinocode_chat.html`
- Styling: `assets/css/main.css`
- Main coordinator: `assets/js/main.js`
- Existing feature modules: auth, documents, memory, projects, audio, TTS, personas, and specialized coaches
- Browser capabilities: fetch/streams, IndexedDB, local/session storage, camera, microphone, speech synthesis, Canvas, Web Audio, and MediaRecorder

### Serverless Backend

- Runtime: Netlify Functions, with Vercel adapters under `api/`
- Operations: chat, image generation, image search, web search, guest session, and public auth configuration
- Shared concerns: origin checks, request-size guards, rate limits, authentication, guest access, and quota consumption

### External Systems

- AI text/vision providers
- Image generation providers
- Supabase Auth and quota RPCs
- Cloudflare Turnstile
- Openverse image search
- Optional Render TTS service
- Optional local Ollama instance

## Current Data Boundary

- Conversations, projects, summaries, preferences, drafts, model health, cooldowns, and artifacts are device-local unless explicitly stated otherwise.
- Authentication does not provide conversation synchronization.
- Authenticated access uses a Supabase bearer token.
- Guest access uses a short-lived signed guest token tied to a device identifier and client IP for quota identity.
- Managed-provider secrets belong in server/deployment environment variables.
- Existing optional direct-provider keys in browser storage are legacy compatibility behavior, not the target managed-provider security model.

## Architecture Authority Order

When documents conflict, apply this order:

1. Approved Master Context
2. Approved SRS
3. Accepted ADRs
4. Approved API Spec
5. Approved AI Engine Spec
6. Implementation plan
7. Audit report
8. Existing implementation behavior

Until a proposed document is explicitly approved, the existing implementation remains the behavioral source of truth.

## Product Invariants

The migration MUST NOT:

- Redesign the Cino AI Platform.
- Invent undocumented platform architecture.
- Break the current CinoCode UI or responsive behavior.
- Remove an existing capability without an approved deprecation decision.
- Change public request/response contracts without a compatibility layer.
- Corrupt or silently discard existing local data.
- Move browser-only capabilities into the platform without an approved contract.
- Present storyboard/slideshow output as generative-video provider output.
- Expose managed-provider credentials to the browser.

## Target Responsibility Split

### CinoCode Client Owns

- UI, interaction state, progressive rendering, and user feedback
- Browser media capture and browser artifact production
- Local persistence and migration of existing local schemas
- Platform API adaptation to existing UI models
- Explicit local-only integrations such as Ollama, if retained by an accepted ADR

### Cino AI Platform Is Expected to Own

- Managed-provider credentials
- Provider capability registry and provider execution
- Provider timeout, retry, fallback, and normalized error behavior
- Prompt execution policy after prompt contracts are approved
- Stream normalization after a streaming contract is approved
- Access control, quotas, and service-side observability

The exact platform deployment, package layout, runtime, and physical API paths are **TBD** and MUST NOT be inferred from this document.

## Migration Principles

- Contract first, implementation second.
- Characterize current behavior before changing it.
- Introduce compatibility adapters before moving execution.
- Migrate one capability at a time.
- Use feature flags or equivalent reversible routing for production changes.
- Remove duplicate legacy code only after parity, acceptance, and rollback windows are complete.
- Record every architecture-changing decision in an ADR.

## Initial Migration Order

1. Text chat compatibility contract
2. Managed-provider execution and normalized errors
3. Streaming parity
4. Vision
5. Image generation
6. Search operations
7. Voice or video only after dedicated specifications are approved

This order is a proposed migration sequence, not authorization to implement every item.

## Explicit Non-Goals

- Rebuilding the UI in a framework
- Cloud conversation synchronization
- Creating a generic tool-calling system without a specification
- Connecting a paid generative-video provider
- Replacing local browser storage
- Replacing Supabase authentication
- Consolidating Netlify and Vercel deployment adapters before runtime ownership is decided

## Open Decisions

- **MC-TBD-001:** Physical base URL and versioning strategy for Cino AI Platform
- **MC-TBD-002:** Platform runtime and deployment ownership
- **MC-TBD-003:** Streaming transport and event schema
- **MC-TBD-004:** Whether user-supplied direct-provider keys remain supported
- **MC-TBD-005:** Whether local Ollama is part of the long-term client contract
- **MC-TBD-006:** Platform model catalog and capability-discovery API
- **MC-TBD-007:** Telemetry, retention, and privacy policy
- **MC-TBD-008:** Formal approval owner for governing documents and ADRs

## Approval Statement

Approval of this baseline authorizes detailed contract design and characterization work. It does not authorize removal of legacy paths or a production traffic migration by itself.
