import { randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '@reka/database'
import { activationTokens } from './activation-token.schema.js'

export interface ActivationTokenRow {
  id: string
  userId: string
  token: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}

export function generateActivationToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function createActivationToken(
  db: Db,
  userId: string,
  expiresAt: Date,
): Promise<ActivationTokenRow> {
  const token = generateActivationToken()
  const [row] = await db.insert(activationTokens).values({ userId, token, expiresAt }).returning()
  return row
}

export async function findValidToken(db: Db, token: string): Promise<ActivationTokenRow | null> {
  const [row] = await db
    .select()
    .from(activationTokens)
    .where(and(eq(activationTokens.token, token), isNull(activationTokens.usedAt)))
    .limit(1)
  return row || null
}

export async function markTokenUsed(db: Db, tokenId: string): Promise<void> {
  await db
    .update(activationTokens)
    .set({ usedAt: new Date() })
    .where(eq(activationTokens.id, tokenId))
}
