# Task: M4 Procurement

## Goal

Build the first business module — Procurement — on the verified M0/M1/M2/M3 foundation, reusing Organization, RBAC, Module Registry, Workflow, and Audit. Prove the full purchase flow: vendor -> purchase request -> workflow approval -> purchase order -> goods receipt.

## Scope

### In scope

- Organization-scoped vendors with unique per-org codes.
- Purchase requests with free-text line items, integer (minor-unit) money.
- Workflow-driven lifecycle via the existing engine (draft -> submitted -> approved/rejected).
- Purchase orders created from approved requests and issued to active same-org vendors.
- Goods receipts against issued orders with outstanding-quantity enforcement and order status roll-up.
- Human-readable, concurrency-safe document numbers (PR-/PO-/GR-).
- Organization isolation and RBAC on every endpoint, audit integration, concurrency tests, and a usable Nuxt UI.

### Out of scope

Inventory/stock, finance/invoices/payments, catalog, budgets, RFQ, multi-level approvals, vendor portal, notifications besides the workflow hook.

## Existing Code

Relevant modules: `access`, `audit`, `workflow`, `organization`, `identity`, `module-registry`.

Patterns reused: Fastify+NestJS thin controllers, `SessionGuard` + org-scoped permission guard, Drizzle migrations under `apps/api/drizzle/`, Vitest integration harness in `apps/api/test/support.ts`, audit via `AuditService.record`, workflow definition/instance/transition via `WorkflowService`, Nuxt auto-imported composables (`app/composables`), shared UI primitives.

## Architecture

- New module: `apps/api/src/modules/procurement/`.
- Dependency direction: `procurement -> organization, access, audit, workflow, identity, module-registry`.
- Foundation changes (minimal, backward compatible):
  - `WorkflowService.createInstance` / `executeTransition` / `createDefinition` / `updateDefinition` accept an optional existing `Db` / nullable actor so business modules can execute workflow transitions atomically inside their own transactions.
  - New `WorkflowService.ensureGlobalDefinition` registers an active, system-wide definition.
  - Procurement permissions appended to the shared `permissionCatalog`.

New infrastructure dependency? No.

## Data

Migration `drizzle/0004_petite_prodigy.sql`: adds `vendors`, `purchase_requests`, `purchase_request_items`, `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_items`, `document_sequences`.

Constraints: unique `vendors(organization_id, code)` and unique `(organization_id, number)` on PR/PO/GR; FKs with `cascade`/`restrict` semantics; org + workload indexes.

## API

```text
/vendors, /purchase-requests, /purchase-orders, /goods-receipts (see docs/modules/procurement.md)
```

Authorization: `SessionGuard` + `ProcurementAccessGuard` + per-resource permissions; organization from `x-organization-id`.

## Frontend

Routes under `/procurement` (index, vendors, purchase-requests, purchase-orders, goods-receipts) via `useProcurement` composable; loading/empty/error/forbidden/success states.

## Tests

Unit: numbering, quantity/price/state rules, workflow definition shape. Integration (real PostgreSQL): vendor CRUD, full request lifecycle, workflow integration, RBAC denials, org isolation, PO creation/issue rules, receipts, audit actor correctness, concurrency (double submit/approve/receipt, parallel numbering).

## Implementation Order

1. Permissions + module manifest. 2. Schema + migration. 3. Numbering + workflow definition. 4. Repo, service, guard, DTOs, controllers. 5. Foundation workflow service extension. 6. Integration + unit tests. 7. Frontend. 8. Docs + verification.

## Verification

```bash
pnpm typecheck   # root: api + web
pnpm lint
pnpm format:check
pnpm test        # 13 api files / 125 tests + 2 web files / 10 tests (live PostgreSQL)
```

## Risks

- Concurrent transitions/mutations — mitigated with row locks (`FOR UPDATE`) inside single transactions.
- Cross-organization access — mitigated by org-scoped queries returning 404.
- Documentation numbers — atomic upsert counter; duplicates impossible, gaps possible after rollback.

## Documentation

- New `docs/modules/procurement.md` (module specification).
- New `docs/adr/0005-workflow-transaction-integration.md`.
- `docs/tasks/M4-procurement.md` (this file).
- `ROADMAP.md` Stage 4 marked completed.

## Completion Checklist

- [x] implementation
- [x] validation
- [x] authorization
- [x] tests
- [x] migration
- [x] docs
- [x] diff reviewed
- [x] verification actually run
