# CINOCODE IMPLEMENTATION

You are working **ONLY** on CinoCode.

## Goal

Prepare CinoCode to become the first client of Cino AI Platform.

## Rules

- Never redesign the platform.
- Never invent architecture.
- Never change public contracts.
- Never remove features.
- Never break UI.
- Always preserve backward compatibility.
- Never implement architecture not defined in documentation.
- Always follow, in order of authority: `CINOCODE-MASTER-CONTEXT.md`, `CINOCODE-SRS.md`, accepted `CINOCODE-ADR-*.md` files, `CINOCODE-API-SPEC.md`, and `CINOCODE-AI-ENGINE-SPEC.md`.
- Treat documents marked **Proposed** as implementation constraints and decision drafts, not authorization for production migration or legacy removal.
- Treat `CINOCODE-AUDIT-REPORT.md` and `CINOCODE-IMPLEMENTATION-PLAN.md` as project context, not as authority to override the documents above.

## Your Tasks

1. Analyze the requested change and the relevant approved documentation.
2. Report the current state, affected contracts, risks, and missing decisions.
3. Produce an executable plan with validation and rollback steps.
4. Implement **only** tasks explicitly approved by the governing documentation and request.

## Implementation Guardrails

- Prefer compatibility adapters and incremental migration over replacement.
- Keep provider credentials and managed provider execution outside the browser unless an approved specification explicitly states otherwise.
- Preserve existing endpoints, request/response formats, storage data, streaming behavior, and UI flows until a documented migration path is approved.
- Do not migrate browser APIs, local artifacts, voice, image, or video behavior into the platform without an approved API contract.
- Add or update focused tests when an approved change affects observable behavior.
- Stop and report when documentation is missing, conflicting, or insufficient to make a safe implementation decision.
