import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Pool } from 'pg'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDatabase, type Database } from '@reka/database'

export const TEST_DB_URL = 'postgres://reka:reka@localhost:5432/reka_test'
const MAINTENANCE_DB_URL = 'postgres://reka:reka@localhost:5432/postgres'
const TEST_DB_NAME = 'reka_test'

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle')

export async function resetTestDatabase(): Promise<void> {
  const admin = new Pool({ connectionString: MAINTENANCE_DB_URL })
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

export async function truncateAllExcept(database: Database, keep: string[]): Promise<void> {
  const result = await database.pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  )
  const tables = result.rows.map((row) => row.tablename as string)
  const drop = tables.filter((table) => !keep.includes(table))
  if (drop.length > 0) {
    await database.pool.query(`TRUNCATE TABLE ${drop.join(', ')} CASCADE`)
  }
}

export function extractSessionCookie(setCookie: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie
  if (!raw) {
    return undefined
  }
  const pair = raw.split(';')[0]
  return pair.startsWith('reka_session=') ? pair : undefined
}
