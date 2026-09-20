import { and, count, eq } from 'drizzle-orm'
import { type Db } from '@reka/database'
import { usersTable } from './user.schema.js'

export type UserRow = typeof usersTable.$inferSelect

export interface CreateUserInput {
  email: string
  passwordHash: string
  displayName: string
  status?: string
  provider?: string
  providerId?: string
}

export async function createUser(db: Db, input: CreateUserInput): Promise<UserRow> {
  const rows = await db
    .insert(usersTable)
    .values({ ...input, status: input.status ?? 'active', provider: input.provider ?? 'local' })
    .returning()
  return rows[0]
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1)
  return rows[0]
}

export async function findUserByProviderId(
  db: Db,
  provider: string,
  providerId: string,
): Promise<UserRow | undefined> {
  const rows = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.provider, provider), eq(usersTable.providerId, providerId)))
    .limit(1)
  return rows[0]
}

export async function findUserById(db: Db, id: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1)
  return rows[0]
}

export async function countUsers(db: Db): Promise<number> {
  const rows = await db.select({ count: count() }).from(usersTable)
  return Number(rows[0]?.count ?? 0)
}
