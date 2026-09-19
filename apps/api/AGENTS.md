# API Instructions

This directory contains the REKA NestJS backend.

## Rules

- Use NestJS modules to enforce business boundaries.
- Keep controllers thin.
- Put business behavior in application/domain services.
- Do not let controllers contain complex business rules.
- Validate every external input.
- Enforce authorization server-side.
- Keep database access behind explicit repositories/services where practical.
- Do not let one business module freely query another module's persistence layer.
- Emit audit events for sensitive business changes.
- Use transactions for multi-write invariants.
- Prefer PostgreSQL-native behavior over unnecessary abstraction.

## API

- REST is the default.
- APIs are versioned under `/api/v1`.
- OpenAPI is the contract.
- Use consistent error responses.
- Do not expose database implementation details.

## Security

Authentication identifies the actor.

Authorization determines whether the actor may perform the action.

Never rely on frontend checks.

## Verification

Run focused module tests first, then integration tests for changed boundaries.
