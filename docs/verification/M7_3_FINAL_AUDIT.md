# M7.3 Final Audit (Completion Pass)

**Date:** 2026-09-21
**Supersedes:** the 2026-09-21 audit at head `1dfb9d8` (`fix(seed): disable no-undef in demo seed script`)
**Method:** live verification against a **freshly reset** database (PostgreSQL via Docker Compose, `reka` database dropped and recreated), NestJS API :4000, Nuxt 4 web :3000. API flows via authenticated HTTP; browser behavior verified with headless Chromium via the DevTools Protocol (real page loads, real network capture, real org switching). Static gates run to completion.

This document records the targeted M7.3 completion pass. It does not start M8 and does not add business modules.

---

## Repository State

**PASS**

| Check               | Result                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `git status`        | M7.3 completion changes staged for one commit (see below)                                              |
| Duplicate artifacts | root `scripts/seed-demo.js` and `apps/api/scripts/seed-demo.js` deleted; single canonical seed remains |

---

## Static Verification

**PASS** (all four checks run to completion in this pass)

| Check               | Result                     | Evidence                                                                                     |
| ------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm typecheck`    | PASS (exit 0)              | all packages + apps clean                                                                    |
| `pnpm lint`         | PASS (exit 0, 32 warnings) | zero errors; warnings are pre-existing `no-explicit-any` in web pages/composables            |
| `pnpm format:check` | PASS (exit 0)              | "All matched files use Prettier code style!"                                                 |
| `pnpm test`         | PASS (exit 0)              | api: 18 files / **194 tests** passed against live PostgreSQL; web: 2 files / 10 tests passed |

Four new integration tests were added to cover the fixed behavior (`apps/api/test/platform.integration.spec.ts`): audit endpoint auth/authz, owner audit read, member `audit.read` denial, and the member activation token flow.

---

## Application Startup

**PASS**

| Step                                     | Result                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm db:up`                             | PASS — `reka-postgres-1` Up (healthy)                                                 |
| `pnpm db:migrate`                        | PASS — migrations applied successfully on a freshly dropped/recreated `reka` database |
| `pnpm demo:seed`                         | PASS — see below                                                                      |
| `pnpm dev` (default config, no env vars) | PASS — API + web boot; `Nest application successfully started` / `reka api started`   |
| OpenAPI `/docs`                          | PASS — HTTP 200 (Swagger UI served)                                                   |
| OpenAPI `/docs-json` (default config)    | PASS — HTTP 200 `application/json`                                                    |

OpenAPI works with default configuration; the `OPENAPI_ENABLED=false` workaround is no longer needed and its stale note was removed from `DEVELOPMENT.md`.

---

## P0 — Organization permissions on seeded / seed-created owner role

**PASS**

Root cause: `AccessService.backfillPlatformPermissions()` only backfilled `module.*`, `workflow.*`, `audit.*`. Owner roles created outside `createOrganizationRoles()` (the demo seed inserted the role directly) therefore lacked every `organization.*` permission. The permission keys already existed in `permissionCatalog`; only the backfill filter was wrong.

Fix (source truth, not a DB patch):

- `apps/api/src/modules/access/permission-catalog.ts` — extracted the permission catalog into a dependency-free module (single source of truth, importable by the seed).
- `AccessService.backfillPlatformPermissions()` now includes `organization.*` in addition to `module.*` / `workflow.*` / `audit.*`.
- The canonical seed grants the **entire catalog** to the owner role it creates, so a fresh database is correct even before the first API boot.

Fresh-DB evidence (after `db:up` → drop/create → `db:migrate` → `demo:seed`):

```text
roles: owner = 39 permissions, member = 0
owner organization.* permissions:
  organization.members.manage
  organization.members.read
  organization.read
  organization.roles.read
  organization.update
platform_modules: assets=t, inventory=t, procurement=t
```

Live API evidence: `GET /organizations/:id/members` with the demo admin session returns HTTP 200 (previously 403 `Missing permission: organization.members.read`). The asset member picker renders options (`Admin Demo (admin@reka.demo)`, `staff (staff@reka.demo)`).

---

## P0 — Audit API `GET /api/v1/audit`

