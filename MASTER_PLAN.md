# REKA Master Plan

## 1. Vision

REKA is an open-source, self-hosted business operating platform for organizations that want one coherent system for identity, workflow, people, procurement, assets, inventory, finance, projects, and support.

The product should feel like one platform rather than a collection of unrelated apps.

```text
                     REKA
                      |
        +-------------+-------------+
        |             |             |
     Identity       Platform      Business
        |             |             |
       SSO          Workflow       HR
       RBAC         Audit          Procurement
       Users        Files          Assets
       Org          Notify         Inventory
                                   Finance
                                   Projects
                                   Helpdesk
```

## 2. Product Principle

REKA is not "an ERP with every feature".

It is a **modular business operating platform** where organizations can enable only what they need.

The platform must work in a lightweight installation and scale in architecture before it scales in infrastructure.

## 3. Architecture Principle

### Decision

Use:

```text
one Git repository
one monorepo
one Nuxt application
one NestJS application
optional worker
one PostgreSQL
optional infrastructure
```

Do not start with dozens of microservices.

### Why

For a solo developer, microservices create operational complexity before there is operational demand.

The architecture must preserve module boundaries so extraction remains possible later.

## 4. Repository

```text
reka/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── packages/
├── infra/
├── docs/
├── AGENTS.md
└── ...
```

Only the root has Git metadata.

## 5. Stack

### Frontend

```text
Nuxt 4
Vue 3
TypeScript
Tailwind
shared UI package
```

### Backend

```text
NestJS
Fastify
TypeScript
REST
OpenAPI
```

### Database

```text
PostgreSQL
```

Run PostgreSQL through Docker/OrbStack for local development.

### ORM

Use Drizzle as an explicit typed SQL layer over PostgreSQL.

Do not add an ORM abstraction for its own sake.

### Jobs

Start with PostgreSQL-backed jobs.

Introduce Redis when caching, queue throughput, distributed coordination, or other concrete requirements justify it.

### Identity

Support:

```text
Local authentication
OIDC
Keycloak
Cognito
Entra ID
```

REKA owns business authorization. Identity providers own authentication.

### Storage

Use:

```text
LocalFilesystem
S3-compatible
```

The application should not hard-code a storage vendor.

### Observability

Start with:

```text
structured logs
request IDs
health/readiness
```

Later:

```text
OpenTelemetry
Prometheus
Grafana
Loki
Tempo/Jaeger
```

## 6. Deployment Profiles

### Lite

```text
web
api
postgres
```

### Standard

```text
web
api
worker
postgres
redis
storage
```

### Enterprise

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

Optional components must remain optional in application code.

## 7. Core Platform Modules

Build these before a large set of business modules:

```text
core
identity
organization
access
workflow
audit
notification
files
settings
module-registry
```

The canonical module list and enable/disable semantics live in [docs/module-system.md](./docs/module-system.md).

## 8. First Business Module

### Procurement

Procurement is the first business module because it demonstrates many enterprise patterns:

```text
Employee
  ↓
Purchase Request
  ↓
Approval
  ↓
Purchase Order
  ↓
Vendor
  ↓
Goods Receipt
  ↓
Asset
```

This creates a useful end-to-end portfolio story without requiring a full finance/accounting system.

## 9. Roadmap

```text
M0 Foundation
M1 Platform Core
M2 Module System
M3 Workflow
M4 Procurement
M5 Operational Foundation
M6 Optional Infrastructure
M7 Additional Modules
M8 Enterprise
```

See [ROADMAP.md](./ROADMAP.md).

## 10. Business Modules

Potential modules:

```text
HR
Procurement
Assets
Inventory
Finance
Projects
Helpdesk
CRM
```

Do not implement every module sequentially just because it exists on the roadmap.

Build the next module when there is a useful workflow to validate the platform architecture.

## 11. Module Enable/Disable

Super admins can enable business modules.

Example:

```text
Enabled:
- HR
- Procurement
- Assets

Disabled:
- Finance
- Inventory
```

Disabling a module means:

```text
no routes
no menu
no normal API access
no background jobs
```

It does not destroy its data.

## 12. AI-First Development

AI agents are implementation assistants.

Humans own:

- product direction
- architecture
- security posture
- module boundaries
- licensing
- major infrastructure decisions

Agents should work on bounded tasks.

Preferred flow:

```text
task
 -> inspect
 -> plan
 -> implement
 -> test
 -> review
 -> update docs
```

## 13. Code Efficiency

Prefer:

- existing utilities
- existing patterns
- vertical slices
- small changes
- focused tests
- minimal dependencies
- measured optimization

Avoid:

- speculative abstractions
- premature microservices
- premature caching
- infrastructure for hypothetical scale
- broad rewrites during feature work

## 14. Definition of Product Quality

A feature is not complete because CRUD works.

A serious REKA module needs:

```text
domain behavior
validation
authorization
audit
API
UI
error states
tests
documentation
```

## 15. Open Source Strategy

The core should be genuinely usable without paying the creator.

Potential revenue:

```text
implementation
migration
customization
integrations
managed hosting
support
SLA
training
enterprise operations
```

The commercial value is expertise and operation, not artificial breakage of the core.

## 16. Documentation Language

Repository documentation:

```text
English
```

Application UI:

```text
English
Indonesian
```

Indonesian technical documentation may be added later if there is demand.

## 17. Success Criteria

REKA succeeds technically when:

1. A small company can self-host it with minimal infrastructure.
2. Modules can be enabled without rewriting the platform.
3. Business workflows are auditable.
4. Authorization is enforced server-side.
5. The codebase remains understandable to a solo maintainer.
6. A future service extraction can happen by evidence rather than guesswork.

## 18. Current Non-Goals

Do not initially attempt:

- complete accounting replacement
- payroll engine
- full CRM suite
- marketplace
- full workflow SaaS builder
- service mesh
- Kubernetes-first deployment
- event-streaming infrastructure
- multi-region active/active
- dozens of independent services

These may become future projects or later milestones.
