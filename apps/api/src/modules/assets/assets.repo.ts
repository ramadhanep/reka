import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '@reka/database'
import {
  assets,
  assetAssignments,
  type AssetInsert,
  type AssetRow,
  type AssetAssignmentInsert,
  type AssetAssignmentRow,
} from './assets.schema.js'

export async function createAsset(db: Db, input: AssetInsert): Promise<AssetRow> {
  const [row] = await db.insert(assets).values(input).returning()
  return row
}

export async function updateAsset(
  db: Db,
  id: string,
  patch: Partial<AssetInsert>,
): Promise<AssetRow | undefined> {
  const rows = await db
    .update(assets)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(assets.id, id))
    .returning()
  return rows[0]
}

export async function findAssetById(db: Db, id: string): Promise<AssetRow | undefined> {
  const rows = await db.select().from(assets).where(eq(assets.id, id)).limit(1)
  return rows[0]
}

export async function findAssetForUpdate(db: Db, id: string): Promise<AssetRow | undefined> {
  const rows = await db.select().from(assets).where(eq(assets.id, id)).for('update')
  return rows[0]
}

export async function findAssetByTag(
  db: Db,
  organizationId: string,
  assetTag: string,
): Promise<AssetRow | undefined> {
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.organizationId, organizationId), eq(assets.assetTag, assetTag)))
    .limit(1)
  return rows[0]
}

export async function listAssets(db: Db, organizationId: string): Promise<AssetRow[]> {
  return db
    .select()
    .from(assets)
    .where(eq(assets.organizationId, organizationId))
    .orderBy(desc(assets.createdAt))
}

export async function listAssetsByStatus(
  db: Db,
  organizationId: string,
  status: string,
): Promise<AssetRow[]> {
  return db
    .select()
    .from(assets)
    .where(and(eq(assets.organizationId, organizationId), eq(assets.status, status)))
    .orderBy(desc(assets.createdAt))
}

export async function createAssetAssignment(
  db: Db,
  input: AssetAssignmentInsert,
): Promise<AssetAssignmentRow> {
  const [row] = await db.insert(assetAssignments).values(input).returning()
  return row
}

export async function updateAssetAssignment(
  db: Db,
  id: string,
  patch: Partial<AssetAssignmentInsert>,
): Promise<AssetAssignmentRow | undefined> {
  const rows = await db
    .update(assetAssignments)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(assetAssignments.id, id))
    .returning()
  return rows[0]
}

export async function findActiveAssignmentByAsset(
  db: Db,
  assetId: string,
): Promise<AssetAssignmentRow | undefined> {
  const rows = await db
    .select()
    .from(assetAssignments)
    .where(and(eq(assetAssignments.assetId, assetId), isNull(assetAssignments.returnedAt)))
    .limit(1)
  return rows[0]
}

export async function findAssignmentById(
  db: Db,
  id: string,
): Promise<AssetAssignmentRow | undefined> {
  const rows = await db.select().from(assetAssignments).where(eq(assetAssignments.id, id)).limit(1)
  return rows[0]
}

export async function findAssignmentForUpdate(
  db: Db,
  id: string,
): Promise<AssetAssignmentRow | undefined> {
  const rows = await db
    .select()
    .from(assetAssignments)
    .where(eq(assetAssignments.id, id))
    .for('update')
  return rows[0]
}

export async function listAssetAssignments(
  db: Db,
  organizationId: string,
): Promise<AssetAssignmentRow[]> {
  return db
    .select()
    .from(assetAssignments)
    .where(eq(assetAssignments.organizationId, organizationId))
    .orderBy(desc(assetAssignments.createdAt))
}

export async function listAssetHistory(
  db: Db,
  organizationId: string,
  assetId: string,
): Promise<AssetAssignmentRow[]> {
  return db
    .select()
    .from(assetAssignments)
    .where(
      and(
        eq(assetAssignments.organizationId, organizationId),
        eq(assetAssignments.assetId, assetId),
      ),
    )
    .orderBy(desc(assetAssignments.createdAt))
}

export async function listAssignmentsByAssignee(
  db: Db,
  organizationId: string,
  assigneeUserId: string,
): Promise<AssetAssignmentRow[]> {
  return db
    .select()
    .from(assetAssignments)
    .where(
      and(
        eq(assetAssignments.organizationId, organizationId),
        eq(assetAssignments.assigneeUserId, assigneeUserId),
      ),
    )
    .orderBy(desc(assetAssignments.createdAt))
}

export async function countActiveAssignmentsForAsset(db: Db, assetId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(assetAssignments)
    .where(and(eq(assetAssignments.assetId, assetId), isNull(assetAssignments.returnedAt)))
  return Number(row?.count ?? 0)
}
