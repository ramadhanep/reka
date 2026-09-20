# Task: M3 Workflow Engine

## Goal

Build a generic, reusable workflow engine that business modules (e.g. Procurement, HR, Finance) can leverage for state machine execution, transition validation, role-based transition authorization, concurrency-safe mutations, audit logging, and transition notification hooks without any business-specific logic leaking into the engine.

## Scope

### In scope

- Core workflow domain entities:
  - `WorkflowDefinition` (versioned state machine descriptor: key, version, status, name, description)
  - `WorkflowState` (state node: key, name, isInitial, isTerminal, metadata)
  - `WorkflowTransition` (directed edge: key, name, fromStateId, toStateId, requiredPermission, metadata)
  - `WorkflowInstance` (active workflow execution: subjectType, subjectId, currentStateId, status, organizationId)
  - `WorkflowTransitionHistory` (immutable audit record of executed transitions)
- Database schema & PostgreSQL migrations via Drizzle ORM
- Deterministic definition validation:
  - Exactly one initial state per definition
  - At least one state and valid terminal states
  - Transitions must reference states within the same definition
  - Key uniqueness per definition
- Lifecycle states for definitions (`draft`, `active`, `archived`):
  - Only `active` definitions can spawn instances
  - Active definitions with instances cannot be mutated in place; new versions are created
- Instance creation and execution:
  - Generic `subjectType` and `subjectId` (no foreign keys to future business tables)
  - State machine rule enforcement (valid transition, correct current state, non-terminal state)
- PostgreSQL transaction & row-locking (`SELECT ... FOR UPDATE`) concurrency control
- Organization boundary and tenant isolation
- Transition authorization evaluated against existing RBAC system (`AccessService`)
- Audit trail integration with `AuditService` (`workflow.definition.created`, `workflow.definition.updated`, `workflow.definition.published`, `workflow.instance.created`, `workflow.transition.executed`)
- In-process domain event / notification hook (`WorkflowNotificationHook`)
- Admin & execution REST API (`/api/v1/workflows`, `/api/v1/workflow-instances`)
- Platform module registration (`workflow`) in `module-manifests.ts` satisfying Procurement's dependency
- Nuxt frontend administration UI under `Settings -> Workflows`
- Comprehensive unit, integration, concurrency, and API testing

### Out of scope

- Procurement, Expense, HR, or other business module domain logic
- Drag-and-drop visual workflow designer
- Dynamic expression languages (JSONLogic, JavaScript eval, custom SQL scripts)
- Complex multi-level approval hierarchies, delegation, escalation, quorum, substitute approvers, SLA timers
- External distributed workflow engines (Temporal, Camunda) or message brokers (Kafka, RabbitMQ, Redis)

## Existing Code

Relevant files/modules:

- `packages/contracts/src/index.ts` — Shared contracts, module types
- `packages/events/src/index.ts` — `RekaEvent` interface
- `apps/api/src/common/database.token.ts` & `database.module.ts` — Drizzle ORM database injection
- `apps/api/src/modules/access/` — RBAC permissions, role repository, `AccessService`
- `apps/api/src/modules/audit/` — `AuditService`, `auditLogs` schema and repo
- `apps/api/src/modules/identity/` — `SessionGuard`, session service, user service
- `apps/api/src/modules/organization/` — `member.repo.ts`, `organization.repo.ts`
- `apps/api/src/modules/module-registry/` — `module-manifests.ts`, `ModuleRegistryService`, `@RequireModule`
- `apps/web/app/` — Nuxt 4 frontend, `useAuth`, `useModules`, layout, UI components

Existing patterns to reuse:

- Fastify + NestJS thin controllers, validation pipes, global exception filter
- `SessionGuard` + organization membership & RBAC permission checks
- Drizzle migrations under `apps/api/drizzle/`
- Vitest integration testing with real PostgreSQL in `apps/api/test/support.ts`
- Audit log recording via `AuditService.record()`

## Architecture

Affected modules:

- New module: `apps/api/src/modules/workflow/`
- Updated: `packages/contracts/src/index.ts` (workflow DTO contracts & interfaces)
- Updated: `apps/api/src/modules/access/access.service.ts` (workflow permissions in permission catalog)
- Updated: `apps/api/src/modules/module-registry/module-manifests.ts` (register `workflow` platform module)
- Updated: `apps/api/src/app.module.ts` (import `WorkflowModule`)
- Updated: `apps/web/app/pages/settings/` (add workflow inspection UI) and `layouts/default.vue`

