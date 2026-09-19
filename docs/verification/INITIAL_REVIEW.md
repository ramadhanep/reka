# REKA Initial Documentation Review

Status: completed during repository bootstrap (M0).

Scope: full consistency, feasibility, security, and resource-efficiency review of the documentation set.
Decisions below reconcile the 26-file documentation pack before implementation begins.

## Executive Summary

**Coherent after minor corrections.**

The documentation set is largely consistent and technically sound. The intended architecture
(monorepo, modular monolith, Nuxt 4 frontend, NestJS + Fastify backend, PostgreSQL, optional
infrastructure) is realistic for a solo developer and resource-efficient by design. No
significant architectural corrections were required.

Corrections applied were limited to: standardizing the canonical module list and ordering,
harmonizing deployment-profile naming, confirming the database layer (Drizzle), fixing a Nuxt 4
directory-structure inaccuracy, and documenting the database-layer decision in an ADR.

## Findings

### 1. Compose / deployment profile naming inconsistent

```
Severity:  Medium
Document:  infra/AGENTS.md, MASTER_PLAN.md, DEVELOPMENT.md, ARCHITECTURE.md, ADR-0003
Problem:   infra/AGENTS.md listed compose profiles `base`, `standard`, `enterprise`,
           `observability`. MASTER_PLAN/ARCHITECTURE/ADR-0003 define deployment profiles
           Lite/Standard/Enterprise. `base` was undefined elsewhere, and `observability`
           was not mapped to a deployment profile.
Why:       Agents and humans would create compose files that drift from the documented
           deployment model.
Correction: Canonical mapping established: Lite = default compose group (web, api, postgres);
           Standard = profile `standard` (worker, redis, storage); Enterprise = profile
           `enterprise` (oidc, observability); `observability` is a standalone compose
           profile for the optional monitoring stack. `base` removed.
```

### 2. Module list inconsistent across documents

```
Severity:  Medium
Document:  ARCHITECTURE.md, PROJECT_STRUCTURE.md, MASTER_PLAN.md, AGENTS.md, module-system.md
Problem:   `core`, `settings`, `module-registry`, and `crm` appeared in some module lists and
           not others. Ordering varied. Identity and access were sometimes combined as
           "identity/access" (AGENTS.md §3) and sometimes separate.
Why:       Module boundaries are the platform's most important contract. Drift misleads
           agents about where code belongs and whether a module may be disabled.
Correction: One canonical list with two tiers:
             Platform (always present): core, organization, identity, access, settings,
               workflow, audit, notification, files, module-registry
             Business (enable/disable): procurement, assets, hr, inventory, finance,
               projects, helpdesk, crm
           Applied to ARCHITECTURE.md, PROJECT_STRUCTURE.md, MASTER_PLAN.md, AGENTS.md,
           and module-system.md. Identity and access kept separate to preserve the
           authentication-vs-authorization security distinction.
```

### 3. Web directory structure used Nuxt 3 layout

```
Severity:  Low
Document:  docs/PROJECT_STRUCTURE.md
Problem:   Web tree placed pages/components/layouts at `apps/web` root. Nuxt 4's default
           srcDir is `app/`.
Why:       Agents scaffolding Nuxt 4 from the documented structure would write to wrong paths.
Correction: Web tree now nested under `apps/web/app/`.
```

### 4. ORM choice left open

```
Severity:  Low
Document:  MASTER_PLAN.md
Problem:   Backend ORM described as "a PostgreSQL-oriented typed SQL layer such as Drizzle",
           implying the choice was not final.
Why:       An open ORM decision blocks consistent bootstrap, migration tooling, and tests.
Correction: Drizzle confirmed as the database layer and documented in ADR-0004.
```

### 5. Frontend stack listed in only one document

```
Severity:  Low
Document:  ARCHITECTURE.md vs MASTER_PLAN.md
Problem:   Tailwind appears only in MASTER_PLAN.md.
Why:       ARCHITECTURE.md should state the full frontend stack.
Correction: Added Tailwind to the web application line in ARCHITECTURE.md.
```

### 6. Drizzle schema placement vs packages/database tension

```
Severity:  Low (clarified, no file change required)
Document:  ARCHITECTURE.md §5/§7, ADR-0004
Problem:   `packages/database` is described as "DB utilities and schema access" while module
           ownership requires each module to own its persistence concerns.
Why:       Ambiguous where schema definitions live.
Correction: Clarified in ADR-0004: `packages/database` provides the connection, migration
           tooling, and shared utilities; schema declarations live with their owning module.
```

## Confirmed Decisions

These decisions were found consistent across the documentation and remain valid:

1. One Git repository, one monorepo, no nested Git repositories (ADR-0001).
2. Modular monolith first; module extraction only via a new ADR and a proven requirement (ADR-0002).
3. Optional infrastructure with deployment profiles; defaults stay on Nuxt + NestJS + PostgreSQL (ADR-0003).
4. Nuxt 4 + Vue 3 + TypeScript + Tailwind frontend; UI behaves as one platform.
5. NestJS + Fastify + TypeScript + REST + OpenAPI backend; versioned `/api/v1`; thin controllers.
6. PostgreSQL as the system of record; migrations required for schema changes.
7. PostgreSQL-backed jobs initially; Redis only when a concrete requirement justifies it.
8. REKA consumes identity providers for authentication (local mode, OIDC, Keycloak, Cognito, Entra ID) and owns business authorization. REKA is not becoming its own identity provider.
9. Storage abstracted behind a provider interface (local filesystem, S3-compatible); no vendor hard-coding.
10. Observability is phased: structured logs, request IDs, health/readiness first; OpenTelemetry + Prometheus/Grafana/Loki/Tempo optional later.
11. Module enable/disable with `disable != delete`; data retained; routes, navigation, API access, and background jobs removed when disabled.
12. Security posture: server-side authorization on every protected operation, established crypto libraries only, uploaded files treated as untrusted, no secrets in logs, DTO validation at API boundary.
13. Solo-developer feasibility and resource efficiency are design constraints, not afterthoughts.
14. English repository documentation; English + Indonesian UI locale.

## Corrected Decisions

1. **Database layer finalized** — "such as Drizzle" made definite; Drizzle + `pg` documented in ADR-0004. Previously implicit, now recorded and binding.
2. **Deployment profile mapping standardized** — compose profiles now map explicitly to Lite/Standard/Enterprise; removed the undefined `base` profile.
3. **Canonical module list established** — `core`, `settings`, `module-registry`, and `crm` added where missing; identity separated from access everywhere; ordering normalized across all 5 documents.

## Remaining Ambiguities

Listed only because they cannot be resolved from current project goals. None block bootstrap.

1. Token-session mechanics (opaque cookies vs refresh-token rotation) are not fixed. This is an identity-module implementation detail with an established security baseline; resolve during the identity module, not now.
2. TypeScript version selection for the foundation pins 5.9.x rather than the newly released 7.x line. This is an operational reliability choice (ecosystem compatibility), not an architecture change; revisit when the TS 7 line is stabilized in the toolchain.
3. Whether `crm` is ever built is open. MASTER_PLAN lists it as a potential module; ROADMAP does not schedule it. Build only when a real workflow justifies it, per MASTER_PLAN §10.
