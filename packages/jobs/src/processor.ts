import type { Database } from '@reka/database'
import { backoffDelay, withJitter } from './backoff.js'
import { claimAvailableJobs, completeJob, failJob } from './queue.js'
import { JOB_STATUS, type JobRow } from './jobs.schema.js'

export type JobHandler = (job: Readonly<JobRow>) => void | Promise<void>
export type JobHandlers = Record<string, JobHandler>

export interface WorkerLogEvent {
  workerId: string
  jobId?: string
  type?: string
  status?: string
  attempts?: number
  maxAttempts?: number
  retryAfterMs?: number
  error?: string
}

export type WorkerLogger = (
  level: string,
  message: string,
  fields?: Record<string, unknown>,
) => void

export interface WorkerOptions {
  db: () => Database
  workerId: string
  handlers: JobHandlers
  batchSize?: number
  pollIntervalMs?: number
  lockTimeoutMs?: number
  backoffBaseMs?: number
  backoffJitter?: number
  logger?: WorkerLogger
}

export interface WorkerProcessBatchResult {
  claimed: number
  completed: number
  failed: number
  retried: number
}

export interface JobWorker {
  processBatch(): Promise<WorkerProcessBatchResult>
  start(): void
  stop(): Promise<void>
  running(): boolean
}

export function createJobWorker(options: WorkerOptions): JobWorker {
  const {
    handlers,
    workerId,
    batchSize = 10,
    pollIntervalMs = 1000,
    lockTimeoutMs = 5 * 60 * 1000,
    backoffBaseMs = 1000,
    backoffJitter = 0.2,
    logger = () => {},
  } = options

  let stopped = false
  let processing = false
  let loopPromise: Promise<void> | null = null

  async function processOne(
    database: Database,
    job: JobRow,
  ): Promise<'completed' | 'failed' | 'retried'> {
    const handler = handlers[job.type]
    try {
      if (!handler) {
        throw new Error(`No handler registered for job type '${job.type}'`)
      }
      await handler(job)
      await completeJob(database.db, job.id)
      logger('info', 'job completed', {
        workerId,
        jobId: job.id,
        type: job.type,
        attempts: job.attempts,
        status: JOB_STATUS.COMPLETED,
      })
      return 'completed'
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const retried = job.attempts >= job.maxAttempts
      if (retried) {
        await failJob(database.db, job.id, message)
        logger('error', 'job permanently failed', {
          workerId,
          jobId: job.id,
          type: job.type,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          status: JOB_STATUS.FAILED,
          error: message,
        })
        return 'failed'
      }
      const delay = withJitter(backoffDelay(job.attempts, backoffBaseMs), backoffJitter)
      await failJob(database.db, job.id, message, delay)
      logger('warn', 'job will retry', {
        workerId,
        jobId: job.id,
        type: job.type,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        retryAfterMs: delay,
        error: message,
      })
      return 'retried'
    }
  }

  async function processBatch(): Promise<WorkerProcessBatchResult> {
    if (processing) return { claimed: 0, completed: 0, failed: 0, retried: 0 }
    processing = true
    try {
      const database = options.db()
      const jobs = await claimAvailableJobs(database.db, workerId, batchSize, lockTimeoutMs)
      if (jobs.length === 0) {
        return { claimed: 0, completed: 0, failed: 0, retried: 0 }
      }
      let completed = 0
      let failed = 0
      let retried = 0
      for (const job of jobs) {
        switch (await processOne(database, job)) {
          case 'completed':
            completed++
            break
          case 'failed':
            failed++
            break
          case 'retried':
            retried++
            break
        }
      }
      return { claimed: jobs.length, completed, failed, retried }
    } finally {
      processing = false
    }
  }

  async function loop(): Promise<void> {
    while (!stopped) {
      const result = await processBatch()
      if (result.claimed === 0 && !stopped) {
        await sleep(pollIntervalMs)
      }
    }
  }

  return {
    processBatch,
    start(): void {
      if (!loopPromise) {
        loopPromise = loop()
      }
    },
    async stop(): Promise<void> {
      stopped = true
      if (loopPromise) {
        await loopPromise
        loopPromise = null
      }
    },
    running(): boolean {
      return !stopped
    },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
