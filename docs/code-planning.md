# Code Planning Standard

This document defines how implementation work is planned before an AI agent changes code.

## 1. Planning Goal

The goal is not to produce long plans.

The goal is to reduce:

- unnecessary edits
- duplicated abstractions
- accidental architecture changes
- incomplete tests
- cross-module coupling
- speculative infrastructure

## 2. Use Vertical Slices

Prefer:

```text
DB -> domain -> API -> UI -> tests
```

for one behavior.

Avoid:

```text
build every database table
then build every API
then build every UI
```

A vertical slice proves the architecture with real behavior.

## 3. Task Size

A good task should usually fit one focused session.

Examples:

Good:

```text
Add Purchase Request draft/submitted states.
```

Too broad:

```text
Build procurement.
```

Split broad work into independently verifiable slices.

## 4. Required Planning Questions

Before implementation, the agent must answer:

### Existing code

- Which files already implement adjacent behavior?
- What patterns are already established?
- Is there an existing utility/service that should be reused?

### Boundaries

- Which module owns this data?
- Which module is allowed to call it?
- Does this create a new dependency direction?

### Data

- Is a migration required?
- What are indexes and uniqueness rules?
- What is the deletion/retention behavior?

### Security

- Who can read it?
- Who can mutate it?
- Are permissions resource-scoped?
- Is audit required?

### API

- What endpoint or contract changes?
- Is backward compatibility relevant?
- What validation and error responses exist?

### UI

- What screens/routes change?
- What are loading/error/empty states?
- What permissions affect visibility?

### Verification

- What is the smallest meaningful test?
- What integration boundary needs coverage?
- What commands will prove the work?

## 5. Implementation Order

For a normal feature:

```text
1. inspect existing patterns
2. define domain/data behavior
3. add migration
4. implement backend/domain behavior
5. implement API
6. add authorization
7. add tests
8. implement UI
9. run focused verification
10. inspect diff
11. update docs if needed
```

## 6. Refactoring Rule

Do not mix a large refactor with feature work unless the refactor is necessary for the feature.

If a cleanup is useful but independent:

```text
separate task
```

## 7. Abstraction Rule

Do not create an abstraction for a hypothetical future.

Prefer concrete code until at least two real consumers need the abstraction, unless the abstraction protects a true architectural boundary such as:

- storage provider
- identity provider
- module API
- external integration
- database access boundary

## 8. Agent Stop Conditions

Stop and ask for an architectural decision only when the task requires:

- a new architectural boundary
- a new persistent infrastructure dependency
- a breaking public API
- a licensing decision
- irreversible data migration
- security-sensitive tradeoff with no established pattern

Otherwise, make the smallest reasonable implementation and document assumptions.

## 9. Definition of Done

A planned change is complete when the behavior, tests, authorization, migration, documentation, and verification are coherent.
