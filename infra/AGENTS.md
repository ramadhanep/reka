# Infrastructure Instructions

Infrastructure exists to make REKA easy to run and operate.

## Principles

- Docker-first local infrastructure.
- Optional services must remain optional.
- Default development should require PostgreSQL only.
- Do not add infrastructure without a concrete use case.
- Pin versions deliberately.
- Never commit production secrets.
- Keep local and production concerns clearly separated.

## Compose

The default group starts PostgreSQL only.

Optional services use profiles:

```text
standard
enterprise
observability
```

Profiles map to the deployment profiles in MASTER_PLAN.md:

```text
Lite      -> default group (web, api, postgres)
Standard  -> + worker, redis, storage
Enterprise-> + oidc, observability
```

Do not silently start every optional container.

## Infrastructure Changes

Any new persistent service should document:

- why it exists
- memory/resource cost
- whether it is optional
- how it affects backups
- how it affects local development
- how it can be removed
