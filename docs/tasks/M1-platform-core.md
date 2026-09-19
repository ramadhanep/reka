# Task: M1 Platform Core — Identity, Organization & Authorization

## Goal

First security and organization vertical slice: local authentication, server-managed
sessions, organizations, memberships, RBAC, server-side authorization, audit events.

## Scope

### In scope

- Local authentication (Argon2id), login/logout/session, safe one-time setup path
- Server-managed sessions, revocable, secure cookies
- Organization + OrganizationMember (single organization concept; no multi-tenancy)
- Role + Permission + RolePermission; explicit permission catalog
- Server-side authorization guard: session -> membership -> permission
- Audit events for sensitive operations
- Minimal UI: login, org list, org detail, members, member management
- Unit + integration + authorization tests

### Out of scope

- MFA, passwordless, WebAuthn, LDAP/SCIM/SAML/SSO, invitations, advanced policy/ABAC
- Tenant isolation, org hierarchy, departments/teams, HR/employee model
- Business modules (procurement, etc.), workflow engine

## Existing Code

- `apps/api/src/common/database.module.ts` — DATABASE token (drizzle + pg pool)
- `packages/contracts` — API_PREFIX, ApiError shape
- `packages/config` — getConfig()
- `apps/api/src/modules/core/core.schema.ts` — schema pattern
- `packages/tooling` — lint/ts/prettier config

## Architecture

Affected modules: `identity` (user, session, auth), `access` (role, permission,
authorization guard), `organization` (org, membership), `audit` (audit log),
`core` (unchanged).

Dependency direction:

```text
organization -> identity (find-or-create by email)
organization -> access (seed roles, evaluate permissions)
identity/org/access -> audit
```

No new infrastructure dependency. Stack remains Nuxt + NestJS + PostgreSQL.

## Database

New tables + one migration:

```text
users, sessions
organizations, organization_members
permissions, roles, role_permissions
audit_logs
```

Rules: unique(organization_id, user_id) on memberships; unique(organization_id, key) on
roles; unique(key) on permissions; unique(slug) on organizations. Session token stored hashed,
never plaintext. Deletion: memberships/roles cascade with organization; sessions cascade with
user; audit actor/org `SET NULL`.

Permission catalog is seeded idempotently at app bootstrap (not raw SQL migration) with only
M1-needed keys.

## API

```text
POST   /api/v1/setup                       -> create first user + org (only when no users)
POST   /api/v1/auth/login                  -> session cookie
POST   /api/v1/auth/logout                 -> revoke session, clear cookie
GET    /api/v1/auth/session                -> current user + orgs
POST   /api/v1/organizations               -> create org (creator becomes owner)
GET    /api/v1/organizations               -> user's orgs
GET    /api/v1/organizations/:id           -> org + caller role/permissions (membership required)
PATCH  /api/v1/organizations/:id           -> organization.update
GET    /api/v1/organizations/:id/members   -> organization.members.read
POST   /api/v1/organizations/:id/members   -> organization.members.manage
PATCH  /api/v1/organizations/:id/members/:memberId -> organization.members.manage
GET    /api/v1/organizations/:id/roles     -> organization.roles.read
```

Authorization: session guard (401); non-member -> 404 (no org existence disclosure);
member without permission -> 403. Errors use the shared `ApiError` shape.

## Frontend

- Vite dev proxy `/api -> http://localhost:4000` (same-origin cookies in dev)
- Pages: `/login`, `/` (org list), `/organizations/:id`
- Auth composable + client-side route middleware
- States: unauthenticated, loading, empty, error, forbidden, success
- Shared primitives under `app/components/ui`
- Permission-aware UI only (API remains the boundary)

## Tests

- Unit: password hash/verify, session expiry/revocation, permission evaluation, slugify
- Integration (real PostgreSQL, dedicated `reka_test` DB): setup, login, session,
  session revocation, org CRUD, membership, cross-org 404, permission 403, audit rows
- Authorization matrix: 401 / 403 / allowed / revoked-session denied

## Implementation Order

1. Schemas + migration
2. identity (password, session, auth, setup)
3. access (roles/permissions, guards/decorators)
4. organization (org + membership service/controller)
5. audit
6. global validation + error filter
7. integration + unit tests
8. frontend flow
9. verification + security review

## Verification

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm exec prettier --check .
# manual: pnpm dev, POST /setup, login, org flow over HTTP
```

## Risks

- Cookie-based auth + dev proxy portability between environments
- Argon2 native module prebuild availability
- Circular DI between modules (mitigated: access/identity own their repos; org calls services)

## Documentation

- This plan, ARCHITECTURE.md (module ownership notes), ROADMAP.md (M1 done), ADR if a
  material decision changes (session model recorded in report; new ADR only if needed)

## Completion Checklist

- [ ] implementation
- [ ] validation (DTO + pipe)
- [ ] authorization (guards, org boundary)
- [ ] tests (unit + integration + authz)
- [ ] migration
- [ ] docs
- [ ] diff reviewed
- [ ] verification actually run
