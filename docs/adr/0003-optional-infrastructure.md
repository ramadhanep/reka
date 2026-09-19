# ADR-0003: Optional Infrastructure Profiles

## Status

Accepted

## Context

A major goal is to keep small self-hosted installations resource-efficient.

## Decision

The default stack contains only:

```text
web
api
postgres
```

Optional services are enabled through deployment profiles.

## Profiles

### Lite

```text
web
api
postgres
```

### Standard

```text
web
api
worker
postgres
redis
storage
```

### Enterprise

```text
web
api
worker
postgres
redis
oidc
storage
observability
```

## Consequences

Users with small deployments avoid unnecessary memory and maintenance costs.

The application must not assume optional services exist.

## Revisit When

If an optional dependency becomes mandatory for correctness rather than performance, document that change with a new ADR.
