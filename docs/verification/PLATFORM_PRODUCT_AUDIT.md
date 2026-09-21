# REKA Platform Product Audit

Audit date: 2026-09-21
Audit type: full product + platform audit (audit-only task — no code changed)
Method: repository inspection + live application walkthrough (PostgreSQL via OrbStack, NestJS API on :4000, Nuxt 4 web on :3000). UI interaction was performed against the API and the rendered frontend; an interactive browser session was not available in this environment, so visual/UX judgments below are derived from actual rendered HTML + source inspection + full end-to-end API flows.

Head revision audited: `be948d5` (master, clean).

---

## Executive Summary

REKA is in a genuinely healthy state for a project at M7.2. The backend is the strong half: documented-domain models, real transactions, concurrency-safe numbering, exactly-once receipts, server-side RBAC enforced behind every business endpoint, good validation errors, and 190 passing API tests including live-PostgreSQL integration tests. The procurement → goods receipt → inventory flow works end-to-end and is genuinely impressive for the stage.

The product-shaped weak spots are concentrated in three places:

1. **The documented bootstrap flow cannot start the API.** `pnpm dev` (and `pnpm dev:api`, and any default-config run) hangs forever during OpenAPI setup because `SwaggerModule.setup` hangs when the `@fastify/static` dependency — which is never installed — is absent. `OPENAPI_ENABLED` defaults to `true` in development. This is the single most damaging finding: a fresh developer or a demo cannot get the app running without knowing the incantation `OPENAPI_ENABLED=false`.
2. **The platform does not currently grant the owner role the permissions its own admin screens need.** On organizations created before M6/M7, `module.read`, `workflow.*`, and all `assets.*` permissions were never backfilled (the assets module's seed exists but is never called; platform permissions have no backfill at all). In the audited database the owner got `403 Missing permission: module.read` on the Modules screen and could not open Workflows or Assets. New organizations are fine; existing ones are silently locked out of admin features.
3. **Several "milestone-complete" platform promises are only partly real:** audit logs are written but have no read API or UI; user invitations create `pending` users that can never activate (no password-set flow); the UI never sends `x-organization-id`, so multi-org admins operate only against their first organization with no visible context or switcher; and documented platform modules (`notification`, `files`, `settings`) do not exist as modules.

Everything in this report is a finding, not a recommendation to implement now. Priorities and a proposed next milestone are in the final sections. The task explicitly defers fixes; the only actionable acceptance is that the application ran for inspection (achieved via `OPENAPI_ENABLED=false`) and the worktree is clean.

---

## Current Product State

### Architecture (as implemented)

- Modular monolith, single monorepo, pnpm workspaces. Nuxt 4 web, NestJS 12 + Fastify API, Drizzle + node-postgres, PostgreSQL 17. Worker app exists but is not part of the dev run.
- API modules: `core`, `identity`, `organization`, `access`, `audit`, `workflow`, `module-registry` (platform) and `procurement`, `assets`, `inventory` (business). Documented platform modules `notification`, `files`, `settings` are **not implemented**.
- Shared packages exist for `contracts`, `config`, `database`, `auth`, `events`, `jobs`, `redis`, `storage`, `telemetry`, `tooling`, `ui`. Only `contracts`, `config`, `database`, `auth` (oidc controller), `jobs` (worker) are actually consumed by apps; `redis`, `storage`, `telemetry`, `events`, `ui` are currently unused/dead. `@reka/ui` is an empty shell — the real shared components live in `apps/web/app/components/ui`.
- Optional infrastructure is genuinely optional and dockerized (compose profiles `standard`, `enterprise`, `observability`); default `db:up` starts only Postgres.
- Infrastructure directories `infra/docker` and `infra/scripts` documented in ARCHITECTURE.md do not exist.

### Apps

| App    | State                                 | Notes                                                           |
| ------ | ------------------------------------- | --------------------------------------------------------------- |
| web    | runs (Nuxt dev)                       | SPA-ish; SSR shells only; data fetched client-side              |
| api    | **cannot boot in default dev config** | hangs in `SwaggerModule.setup` (missing `@fastify/static`)      |
| worker | exists, runs standalone               | PostgreSQL-backed job worker; no root script, not containerized |

### Modules (runtime registry state — audited DB)

All 7 platform modules enabled and protected. All business modules (`procurement`, `assets`, `inventory`, `hr`) ship **disabled by default**; admin must enable them via Settings → Modules. HR is registry-only (no routes, no controller, no UI, no permissions).

### Frontend routes

```
/                                  organizations (home)
/login
/organizations/:id                 org detail: members, roles, name edit
/settings/modules                  module enable/disable
/settings/workflows                workflow definitions list
/settings/workflows/:id            workflow inspector (states + transitions)
/assets                            asset dashboard (stat cards)
/assets/list                       asset table + create (status filter via ?status=)
/assets/:id                        asset detail, assign/return/maintenance/retire, history
/inventory                         inventory dashboard
/inventory/items                   item CRUD
/inventory/warehouses              warehouses + locations
/inventory/warehouses/:id          warehouse location list
/inventory/stock                   balances + Receive/Transfer/Adjust/Issue forms
/inventory/movements               ledger, type filter
/procurement                       dashboard (counts)
/procurement/vendors               vendor CRUD
/procurement/purchase-requests     list + create + submit/approve/reject
/procurement/purchase-orders       create from approved request, list, issue
/procurement/goods-receipts        record receipt
```

### API surface

Auth (login/logout/session, oidc login/callback/status), setup (POST only), health (status/live/ready under `/api/v1`), organizations (+members, roles), modules (+enable/disable), workflows (definitions + instances + transitions), vendors, purchase-requests (+submit/approve/reject), purchase-orders (+issue), goods-receipts, assets (+assign/return/maintenance/retire/history), inventory (items/warehouses/locations/stock/movements/receive/transfer/adjust/issue). **No audit read endpoint exists.**

### Design system

Consistent Tailwind slate-based primitives (`ui/Button.vue`, `ui/Input.vue`, `ui/Card.vue`, `ui/ErrorText.vue`) used uniformly across pages. Coherent aesthetic; per-page consistent cards, tables, badges, empty states. Weakness: primitives are minimal (no variant/status/`type="button"` handling; `variant="danger"`/`variant="secondary"` props are silently ignored).

### Authentication / organization flow

Cookie session (`reka_session`, SHA-256-hashed token in DB, 7-day expiry), org-scoped permission guard resolves org from `x-organization-id` header → query/body `organizationId` → first eligible org. Server-side enforcement verified end-to-end (member with no perms → 403; non-member org → 403 "Not an active member").

---

## User Experience Findings

### What works well

- Every list page has explicit loading, empty, and error states (no blank screens / infinite spinners observed in source or rendered output).
- Validation messages surfaced inline and from the API are human-readable (`"Only draft purchase requests can be submitted (current status: submitted)"`).
- Consistent card-based list UI and status badges.
- Forms reset and close after success; action messages appear for errors.

### Recurring UX problems

- **Money units mismatch between UI and API.** The API stores integer minor units (cents). The purchase-request form asks for "Price" and sends it un-scaled; a user entering `1200` later sees `USD 12.00` on the list. The asset form literally labels the field `Price (minor units)`. Users think in dollars; the UI sells them cents. `Severity: High — Area: Money, Procurement/Assets UI — Location: apps/web/app/pages/procurement/purchase-requests.vue, purchase-orders.vue, assets/list.vue`
- **Assigning an asset requires typing a raw user UUID** (`placeholder="User ID"`), and assignment history displays raw UUIDs with no user name lookup. `Severity: High — Area: Assets UI — Location: apps/web/app/pages/assets/[id].vue`
- **No organization context in the UI.** No active-org indicator, no org switcher; all business data loads against the actor's _first eligible_ org. A multi-org admin cannot choose which org they are operating in. `Severity: High — Area: Multi-tenant — Location: all composables (useProcurement.ts, useInventory.ts, useAssets.ts) — API: apps/api/src/common/org-permission.guard.ts:54`
- **Pending members are a dead end.** Adding a member creates a `pending` user; there is no API or UI to set their password or activate them. They can never sign in. `Severity: High — Area: Organization/Identity — Location: apps/api/src/modules/identity/user.service.ts:88 (createPendingUser); no activation endpoint`
- **Module enable/disable has no UI consequence for route visibility.** Backend correctly 404s disabled module routes; frontend hides nav. But navigating directly to a disabled module's URL shows the auth-checked page that errors at data load (no "module disabled" screen).
- **"Issue order" and similar body-less POSTs** return `400 Body cannot be empty when content-type is set to 'application/json'` if any client sets JSON content-type without a body (curl/docs pitfalls; the browser SPA is fine today, API consumers will hit it).

---

## Navigation Findings

- Duplicate left-navigation: layout header nav lists Organizations / Modules / Workflows + enabled business modules, **but** every subpage carries its own back-link ("← Procurement", "← Workflows"). The two navigation systems coexist without tension, but there is no _within-module_ secondary nav (e.g. Procurement's four screens have no persistent tab bar), so moving between Vendors ↔ Purchase Requests requires going back to the dashboard.
- `resolveNavigation` duplicates the platform nav into every page via the shared header (`layout/default.vue`), which is good. However the module metadata `menus[]` (declared in module manifests) is **never consumed** — the layout builds nav from a hardcoded `knownBusinessNavItems` list, so manifest menu metadata is dead. `Severity: Medium — Location: apps/web/app/utils/navigation.ts vs apps/api/src/modules/module-registry/module-manifests.ts`
- HR and Finance appear in `knownBusinessNavItems` without existing modules; harmless today (filtered by disabled modules) but a dead-link trap the moment someone enables a module with no pages.
- Active states rely on `active-class` on exact path; `/assets/list?status=AVAILABLE` (used by dashboard cards) loses the active state.
- No mobile menu; the 5-6 item horizontal nav will overflow at ~360px. `Severity: Low`
- Module-admin gate: `Settings → Modules` visible to any owner; `canManageModules`/`canManageWorkflows` hardcode `roleKey === 'owner'` in the frontend (agrees with backend default but couples UI to a role key).

---

## Procurement Findings

End-to-end flow verified live (all server-side):
`Vendor → Purchase Request (draft) → submit → approve → Purchase Order (draft) → issue → Goods Receipt → status received`

- Document numbering (`PR-000001`, `PO-000001`, `GR-000001`) is atomic and per-org. `Severity: none`
- Double-submit, double-approve, double-issue, over-issue, over-ordering against an approved request, and receiving against a non-issued PO are all rejected with clear messages. Concurrency guards work.
- **Cross-module boundary is well done**: stock does **not** move on goods receipt; inventory receive is an explicit, exactly-once step (409 on duplicate). This is a developer-grade decision that the UI makes the user live out: the stock page requires picking an inventory item manually for a GR line and the UI never explains "this receipt becomes stock only when you receive it here." Terminology help is needed. `Severity: Medium — Area: Procurement↔Inventory — Location: apps/web/app/pages/inventory/stock.vue:27-90`
- Purchase order creation reuses `estimatedUnitPrice` as `unitPrice` without letting the buyer adjust the agreed price; partial quantity ordering is supported. Reasonable v1, but no way to edit a draft PO before issue.
- No ability to edit or delete a draft purchase request or vendor (only create). No edit UI for purchase orders.
- Vendor status enum is lowercase (`active|inactive`) while inventory/asset statuses are UPPERCASE (`ACTIVE`, `AVAILABLE`) — inconsistent status casing across modules (see Domain Consistency).
- Purchase request list item shows total via `formatMoney` on cents — displays correct dollars, but reinforces the input mismatch (enter `1200`, see `$12.00`).

---

## Inventory Findings

End-to-end flow verified live:
`Create item → warehouse → location → receive from Goods Receipt (10) → transfer 4 → adjust +1 (FOUND) → issue 2 → balances 4+5, insufficient-stock rejected`

- Ledger/balance consistency verified; TRANSFER_OUT/TRANSFER_IN pair; append-only movements; exactly-once receive (409). This is the highest-quality module.
- **Pagination/sorting absent by design** (documented). Movements capped at 200 with no indicator; balances have no limit beyond DB. Fine for v1, but the UI does not hint that lists may be truncated.
- **Receive UX is the most complex form in the product** (receipt → line → item → location → quantity). No guidance that the item is a manual mapping decision; no "suggest matching item" logic; quantity is pre-filled from the line. `Severity: Medium`
- Warehouse/location update endpoints missing in v1 (create-only) — the UI has no options to edit, which is consistent, just limited.
- Movement "Type" filter exists; item/location filters are not exposed in UI (API supports filters).
- Status badge for items (`ACTIVE`/`INACTIVE`) falls through to the generic slate badge because the shared `statusBadge` maps lowercase only.

---

## Assets Findings

End-to-end flow verified live:
`create → assign → re-assign rejected → maintenance blocked while assigned → return → retire → history (1 assignment, returned)`

- Lifecycle rules are enforced server-side and sensible (cannot assign twice; must return before maintenance; retire from any non-retired status).
- Lifecycle events ARE audited (`asset.created/assigned/returned/retired`), but the **History tab shows assignments only** — audit events like "maintenance" and "retired" don't appear in asset history; a user cannot see _why_ it went to maintenance or that it was retired from the history panel. `Severity: Medium — Location: apps/api/src/modules/assets/assets.service.ts getAssetHistory`
- **Asset ← procurement provenance exists but is invisible in the UI**: assets carry `vendorId`/`purchaseOrderId` (FKs to procurement tables) but the detail page does not show vendor or PO; the create form does not expose any link to a PO or vendor (only raw fields). The "where did this asset come from" story is incomplete in the product. `Severity: Medium — Location: apps/web/app/pages/assets/[id].vue, assets/list.vue`
- **Asset ↔ inventory boundary**: nothing in the UI explains that a serialized laptop is an Asset and 100 cables is an inventory quantity; both namespaces can hold "Laptop" simultaneously. No assistive copy. `Severity: Low`
- Create form requires tag/name/category; serial/date/price optional. Price field labeled in minor units (see Money).

---

## Identity / RBAC Findings

- Login/logout/session all work; session cookie HttpOnly, SameSite=Lax, 7-day expiry; `Secure` flag absent in dev (expected; `cookieSecure` config exists).
- **Server-side authorization verified solid**: permission-guarded endpoints return `403 Missing permission: X`; cross-org access returns `403 Not an active member`; disabled-module routes return 404. `Severity: none (positive)`
- All module guards delegate to one shared factory (`createOrgPermissionGuard`) — no guard duplication. `Severity: none (positive)`
- **Owner-role permission backfill bug (see Executive Summary #2).** Root cause chain:
  - `ModuleRegistryService`/`AccessService` only seed the catalog; granting to roles happens at org creation (`createOrganizationRoles` grants the _entire current_ catalog) plus per-module `backfillOwnerRolePermissions`.
  - `assets.service.seed()` exists but has **no `onModuleInit`** calling it → asset perms never backfilled.
  - No backfill exists for `module.*` and `workflow.*` → orgs created before those keys (M6/M7) never receive them.
  - Result: in the audited org, `/modules`, `/workflows`, `/audit`, and `/assets` were 403 for the owner until I granted the keys. Fresh orgs are fine, which masks the bug in tests. `Severity: Critical — Area: Access — Location: apps/api/src/modules/assets/assets.service.ts:81, apps/api/src/modules/access/access.service.ts backfillOwnerRolePermissions`
- **No audit read API/UI** — "auditable workflows" is a promise with no consumer surface. `Severity: High — Area: Audit — Location: apps/api/src/modules/audit/ (service/repo only, no controller)`
- Throttling present on login (10/min) via `@nestjs/throttler`, plus a global rule. Reasonable.

---

## Accessibility Findings

- Labels exist but are **not associated** with inputs (`UiInput` has an `id` prop that nothing sets; labels are sibling text nodes, not `for`). Screen readers get unlabeled fields. `Severity: Medium`
- `UiButton` renders `<button>` without default `type="button"` and no focus ring styling; inputs set `focus:outline-none` with a border-only focus change (weak but visible). `Severity: Low`
- No ARIA on icon-less state; tables use `th scope="col"` (good). `Severity: none`
- Modals are "simplified as forms" (author's comment) — no focus trap, no escape/overlay, no `role="dialog"`; acceptable today but a known a11y gap. `Severity: Low`
- Color-only status badges (no icons) with pastel backgrounds; contrast on text is acceptable. `Severity: Low`
- Warning: primary button color is `bg-slate-900` text-white on white/slate-50 — passes contrast; the red "danger" variants are not wired (variant prop ignored), so destructive actions look identical to primary. `Severity: Low`

---

## Error / Loading / Empty-State Findings

Strengths: every major page handles loading + empty + error + success. Forms handle disabled/loading and inline errors. Shared `UiErrorText`, per-page banners for success/action errors.

Gaps:

- `ErrorText` inside a form disappears on `actionError = null` correctly; good.
- Org member page fetches members and roles unconditionally and renders a generic "Failed to load organization" when a non-manager views it (403), instead of hiding or explaining. `Severity: Medium — Location: apps/web/app/pages/organizations/[id].vue`
- Disabled-module route: direct navigation shows a broken-looking page rather than a "module disabled" state. `Severity: Medium`
- `useAsyncData` on index/organizations runs on the server unauthenticated (SSR has no session cookie because `auth` middleware returns early on server) → first paint can show an error/flash before client re-fetch. `Severity: Low — Location: apps/web/app/middleware/auth.ts (process.server early return)`
- Asset detail: `handleMaintenance`/`handleRetire` ignore success/failure entirely (no feedback on failure). `Severity: Medium — Location: apps/web/app/pages/assets/[id].vue:138-148`
- API errors are consistently `{code, message, requestId}` JSON via the global filter (good), but the web | `400` Fastify error `{"error":"Bad Request","message":"Client Error","statusCode":400}` leaks through for bodyless-POST-with-json-content-type cases, which the SPA avoids today. `Severity: Low`

---

## API / Backend Findings

- Consistent error envelope, request IDs everywhere, org scoping on all business queries (server-side), DTO whitelisting+transformation, 1 MiB body limit, helmet headers, structured pino JSON logs. `Severity: none (positive)`
- **API shape inconsistencies:**
  - Resource key styles differ: `{vendors}`, `{purchaseRequests}`, `{purchaseOrders}`, `{goodsReceipts}` (camel) vs `{modules}`/`{workflows}`/`{assets}`/`{items}`/`{balances}`/`{movements}`/`{history}` (plain). Not wrong, just mixed conventions.
  - State enum casing: procurement/vendor/PR/PO lowercase (`active`, `draft`, `submitted`) vs inventory/assets UPPERCASE (`ACTIVE`, `AVAILABLE`, `ASSIGNED`, ...). Inconsistent and a guaranteed source of bugs at the UI boundary (the shared `statusBadge` only handles lowercase).
  - `PATCH /vendors/:id` accepts `status: 'active'|'inactive'` while `PATCH /inventory/items/:id` uses `ACTIVE|INACTIVE`.
- **Concept naming:** Inventory `receive` uses `referenceType: 'GOODS_RECEIPT'` (procurement noun) — good cross-link; but asset `purchaseOrderId`/`vendorId` are the only cross-module FKs in the schema (DB-level coupling; assets module will not drop cleanly if procurement schema changes). `Severity: Medium`
- No audit endpoint; no notification/files modules despite docs. `Severity: High`
- Concurrency design is a standout: row locks on aggregate roots, `ON CONFLICT` numbering, partial unique index for exactly-once receipts, `UPDATE ... WHERE quantity >= delta` for non-negative balances. (Positive)

---

## Architecture Findings

- Modular monolith, one repo, no microservice drift. No unnecessary infrastructure running by default. `Severity: none (positive)`
- Business modules correctly depend on platform modules; guards centralized; `inventory → procurement` communicates through a facade service, not raw tables (positive).
- **`@reka/ui` empty shell**: documented shared UI package exports only a string; real components live in the web app. Either move them or rename the docs. `Severity: Medium — Location: packages/ui/src/index.ts`
- **Dead/placeholder packages**: `@reka/redis`, `@reka/storage`, `@reka/telemetry`, `@reka/events` are written but unused by any app; `@reka/auth` used only by the inert OIDC controller; `@reka/jobs` used only by worker (which is not in the dev run). M6 is infrastructure-without-consumers — acceptable scaffolding, but should be flagged as not-yet-integrated, not as shipped features. `Severity: Medium`
- Documented platform modules `notification`, `files`, `settings` don't exist (settings is page-level, not a module).
- `inventory` module declares dependency on `assets` (manifest `dependencies: ['organization','assets']`) despite not requiring it at runtime — documented in inventory.md as a test-compat hack. This is exactly the kind of "keep the old test semantics" debt that should be curdef at some point. `Severity: Low`
- Assets table holds FKs into procurement (`vendors`, `purchase_orders`) — cross-module DB coupling (see above).

---

## Domain Consistency Findings

| Term                                      | Used as                                                                                                  | Inconsistency                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| User vs Employee                          | `User` everywhere; `hr` envisioned for employees                                                         | No HR module yet; fine for now                                                                                                   |
| Asset vs Inventory Item                   | Both exist, doc'd boundary                                                                               | UI gives users no clue when to use which; both can be "Laptop"                                                                   |
| Goods Receipt vs Stock Receipt vs Receive | `Goods Receipt` (procurement), inventory action `Receive`, movement type `RECEIPT`                       | Three names for one hand-off; the inventory "Receive from Goods Receipt" form is the seam and is the hardest form in the product |
| Organization vs Tenant                    | `Organization` only (good)                                                                               | N/A                                                                                                                              |
| Purchase Request vs Purchase Order        | Distinct and well-explained in UI copy (good)                                                            | N/A                                                                                                                              |
| Status casing                             | `active` / `draft` / `submitted` (procurement) vs `ACTIVE` / `AVAILABLE` / `ASSIGNED` (inventory/assets) | **Should be standardized** (recommend uppercase enum per status badge dictionary)                                                |
| Purchasing unit Price                     | cents (API) vs dollars (UI intent)                                                                       | **Should be standardized at the API boundary with a documented unit**                                                            |
| "Pending approval"                        | `statusBadge` maps `submitted` → label "pending approval" (good UX)                                      | fine                                                                                                                             |
| User display name                         | pending users get email, admins set via setup                                                            | `displayName` not settable when adding a member                                                                                  |

Recommendation (not implemented): standardize status casing into one enum + one badge dictionary; document monetary units as cents in the API contract and convert in the UI; keep "Goods Receipt" as the procurement term and "Receive" as the inventory verb with explicit copy.

---

## Performance / Resource Findings

- API response times measured ~3–7 ms per authenticated business request locally (no issues). No polling anywhere. No obvious repeated-call patterns; several pages fire 3–5 parallel GETs on mount (acceptable).
- Dev footprint is heavy but expected: Nuxt dev ~600 MB RSS; Nest watch ~370 MB. Not observable in production builds (no production build/docker image exists to measure).
- Docker only runs Postgres by default (verified: no redis/obs/minio containers spun up). Positive.
- Worker app exists but is not running in the dev flow — by design (Lite). Q for later: nothing enqueues `ops.noop`, so the worker is a proof-of-life only.

---

## Developer Experience Findings

The core question — "could another developer clone and run REKA without me explaining?" — answers **no**, because of the bootstrap blocker:

1. `pnpm install` ✓, `pnpm db:up` ✓ (Postgres only), `pnpm db:migrate` ✓.
2. `pnpm dev` → **web starts; api hangs forever** (OpenAPI/Swagger + missing `@fastify/static`). Default-config run, no error message — the process sits at `InstanceLoader...` then `SwaggerModule.setup` forever. The fix-workaround is an undocumented env var.
3. Even when the API is up, the only bootstrapped account's password is unknown to a fresh clone (no seed/demo user, no setup UI beyond the raw POST `/api/v1/setup`). A fresh clone gives a blank DB and `REKA is already initialized` only if the DB has data; the real friction is: there is no documented way to get a demo login.
4. No test seed, no demo script, no `docker`/`scripts` dir.
5. No CI anywhere (ROADMAP Stage-0 promised it).
6. Tests are excellent and run clean: API 18 files / 190 tests pass; web 2 files / 10 tests pass; full `pnpm typecheck` and `pnpm lint` (24 `any` warnings, 0 errors) pass. Worker has no tests, no root run script.

---

## Documentation Findings (drift)

- **DEVELOPMENT.md / README.md** claim `pnpm dev` works — it hangs (see above). Duplicated scripts (`pnpm dev:web`) exist. `Severity: High`
- **ARCHITECTURE.md / ROADMAP Stage 5** promise OpenAPI as shipped; the OpenAPI endpoint hangs boot of the app by default and there is no serving dependency (`@fastify/static`). `Severity: High`
- ARCHITECTURE.md tree lists `infra/{compose,docker,scripts}` — `docker/` and `scripts/` don't exist; worker/redis/storage etc. "shared packages" partially exist. `Severity: Low`
- module-system.md lists platform modules `notification`, `files`, `settings` — not implemented. `Severity: Medium`
- MASTER_PLAN.md Section 8 "First Business Module" procurement flow matches; Section 11 enable/disable semantics match the running implementation.
- docs/modules/procurement.md and inventory.md accurately describe the implementation (rare, good). `Severity: none (positive)`
- ROADMAP Stage 3 Workflow is not marked COMPLETED although M3 is verified — trivial inconsistency. `Severity: Low`

---

## Demo Readiness

The demo story is: Login → Organization → Procurement → Approval → Goods Receipt → Inventory → Asset → Assignment.

Out-of-the-box (fresh install, no manual steps) the demo **breaks at three points**:

1. **API won't start** under default config; a demo needs `OPENAPI_ENABLED=false` and knowledge of a login credential.
2. **Assets is denied for the owner** on any pre-existing org (permission backfill bug), so "Asset → Assignment" 403s.
3. **Modules arrive disabled** — presentable as "admin enables them live", which actually demonstrates the module system well (positive). But an unprepared demoer will see an empty navigation.
4. After enabling, the procurement → GR → **manual** inventory-receive → asset-assign chain works fully and is the strongest part of the demo.

Recommend: pre-enable modules and pre-seed data for demos; fix the bootstrap and the asset backfill before promising a client-facing walkthrough.

---

## Strengths

- Exceptionally strong backend discipline for this stage: real transactions, explicit route/serialization guards, concurrency-safe invariants, 190 passing tests including live-DB integration tests.
- Server-side authorization enforced end-to-end; cross-org isolation verified.
- Append-only stock ledger with materialized balances done properly.
- Decentralized-but-guard-inherited authz (one factory, no duplication).
- Clean, consistent, minimal Tailwind UI; every page has loading/empty/error/success states.
- Optional infrastructure genuinely optional; opt-in compose profiles; zero unnecessary containers.
- Honest docs in `docs/modules/` that match implementation.

---

## Critical Issues

**P0-1 — API cannot boot under default development config.**
Area: DX / correctness · Location: apps/api/src/common/openapi.ts; `@fastify/static` never in apps/api/package.json; `OPENAPI_ENABLED` defaults true (packages/config/src/index.ts:212)
Observation: `pnpm dev` hangs forever inside `SwaggerModule.setup`; no error, no listener. Verified twice (watch + direct `node dist/main.js`).
Why it matters: the documented runbook fails for every developer and demo.
Fix later (today: `OPENAPI_ENABLED=false`); prospective fix: install `@fastify/static` or make OpenAPI setup failure non-fatal, and add a startup test that boots with default config.

**P0-2 — Owner role loses assigned platform permissions on pre-existing organizations.**
Area: Access / module enable · Location: apps/api/src/modules/assets/assets.service.ts:81 (seed exists, no `onModuleInit`); no backfill for `module.*`/`workflow.*` in access.service.ts; grant-at-org-creation in access.service.ts:100
Observation: audited org owner got 403 on Modules, Workflows, Assets, i.e. the admin product is unreachable for existing tenants.
Why it matters: breaks module enablement flow (M2 premise) and Assets demo for all pre-M6 orgs.

**P0-3 (contested) — Audit has no read surface.**
Area: Audit · Observation: audits are written but there is no endpoint/UI.
Why it matters: "auditable workflows" is a headline platform claim.
Severity call: I keep this P0-adjacent; at minimum it should be the next milestone's first item.

---

## High Priority Issues

- **P1-1 Multi-org context**: UI never sends `x-organization-id`; no org switcher/indicator; business screens silently bind to first org (apps/web/app/composables/*, apps/api/src/common/org-permission.guard.ts:54).
- **P1-2 Money unit handling**: cents-vs-dollars mismatch between UI forms and API; "Price (minor units)" label leaks implementation detail (pages listed in Money finding).
- **P1-3 Asset assignment UX**: raw UUID entry + raw UUID in history; needs member picker + names.
- **P1-4 Invitation dead-end**: pending users cannot be activated; no password-set/reset flow in UI or API.
- **P1-5 Disabled-module UX**: direct nav to disabled module shows a broken page instead of "module disabled".
- **P1-6 Status enum casing inconsistency** across modules (domain consistency, badge mapping risk).
- **P1-7 Asset provenance not visible and asset↔inventory vocabulary confusing** (vendor/PO absent from asset detail; history doesn't show maintenance/retire).
- **P1-8 Body-less POST + JSON content-type returns opaque Fastify 400**; SPA is unaffected today, external API users will be bitten.

---

## Medium Priority Issues

- Manifest `menus[]`/`routes[]` metadata unused by frontend nav (dead metadata).
- `@reka/ui` empty shell vs docs; real components in web app.
- Unused optional packages (redis/storage/telemetry/events/auth) presented as shipped infrastructure.
- Missing documented `notification`/`files`/`settings` modules.
- Assets ← procurement DB-level FKs (module coupling beyond facade).
- Member restriction UX on /organizations/:id (403 → generic failure text).
- No CI (ROADMAP Stage-0 promise).
- No worker container/root script; jobs are proof-of-life only.
- Inventory receive form is the hardest UX in the product; no guidance.

---

## Low Priority / Polish

- Focus-visible rings, `for`-attribute label binding, button `type="button"` default, modal a11y (focus trap/escape/dialog role), `variant` props on UiButton are ignored.
- Status badge dictionary doesn't include inventory/asset enums (falls to generic slate).
- Back-links vs header nav duplication; no within-module tabs.
- Mobile nav overflow at narrow widths.
- `error.statusMessage === '404'` UX on org page; SSR unauth flash on first paint.
- `any` lint warnings (24) in web pages; duplicate `ActionResult`/`run` helpers duplicated across three composables.
- Movement list cap (200) has no UI hint.
- Money: purchase-order line prices not editable post-estimate.

---

## Recommended Backlog

**P0 (blockers to "platform foundation is production-ready"):**

1. Fix API default-config boot (OpenAPI/`@fastify/static`) + regression test that `pnpm dev` boots.
2. Fix owner-role permission backfill for platform + assets permissions on existing orgs.
3. Add a minimal audit read API (list/filter) + Settings → Audit screen.

**P1 (material improvement):** 4. Org context in UI (active-org selector + header); send `x-organization-id`. 5. Money units: document cents in contract + convert in UI (drop "minor units" labels). 6. Asset assignment member picker + name resolution in history. 7. User activation/set-password flow for pending members. 8. Standardize status enums + one shared badge mapping. 9. Disabled-module route state; asset provenance display; vocabulary copy for Inventory↔Assets boundaries. 10. Seed/demo script + documented credentials; CI pipeline (lint/typecheck/test/build).

**P2 (polish):** 11. a11y pass (labels/for, focus rings, type="button", simple dialog component). 12. Navigation polish (within-module tabs, mobile menu, manifest-driven nav). 13. Deduplicate composable helpers; clear `any` warnings. 14. Inventory receive form guidance; movement-limit hint. 15. Plug unused packages (redis/storage) when first real consumer exists; retire or implement `@reka/ui`.

---

## Suggested Next Milestone

Recommend a **hardening milestone, not a new business module**: "M7.3 Platform Hardening / Demoship", containing P0-1..3 + the UI-context subset of P1 (org context, member activation, audit screen). Rationale: M7.3 (Assets/Inventory) verified the platform at the backend; the next delivery should make the running product demonstrable and admin-complete before another CRUD module (e.g. projects, helpdesk) is added. After P0s, re-run this audit's demo path as the acceptance test.

---

## Final Report

- **Application startup**: API would not boot under default config (OpenAPI hang, missing `@fastify/static`); booted for inspection with `OPENAPI_ENABLED=false`. Web booted fine. Postgres via OrbStack was already healthy.
- **Routes inspected**: all 27 frontend route files read; all API controllers mapped; all endpoints exercised via authenticated curl walkthrough.
- **Major flows tested**: login/session/logout; organization create/detail/members/roles; module enable/disable (+audit trail, disabled→404); procurement full chain (vendor→PR→submit→approve→PO→issue→GR→received, plus all invalid-transition guards); inventory (receive/transfer/adjust/issue/ledger/balances/exactly-once); assets (assign/return/maintenance-block/retire/history); RBAC member 403s; cross-org isolation.
- **Major findings**: P0-1 API boot hang; P0-2 owner-role permission backfill hole (assets seed never runs); audit with no read surface; multi-org context missing in UI; money unit mismatch; invitation dead-end; stale docs (dev runbook, platform module list, infra tree); no CI.
- **P0 issues**: 3 (P0-1 boot, P0-2 backfill, P0-3 audit surface).
- **P1 issues**: 8 (see Recommended Backlog P1).
- **P2 issues**: 15.
- **Architecture concerns**: modular monolith holds; dead `@reka/ui` shell; unused M6 packages; missing documented platform modules; assets↔procurement DB FKs; manifest nav metadata unused.
- **UX concerns**: org context missing, money units, asset UUID-paste assignment, pending-member dead end, domain-vocabulary seams at Inventory Receive, no audit screen.
- **Demo readiness**: fails out-of-the-box at API boot + asset permissions; strong once booted, modules enabled, and seeded.
- **Documentation drift**: DEVELOPMENT/README runbook (boot), ROADMAP Stage-0 CI + Stage-5 OpenAPI claims, ARCHITECTURE infra tree + platform module list, module-system platform modules, `@reka/ui` positioning.
- **Git status**: clean at audit end (verified `git status` — nothing to commit); all test data and DB modifications from the walkthrough were reverted; original admin credential hash restored; dev processes stopped. No source files changed.
