# REKA Architecture

## 1. North Star

A small organization should be able to run REKA with:

```text
Nuxt
NestJS
PostgreSQL
```

A larger organization should be able to add:

```text
Redis
worker
OIDC
object storage
observability
integrations
```

without replacing the core architecture.

## 2. Monorepo

The repository contains all product layers:

```text
reka/
├── apps/
│   ├── web/                    # Nuxt 4 + Vue + Tailwind
│   ├── api/                    # NestJS + Fastify
│   └── worker/                 # background jobs
│
├── packages/
│   ├── ui/                     # shared UI components
│   ├── contracts/              # API/domain contracts
│   ├── database/               # DB utilities and schema access
│   ├── auth/                   # auth abstractions
│   ├── storage/                # storage abstraction
│   ├── events/                 # event contracts
│   ├── config/                 # shared configuration
│   └── tooling/                # shared lint/ts/test config
│
├── infra/
│   ├── compose/                # Docker Compose profiles
│   ├── docker/                 # Dockerfiles
│   └── scripts/                # local/ops scripts
│
├── docs/
├── AGENTS.md
├── opencode.jsonc
├── package.json
└── pnpm-workspace.yaml
```

This is a monorepo, not a multi-repository system.

## 3. Why Frontend, Backend, Infra, and Docs Share Git

A single product change often crosses all boundaries:

```text
DB migration
  -> API
  -> contract
  -> frontend
  -> test
  -> Docker
  -> documentation
```

One repository allows that change to be atomic.

Splitting these into separate repositories would create:

- version coordination
- cross-repo PRs
- duplicated CI
- harder AI context
- more releases
- more operational work

For a solo developer, these costs are not justified.

## 4. Application Boundaries

### Web

Responsible for:

- routing
- UI
- user interaction
- client state
- server data fetching
- module navigation

It does not own business rules.

### API

Responsible for:

- authentication integration
- authorization
- validation
- business rules
- transactions
- persistence orchestration
- audit events

### Worker

Responsible for:

- asynchronous jobs
- scheduled jobs
- long-running tasks
- external integrations that should not block requests

The worker can share packages with the API.

## 5. Backend Module Structure

Inside `apps/api`:

```text
src/
├── app/
├── common/
├── modules/
│   ├── core/
│   ├── organization/
│   ├── identity/
│   ├── access/
│   ├── settings/
│   ├── workflow/
│   ├── audit/
│   ├── notification/
│   ├── files/
│   ├── module-registry/
│   ├── procurement/
│   ├── assets/
│   ├── hr/
│   ├── inventory/
│   ├── finance/
│   ├── projects/
│   ├── helpdesk/
│   └── crm/
└── main.ts
```

Platform modules (`core`, `organization`, `identity`, `access`, `settings`, `workflow`, `audit`, `notification`, `files`, `module-registry`) are foundational and always present.

Business modules (`procurement`, `assets`, `hr`, `inventory`, `finance`, `projects`, `helpdesk`, `crm`) are enable/disable capabilities. See [docs/module-system.md](./docs/module-system.md) for lifecycle and enable/disable semantics.

A module should own its:

- controller/API surface
- application services
- domain rules
- persistence adapters
- module tests

Shared infrastructure belongs in packages, not copied between modules.

## 6. Module Dependency Rules

Prefer:

```text
business module
    -> platform module
    -> shared package
```

Avoid:

```text
procurement
    -> finance internals
    -> HR internals
    -> inventory internals
```

Instead communicate through explicit application services/events/contracts.

### Allowed examples

```text
procurement -> workflow
procurement -> audit
procurement -> notification
procurement -> organization
```

### Future extraction target

A module may eventually become:

```text
procurement-service
```

but its public contracts should already be explicit before extraction.

## 7. Data Ownership

At the beginning:

```text
one PostgreSQL database
```

but modules still own their logical data.

Do not let every module freely query every table.

Prefer module-owned repositories/services.

Later, a module can migrate to its own database if extraction is justified.

## 8. Authentication vs Authorization

Authentication answers:

> Who are you?

Authorization answers:

> What may you do here?

Identity providers can handle authentication:

- local mode
- OIDC
- Keycloak
- Cognito
- Microsoft Entra ID

REKA owns business authorization:

- organization membership
- role
- permission
- scope
- approval authority

## 9. Storage

Use an abstraction:

```text
StorageProvider
├── local
└── s3-compatible
```

Default:

```text
local volume
```

The database stores metadata; object/file storage stores binary content.

## 10. Optional Infrastructure

Base:

```text
web
api
postgres
```

Standard:

```text
web
api
postgres
worker
redis
storage
```

Enterprise:

```text
web
api
worker
postgres
redis
oidc
storage
observability
```

Optional infrastructure must not leak assumptions into core business logic.

## 11. Extraction Criteria

Extracting a module into a service requires an explicit ADR.

Valid reasons include:

- independent scaling
- failure isolation
- deployment independence
- resource profile
- security boundary
- data ownership
- external integration constraints

Invalid reason:

> "Microservices are more professional."

## 12. Current Decision

**REKA is a modular monolith until evidence says otherwise.**
