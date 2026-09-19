# ADR-0004: Use Drizzle as the Database Layer

## Status

Accepted

## Context

REKA needs a typed access layer over PostgreSQL for the modular monolith.

Options considered:

- Bare `pg`: flexible but no schema types, no migrations, hand-written SQL everywhere.
- Full ORM (Prisma/TypeORM): heavier runtime, codegen, often weaker PostgreSQL-native behavior, more abstraction between domain code and SQL.
- Drizzle: thin typed SQL layer, close to SQL, first-class PostgreSQL support, built-in lightweight migrations.

The project principle is a PostgreSQL-oriented typed SQL layer without an ORM abstraction for its own sake.

## Decision

Use Drizzle (`drizzle-orm`) with `drizzle-kit` for schema and migrations.

`pg` is the PostgreSQL driver.

Schema definitions live with their owning module. Migrations are generated and must not be edited as a shortcut.

## Consequences

- TypeScript types are derived from schema declarations near the domain code.
- SQL remains explicit and debuggable; PostgreSQL-specific features stay available.
- Migration workflow: `drizzle-kit generate` -> review -> apply.
- Swapping the database layer later remains possible because the contracts are the public API, not the database layer.

## Revisit When

If a domain need cannot be expressed cleanly with Drizzle and it is not a one-off, evaluate alternatives via a new ADR.
