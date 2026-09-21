# Task: M7.2 Inventory Management

## Goal

Add the first usable Inventory business module: items, warehouses/locations, a stock ledger with current balances, and stock operations (receive from Goods Receipt, transfer, adjustment, issue). Inventory stays a separate module from Asset Management; it reuses organization, RBAC, module registry, audit, and procurement.

## Scope

### In scope

- `inventory` module registration through the existing module registry.
- `InventoryItem`, `Warehouse`, `WarehouseLocation`, `StockBalance`, `StockMovement`.
- Stock operations: receive (from procurement goods receipt), transfer, adjustment, issue.
- Row-level locking + CHECK constraints for concurrency safety; no negative stock.
- Organization isolation on every endpoint; server-side authorization via RBAC.
- Audit events for item/warehouse/location/stock changes.
- API under `/api/v1/inventory/**`.
- Nuxt UI: items, warehouses (detail with locations), stock, movements, action forms.
- Unit, integration, concurrency (live PostgreSQL), and HTTP e2e tests.
- `docs/tasks/M7-inventory.md` and `docs/modules/inventory.md`.

### Out of scope

- Asset creation from stock receipts (explicit Assets boundary, deferred).
- Product catalog, variants, bundles, BOM, manufacturing, serial-number inventory.
- Fulfillment/order issuing, reservations, bins/pickers, multi-tenant transfers.
- Full warehouse-management UI (pickers, zones, barcodes).
- HR, Finance, Projects, Helpdesk.

## Existing Code

Relevant modules/files:

- `apps/api/src/modules/assets/*` — reference business module (schema, repo, rules, service, guard, controller, dto).
- `apps/api/src/modules/procurement/*` — purchase orders / goods receipts to integrate with.
- `apps/api/src/modules/audit/audit.service.ts` — shared audit events.
- `apps/api/src/modules/access/access.service.ts` — `permissionCatalog` + `backfillOwnerRolePermissions`.
- `apps/api/src/modules/module-registry/module-manifests.ts` — `inventoryModuleManifest` already exists (disabled).
- `apps/api/src/common/org-permission.guard.ts` — `createOrgPermissionGuard`.
- `apps/api/drizzle/` — generated migrations (0000..0007); new tables via drizzle-kit.
- `apps/api/test/support.ts` — live PostgreSQL test helpers.
- `apps/web/app/pages/assets/*` and `apps/web/app/composables/useAssets.ts` — frontend reference patterns.

Existing patterns to reuse:

- Organization-scoped uuid PK tables, snake_case columns, `created_at`/`updated_at`.
- Transactional service methods (`this.database.db.transaction`) + audit within the tx.
- `createOrgPermissionGuard` per-module access guard + `@RequireModule`/`ModuleEnabledGuard`.
- `AccessService.seed()` backfill of `inventory.*` permissions to the owner role.
- `onConflictDoUpdate` upserts and conditional `UPDATE ... WHERE quantity >= delta` for atomic balance changes.

## Architecture

Affected modules:

- `apps/api/src/modules/inventory/` (new business module).
- `apps/api/src/modules/procurement/` (new read facade for the receive integration).
- `apps/api/src/modules/access/` (permission catalog entries).
- `apps/api/src/modules/module-registry/` (inventory permissions in manifest).
- `apps/web/app/pages/inventory/*`, `apps/web/app/composables/useInventory.ts` (new).

Dependency direction:

```text
inventory
  -> organization (tenant scoping)
  -> access       (RBAC)
  -> audit        (events)
  -> identity     (SessionGuard actor)
  -> module-registry (module guard)
  -> procurement  (runtime read facade for receive validation)
```

Runtime coupling to `ProcurementService` is deliberate and additive (a single read medium in the owning module). The module-manifest dependency list is left as the M7.1 baseline `['organization', 'assets']` on purpose so the existing M0-M7.1 module-registry tests keep their exact enablement semantics; the inventory lifecycle does not require procurement to be enabled because receive still validates against durable `goods_receipts` rows.

New infrastructure dependency?

- None. PostgreSQL only. No queue/cache/broker.

## Domain Model

```text
InventoryItem (stock-keeping item; not an individual asset)
Warehouse (org-scoped, code unique per org)
WarehouseLocation (belongs to exactly one warehouse)
StockBalance (materialized current state; unique per org+item+location)
StockMovement (append-only ledger; every change writes a movement)
```

Quantity representation:

- `NUMERIC(18,4)` with drizzle `mode: 'number'`. Supports integer and fractional units (5, 2.5, 0.25) and avoids float drift. See `docs/modules/inventory.md`.

Movement types:

```text
RECEIPT, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT_IN, ADJUSTMENT_OUT, ISSUE
```

Direction implied by the type; movement `quantity` is always a positive magnitude.

Reference model:

- `referenceType`: `GOODS_RECEIPT | TRANSFER | ADJUSTMENT | ISSUE`.
- `referenceId`:
  - `GOODS_RECEIPT` -> goods_receipt_item uuid (partial unique index enforces exactly-once stocking).
  - `TRANSFER` -> the TRANSFER_OUT movement uuid (groups the pair).
  - `ADJUSTMENT` / `ISSUE` -> null (no doc tables; the movement is the record).

## Transactional Integrity

All stock operations run in a single PG transaction that updates StockBalance AND inserts StockMovement; audit is written inside the same tx. Any failure rolls back both.

Concurrency strategy:

- Receipt/adjustment-IN: `INSERT ... ON CONFLICT (org,item,location) DO UPDATE quantity = quantity + delta` (atomic, never errors).
- Issue/adjustment-OUT: `UPDATE stock_balances SET quantity = quantity - delta WHERE ... AND quantity >= delta` (row-locks the balance; overshoot affects 0 rows).
- Transfer: same two statements, executed in ascending location-id order to avoid A→B / B→A deadlocks.
- Global backstop: `CHECK (quantity >= 0)` on `stock_balances`.
- Exactly-once receive: partial unique index `(organization_id, reference_id) WHERE reference_type = 'GOODS_RECEIPT'`.

## Permissions

```text
inventory.read
inventory.item.manage
inventory.warehouse.manage
inventory.stock.receive
inventory.stock.transfer
inventory.stock.adjust
inventory.stock.issue
```

All seeded to the `owner` role via `backfillOwnerRolePermissions`.

## Audit Events

```text
inventory.item.created      inventory.item.updated
inventory.warehouse.created inventory.location.created
inventory.stock.received    inventory.stock.transferred
inventory.stock.adjusted    inventory.stock.issued
```

## Implementation Order

1. permissions/manifest/app.module registration
2. schema + generated migration
3. repo (CRUD + balance primitives)
4. procurement read facade
5. service (rules + transactions)
6. controller + dto
7. frontend
8. unit + integration + concurrency + e2e tests
9. architecture + security review
10. docs + final verification

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test            # includes live-PostgreSQL integration + concurrency tests
```

## Recovery Rule

On context loss: inspect `git status`/`git diff`/recent commits, read this file and `docs/modules/inventory.md`, inspect `apps/api/src/modules/inventory/*`, continue; never reset completed work; if already complete, verify instead.