Dependency direction:

```text
workflow -> core
workflow -> identity (actor identification)
workflow -> access (permission evaluation)
workflow -> organization (tenant scoping)
workflow -> audit (audit event recording)
workflow -> database (persistence & row locking)
module-registry -> recognizes workflow as platform module
procurement (future) -> depends on workflow
```

New infrastructure dependency?

- [x] no

## Data

Migration required?

- [x] yes

Schema changes:

1. `workflow_definitions`:
   - `id`: `uuid` PK defaultRandom
   - `organization_id`: `uuid` nullable FK `organizations.id`
   - `key`: `text` NOT NULL
   - `name`: `text` NOT NULL
   - `description`: `text` nullable
   - `version`: `integer` NOT NULL DEFAULT 1
   - `status`: `text` NOT NULL DEFAULT 'draft' ('draft' | 'active' | 'archived')
   - `created_at`: `timestamp with time zone` NOT NULL DEFAULT now()
   - `updated_at`: `timestamp with time zone` NOT NULL DEFAULT now()

2. `workflow_states`:
   - `id`: `uuid` PK defaultRandom
   - `workflow_definition_id`: `uuid` NOT NULL FK `workflow_definitions.id` ON DELETE CASCADE
   - `key`: `text` NOT NULL
   - `name`: `text` NOT NULL
   - `is_initial`: `boolean` NOT NULL DEFAULT false
   - `is_terminal`: `boolean` NOT NULL DEFAULT false
   - `metadata`: `jsonb` NOT NULL DEFAULT '{}'
   - `created_at`: `timestamp with time zone` NOT NULL DEFAULT now()
   - `updated_at`: `timestamp with time zone` NOT NULL DEFAULT now()

3. `workflow_transitions`:
   - `id`: `uuid` PK defaultRandom
   - `workflow_definition_id`: `uuid` NOT NULL FK `workflow_definitions.id` ON DELETE CASCADE
   - `key`: `text` NOT NULL
   - `name`: `text` NOT NULL
   - `from_state_id`: `uuid` NOT NULL FK `workflow_states.id` ON DELETE CASCADE
   - `to_state_id`: `uuid` NOT NULL FK `workflow_states.id` ON DELETE CASCADE
   - `required_permission`: `text` nullable
   - `metadata`: `jsonb` NOT NULL DEFAULT '{}'
   - `created_at`: `timestamp with time zone` NOT NULL DEFAULT now()
   - `updated_at`: `timestamp with time zone` NOT NULL DEFAULT now()

4. `workflow_instances`:
   - `id`: `uuid` PK defaultRandom
   - `organization_id`: `uuid` NOT NULL FK `organizations.id` ON DELETE CASCADE
   - `workflow_definition_id`: `uuid` NOT NULL FK `workflow_definitions.id` ON DELETE RESTRICT
   - `subject_type`: `text` NOT NULL
   - `subject_id`: `text` NOT NULL
   - `current_state_id`: `uuid` NOT NULL FK `workflow_states.id` ON DELETE RESTRICT
   - `status`: `text` NOT NULL DEFAULT 'active' ('active' | 'completed' | 'canceled')
   - `created_by`: `uuid` NOT NULL FK `users.id`
   - `created_at`: `timestamp with time zone` NOT NULL DEFAULT now()
   - `updated_at`: `timestamp with time zone` NOT NULL DEFAULT now()

5. `workflow_transition_history`:
   - `id`: `uuid` PK defaultRandom
   - `instance_id`: `uuid` NOT NULL FK `workflow_instances.id` ON DELETE CASCADE
   - `organization_id`: `uuid` NOT NULL FK `organizations.id` ON DELETE CASCADE
   - `transition_id`: `uuid` nullable FK `workflow_transitions.id` ON DELETE SET NULL
   - `transition_key`: `text` NOT NULL
   - `from_state_id`: `uuid` nullable FK `workflow_states.id` ON DELETE SET NULL
   - `from_state_key`: `text` NOT NULL
   - `to_state_id`: `uuid` nullable FK `workflow_states.id` ON DELETE SET NULL
   - `to_state_key`: `text` NOT NULL
   - `actor_id`: `uuid` NOT NULL FK `users.id`
   - `comment`: `text` nullable
   - `metadata`: `jsonb` NOT NULL DEFAULT '{}'
   - `created_at`: `timestamp with time zone` NOT NULL DEFAULT now()

Indexes / constraints:

