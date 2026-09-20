import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const jobsTable = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'failed'
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('jobs_status_available_idx').on(table.status, table.availableAt),
    index('jobs_type_idx').on(table.type),
    index('jobs_locked_idx').on(table.lockedAt),
  ],
)

export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS]

export type JobRow = typeof jobsTable.$inferSelect
export type JobInsert = typeof jobsTable.$inferInsert
