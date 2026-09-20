import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '@reka/database'
import { JOB_STATUS, jobsTable, type JobRow } from './jobs.schema.js'

export interface EnqueueInput {
  type: string
  payload?: Record<string, unknown>
  scheduledAt?: Date
  maxAttempts?: number
}

export async function enqueueJob(db: Db, input: EnqueueInput): Promise<JobRow> {
  // When no schedule is given the DB default (server now()) is used so the
  // availability clock always matches the server clock used by claimers.
  const [row] = await db
    .insert(jobsTable)
    .values({
      type: input.type,
      payload: input.payload ?? {},
      maxAttempts: input.maxAttempts ?? 3,
      ...(input.scheduledAt ? { availableAt: input.scheduledAt } : {}),
    })
    .returning()
  return row
}

/**
 * Atomically claims the next batch of due jobs.
 *
 * Uses a single `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`
 * so concurrent workers/processes each take disjoint rows without a
 * distributed lock. Also reclaims jobs left running by a crashed worker after
 * `lockTimeoutMs`, making the queue safe under multiple workers.
 *
 * All time comparisons use PostgreSQL `now()` (server clock) to avoid
 * client/server clock-skew affecting availability and stale-lock detection.
 */
export async function claimAvailableJobs(
  db: Db,
  workerId: string,
  batchSize: number,
  lockTimeoutMs = 5 * 60 * 1000,
): Promise<JobRow[]> {
  if (batchSize < 1) return []
  const lockTimeoutSeconds = lockTimeoutMs / 1000
  const rows = await db
    .update(jobsTable)
    .set({
      status: JOB_STATUS.RUNNING,
      attempts: sql`${jobsTable.attempts} + 1`,
      lockedAt: sql`now()`,
      lockedBy: workerId,
      updatedAt: sql`now()`,
    })
    .where(
      sql`${jobsTable.id} IN (
        SELECT ${jobsTable.id} FROM ${jobsTable}
        WHERE (
          ${jobsTable.status} = ${JOB_STATUS.PENDING}
          AND ${jobsTable.availableAt} <= now()
        )
        OR (
          ${jobsTable.status} = ${JOB_STATUS.RUNNING}
          AND ${jobsTable.lockedAt} < now() - (${lockTimeoutSeconds} * interval '1 second')
        )
        ORDER BY ${jobsTable.availableAt}, ${jobsTable.createdAt}
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )`,
    )
    .returning()
  return rows
}

export async function completeJob(db: Db, id: string): Promise<JobRow> {
  const [row] = await db
    .update(jobsTable)
    .set({
      status: JOB_STATUS.COMPLETED,
      completedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(jobsTable.id, id))
    .returning()
  return row
}

export async function failJob(
  db: Db,
  id: string,
  error: string,
  retryDelayMs?: number,
): Promise<JobRow> {
  const retryAt =
    retryDelayMs !== undefined
      ? sql`now() + (${retryDelayMs / 1000} * interval '1 second')`
      : undefined
  const [row] = await db
    .update(jobsTable)
    .set({
      status: retryAt ? JOB_STATUS.PENDING : JOB_STATUS.FAILED,
      failedAt: retryAt ? undefined : sql`now()`,
      availableAt: retryAt,
      lastError: error,
      updatedAt: sql`now()`,
    })
    .where(eq(jobsTable.id, id))
    .returning()
  return row
}

export async function getJob(db: Db, id: string): Promise<JobRow | undefined> {
  const rows = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1)
  return rows[0]
}

export async function findJobsByType(
  db: Db,
  types: string[],
  statuses: string[] = [],
): Promise<JobRow[]> {
  if (types.length === 0) return []
  const where =
    statuses.length === 0
      ? inArray(jobsTable.type, types)
      : and(inArray(jobsTable.type, types), inArray(jobsTable.status, statuses))
  const rows = await db.select().from(jobsTable).where(where).orderBy(jobsTable.createdAt)
  return rows
}

export async function resetFailedJob(
  db: Db,
  id: string,
  attempts: number,
): Promise<JobRow | undefined> {
  const [row] = await db
    .update(jobsTable)
    .set({
      attempts,
      status: JOB_STATUS.PENDING,
      lastError: null,
      failedAt: null,
      availableAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(jobsTable.id, id), eq(jobsTable.status, JOB_STATUS.FAILED)))
    .returning()
  return row
}

export async function countJobs(db: Db, status?: string): Promise<number> {
  const where = status ? sql`${jobsTable.status} = ${status}` : undefined
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobsTable)
    .where(where)
  return Number(rows[0]?.count ?? 0)
}
