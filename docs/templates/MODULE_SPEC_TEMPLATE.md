# Module: <name>

## Purpose

What business capability does this module provide?

## Responsibilities

- ...

## Non-Responsibilities

- ...

## Dependencies

```text
<module>
  -> <dependency>
```

## Domain Entities

- ...

## State Machines

```text
DRAFT -> SUBMITTED -> APPROVED -> COMPLETED
```

## Permissions

```text
module.resource.read
module.resource.create
module.resource.update
module.resource.approve
module.resource.delete
```

## Audit Events

```text
module.resource.created
module.resource.updated
module.resource.approved
module.resource.deleted
```

## API

```text
GET    /api/v1/...
POST   /api/v1/...
```

## UI

Routes:

- ...

Navigation:

- ...

## Persistence

Tables:

- ...

Ownership rules:

- ...

## Background Jobs

- ...

## Notifications

- ...

## Security Considerations

- ...

## Test Scenarios

- ...

## Extraction Readiness

What would need to be true before this module could become an independent service?

- ...
