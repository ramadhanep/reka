import { and, eq, isNull } from 'drizzle-orm'
import { type Db } from '@reka/database'
import { sessions } from './session.schema.js'

export type SessionRow = typeof sessions.$inferSelect

export interface CreateSessionInput {
  userId: string
  tokenHash: string
  expiresAt: Date
}

export async function createSession(db: Db, input: CreateSessionInput): Promise<SessionRow> {
  const rows = await db.insert(sessions).values(input).returning()
  return rows[0]
}

export async function findSessionByTokenHash(
  db: Db,
  tokenHash: string,
  now: Date,
): Promise<SessionRow | undefined> {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .limit(1)
  const row = rows[0]
  if (!row || row.expiresAt.getTime() < now.getTime()) {
    return undefined
  }
  return row
}

export async function revokeSession(db: Db, tokenHash: string, now: Date): Promise<void> {
  await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.tokenHash, tokenHash))
}
