import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AUTH_CLEANUP_JOB, findJobsByType, JOB_STATUS, type Database } from '@reka/jobs'
import { ensureAuthCleanupScheduled } from '../src/modules/identity/auth-cleanup.scheduler.js'
import { migrateTestDatabase, resetTestDatabase, TEST_DB_URL } from './support.js'

let database: Database

describe('auth-cleanup bootstrap scheduler', () => {
  beforeAll(async () => {
    process.env.APP_ENV = 'test'
    process.env.DATABASE_URL = TEST_DB_URL
    await resetTestDatabase()
    database = await migrateTestDatabase()
  })

  beforeEach(async () => {
    await database.pool.query('TRUNCATE TABLE jobs CASCADE')
  })

  afterAll(async () => {
    await database.close()
    delete process.env.APP_ENV
    delete process.env.DATABASE_URL
  })

  it('enqueues exactly one pending job across repeated calls', async () => {
    const first = await ensureAuthCleanupScheduled(database)
    const second = await ensureAuthCleanupScheduled(database)

    expect(first).toBe(true)
    expect(second).toBe(false)

    const pending = await findJobsByType(
      database.db,
      [AUTH_CLEANUP_JOB],
      [JOB_STATUS.PENDING, JOB_STATUS.RUNNING],
    )
    expect(pending).toHaveLength(1)
    expect(pending[0].type).toBe(AUTH_CLEANUP_JOB)
    expect(pending[0].status).toBe(JOB_STATUS.PENDING)
  })

  it('does not enqueue when a running job already exists', async () => {
    await ensureAuthCleanupScheduled(database)
    await database.pool.query(
      `UPDATE jobs SET status = 'running', locked_at = now(), locked_by = 'some-worker'`,
    )

    const enqueued = await ensureAuthCleanupScheduled(database)
    expect(enqueued).toBe(false)

    const jobs = await findJobsByType(database.db, [AUTH_CLEANUP_JOB])
    expect(jobs).toHaveLength(1)
    expect(jobs[0].status).toBe(JOB_STATUS.RUNNING)
  })
})
