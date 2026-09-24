import type { LogLevel } from '@reka/config'
import type { Database } from '@reka/database'
import { AUTH_CLEANUP_JOB, enqueueJob, type JobHandler } from '@reka/jobs'

export interface AuthCleanupResult {
  deletedSessions: number
  deletedActivationTokens: number
}

export type AuthCleanupLogger = (
  level: LogLevel,
  message: string,
  fields?: Record<string, unknown>,
) => void

/**
 * Deletes expired sessions and activation tokens.
 *
 * Cleanup only removes rows that are already expired (`expires_at < now()`);
 * validation, expiry durations, and revocation semantics are untouched. The
 * SQL is intentionally minimal and covered by integration tests against the
 * real migrated schema.
 */
export async function runAuthCleanup(database: Database): Promise<AuthCleanupResult> {
  const sessions = await database.pool.query('DELETE FROM sessions WHERE expires_at < now()')
  const activationTokens = await database.pool.query(
    'DELETE FROM activation_tokens WHERE expires_at < now()',
  )
  return {
    deletedSessions: sessions.rowCount ?? 0,
    deletedActivationTokens: activationTokens.rowCount ?? 0,
  }
}

/**
 * Creates the `ops.auth-cleanup` job handler.
 *
 * Runs the cleanup, logs the deleted counts, then re-enqueues the next run at
 * `now + intervalMs`. This self-rescheduling pattern needs no cron/scheduler:
 * if no worker is running the follow-up job simply waits pending.
 */
export function createAuthCleanupHandler(
  database: Database,
  intervalMs: number,
  logger: AuthCleanupLogger = () => {},
): JobHandler {
  return async (job) => {
    const result = await runAuthCleanup(database)
    const nextRunAt = new Date(Date.now() + intervalMs)
    await enqueueJob(database.db, {
      type: AUTH_CLEANUP_JOB,
      scheduledAt: nextRunAt,
    })
    logger('info', 'auth cleanup completed', {
      jobId: job.id,
      deletedSessions: result.deletedSessions,
      deletedActivationTokens: result.deletedActivationTokens,
      nextRunAt: nextRunAt.toISOString(),
    })
  }
}
