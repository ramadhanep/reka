# REKA Development Guide

## Prerequisites

Recommended local environment:

- Node.js 24 LTS
- pnpm
- Docker
- OrbStack on macOS
- Git

## Local Architecture

```text
Mac
 |
OrbStack
 |
 +-- PostgreSQL
 |
 +-- optional Redis
 |
 +-- optional object storage
 |
 +-- optional observability
```

The frontend and backend run locally through the Node toolchain during development unless containerized execution is specifically useful.

## Initial Repository Bootstrap

Commands:

```bash
pnpm install
pnpm db:up          # starts local PostgreSQL via Docker Compose
pnpm db:migrate     # applies pending Drizzle migrations
pnpm demo:seed      # seeds demo organization + admin user (admin@reka.demo / demo123)
pnpm dev            # starts web (Nuxt 4) and api (NestJS + Fastify)
```

Environment defaults in `packages/config` target the local Docker PostgreSQL, so no
`.env` file is required for the default development flow. Override via `.env` or shell
environment when needed.

## Worker

Background jobs run in `apps/worker`, backed by the PostgreSQL jobs table. No extra
infrastructure is required.

```bash
pnpm --filter @reka/worker dev       # run the worker with file watching
pnpm --filter @reka/worker test      # run worker integration tests
```

Recurring job intervals are configured via environment variables where applicable
(for example `AUTH_CLEANUP_INTERVAL_MS`, default 24h).

## Environment

Use:

```text
.env
.env.example
```

Never commit secrets.

Separate variables by responsibility:

```text
APP_
DATABASE_
AUTH_
STORAGE_
REDIS_
OTEL_
```

## Profiles

Default development:

```bash
pnpm db:up
```

Optional:

```bash
docker compose --profile standard up -d
```

The `standard` profile adds Redis. The `enterprise` and `observability` compose profiles are
added in ROADMAP Stage 6 (optional infrastructure) and must not be assumed to exist yet.

Profiles map to Lite / Standard / Enterprise deployment profiles; see [MASTER_PLAN.md](./MASTER_PLAN.md).

## Branching

Use short-lived branches:

```text
feat/procurement-request
fix/auth-session
refactor/workflow-engine
docs/architecture
```

Avoid long-lived feature branches.

## Commit Strategy

Prefer small, coherent commits.

Examples:

```text
feat(procurement): add purchase request domain
feat(api): expose purchase request endpoints
test(procurement): cover approval transitions
docs(procurement): document request lifecycle
```

Do not create commits that mix unrelated refactors.

## Pull Request / Self-Review

Before merging:

1. inspect diff
2. run focused checks
3. run affected integration tests
4. run broader checks when practical
5. verify migration behavior
6. verify authorization
7. verify documentation

## Database Changes

Schema workflow:

```text
model decision
    ↓
migration
    ↓
repository/service
    ↓
API
    ↓
tests
    ↓
UI
```

Never manually edit production data as part of a normal application migration.

## Performance

Do not optimize based on intuition.

When performance matters:

1. identify a measurement
2. reproduce
3. profile
4. fix
5. measure again

Avoid premature caching.

## Resource Efficiency

Every optional dependency has:

- CPU cost
- memory cost
- operational cost
- attack surface
- upgrade cost

Prefer fewer infrastructure components until demand justifies them.