**PASS**

Root cause: `AuditController` applied `AuditReadGuard` without `SessionGuard`, so `request.user` was never populated and the guard always threw `UnauthorizedException` (401 for everyone). The shared guard was also used without setting the required-permission metadata, so it did not actually enforce `audit.read`.

Fix:

- `AuditController` now uses the shared `orgPermissionsDecorator('audit.read', AuditReadGuard, 'audit.read')`, which composes `SessionGuard` + the permission guard and sets the required permission.
- `AuditModule` previously could not import `IdentityModule` (circular via `AuditService`). Added `SessionModule` (`apps/api/src/modules/identity/session.module.ts`) exporting `SessionService`/`SessionGuard`; `IdentityModule` and `AuditModule` both import it. No cycle.

Live evidence:

| Case                               | Result                                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| No session                         | HTTP 401                                                    |
| Owner, org header                  | HTTP 200, org-scoped logs (real records)                    |
| Owner, query `organizationId` only | HTTP 200                                                    |
| Plain member (no `audit.read`)     | HTTP 403 `Missing permission: audit.read`                   |
| Cross-org                          | logs are per organization; Org B returned only Org B events |

Audit content observed for Org A after live actions:

```text
asset.assigned
asset.created
procurement.vendor.created
organization.member_added
```

The Settings → Audit UI displays these records (headless browser check: actions `asset.assigned`, `asset.created`, `procurement.vendor.created` present; "No audit logs found" not shown). The page now uses the org switcher's active organization instead of a hardcoded `organizations[0]`.

---

## P0 — Organization context on real HTTP requests

**PASS**

Root cause: the `org-context` plugin patched `globalThis.$fetch`, but Nuxt's auto-imported `$fetch` is the module-scope snapshot `export const $fetch = globalThis.$fetch` from `#build/fetch.mjs`, captured before plugins run. The patch never applied to application code, so no request carried `x-organization-id`.

Fix: removed the global-patch plugin and introduced a first-class `useApi()` composable (`apps/web/app/composables/useApi.ts`) that reads the same `org-context:active` state the switcher mutates and sets `x-organization-id`. Every application API call in composables and pages now goes through it (verified: no `$fetch` remains outside `useApi.ts`).

Live browser evidence (headless Chromium + CDP network capture, real `/api/v1/vendors` requests while switching the header `<select>`):

```text
GET /api/v1/vendors   x-organization-id: null   (pre-selection race on first paint)
GET /api/v1/vendors   x-organization-id: 9c6975ad…  (Org A)  vendor visible = true
GET /api/v1/vendors   x-organization-id: c630f96f…  (Org B)  vendor visible = false
GET /api/v1/vendors   x-organization-id: 9c6975ad…  (Org A)  vendor visible = true
```

Cross-org isolation re-verified over HTTP: Org B vendor list empty; Org A asset fetched under Org B header → 404; unknown/non-member org → 403.

---

## P0 — Reproducible Demo Seed (`pnpm demo:seed`)

**PASS**

Previous defects fixed:

- `dotenv` is now a direct dependency of `@reka/api`; the seed loads the repo-root `.env` when present.
- `tsx` added as an `@reka/api` dev dependency and the seed is TypeScript importing the real schema modules (no hand-maintained raw SQL, no `.js`→`.ts` resolution failure).
- Default `DATABASE_URL` is `postgres://reka:reka@localhost:5432/reka`, matching the Compose defaults and `packages/config`.
- Duplicate/divergent seeds removed. One canonical implementation: `apps/api/scripts/seed-demo.ts`. Root `demo:seed` delegates: `pnpm --filter @reka/api demo:seed`.
- The seed creates the owner **and** member roles, grants the owner the full permission catalog, enables procurement/inventory/assets (upserting module rows so it works before the first API boot), and prints credentials.

Fresh-clone flow verified:

```bash
pnpm db:up
pnpm db:migrate
pnpm demo:seed
pnpm dev
```

Produces: admin `admin@reka.demo` / `demo123` (active), organization `Acme Indonesia`, owner role with full permissions, member role, and enabled demo modules.

---

## P1 — Member Activation

