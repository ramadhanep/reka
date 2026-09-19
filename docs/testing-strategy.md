# Testing Strategy

## Test Pyramid

```text
            E2E
        /         \
     API / Integration
    /                 \
      Unit / Domain
```

The majority of tests should be fast unit/domain tests.

## Unit Tests

Use for:

- state transitions
- permission logic
- validation
- calculations
- policy rules
- business invariants

Good:

```text
PurchaseRequestPolicy
WorkflowTransition
ApprovalLimitPolicy
```

## Integration Tests

Use for:

- PostgreSQL behavior
- repositories
- transactions
- API modules
- auth boundaries
- storage adapters

Prefer real PostgreSQL for database integration tests where practical.

## E2E

Reserve for important user journeys.

Initial critical flow:

```text
login
  -> create purchase request
  -> submit
  -> approve
  -> create purchase order
  -> receive
  -> assign asset
```

## Authorization Tests

Every sensitive endpoint should have tests for:

```text
allowed
forbidden
wrong organization
wrong scope
missing role
missing permission
```

Authorization bugs are more serious than cosmetic UI bugs.

## Migration Tests

A schema change must be tested from a clean database.

Test:

```text
migration up
application behavior
```

and verify rollback strategy when relevant.

## Test Naming

Describe behavior, not implementation:

Good:

```text
allows procurement manager to approve requests below approval limit
```

Bad:

```text
calls approveRequest()
```

## Focused Verification

AI agents must start with the narrowest useful check:

```text
changed unit test
affected module test
affected API integration test
```

Then expand only when necessary.

## Anti-Tautology Rule

Do not write tests that merely restate the implementation.

Weak:

```ts
expect(service.foo()).toBe(service.foo())
```

Strong:

```ts
expect(request.status).toBe('APPROVED')
expect(audit.action).toBe('purchase_request.approved')
```

## Coverage

Coverage is a signal, not the definition of correctness.

Prioritize:

- critical domain logic
- permission logic
- state transitions
- money calculations
- data integrity
- error handling
