/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  backoffDelay,
  claimAvailableJobs,
  createJobWorker,
  enqueueJob,
  findJobsByType,
  getJob,
  jobsTable,
  JOB_STATUS,
  type Database,
} from '@reka/jobs'
import { migrateTestDatabase, resetTestDatabase, TEST_DB_URL } from './support.js'

function drain(): Promise<void> {
  return database.pool.query('TRUNCATE TABLE jobs CASCADE')
}

let database: Database

describe('PostgreSQL-backed jobs (worker queue)', () => {
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
  })

  it('enqueues, claims, processes, and completes a job', async () => {
    const seen: string[] = []
    const worker = createJobWorker({
      db: () => database,
      workerId: 'worker-a',
      handlers: { 'job.echo': (job) => void seen.push(job.payload['value'] as string) },
    })

    const created = await enqueueJob(database.db, {
      type: 'job.echo',
      payload: { value: 'hello' },
    })
    expect(created.status).toBe(JOB_STATUS.PENDING)
    expect(created.attempts).toBe(0)

    const result = await worker.processBatch()
    expect(result.claimed).toBe(1)
    expect(result.completed).toBe(1)

    expect(seen).toEqual(['hello'])
    const done = await getJob(database.db, created.id)
    expect(done?.status).toBe(JOB_STATUS.COMPLETED)
    expect(done?.attempts).toBe(1)
    expect(done?.lockedBy).toBe('worker-a')
    expect(done?.completedAt).toBeDefined()
  })

  it('leaves future-scheduled jobs untouched until they are available', async () => {
    const future = new Date(Date.now() + 10_000)
    await enqueueJob(database.db, { type: 'job.later', scheduledAt: future })
    const worker = createJobWorker({
      db: () => database,
      workerId: 'w',
      handlers: { 'job.later': () => {} },
    })
    const result = await worker.processBatch()
    expect(result.claimed).toBe(0)
    const rows = await findJobsByType(database.db, ['job.later'])
    expect(rows[0].status).toBe(JOB_STATUS.PENDING)
  })

  it('retries with backoff and succeeds on a later attempt', async () => {
    let calls = 0
    const retryWorker = createJobWorker({
      db: () => database,
      workerId: 'retry-worker',
      handlers: {
        'job.flaky': () => {
          calls++
          if (calls < 3) throw new Error('transient failure')
        },
      },
      backoffBaseMs: 1,
      backoffJitter: 0,
    })

    const created = await enqueueJob(database.db, { type: 'job.flaky', maxAttempts: 5 })

    await retryWorker.processBatch() // attempt 1 -> retry
    await sleep(20)
    await retryWorker.processBatch() // attempt 2 -> retry
    await sleep(20)
    await retryWorker.processBatch() // attempt 3 -> success

    const job = await getJob(database.db, created.id)
    expect(job?.status).toBe(JOB_STATUS.COMPLETED)
    expect(job?.attempts).toBe(3)
    expect(calls).toBe(3)
  })

  it('leaves permanently failed jobs inspectable', async () => {
    const worker = createJobWorker({
      db: () => database,
      workerId: 'fatal-worker',
      handlers: {
        'job.fatal': () => {
          throw new Error('boom')
        },
      },
      backoffBaseMs: 1,
      backoffJitter: 0,
    })
    const created = await enqueueJob(database.db, { type: 'job.fatal', maxAttempts: 3 })

    for (let i = 0; i < 3; i++) {
      await worker.processBatch()
      await sleep(20)
    }

    const job = await getJob(database.db, created.id)
    expect(job?.status).toBe(JOB_STATUS.FAILED)
    expect(job?.attempts).toBe(3)
    expect(job?.lastError).toContain('boom')
    expect(job?.failedAt).toBeDefined()
    expect(job?.completedAt).toBeNull()
  })

  it('tracks a retry via backoff and updates lastError', async () => {
    const worker = createJobWorker({
      db: () => database,
      workerId: 'fail-once',
      handlers: {
        'job.retry': () => {
          throw new Error('retry me')
        },
      },
      backoffBaseMs: 1000,
      backoffJitter: 0,
    })
    const created = await enqueueJob(database.db, { type: 'job.retry', maxAttempts: 2 })
    await worker.processBatch()
    const job = await getJob(database.db, created.id)
    expect(job?.status).toBe(JOB_STATUS.PENDING) // scheduled for retry
    expect(job?.lastError).toContain('retry me')
    expect(job?.attempts).toBe(1)
    expect(job?.availableAt?.getTime()).toBeGreaterThan(Date.now() - 10)
  })

  it('processes jobs safely across concurrent workers without double execution', async () => {
    const processed = new Set<string>()
    const total = 20
    for (let i = 0; i < total; i++) {
      await enqueueJob(database.db, { type: 'job.slow', payload: { i } })
    }

    const makeWorker = (id: string) =>
      createJobWorker({
        db: () => database,
        workerId: id,
        handlers: {
          'job.slow': async (job) => {
            await sleep(15)
            processed.add(job.id)
          },
        },
      })

    const a = makeWorker('parallel-a')
    const b = makeWorker('parallel-b')
    const [ra, rb] = await Promise.all([a.processBatch(), b.processBatch()])

    expect(ra.claimed + rb.claimed).toBe(total)
    expect(ra.claimed + rb.claimed).toBe(new Set([...processed]).size)
    expect(processed.size).toBe(total)

    const counts = await countJobs()
    expect(counts.completed).toBe(total)
    expect(counts.pending).toBe(0)
  })

  it('reclaims jobs left running by a crashed worker', async () => {
    const created = await enqueueJob(database.db, { type: 'job.reclaim' })
    await claimAvailableJobs(database.db, 'crashed-worker', 10, 1000)
    // Simulate the worker dying mid-job.
    await database.pool.query(
      `UPDATE jobs SET locked_at = now() - interval '1 minute' WHERE id = $1`,
      [created.id],
    )
    const reclaimed = await claimAvailableJobs(database.db, 'fresh-worker', 10, 1000)
    expect(reclaimed.map((j) => j.id)).toContain(created.id)
    expect(reclaimed[0].lockedBy).toBe('fresh-worker')
    expect(reclaimed[0].attempts).toBe(2)
  })

  it('exposes worker control primitives (processBatch/start/stop/running)', async () => {
    const worker = createJobWorker({ db: () => database, workerId: 'ctl', handlers: {} })
    expect(worker.running()).toBe(true)
    worker.start()
    await sleep(30)
    await worker.stop()
    await expect(worker.processBatch()).resolves.toBeDefined()
  })
})

describe('backoffDelay', () => {
  it('returns exponential backoff capped at one hour', () => {
    expect(backoffDelay(1)).toBe(1000)
    expect(backoffDelay(2)).toBe(2000)
    expect(backoffDelay(3)).toBe(4000)
    expect(backoffDelay(20)).toBeLessThanOrEqual(60 * 60 * 1000)
  })

  it('returns 0 for attempts below 1', () => {
    expect(backoffDelay(0)).toBe(0)
  })
})

let _statusCounts: Record<string, number> | null = null
async function countJobs(): Promise<Record<string, number>> {
  const rows = await database.db.select({ status: jobsTable.status }).from(jobsTable)
  _statusCounts = { pending: 0, running: 0, completed: 0, failed: 0 }
  for (const row of rows) _statusCounts[row.status] = (_statusCounts[row.status] ?? 0) + 1
  return _statusCounts
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