**PASS**

Root cause: `UserService.createActivationToken` had no caller; `POST /organizations/:id/members` created a pending user but never issued a token, so invitations were a dead end.

Fix: `OrganizationService.addMember` now issues a single-use activation token for pending users and returns it as `activation: { token, expiresAt }` on the created member (self-hosted mechanism; no email provider required). The token is redacted from logs (`*.token` pino redaction) and only returned to the managing admin.

Live evidence (owner session):

```text
POST /organizations/:id/members  -> 201, activation.token returned (32-byte base64url)
pending user login before activation -> 401
POST /auth/activate {token,password}  -> 200
login with new password               -> 200
reuse same token                      -> 400 Invalid or expired activation token
token value present in API logs       -> 0 occurrences
```

Security properties preserved: cryptographically secure token, single-use, 7-day expiry, generic invalid-token error, no token logging, organization boundary enforced by the managing endpoint.

---

## P1 — Asset Assignment History

**PASS**

Fix: `listAssetHistory` now left-joins `users` and `AssetAssignmentView` includes `assigneeName` / `assigneeEmail`; the web history panel renders the name/email instead of the raw UUID. Organization scoping is unchanged.

Live evidence: history response includes `assigneeName: "staff"`, `assigneeEmail: "staff@reka.demo"`; browser history panel shows `staff@reka.demo` (no raw UUID).

---

## P1/P2 — Documentation Drift

**PASS**

Corrected to reflect current reality:

- `ARCHITECTURE.md`: removed non-existent `settings`, `notification`, `files` platform modules and `finance`, `projects`, `helpdesk`, `crm`, `hr` backend module directories; removed non-existent `infra/docker` and `infra/scripts`; replaced the `procurement -> notification` example.
- `docs/module-system.md`: platform list now `core, organization, identity, access, workflow, audit, module-registry`; business list now `procurement, assets, hr, inventory` (hr is registry-declared only).
- `docs/PROJECT_STRUCTURE.md`: same module/infra corrections.
- `DEVELOPMENT.md`: removed the stale `OPENAPI_ENABLED=false` workaround.

---

## Full Demo Flow (live)

```text
Login ........................... PASS  (HTTP 200, session cookie)
Organization ................... PASS  (switcher changes real request context)
Procurement (vendor) ........... PASS  (create + list; integration suite covers full PR→PO→GR)
Inventory ...................... PASS  (integration suite: receive/transfer/adjust/issue, exactly-once)
Asset lifecycle ................ PASS  (live: AVAILABLE → ASSIGNED → AVAILABLE → MAINTENANCE → RETIRED; invalid transitions 400)
Assignment (member picker) ..... PASS  (options show member name/email)
Audit .......................... PASS  (HTTP 200, real records, org-scoped, UI renders)
Activation ..................... PASS  (token issued → activate → login, single-use)
Disabled module UX ............. PASS  (disable → vendor API 404; re-enable → 200)
OpenAPI ........................ PASS  (/docs + /docs-json HTTP 200 with default config)
```

---

## Remaining Issues

1. **P1-8, unchanged (not in scope):** a body-less `POST` with `Content-Type: application/json` still returns Fastify `400 Body cannot be empty`. The SPA sends `{}` and is unaffected. No change made in this pass.
2. `hr` is registered as a business module manifest but has no backend module implementation. Documentation now states this explicitly rather than implying it exists.
3. The initial `/api/v1/vendors` request can race the layout's organization auto-selection on first paint (header `null`); subsequent requests carry the selected organization. This is a first-paint ordering detail, not a context leak.

---

## Final Classification

**FULLY VERIFIED**

All previously failing M7.3 items are fixed and re-tested live against a fresh reproducible database:

- seed-created owner role has all `organization.*` permissions (seed grant + startup backfill),
- `GET /api/v1/audit` works for authorized owners, is denied for unauthorized users, and is organization-isolated,
- real browser requests carry `x-organization-id` and data follows the selected organization,
- `pnpm demo:seed` works from a clean database,
- pending members can be activated through a product API path,
- asset assignment history shows member name/email,
- documentation matches the codebase.

Static gates and the full test suite pass.
