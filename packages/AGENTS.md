# Shared Packages Instructions

Packages contain reusable technical libraries and contracts.

## Rules

A package should be reusable for a concrete reason.

Avoid turning every helper into a package.

Examples:

```text
ui
contracts
database
auth
storage
events
config
tooling
```

## Dependency Direction

Packages should not depend on business modules.

Avoid:

```text
packages/ui -> procurement
```

Prefer:

```text
procurement -> packages/ui
```

## API Contracts

Shared contracts must remain stable and explicit.

Do not leak database entities directly as public API contracts.

## Extraction

A package may become its own publishable package later, but that is not a goal in the initial implementation.
