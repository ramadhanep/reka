# Module System

## Purpose

REKA is a platform of business modules rather than a single giant application feature set.

Examples:

Platform modules (foundational, always present):

```text
core
organization
identity
access
workflow
audit
module-registry
```

Business modules (enable/disable capabilities):

```text
procurement
assets
hr
inventory
```

## Module Lifecycle

```text
Available
   |
   v
Enabled
   |
   v
Initialized
   |
   v
Healthy
```

A module can also be:

```text
Disabled
Uninstalled
Blocked by dependency
```

## Module Metadata

Implemented shape in `@reka/contracts`:

```ts
export type ModuleCategory = 'platform' | 'business'

export interface ModuleMenuItem {
  id: string
  label: string
  path: string
  icon?: string
  order?: number
}

export interface RekaModule {
  id: string
  version: string
  displayName: string
  description?: string
  category: ModuleCategory
  dependencies: string[]
  permissions?: string[]
  routes?: string[]
  menus?: ModuleMenuItem[]
  migrations?: string[]
}

export interface ModuleSummary {
  id: string
  version: string
  displayName: string
  description?: string
  category: ModuleCategory
  dependencies: string[]
  permissions: string[]
  routes: string[]
  menus: ModuleMenuItem[]
  enabled: boolean
}
```

## Dependencies & Lifecycle Validation

Dependencies are strictly validated by `ModuleRegistryService`:

1. **Cycle Detection**: DFS topological traversal rejects any registration that would create a circular dependency (`A -> B -> A`).
2. **Missing Dependencies**: When enabling a module, all listed dependencies must be registered and currently enabled.
3. **Platform Protection**: Platform modules (`core`, `identity`, `access`, `organization`, `audit`, `module-registry`) are required and cannot be disabled.
4. **Active Dependent Protection**: A module cannot be disabled if another enabled module depends on it.

## Persistence

Runtime module enable/disable status is persisted in PostgreSQL:

```sql
CREATE TABLE "platform_modules" (
  "id" text PRIMARY KEY NOT NULL,
  "version" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

## Administration API

Admin-facing endpoints protected by `SessionGuard` and `ModuleAccessGuard`:

```text
GET  /api/v1/modules              (requires module.read)
GET  /api/v1/modules/:id          (requires module.read)
POST /api/v1/modules/:id/enable   (requires module.manage)
POST /api/v1/modules/:id/disable  (requires module.manage)
```

## Audit Trail

Module lifecycle mutations emit structured audit logs:

- `module.enabled`
- `module.disabled`

Each event includes: actor ID, organization context ID, module ID, timestamp, and metadata.

## Route Protection

Module-scoped backend endpoints are protected by `@RequireModule('moduleId')` and `ModuleEnabledGuard`.
When a module is disabled, HTTP requests return `404 Not Found` (`Module '<id>' is disabled`).

## Enable/Disable Rules

Disabling a module must not silently destroy data.

Default behavior:

```text
disable != delete
```

When disabled:

- routes disappear (return 404)
- navigation links disappear
- UI capabilities are hidden
- background jobs stop
- API access is blocked
- database tables and records remain intact

Deletion requires a separate explicit operation and policy.

## Resource Efficiency

Disabled modules should avoid:

- background workers
- scheduled tasks
- unnecessary initialization
- unnecessary queries
- unnecessary UI bundles where practical

Do not promise perfect code-splitting or zero cost. Measure before optimizing.

## Versioning

Modules have their own semantic version metadata, but the repository has one release version initially.

If module extraction becomes necessary later, its package/service version can diverge.

## Feature Flags vs Modules

A module is a business capability:

```text
procurement
```

A feature flag controls behavior inside or across modules:

```text
procurement.newApprovalScreen
```

Do not use feature flags as a replacement for the module system.

## Future Plugin Direction

A later version may support external modules/packages.

Do not implement a full runtime plugin marketplace until internal module boundaries are proven.
