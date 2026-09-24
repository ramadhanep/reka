import { Inject, Injectable, Logger } from '@nestjs/common'
import type { OnModuleInit } from '@nestjs/common'
import type { Database } from '@reka/database'
import { AUTH_CLEANUP_JOB, enqueueJob, findJobsByType, JOB_STATUS } from '@reka/jobs'
import { DATABASE } from '../../common/database.token.js'

/**
 * Enqueues the first `ops.auth-cleanup` job unless one is already pending or
 * running. The worker re-enqueues the follow-up run itself, so API restarts
 * never duplicate the schedule.
 *
 * @returns true when a job was enqueued, false when one already existed.
 */
export async function ensureAuthCleanupScheduled(database: Database): Promise<boolean> {
  const existing = await findJobsByType(
    database.db,
    [AUTH_CLEANUP_JOB],
    [JOB_STATUS.PENDING, JOB_STATUS.RUNNING],
  )
  if (existing.length > 0) {
    return false
  }
  // No scheduledAt: the DB default (server now()) makes the first run immediate.
  await enqueueJob(database.db, { type: AUTH_CLEANUP_JOB })
  return true
}

/**
 * Bootstraps the recurring auth-cleanup job when the API starts.
 *
 * Idempotent by design: only enqueues when no pending/running job exists, so
 * concurrent API instances and restarts cannot create duplicates.
 */
@Injectable()
export class AuthCleanupScheduler implements OnModuleInit {
  private readonly logger = new Logger(AuthCleanupScheduler.name)

  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onModuleInit(): Promise<void> {
    const enqueued = await ensureAuthCleanupScheduled(this.database)
    this.logger.log(
      enqueued
        ? `enqueued initial ${AUTH_CLEANUP_JOB} job`
        : `${AUTH_CLEANUP_JOB} job already scheduled, skipping`,
    )
  }
}
