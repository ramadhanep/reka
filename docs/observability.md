# Observability

## Purpose

Observability helps answer:

> What happened, where, and why?

Three primary signals:

```text
Logs
Metrics
Traces
```

## Phase 1 — Simple

Start with:

- structured JSON logs
- request ID
- correlation ID
- health endpoint
- readiness endpoint
- DB health check
- explicit error logging

Example:

```json
{
  "level": "error",
  "requestId": "req_123",
  "module": "procurement",
  "action": "purchase_request.approve",
  "error": "..."
}
```

## Phase 2 — OpenTelemetry

Instrument the application using OpenTelemetry.

Conceptually:

```text
REKA
 |
 +-- traces
 +-- metrics
 +-- logs
 |
 v
OpenTelemetry Collector
```

## Phase 3 — Optional Observability Stack

Provide a Docker profile for:

```text
OpenTelemetry Collector
Prometheus
Grafana
Loki
Tempo / Jaeger
```

These are optional.

The base REKA installation must not require an observability cluster.

## Useful Metrics

Start with:

```text
HTTP request count
HTTP latency
HTTP error rate
DB query latency
job duration
job failure count
queue depth
module health
```

## Tracing

Trace boundaries such as:

```text
HTTP request
 -> auth
 -> procurement
 -> DB query
 -> notification job
```

This becomes especially valuable once external integrations exist.

## Background Jobs

Background jobs run in `apps/worker` and are backed by PostgreSQL (no broker;
see [ADR 0006](./adr/0006-postgresql-jobs.md)). The first recurring job is the
auth-hygiene cleanup (`ops.auth-cleanup`, default 24h interval), scheduled
from the API bootstrap. Job duration, failure count, and queue depth are the
candidate metrics for this path.

## Logging Rules

Logs should be:

- structured
- searchable
- contextual
- free of secrets
- free of unnecessary personal data

Avoid logging:

- passwords
- access tokens
- full authorization headers
- sensitive document contents

## Incident Debugging Goal

A useful request should be traceable via:

```text
requestId
traceId
userId
organizationId
module
action
```

without turning logs into a data dump.
