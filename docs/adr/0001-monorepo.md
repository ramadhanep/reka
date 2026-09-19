# ADR-0001: Use a Single Monorepo

## Status

Accepted

## Context

REKA contains frontend, backend, workers, shared libraries, infrastructure, tests, and documentation.

As a solo developer, multiple repositories create unnecessary coordination overhead.

## Decision

Use one Git repository:

```text
reka/
├── apps/
├── packages/
├── infra/
├── docs/
└── ...
```

Frontend, backend, worker, and infrastructure do not have separate Git repositories.

## Consequences

### Positive

- atomic changes
- simpler CI
- shared types
- shared contracts
- easier local development
- better AI-agent context
- simpler versioning

### Negative

- repository becomes larger
- CI must support selective builds/tests
- module boundaries require discipline

## Revisit When

Consider multiple repositories only when there are independent products/teams with genuinely independent release and ownership requirements.
