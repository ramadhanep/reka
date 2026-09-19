# Task: M2 Module System

## Goal

Establish the reusable platform mechanism that allows REKA to enable and disable business
modules dynamically while maintaining a single modular monolith, single PostgreSQL database,
and strict dependency validation without introducing microservices or destructive migrations.

## Scope

### In scope

- Strongly typed module definition (`RekaModule`, `ModuleSummary`, `ModuleCategory`)
- Module Registry service (`register`, `get`, `list`, `isEnabled`, `enable`, `disable`)
- Built-in platform modules (`identity`, `organization`, `access`, `audit`, `core`, `module-registry`)
- Future business module declarations (`assets`, `procurement`, etc.)
- Strict dependency validation (missing dependencies, circular dependencies, dependent disable protection)
- Runtime enable/disable semantics (`disable != delete`; preserves data; no DDL on toggle)
- Module route protection (`@RequireModule` decorator & guard blocking disabled module APIs with 404)
- Minimal persistence in PostgreSQL (`platform_modules` table with migration)
- Admin-facing REST API (`GET /api/v1/modules`, `GET /api/v1/modules/:id`, `POST /api/v1/modules/:id/enable`, `POST /api/v1/modules/:id/disable`)
- Authorization integration using existing session & RBAC (`module.read`, `module.manage` permissions)
- Audit logging (`module.enabled`, `module.disabled` with actor, module, timestamp, organization context)
- Frontend module management UI (Settings -> Modules) and dynamic navigation integration (hiding disabled modules)
- Unit, integration, authorization, API, and frontend tests

### Out of scope

- Implementing Procurement, HR, Finance, Inventory, or other business module domain logic
- External plugin marketplace, dynamic remote package loading, sandboxing
- Per-module microservices, separate databases, Kubernetes, Redis, Kafka, RabbitMQ

## Existing Code

Relevant files/modules:

- `packages/contracts/src/index.ts` — API contracts, error shapes
- `apps/api/src/common/database.module.ts` — Drizzle ORM + PG pool
- `apps/api/src/modules/access/` — RBAC permissions, role repository, access service
- `apps/api/src/modules/audit/` — AuditService, audit_logs schema and repository
- `apps/api/src/modules/identity/` — SessionGuard, session service, user service
- `apps/api/src/modules/organization/` — OrganizationService, member repository
- `apps/web/app/` — Nuxt 4 frontend, `useAuth`, UI components, layout

Existing patterns to reuse:

- Thin controllers, validation pipes, global HttpExceptionFilter
- SessionGuard + Permission-based ACL guard
- AuditService for immutable administrative action records
- Drizzle migrations under `apps/api/drizzle/`
- Vitest integration testing with real PostgreSQL (`support.ts`)

## Architecture

Affected modules:

- New module: `apps/api/src/modules/module-registry/`
- Updated: `packages/contracts/`
- Updated: `apps/api/src/modules/access/access.service.ts` (new catalog permissions)
- Updated: `apps/api/src/app.module.ts` (register ModuleRegistryModule)
- Updated: `apps/web/app/` (settings page, navigation composables/components)

Dependency direction:

```text
module-registry -> access (permission check)
module-registry -> audit (audit events)
module-registry -> database (persistence in platform_modules)
business modules -> module-registry (manifest registration, @RequireModule)
```

New infrastructure dependency?

- [x] no

## Data

Migration required?

- [x] yes

Schema changes:

Table `platform_modules`:

- `id`: `text` PRIMARY KEY
- `version`: `text` NOT NULL
- `enabled`: `boolean` NOT NULL DEFAULT false
- `created_at`: `timestamp with time zone` NOT NULL DEFAULT now()
- `updated_at`: `timestamp with time zone` NOT NULL DEFAULT now()

Indexes / constraints:

- Primary key on `id`

## API

Endpoints/contracts:

```text
GET  /api/v1/modules              -> list all registered modules with status
GET  /api/v1/modules/:id          -> single module detail
POST /api/v1/modules/:id/enable   -> enable module (dependency checked)
POST /api/v1/modules/:id/disable  -> disable module (protected against platform modules & active dependents)
```

Authorization:

- `SessionGuard`: 401 if unauthenticated
- `ModuleAccessGuard`:
  - Read (`GET /modules`, `GET /modules/:id`): requires authenticated session and active organization membership with `module.read` or `module.manage`
  - Manage (`POST /modules/:id/enable`, `POST /modules/:id/disable`): requires active organization membership with `module.manage`
  - 403 Forbidden if missing permission

Validation:

- ValidationPipe on all inputs
- Module existence check (404 if not found)
- Dependency validation (400 / Conflict if missing/disabled dependencies)
- Platform module disable prevention (400 Bad Request)
- Active dependent prevention (400 Bad Request)

## Frontend

Routes:

- `/settings/modules` — Module management list & toggle controls

Components:

- Navigation header in `default.vue`: displays enabled business module links and Settings link
- `ModuleList`: table/cards showing module ID, displayName, version, category, status, dependencies, enable/disable actions

States:

- loading: spinner / loading text
- empty: no modules found
- error: error banner displaying dependency errors or API failures
- success: state updated reactively
- unauthorized / forbidden: buttons disabled or forbidden message

## Tests

Unit:

- `module-registry.service.spec.ts`:
  - module registration & retrieval
  - duplicate registration rejection
  - dependency graph validation (valid, missing, circular)
  - enable / disable logic
  - platform module disable protection
  - dependent module disable protection

Integration / API:

- `module-registry.integration.spec.ts`:
  - GET /api/v1/modules & GET /api/v1/modules/:id
  - POST /api/v1/modules/:id/enable & disable
  - 401 unauthenticated
  - 403 unauthorized member without `module.manage`
  - 200 authorized admin / owner
  - audit log emission (`module.enabled`, `module.disabled`) with actor and organization context
  - database persistence verification (data preserved on toggle)
  - route protection with `@RequireModule`: 404 when disabled, 200 when enabled

Frontend:

- `apps/web/app/utils/modules.spec.ts` or component test:
  - filtering navigation items by enabled modules
  - permission check for module management actions
  - dependency error formatting

## Implementation Order

1. Contracts: `packages/contracts/src/index.ts`
2. Schema & migration: `platform-module.schema.ts` + drizzle migration
3. Module registry repository, manifests, & service with dependency validation
4. Route protection guard & decorator (`@RequireModule`)
5. Authorization guard & permission catalog updates (`module.read`, `module.manage`)
6. Controller & API endpoints (`/api/v1/modules`)
7. Audit event emission
8. Wire into `AppModule` with initial bootstrap registration
9. Frontend: Settings > Modules UI + navigation integration
10. Verification: Unit + integration + API + frontend tests
11. Documentation sync (`MASTER_PLAN.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `docs/module-system.md`)

## Verification

Commands:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Expected result:

- All test suites pass cleanly
- All linters and typechecks pass
- Formatting passes

## Risks

- Circular dependencies: mitigated with topological DFS cycle detection
- Inadvertent platform module disablement: blocked at both registry and guard levels
- Dependent module breaking on parent disablement: blocked if any active module requires it

## Documentation

Docs to update:

- `docs/tasks/M2-module-system.md`
- `MASTER_PLAN.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `docs/module-system.md`

## Completion Checklist

- [x] implementation
- [x] validation
- [x] authorization
- [x] tests
- [x] migration if needed
- [x] docs
- [x] diff reviewed
- [x] verification actually run
