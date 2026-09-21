# Module: Inventory

## Purpose

Inventory tracks stock quantities and their movements: stock-keeping items, warehouses and locations, a materialized stock balance, and an append-only stock ledger. Every stock change writes a ledger movement; the balance is derived state.

## Responsibilities

- Maintain organization-scoped stock-keeping `inventory_items` (SKU, name, unit, status).
- Maintain organization-scoped `warehouses` and `warehouse_locations`.
- Receive stock from a Procurement goods receipt into a location (exactly once per goods-receipt item).
- Transfer stock between locations within the same organization.
- Adjust stock with a mandatory reason (`DAMAGED`, `LOST`, `COUNT_CORRECTION`, `FOUND`, `OTHER`).
- Issue stock for consumption, recording an optional reason and reference.
- Expose current balances and movement history through read endpoints.

## Non-Responsibilities

- Individually tracked physical items (that is the Assets module). Inventory never creates assets automatically.
- Product catalog, variants, bundles, BOM, manufacturing, serial-number inventory.
- Fulfillment/order management, reservations, or pick/pack/ship.
- Accounting, costing, or valuation (future Finance module).
- Warehouse-management UI beyond basic locations.

## Dependencies

```text
inventory
  -> organization (tenant scoping)
  -> access       (RBAC permission checks)
  -> audit        (event trail)
  -> identity     (actor identification via SessionGuard)
  -> module-registry (module enable guard)
  -> procurement  (runtime read facade for receive validation)
```

The module-manifest `dependencies` list keeps the M7.1 baseline `['organization', 'assets']` so the pre-existing module-registry enable/disable tests retain their exact semantics. At runtime, the Nest module also imports `ProcurementModule` and reads goods receipts only through the owning service's `getGoodsReceiptItemForStock(...)` facade; Inventory never queries procurement tables directly. Inventory does not require the procurement module to be enabled because it validates durable `goods_receipts` rows regardless.

## Domain Entities

- `inventory_item` — stock-keeping item (`sku` unique per organization, `unit`, `status`).
- `warehouse` — org-scoped site (`code` unique per organization, `status`).
- `warehouse_location` — belongs to exactly one warehouse (`code` unique per warehouse).
- `stock_balance` — materialized current quantity, unique per `(organization, item, location)`, `CHECK (quantity >= 0)`.
- `stock_movement` — append-only ledger entry (type, quantity, reference, reason, actor).

```text
Purchased via Procurement:  Purchase Order -> Goods Receipt -> inventory.receiveStock -> RECEIPT movement + balance delta
Location transfer:          TRANSFER_OUT (source) + TRANSFER_IN (destination), one transaction
Adjustment:                 ADJUSTMENT_IN / ADJUSTMENT_OUT   (reason required)
Consumption:                ISSUE
```

## Quantity Representation

Stock quantities are `NUMERIC(18,4)` (drizzle `mode: 'number'`), documented in ADR-approved fashion by follows: integers and fractional amounts like `5`, `2.5`, `0.25` are supported without float drift. Application rules cap scale at 4 decimals and magnitude at `10_000_000_000_000` to stay well inside the column and away from IEEE-754 rounding edges (`inventory.rules.ts`).

## Stock Ledger vs Stock Balance

- `stock_movements` is the business history and the source of truth for "what happened".
- `stock_balances` is the materialized current state, always updated in the same transaction as any movement.
- Both are updated atomically; if either fails, everything rolls back. The balance is never the only record.

## Concurrency Strategy

- Receipts and adjustments-IN: `INSERT ... ON CONFLICT (org, item, location) DO UPDATE quantity = quantity + delta`.
- Issues and adjustments-OUT: `UPDATE ... SET quantity = quantity - delta WHERE ... AND quantity >= delta` (row-locked, atomic; overshoot affects zero rows).
- Transfers: the same two statements executed in ascending location-id order to avoid cross-transfer deadlocks.
- Global backstop: `CHECK (quantity >= 0)` on `stock_balances`.
- Exactly-once receipt: partial unique index `(organization_id, reference_id) WHERE reference_type = 'GOODS_RECEIPT'` plus a pre-check; a concurrent duplicate hit raises 409 and rolls back.

## Procurement Integration

`receiveStock` validates the goods receipt through `ProcurementService.getGoodsReceiptItemForStock` (org-scoped, rejects cancelled purchase orders, uses the caller-provided transaction). The received quantity must equal the goods-receipt item quantity; partial stocking of a single goods-receipt item is deferred (the unique index stores once per goods-receipt item).

## Asset Boundary

Inventory and Assets are separate modules. A received stock line (e.g. 100 cables) is inventory quantity; an individually tracked item (e.g. a serialized laptop) is an Asset. No automatic asset creation exists in M7.2; a future integration may convert specific receipts into assets explicitly.

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

Reads require `inventory.read`; mutations require the corresponding `inventory.*` key. The `owner` role receives all keys via `AccessService.backfillOwnerRolePermissions`.

## Audit Events

`inventory.item.created`, `inventory.item.updated`, `inventory.warehouse.created`, `inventory.location.created`, `inventory.stock.received`, `inventory.stock.transferred`, `inventory.stock.adjusted`, `inventory.stock.issued` — recorded inside the same transaction as the change, with the real actor id.

## API

Versioned under `/api/v1/inventory`:

```text
GET/POST items       GET/PATCH items/:id
GET/POST warehouses  GET warehouses/:id
GET/POST locations   (GET supports ?warehouseId)
GET stock            (?itemId | ?locationId | ?warehouseId)
GET movements        (?itemId | ?locationId | ?warehouseId | ?type)
POST receive | transfer | adjust | issue
```

## Verification

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

`apps/api/test/inventory.integration.spec.ts` covers item/warehouse/location CRUD, receiving through the full procurement chain, transfer/adjust/issue, balance–ledger consistency, RBAC, cross-organization isolation, and live-PostgreSQL concurrency races (concurrent receipts, same-receipt duplicate, oversubscribed issues, opposite-direction transfers).

## Remaining Limitations

- Pagination is not exposed for movements (hard-capped at 200 rows) or stock balances.
- The org resolution defaults to the actor's first eligible organization when no `x-organization-id` header is sent; the UI does not currently send the header. This is shared platform behavior, not inventory-specific.
- Goods-receipt items are stocked in full per line (no partial stocking of one line).
- Warehouse/location update endpoints are not yet implemented (create-only in v1).
