# REKA Roadmap

## Stage 0 — Foundation

Goal: create a boring, reliable development platform.

- monorepo
- pnpm workspace
- Nuxt 4
- NestJS + Fastify
- PostgreSQL
- Docker Compose
- CI
- lint
- formatting
- typechecking
- test runner
- configuration system
- base design system

## Stage 1 — Platform Core

Goal: establish the shared business platform.

- organization
- users
- departments
- teams
- local authentication
- sessions
- roles
- permissions
- settings
- audit
- file metadata
- notification center

## Stage 2 — Module System

Goal: enable feature modules cleanly.

- module registry
- module metadata
- dependencies
- enable/disable
- menu registration
- route registration
- permission registration
- module migrations
- module health

## Stage 3 — Workflow

Goal: make business processes reusable.

- states
- transitions
- guards
- approvals
- comments
- escalation
- delegation
- notifications
- audit integration
- transition history

## Stage 4 — Procurement

Goal: first production-quality business module.

- vendors
- products
- purchase requests
- approvals
- purchase orders
- goods receipt
- procurement dashboard
- audit
- notifications

Demo story:

```text
Employee
  -> Purchase Request
  -> Manager Approval
  -> Procurement Review
  -> Purchase Order
  -> Goods Receipt
  -> Asset Assignment
```

## Stage 5 — Operational Foundation

- background worker
- postgres-backed jobs
- health/readiness
- structured logging
- request IDs
- OpenAPI
- backup documentation
- security hardening

## Stage 6 — Optional Infrastructure

- Redis
- OIDC
- Keycloak
- S3-compatible storage
- OpenTelemetry
- Prometheus
- Grafana
- Loki
- Tempo

## Stage 7 — Additional Modules

Order is intentionally flexible:

- assets
- HR
- inventory
- projects
- helpdesk
- finance

Choose based on real user scenarios rather than trying to complete all modules.

## Stage 8 — Enterprise

- advanced SSO
- LDAP/AD
- SCIM
- API keys
- webhooks
- integrations
- advanced audit
- disaster recovery
- tenant isolation
- service extraction where justified

## Milestone Rule

Every stage should produce a usable increment.

Do not spend months building infrastructure before a user-visible business flow exists.
