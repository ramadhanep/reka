# REKA Project Structure

```text
reka/
│
├── apps/
│   ├── web/                       # Nuxt 4 frontend
│   │   └── app/                   # Nuxt 4 default srcDir
│   │       ├── pages/
│   │       ├── components/
│   │       ├── layouts/
│   │       ├── composables/
│   │       ├── middleware/
│   │       └── modules/
│   │
│   ├── api/                       # NestJS backend
│   │   └── src/
│   │       ├── app/
│   │       ├── common/
│   │       ├── modules/
│   │       │   ├── core/
│   │       │   ├── organization/
│   │       │   ├── identity/
│   │       │   ├── access/
│   │       │   ├── settings/
│   │       │   ├── workflow/
│   │       │   ├── audit/
│   │       │   ├── notification/
│   │       │   ├── files/
│   │       │   ├── module-registry/
│   │       │   ├── procurement/
│   │       │   ├── assets/
│   │       │   ├── hr/
│   │       │   ├── inventory/
│   │       │   ├── finance/
│   │       │   ├── projects/
│   │       │   ├── helpdesk/
│   │       │   └── crm/
│   │       └── main.ts
│   │
│   └── worker/                    # async/scheduled jobs
│
├── packages/
│   ├── ui/
│   ├── contracts/
│   ├── database/
│   ├── auth/
│   ├── storage/
│   ├── events/
│   ├── config/
│   └── tooling/
│
├── infra/
│   ├── compose/
│   ├── docker/
│   └── scripts/
│
├── docs/
│   ├── adr/
│   ├── templates/
│   ├── verification/
│   └── ...
│
├── AGENTS.md
├── ARCHITECTURE.md
├── DEVELOPMENT.md
├── ROADMAP.md
├── package.json
├── pnpm-workspace.yaml
└── opencode.jsonc
```

## Git Boundary

Only the repository root contains `.git`.

Do not initialize Git separately inside:

```text
apps/web
apps/api
apps/worker
infra
packages
```

## Why

The product is one deployable system with multiple logical components.

The codebase should be able to express a cross-layer change as one atomic change.

## Future Extraction

If a service is extracted later, create the new repository only when there is a concrete operational/business reason.

The initial repository structure must not be optimized around hypothetical extraction.
