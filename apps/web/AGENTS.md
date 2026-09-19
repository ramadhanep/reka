# Web App Instructions

This directory contains the REKA Nuxt 4 frontend.

## Rules

- Use TypeScript.
- Keep business rules on the backend.
- Use shared UI primitives from `packages/ui`.
- Keep module-specific UI under the relevant module.
- Do not duplicate generic components.
- Route visibility is not authorization.
- Always handle loading, empty, error, success, and unauthorized states.
- Do not invent API response shapes; use established contracts.
- Keep server state and local UI state conceptually separate.
- Prefer composables for reusable behavior.
- Keep pages thin when a feature can be expressed as module components/composables.

## Before Editing

Read:

- root `AGENTS.md`
- `ARCHITECTURE.md`
- relevant module documentation

## Verification

At minimum for TypeScript changes:

```bash
pnpm typecheck
```

Run focused frontend tests for affected behavior.
