# Backup & Restore

REKA's system of record is a single PostgreSQL database. This document covers
practical backup/restore for the Docker/OrbStack development setup and the
general production procedure. Cloud backup automation is out of scope for now.

## What to back up

- **Database (mandatory):** all application data (users, organizations, audit,
  workflows, procurement, jobs).
- **Application files / object storage (separate strategy):** once REKA stores
  files (module `files`), templates, or exports, those live outside PostgreSQL
  and need their own backup (volume snapshots or object-storage versioning).
  PostgreSQL-only backups do not cover them.
- **Configuration:** `.env` / secrets never belong in the database and must be
  stored in your secret manager; back them up with your infra-as-code.

## Backup

### Development (Docker/OrbStack)

The compose project is named `reka` and runs the `reka-postgres-1` container.

```bash
# One file per database, compressed (default dev DB):
docker exec reka-postgres-1 pg_dump -U reka -d reka \
  -Fc | gzip -9 > backups/reka-$(date +%F-%H%M%S).dump.gz

# Including the audit-heavy schema is automatic (single DB).
```

### Production

```bash
pg_dump -U <user> -h <host> -d reka -Fc \
  -Z 9 \
  -f backups/reka-$(date +%F-%H%M%S).dump
```

Use `pg_dump` while the app is running (online backup); use no special flags
unless you need point-in-time recovery, in which case configure WAL
`continuous_archiving`. For very large databases prefer `-Fd` (directory
format) with `pg_backup` parallelism or `pg_basebackup` for full-cluster
snapshots.

Never keep the only copy on the same host as PostgreSQL.

## Retention

A simple viable retention policy:

```text
keep: daily for 14 days
keep: weekly for 8 weeks
keep: monthly for 12 months
```

Example rotation (macOS/Linux):

```bash
find backups -name '*.dump' -mtime +90 -delete          # > 90 days
```

Prefer an off-site/object-store sink (S3-compatible bucket) for the final
copies; that remains an external tool decision, not a REKA feature.

## Verification

Backup rotation is not backup. Restore from a copy regularly and assert data:

```bash
# Restore a dump into a scratch database and run a smoke query:
docker exec -i reka-postgres-1 psql -U reka -d reka_restore_test < <(zcat backups/latest.dump.sql)
docker exec reka-postgres-1 psql -U reka -d reka_restore_test \
  -c "select count(*) from audit_logs;"
```

Automate a monthly restore test once the infrastructure exists. Document the
expected row counts per table in this file as they are system-defined (e.g.
`audit_logs`, `jobs`, `workflow_instances`) so drift is visible.

## Restore

### Development (Docker/OrbStack)

```bash
# 1. Stop the API/worker so no writes race the restore.
# 2. Drop and recreate the database:
docker exec reka-postgres-1 psql -U reka -d postgres -c 'DROP DATABASE reka;'
docker exec reka-postgres-1 psql -U reka -d postgres -c 'CREATE DATABASE reka;'

# 3. Re-apply migrations first (they create the schema) OR restore a full
#    custom-format dump which contains schema + data:
zcat backups/reka-XXXX.dump.gz | docker exec -i reka-postgres-1 \
  pg_restore -U reka -d reka --clean --if-exists --no-owner

# 4. Restart the API/worker.
```

If you prefer to re-migrate instead:

```bash
pnpm db:migrate
```

and then restore a data-only dump. Choose one approach per restore, do not
double-apply schema.

### Production

```bash
pg_restore -U <user> -h <host> -d reka --clean --if-exists --single-transaction \
  -O --no-owner backups/reka-XXXX.dump
```

Notes:

- `--single-transaction` makes the restore all-or-nothing.
- `-O` / `--no-owner` avoids ownership failures when restoring under a
  different role.
- `--no-owner` + `--no-acl` is the safe default when role names differ.
- Verify the restore with the smoke queries from Verification above, and by
  checking the latest `audit_logs.occurred_at` is sane.

## Disaster timing

For the default **Lite** deployment (web + api + postgres) the realistic RPO
is the backup interval. Point-in-time recovery is only possible with WAL
archiving (e.g. `pgBackRest` or a managed database offering PITR). Choose
before you need it; do not rely on `pg_dump` for PITR.

## Multi-database note

The test harness uses a separate `reka_test` database. Development backups of
`reka` do not include `reka_test`, which is disposable and recreated by the
test suite.
