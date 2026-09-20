# Task: M6 Optional Infrastructure Foundation

## Goal

Add optional infrastructure capabilities (Redis, OIDC, S3-compatible storage, Observability) without making them mandatory for the base REKA installation. The Lite deployment (web, api, postgres) must continue working unchanged.

## Scope

### In scope

1. **Docker Compose profile improvements** - Standardize Lite, Standard, Enterprise, Observability profiles
2. **Configuration model** - Extend `@reka/config` for optional services with validation
3. **Storage provider abstraction** - Complete `StorageProvider` interface with S3-compatible adapter
4. **OIDC provider abstraction** - Add OIDC to `@reka/auth` with provider pattern
5. **Redis adapter** - Only where justified (caching, rate limiting, distributed coordination)
6. **OpenTelemetry instrumentation** - HTTP, DB, worker jobs, external calls
7. **Observability profile** - otel-collector, prometheus, grafana, loki, tempo
8. **Tests** - Enabled/disabled modes for all optional components
9. **Documentation** - Sync MASTER_PLAN, ARCHITECTURE, ROADMAP, DEVELOPMENT, observability.md

### Out of scope

- HR, Assets, Inventory, Finance, CRM, Helpdesk modules
- LDAP/SAML/SCIM
- Antivirus scanning
- License keys / feature locking / commercial code
- Full observability stack deployment (just the abstraction and profile)

## Existing Code

Relevant files/modules:

- `infra/compose/compose.yaml` - current compose with only postgres + redis (standard profile)
- `packages/config/src/index.ts` - configuration with production validation
- `packages/storage/src/index.ts` - LocalFilesystemStorage only
- `packages/auth/src/index.ts` - AuthProvider interface with local/oidc kinds
- `apps/api/src/modules/identity/` - local auth (session-based)
- `apps/api/src/main.ts` - helmet, cors, throttler, logger setup
- `apps/worker/src/main.ts` - worker with job processing
- `packages/jobs/src/` - PostgreSQL-backed job queue

Existing patterns to reuse:

- Configuration validation pattern in `@reka/config`
- Provider interface pattern in `@reka/storage` and `@reka/auth`
- Module registry pattern for optional features
- Docker compose profiles

## Architecture

Affected modules:

- `packages/config` - add optional service config
- `packages/storage` - add S3CompatibleStorage
- `packages/auth` - add OIDC provider implementation
- `packages/database` - potentially Redis caching layer
- `apps/api` - integrate optional services
- `apps/worker` - optional Redis for caching/coordination
- `infra/compose` - add profiles

Dependency direction:

```
apps/api -> packages/config
apps/api -> packages/storage
apps/api -> packages/auth
apps/worker -> packages/config
apps/worker -> packages/storage (if needed)
infra/compose -> defines all services
```

New infrastructure dependency?

- Redis: optional, only for caching/coordination where justified
- S3-compatible storage: optional, adapter pattern
- OIDC: optional, provider pattern
- OpenTelemetry: optional, instrumentation only

## Data

Migration required? No (no schema changes for infrastructure)

## API

No new API endpoints in M6. Infrastructure only.

## Frontend

No frontend changes in M6. Infrastructure only.

## Tests

### Redis

- Enabled mode: cache works, rate limiting works
- Disabled mode: application works without Redis
- Unavailable Redis: graceful degradation

### OIDC

- Provider configuration validation
- Disabled mode: local auth works
- Identity mapping boundary test
- AuthN/AuthZ separation test

### Storage

- Local provider works
- S3-compatible provider abstraction
- Authorization before reads
- Missing provider configuration handling
- Upload/download behavior

### Observability

- Enabled/disabled behavior
- Telemetry failure does not break application

### Compose

- Validate profiles start correctly

All existing M0-M5 tests must continue passing.

## Implementation Order

1. Docker/profile cleanup (compose.yaml)
2. Configuration model (@reka/config)
3. Storage provider abstraction + S3 adapter (@reka/storage)
4. OIDC provider abstraction + integration (@reka/auth, identity module)
5. Redis adapter where justified (caching in access module, rate limiting)
6. OpenTelemetry instrumentation (HTTP, DB, jobs)
7. Observability compose profile
8. Documentation updates
9. Tests
10. Architecture review
11. Security review

## Verification

Commands:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Also verify profiles:

```bash
docker compose up -d postgres                    # Lite
docker compose --profile standard up -d          # Standard (+ redis)
docker compose --profile enterprise up -d        # Enterprise (+ oidc, storage)
docker compose --profile observability up -d     # Observability
```

Expected result:

- All typecheck, lint, format, test pass
- Lite profile works (web, api, postgres)
- Standard profile adds worker, redis
- Enterprise profile adds oidc, storage
- Observability profile adds otel collector, prometheus, grafana, loki, tempo

## Risks

- Making optional infrastructure mandatory by accident
- Breaking existing Lite deployment
- Secret leakage in logs/telemetry
- OIDC callback/state/nonce handling vulnerabilities
- S3 credential handling

## Documentation

Docs to update:

- MASTER_PLAN.md
- ARCHITECTURE.md
- ROADMAP.md
- DEVELOPMENT.md
- docs/observability.md
- docs/tasks/M6-optional-infrastructure.md (this file)

## Completion Checklist

- [ ] Docker Compose profiles
- [ ] Configuration model
- [ ] Storage provider + S3 adapter
- [ ] OIDC provider + integration
- [ ] Redis adapter (caching/rate limiting)
- [ ] OpenTelemetry instrumentation
- [ ] Observability compose profile
- [ ] Tests for all optional components
- [ ] Documentation synchronized
- [ ] Architecture review
- [ ] Security review
- [ ] All verification commands pass
- [ ] Final commit
