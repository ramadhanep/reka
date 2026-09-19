# ADR-0002: Start as a Modular Monolith

## Status

Accepted

## Context

REKA has many business capabilities but is initially built by one developer.

Microservices would introduce:

- more deployments
- more networking
- distributed failures
- observability requirements
- service contracts
- duplicated infrastructure
- higher memory usage

before product-market requirements justify them.

## Decision

Implement modules inside one NestJS application.

The module boundaries must be explicit.

## Consequences

### Positive

- simpler operations
- low resource usage
- fast refactoring
- transactional consistency
- easy local development

### Negative

- some modules share a process
- a bad dependency can create coupling
- independent scaling is not available initially

## Extraction

A module can be extracted later through a new ADR after proving:

- clear contract
- clear data ownership
- real scaling/isolation requirement
- operational readiness
