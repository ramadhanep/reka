# REKA Project Instructions

## 1. Mission

REKA is an open-source, self-hosted business operating platform.

The project prioritizes:

1. correctness
2. security
3. maintainability
4. resource efficiency
5. simple deployment
6. explicit architecture boundaries

Do not optimize for architectural fashion.

## 2. Repository Model

This repository is a monorepo.

```text
apps/web       -> Nuxt frontend
apps/api       -> NestJS backend
apps/worker    -> background jobs
packages/*    -> reusable libraries and contracts
infra/*       -> Docker and operational infrastructure
docs/*        -> product and engineering documentation
```

There is one Git repository.

Do not create nested Git repositories.

Do not turn modules into microservices unless the architecture documentation explicitly approves the extraction.

## 3. Architecture

Start with a modular monolith.

Business modules belong inside the API application until a real extraction reason exists.

Use clear boundaries:

- core
- organization
- identity
- access
- settings
- workflow
- audit
- notification
- files
- module-registry
- business modules

The canonical module list and enable/disable semantics live in [docs/module-system.md](./docs/module-system.md).

Do not introduce a queue, cache, message broker, service mesh, or separate database unless the task has a concrete requirement for it.

## 4. Dependencies

Prefer the smallest dependency set that solves the problem.

Every new dependency must have a reason documented in the task or ADR.

Avoid introducing infrastructure only to make a diagram look more "enterprise".

## 5. Database

PostgreSQL is the system of record.

Database schema changes require:

- migration
- relevant tests
- rollback consideration
- authorization review
- documentation update when behavior changes

Never edit generated migration history as a shortcut.

## 6. Security

Never implement cryptography manually.

Use established libraries for:

- password hashing
- token signing
- session handling
- OIDC
- validation

Every protected API operation must define its authorization behavior.

Never trust frontend permissions.

## 7. API

REST + OpenAPI is the default.

Use versioned endpoints:

```text
/api/v1/...
```

Keep controllers thin.

Business rules belong in application/domain services.

## 8. Frontend

Use Nuxt 4 + Vue + TypeScript.

The UI must behave as one coherent platform.

Module-specific UI should live close to its module.

Do not duplicate design-system components inside business modules.

## 9. Tests

A change is not complete when it only compiles.

Prefer focused verification:

```text
format/lint
typecheck
unit tests
integration tests for affected boundaries
e2e for critical flows
```

Run the narrowest relevant tests first, then broader tests.

Do not claim a test passed unless it actually ran.

## 10. AI Agent Behavior

Before coding:

1. inspect relevant files
2. read applicable AGENTS.md
3. read the relevant architecture/module docs
4. identify existing patterns
5. state the implementation plan
6. make the smallest coherent change

During coding:

- do not rewrite unrelated files
- do not silently change architecture
- do not invent APIs that conflict with existing contracts
- do not duplicate existing utilities
- do not add speculative abstractions

After coding:

- run focused verification
- inspect the diff
- update documentation when behavior/architecture changed
- report remaining risks

## 11. Planning

For non-trivial work, create a task plan using:

[docs/templates/TASK_TEMPLATE.md](./docs/templates/TASK_TEMPLATE.md)

Use small vertical slices.

Prefer:

```text
schema -> backend -> API contract -> UI -> test
```

over large disconnected layers.

## 12. Definition of Done

A task is complete only when:

- implementation exists
- authorization is considered
- validation is present
- errors are handled
- tests cover meaningful behavior
- migrations are included if needed
- docs are updated if architecture/behavior changed
- unrelated code is untouched
- verification has actually been run
