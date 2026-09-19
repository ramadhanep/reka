import { eq } from 'drizzle-orm'
import type { Db } from '@reka/database'
import { platformModules, type PlatformModuleRow } from './module.schema.js'

export async function findPlatformModules(db: Db): Promise<PlatformModuleRow[]> {
  return db.select().from(platformModules)
}

export async function findPlatformModuleById(
  db: Db,
  id: string,
): Promise<PlatformModuleRow | undefined> {
  const rows = await db.select().from(platformModules).where(eq(platformModules.id, id)).limit(1)
  return rows[0]
}

export async function upsertPlatformModule(
  db: Db,
  input: { id: string; version: string; enabled: boolean },
): Promise<PlatformModuleRow> {
  const existing = await findPlatformModuleById(db, input.id)
  if (existing) {
    const updated = await db
      .update(platformModules)
      .set({
        version: input.version,
        enabled: input.enabled,
        updatedAt: new Date(),
      })
      .where(eq(platformModules.id, input.id))
      .returning()
    return updated[0]
  }

  const inserted = await db
    .insert(platformModules)
    .values({
      id: input.id,
      version: input.version,
      enabled: input.enabled,
    })
    .returning()
  return inserted[0]
}

export async function setPlatformModuleEnabled(
  db: Db,
  id: string,
  enabled: boolean,
): Promise<PlatformModuleRow | undefined> {
  const rows = await db
    .update(platformModules)
    .set({
      enabled,
      updatedAt: new Date(),
    })
    .where(eq(platformModules.id, id))
    .returning()
  return rows[0]
}
