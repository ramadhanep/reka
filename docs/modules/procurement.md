# Module: Procurement

## Purpose

Procurement manages the purchase lifecycle: vendors, purchase requests, workflow-driven approval, purchase orders, and goods receipt. It is the first business module built on the REKA platform foundation and is the reference example for how a business module reuses the platform modules (organization, access, audit, workflow, module-registry) instead of duplicating them.

## Responsibilities

- Maintain organization-scoped vendor records.
- Manage purchase requests and their line items.
- Drive request approval through the generic Workflow Engine (draft -> submitted -> approved/rejected).
- Create purchase orders from approved requests and issue them to active vendors.
- Record goods receipts against issued purchase orders, tracking received quantities.

## Non-Responsibilities

- Inventory / stock ledger (future Inventory module).
- Accounting, invoices, payments, tax, or vendor payables (future Finance module).
- Product catalog (requests use free-text line items).
- Multi-level approval hierarchies, budgets, or RFQ/quotation systems.

## Dependencies

```text
procurement
  -> organization (tenant scoping)
  -> access (RBAC permission checks)
  -> audit (event trail)
  -> workflow (generic lifecycle engine)
  -> identity (actor identification via SessionGuard)
  -> module-registry (module enable guard)
```

## Domain Entities

- `vendor` — supplier record (code unique per organization).
- `purchase_request` — request header (number, requester, workflow instance ref).
- `purchase_request_item` — line item (description, quantity, estimated unit price).
- `purchase_order` — order header (number, vendor, source request).
- `purchase_order_item` — line item with issued quantity and running received quantity.
- `goods_receipt` — receipt header (number, purchase order, received by/at).
- `goods_receipt_item` — received quantity per order line.
- `document_sequence` — per-organization numbering counter (PR/PO/GR).

## Money Representation

Monetary values are stored as **integer minor currency units** (e.g. cents) in a `bigint` column with an explicit `currency` column (default `USD`). Float is never used for money. M4 deliberately introduces no tax or accounting logic.

## State Machines

Purchase request lifecycle is implemented by the workflow engine using definition key `purchase-request`:

```text
DRAFT -> SUBMITTED (pending approval) -> APPROVED   (terminal)
                                  \----> REJECTED   (terminal)
```

Purchase order statuses (application-level):

```text
DRAFT -> ISSUED -> PARTIALLY_RECEIVED -> RECEIVED
   \-------> CANCELLED (reserved, not exposed in M4)
```

## Permissions

```text
procurement.vendor.read
procurement.vendor.manage
procurement.purchase_request.read
procurement.purchase_request.create
procurement.purchase_request.submit
procurement.purchase_request.approve
procurement.purchase_request.reject
procurement.purchase_order.read
procurement.purchase_order.create
procurement.purchase_order.issue
procurement.goods_receipt.read
procurement.goods_receipt.create
```

Permissions live in the shared permission catalog. New organizations grant them to the `owner` role automatically; the procurement module bootstrap also backfills them onto the owner role of pre-existing organizations. Transitions `submit`/`approve`/`reject` additionally require `procurement.purchase_request.*` via the workflow engine's transition authorization.

## Audit Events

```text
procurement.vendor.created
procurement.vendor.updated
procurement.purchase_request.created
procurement.purchase_request.submitted
procurement.purchase_request.approved
procurement.purchase_request.rejected
procurement.purchase_order.created
procurement.purchase_order.issued
procurement.goods_receipt.created
```

Audit records the **actual actor** (e.g. the approver for `*.approved`) and keeps `requesterId` in metadata; the workflow subject is the purchase request, never the actor.

## API

All endpoints are under `/api/v1`, gated by `@RequireModule('procurement')` + permission guard.

```text
Vendors
GET    /vendors                 (procurement.vendor.read)
POST   /vendors                 (procurement.vendor.manage)
GET    /vendors/:id             (procurement.vendor.read)
PATCH  /vendors/:id             (procurement.vendor.manage)

Purchase requests
GET    /purchase-requests       (procurement.purchase_request.read)
POST   /purchase-requests       (procurement.purchase_request.create)
GET    /purchase-requests/:id   (procurement.purchase_request.read)
POST   /purchase-requests/:id/submit   (procurement.purchase_request.submit)
POST   /purchase-requests/:id/approve  (procurement.purchase_request.approve)
POST   /purchase-requests/:id/reject   (procurement.purchase_request.reject)

Purchase orders
GET    /purchase-orders         (procurement.purchase_order.read)
POST   /purchase-orders         (procurement.purchase_order.create)
GET    /purchase-orders/:id     (procurement.purchase_order.read)
POST   /purchase-orders/:id/issue      (procurement.purchase_order.issue)

Goods receipts
GET    /goods-receipts          (procurement.goods_receipt.read)
POST   /goods-receipts          (procurement.goods_receipt.create)
GET    /goods-receipts/:id      (procurement.goods_receipt.read)
```

The organization is resolved from the `x-organization-id` header (or the actor's first eligible organization) and every query is scoped server-side.

## UI

```text
/procurement                  overview
/procurement/vendors       vendor list + create
/procurement/purchase-requests  request list + create + submit/approve/reject
/procurement/purchase-orders    order list + create + issue
/procurement/goods-receipts     receipts list + record receipt
```

## Data Ownership

All procurement tables and queries are scoped by `organization_id`. Foreign keys reference platform tables (`organizations`, `users`, `workflow_instances`). Procurement never reads Inventory or Finance tables.

## Important Invariants

- Every entity is organization-scoped; cross-organization access returns 404.
- Money is integer minor units; quantities are positive integers.
- A request may only be submitted from `draft` and must contain at least one valid item.
- Approval/rejection is only valid from `submitted`.
- A purchase order requires an `approved` request, an `active` vendor in the same organization, and item quantities that never exceed the cumulative outstanding requested quantity (across all orders, enforced under a request row lock).
- Receipt quantities can never exceed a purchase order line's outstanding quantity.
- Numbers (`PR-`, `PO-`, `GR-`) are allocated atomically per organization and never duplicated.

## Concurrency

Mutations that must not race acquire a `SELECT ... FOR UPDATE` row lock on the aggregate root inside a single transaction:

- double submit / double approve/reject -> the request row is locked first, then the workflow instance transition runs in the same transaction.
- double issue / double receipt -> the purchase order row is locked first.
- create purchase order -> the request row is locked and ordered quantity is checked against the cumulative outstanding quantity.
- document numbers -> atomic `INSERT ... ON CONFLICT DO UPDATE` on `(organization_id, code)`.

A document number may leave a gap after a rolled-back transaction; duplicates are impossible.

The system-wide `purchase-request` workflow definition may only be modified by a system (null-organization) scope, never by an organization-scoped actor.

## Future Boundaries

- Inventory: goods receipts become the input to stock movements after receipt.
- Finance: purchase orders and receipts feed three-way matching and payables.
- Notifications: workflow transition events already emit through `WorkflowNotificationHook`.
