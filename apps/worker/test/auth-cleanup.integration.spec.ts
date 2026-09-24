/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_CLEANUP_JOB,
  createJobWorker,
  enqueueJob,
  findJobsByType,
  getJob,
  JOB_STATUS,
  type Database,
} from '@reka/jobs'
import { createAuthCleanupHandler, runAuthCleanup } from '../src/handlers/auth-cleanup.js'
import { migrateTestDatabase, resetTestDatabase, TEST_DB_URL } from './support.js'

let database: Database

async function seedUser(): Promise<string> {
  const result = await database.pool.query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, 'x', 'Cleanup Test User') RETURNING id`,
    [`cleanup-${Date.now()}@reka.test`],
  )
  return result.rows[0].id as string
}

async function seedSession(
  userId: string,
  tokenHash: string,
  expiresAtSql: string,
  revokedAtSql: string | null = null,
): Promise<void> {
  await database.pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, revoked_at)
     VALUES ($1, $2, ${expiresAtSql}, ${revokedAtSql ?? 'NULL'})`,
    [userId, tokenHash],
  )
}

async function seedActivationToken(
  userId: string,
  token: string,
  expiresAtSql: string,
  usedAtSql: string | null = null,
): Promise<void> {
  await database.pool.query(
    `INSERT INTO activation_tokens (user_id, token, expires_at, used_at)
     VALUES ($1, $2, ${expiresAtSql}, ${usedAtSql ?? 'NULL'})`,
    [userId, token],
  )
}

function drain(): Promise<void> {
  return database.pool.query('TRUNCATE TABLE jobs, sessions, activation_tokens, users CASCADE')
}

describe('ops.auth-cleanup worker handler', () => {
  beforeAll(async () => {
    process.env.APP_ENV = 'test'
    process.env.DATABASE_URL = TEST_DB_URL
    await resetTestDatabase()
    database = await migrateTestDatabase()
  })

  beforeEach(async () => {
    await drain()
  })

  afterAll(async () => {
    await database.close()
    delete process.env.APP_ENV
    delete process.env.DATABASE_URL
  })

  it('deletes expired sessions and activation tokens but keeps valid/used rows', async () => {
    const userId = await seedUser()
    await seedSession(userId, 'expired-session', "now() - interval '1 day'")
    await seedSession(userId, 'valid-session', "now() + interval '1 day'")
    await seedSession(userId, 'expired-revoked-session', "now() - interval '1 day'", 'now()')
    await seedActivationToken(userId, 'expired-token', "now() - interval '1 day'")
    await seedActivationToken(userId, 'valid-token', "now() + interval '1 day'")
    await seedActivationToken(userId, 'used-token', "now() + interval '1 day'", 'now()')
    await seedActivationToken(userId, 'expired-used-token', "now() - interval '1 day'", 'now()')

    const result = await runAuthCleanup(database)

    expect(result.deletedSessions).toBe(2)
    expect(result.deletedActivationTokens).toBe(2)

    const sessions = await database.pool.query('SELECT token_hash FROM sessions')
    expect(sessions.rows.map((r: any) => r.token_hash).sort()).toEqual(['valid-session'])

    const tokens = await database.pool.query('SELECT token FROM activation_tokens')
    expect(tokens.rows.map((r: any) => r.token).sort()).toEqual(['used-token', 'valid-token'])
  })

  it('re-enqueues exactly one future-scheduled follow-up job after running', async () => {
    const userId = await seedUser()
    await seedSession(userId, 'expired-session', "now() - interval '1 day'")
    await seedActivationToken(userId, 'expired-token', "now() - interval '1 day'")

    const intervalMs = 60 * 60 * 1000 // 1h
    const worker = createJobWorker({
      db: () => database,
      workerId: 'auth-cleanup-worker',
      handlers: {
        [AUTH_CLEANUP_JOB]: createAuthCleanupHandler(database, intervalMs),
      },
    })

    const created = await enqueueJob(database.db, { type: AUTH_CLEANUP_JOB })
    const result = await worker.processBatch()

    expect(result.claimed).toBe(1)
    expect(result.completed).toBe(1)

    const done = await getJob(database.db, created.id)
    expect(done?.status).toBe(JOB_STATUS.COMPLETED)

    // The handler deleted the expired rows as part of the run.
    const sessions = await database.pool.query('SELECT token_hash FROM sessions')
    expect(sessions.rowCount).toBe(0)
    const tokens = await database.pool.query('SELECT token FROM activation_tokens')
    expect(tokens.rowCount).toBe(0)

    // Exactly one pending follow-up, scheduled in the future.
    const pending = await findJobsByType(database.db, [AUTH_CLEANUP_JOB], [JOB_STATUS.PENDING])
    expect(pending).toHaveLength(1)
    expect(pending[0].availableAt?.getTime()).toBeGreaterThan(Date.now())
    expect(pending[0].availableAt?.getTime()).toBeGreaterThanOrEqual(
      Date.now() + intervalMs - 60_000,
    )
  })
})
