import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Pool } from 'pg'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDatabase, type Database } from '@reka/database'

export const TEST_DB_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/reka_test'

const TEST_DB_NAME = new URL(TEST_DB_URL).pathname.slice(1)

function maintenanceDbUrl(): string {
  const url = new URL(TEST_DB_URL)
  url.pathname = '/postgres'
  return url.toString()
}

// The worker shares the API's single migration history.
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../api/drizzle')

export async function resetTestDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: maintenanceDbUrl() })
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    )
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`)
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`)
  } finally {
    await admin.end()
  }
}

export async function migrateTestDatabase(): Promise<Database> {
  const database = createDatabase(TEST_DB_URL)
  await migrate(database.db, { migrationsFolder })
  return database
}