- `workflow_definitions_key_ver_idx`: on `(organization_id, key, version)`
- `workflow_states_def_key_unique`: unique on `(workflow_definition_id, key)`
- `workflow_transitions_def_key_from_unique`: unique on `(workflow_definition_id, key, from_state_id)`
- `workflow_instances_org_idx`: on `organization_id`
- `workflow_instances_subject_idx`: on `(organization_id, subject_type, subject_id)`
- `workflow_history_instance_idx`: on `instance_id`

## API

Endpoints/contracts:

```text
Definitions:
GET    /api/v1/workflows                     -> list workflow definitions for active organization
GET    /api/v1/workflows/:id                 -> get workflow definition with its states and transitions
POST   /api/v1/workflows                     -> create draft workflow definition with states and transitions
PATCH  /api/v1/workflows/:id                 -> update definition metadata or publish/archive status
POST   /api/v1/workflows/:id/version         -> create next draft version from existing definition

Instances:
POST   /api/v1/workflow-instances            -> start workflow instance for a subject
GET    /api/v1/workflow-instances/:id        -> get workflow instance with current state & available transitions
GET    /api/v1/workflow-instances/:id/history -> get immutable transition history for an instance
POST   /api/v1/workflow-instances/:id/transitions/:transitionKey -> execute transition with optional comment
```

Authorization:

- `SessionGuard`: requires valid session cookie
- Organization Membership: verified for active organization (`x-organization-id` or membership)
- Permissions:
  - `workflow.definition.read` for reading definitions
  - `workflow.definition.manage` for creating/updating/publishing definitions
  - `workflow.instance.read` for inspecting instance and history
  - `workflow.instance.create` for starting an instance
  - `workflow.instance.transition` + `transition.requiredPermission` for executing transitions

Validation:

- ValidationPipe with DTOs
- Definition validation: exactly one initial state, all transitions point to valid states
- Instance creation: definition must be in `active` status
- Transition validation: instance must be in `active` status; transition `fromState` must match `currentStateId`
- Concurrency: row-level lock `SELECT ... FOR UPDATE` prevents concurrent race mutations

## Frontend

Routes:

- `/settings/workflows` — List workflow definitions, status, version, and trigger inspection
- `/settings/workflows/[id]` — Detailed view of states, transitions, initial/terminal indicators

Components:

- `SettingsNav` / Layout link: Workflows item under settings
- `WorkflowList`: Table of definitions with key, name, version, status, and created date
- `WorkflowDetail`: State and transition inspection viewer showing graph flow

States:

- loading: spinner / skeleton
- empty: no workflows defined
- error: error banner
- success: rendered data

## Tests

Unit:

- State machine validation: valid/invalid transitions, wrong current state, terminal state checks
- Graph validation: unique initial state, state existence, duplicate keys
- Versioning: draft -> active, version bumping
- Permission evaluator: transition allowed / denied based on user roles

Integration:

- Database persistence and migrations
- Instance creation and lifecycle transitions
- History record creation
- Multi-tenancy / organization boundary enforcement
- Concurrency test: simultaneous conflicting transitions against the same instance with `SELECT ... FOR UPDATE`

API:

- Full HTTP flows for definitions, instances, transitions, and history

## Implementation Order

1. Shared contracts in `@reka/contracts`
2. Database schema in `apps/api/src/modules/workflow/` and Drizzle migration
3. Platform permissions in `AccessService` and module manifest registration
4. Workflow domain service (definition, validation, instance, transition execution with row lock, history, audit, notification hook)
5. REST controllers and DTOs with validation
6. Nuxt frontend workflow administration viewer
7. Unit, integration, concurrency, and API tests
8. Documentation sync & verification

## Verification

Commands:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Expected result:

```text
All tests pass cleanly with zero lint and typecheck errors.
```

## Risks

- Concurrency: concurrent transition attempts could cause race conditions if not properly locked. Mitigated via PostgreSQL `SELECT ... FOR UPDATE` inside `db.transaction`.
- Tenant isolation: instances must not leak across organizations. Mitigated via strict organizationId matching in query predicates.
- Re-executing terminal states: instances in terminal states must block any further transitions. Mitigated by explicit `isTerminal` check in the transition validator.

## Documentation

Docs to update:

- `MASTER_PLAN.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `docs/module-system.md`
- New ADR: `docs/adr/0005-workflow-engine.md`

## Completion Checklist

- [ ] implementation
- [ ] validation
- [ ] authorization
- [ ] tests
- [ ] migration if needed
- [ ] docs
- [ ] diff reviewed
- [ ] verification actually run
