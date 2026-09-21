# REKA

**REKA** is the working name for an open-source, self-hosted business operating platform.

The goal is not to build "another ERP" by stacking CRUD screens. REKA is designed as a modular platform where organizations can enable only the business capabilities they need:

- Identity and access
- Organizations and people
- Workflow and approvals
- Procurement
- Assets
- Inventory
- Audit

Additional modules planned:

- HR
- Finance
- Projects
- Helpdesk

## Architecture Direction

REKA starts as a **modular monolith in a single monorepo**.

```text
                        REKA PLATFORM
                              |
                +-------------+-------------+
                |                           |
             Nuxt Web                   NestJS API
                                            |
                          +-----------------+-----------------+
                          |                 |                 |
                       Core              Modules          Integration
                     Services          Business Logic       Layer
                          |                 |                 |
                          +-----------------+-----------------+
                                            |
                                       PostgreSQL
```

Optional infrastructure is added only when needed:

```text
Redis
OIDC / Keycloak
S3-compatible storage
Background workers
OpenTelemetry
Prometheus
Grafana
Loki
Tempo
```

## Repository Rule

There is **one Git repository**.

Do not create separate repositories for frontend, backend, or infrastructure.

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
└── opencode.jsonc
```

This is a deliberate decision for a solo developer:

- one CI pipeline
- one version
- shared TypeScript contracts
- atomic cross-layer changes
- easier AI-agent context
- less release overhead

Read [AGENTS.md](./AGENTS.md) before making changes.

## Getting Started

Prerequisites: Node.js 24 LTS, pnpm, Docker.

```bash
pnpm install
pnpm db:up          # start local PostgreSQL
pnpm db:migrate     # apply migrations
pnpm demo:seed      # seed demo organization and admin user
pnpm dev            # web (localhost:3000) + api (localhost:4000)
```

Demo credentials: `admin@reka.demo` / `demo123`

See [DEVELOPMENT.md](./DEVELOPMENT.md) for details.

## Documentation Map

- [AGENTS.md](./AGENTS.md) — active OpenCode project rules
- [ARCHITECTURE.md](./ARCHITECTURE.md) — current system architecture
- [DEVELOPMENT.md](./DEVELOPMENT.md) — local development and commands
- [ROADMAP.md](./ROADMAP.md) — staged implementation plan
- [docs/code-planning.md](./docs/code-planning.md) — how implementation work must be planned
- [docs/module-system.md](./docs/module-system.md) — module boundaries and enable/disable behavior
- [docs/testing-strategy.md](./docs/testing-strategy.md) — testing standards
- [docs/security.md](./docs/security.md) — security baseline
- [docs/observability.md](./docs/observability.md) — logs, metrics, traces
- [docs/ai-agent-workflow.md](./docs/ai-agent-workflow.md) — AI-agent workflow
- [docs/verification/INITIAL_REVIEW.md](./docs/verification/INITIAL_REVIEW.md) — initial documentation review
- [docs/templates/TASK_TEMPLATE.md](./docs/templates/TASK_TEMPLATE.md) — implementation task template

## Naming

The project name is currently **REKA**.

Treat the name as provisional until a future brand/domain/package-name check is performed.
