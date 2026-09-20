# ADR 0006: PostgreSQL-backed jobs (no broker)

## Status

Accepted.

## Context

M5 adds a background worker (`apps/worker`). The choice was between a message
broker (Redis/Kafka/RabbitMQ/NATS) and relying on PostgreSQL, which is already
mandatory. Operational requirements: durable enqueue, at-least-once processing,
retries with backoff, permanent failure visibility, and safe operation under
multiple concurrent workers.

The monorepo rules (`AGENTS.md`, ADR 0003) forbid introducing mandatory
infrastructure without a concrete need. A broker adds an extra process, extra
operational surface, and a new failure domain before the workload justifies it.

## Decision

Implement a small PostgreSQL-backed job queue in a dedicated workspace package
`packages/jobs`, used by both the API (enqueue) and the worker (claim/process).

- Queue table `jobs` with `status`, `attempts`, `max_attempts`, `available_at`,
  `locked_at/locked_by`, timestamps, and `last_error`.
- Claiming uses a single `UPDATE ... WHERE id IN (SELECT ... LIMIT n FOR UPDATE
SKIP LOCKED)` statement, so concurrent workers/processes take disjoint rows
  without distributed locks.
- All time comparisons use PostgreSQL `now()` (server clock) to avoid
  client/server clock-skew making availability or stale-lock logic unreliable.
- Retry uses exponential backoff with optional jitter; permanently failed jobs
  stay inspectable in `status = 'failed'` with `last_error` and `failed_at`.
- A crashed worker's `running` jobs are reclaimed after a lock timeout.
- The schema is versioned with the shared Drizzle migrations under
  `apps/api/drizzle`.

Scope deliberately excluded: job sagas, scheduler/cron, per-job priority,
FIFO guarantees (SKIP LOCKED is unordered by design), retry-on-shutdown
acknowledgement, and a dashboard. Those belong to a scheduler and/or broker if
ever justified.

## Consequences

- The base installation stays Lite: PostgreSQL is the only required service.
- A future broker (Redis Streams, pg-boss-isomorphic, etc.) can sit behind the
  same `enqueue/claim/complete/fail` contract defined in `packages/jobs`.
- Job throughput is bounded by PostgreSQL; adequate for the expected workload
  and safely improvable later (e.g. `-Fc` parallelism or a broker).
- The worker is intentionally stateless: at-least-once semantics mean handlers
  must be idempotent where it matters.

## Alternatives considered

- `pg-boss` (mature, battle-tested) adds a dependency and its own schema/API
  but removes the need to maintain our own queue. Trade-off accepted: the queue
  surface we need is small, hand-rolling keeps full control and no extra dep,
  and the retry/claim logic is under our tests. Revisit pg-boss if monitoring,
  cron, or advanced scheduling needs appear.
- Redis as an in-memory queue: rejected (new mandatory infrastructure, lossy
  without AOF+persistence discipline).
