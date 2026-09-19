import { inArray } from 'drizzle-orm'
import { type Db } from '@reka/database'
import { permissions } from './permission.schema.js'

export type PermissionRow = typeof permissions.$inferSelect

export async function ensurePermissions(
  db: Db,
  keys: string | string[],
  description: (key: string) => string,
): Promise<void> {
  const all = Array.isArray(keys) ? keys : [keys]
  const existing = await db
    .select({ key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, all))
  const existingKeys = new Set(existing.map((row) => row.key))
  const missing = all
    .filter((key) => !existingKeys.has(key))
    .map((key) => ({ key, description: description(key) }))
  if (missing.length > 0) {
    await db.insert(permissions).values(missing).onConflictDoNothing()
  }
}

export async function findPermissionsByKeys(db: Db, keys: string[]): Promise<PermissionRow[]> {
  return db.select().from(permissions).where(inArray(permissions.key, keys))
}
