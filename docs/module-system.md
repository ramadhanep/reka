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
settings
workflow
audit
notification
files
module-registry
```

Business modules (enable/disable capabilities):

```text
procurement
assets
hr
inventory
finance
projects
helpdesk
crm
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

Target shape:

```ts
interface RekaModule {
  id: string
  version: string
  displayName: string
  dependencies: string[]
  permissions: string[]
  routes: string[]
  menus: string[]
  migrations: string[]
}
```

## Dependencies

Example:

```text
procurement
  depends on:
    core
    organization
    access
    workflow
    audit
    notification
```

The module registry should validate dependency graphs before enabling a module.

## Enable/Disable Rules

Disabling a module must not silently destroy data.

Default behavior:

```text
disable != delete
```

When disabled:

- routes disappear
- navigation disappears
- UI capabilities are hidden
- background jobs stop
- API access is blocked
- data remains intact

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
