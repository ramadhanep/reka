# ADR 0005: Business modules execute workflow transitions inside their own transactions

## Status

Accepted.

## Context

M4 Procurement needs atomic operations that combine a business aggregate row lock with a generic workflow engine transition and an audit write:

- submitting a purchase request creates its workflow instance and executes the `submit` transition
- approving/rejecting must lock the purchase request row and execute the transition once
- if these happened in separate transactions, two concurrent submitters could create two workflow instances, and an approve could race a reject.

`WorkflowService.transition` ran entirely inside its own `this.database.db.transaction`, so a business module could not share its transaction with the engine.

## Decision

`WorkflowService` methods used by business modules accept an optional existing database transaction (`Db`) and run the whole engine operation (row lock, authorization, state update, history, audit) on that transaction when provided. The engine still runs its own transaction when none is provided, preserving the existing standalone behavior.

A new `ensureGlobalDefinition` method lets a business module register an active, system-wide (organization-null) workflow definition at bootstrap; it accepts a nullable actor because bootstrap has no user session, and audit records record `actor_id = null` for these system events.

To keep the system-wide definition tamper-proof, organization-scoped actors are forbidden from modifying or versioning definitions whose `organization_id IS NULL`; only a future system admin scope may change them.

## Consequences

- Procurement can hold a `SELECT ... FOR UPDATE` on the purchase request / purchase order row and execute the workflow transition in the same transaction, giving atomic submit/approve/reject and atomic receipt against order outstanding quantities.
- The audit write for `workflow.transition.executed` commits atomically with the business write.
- Future business modules (assets, HR, finance) will follow the same pattern; the engine API is the permanent contract for cross-module atomic workflow integration.
- The optional-transaction signature is backward compatible; existing callers are unaffected.

## Alternatives considered

- Emitting in-process events and asking the business module to react asynchronously: lost atomicity.
- Re-querying the workflow instance state instead of writing a mirrored status column: kept a denormalized `status` column on the business row for cheap listing; both are updated in the same transaction.
