import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { type Db } from '@reka/database'
import {
  goodsReceiptItems,
  goodsReceipts,
  purchaseOrders,
  purchaseOrderItems,
  purchaseRequestItems,
  purchaseRequests,
  vendors,
  type GoodsReceiptInsert,
  type GoodsReceiptItemInsert,
  type GoodsReceiptItemRow,
  type GoodsReceiptRow,
  type PurchaseOrderInsert,
  type PurchaseOrderItemInsert,
  type PurchaseOrderItemRow,
  type PurchaseOrderRow,
  type PurchaseRequestInsert,
  type PurchaseRequestItemInsert,
  type PurchaseRequestItemRow,
  type PurchaseRequestRow,
  type VendorInsert,
  type VendorRow,
} from './procurement.schema.js'
import { PURCHASE_ORDER_STATUS } from './procurement-workflow.js'

// ---- Vendors ----

export async function createVendorIn(db: Db, input: VendorInsert): Promise<VendorRow> {
  const [row] = await db.insert(vendors).values(input).returning()
  return row
}

export async function updateVendorIn(
  db: Db,
  id: string,
  patch: Partial<VendorInsert>,
): Promise<VendorRow | undefined> {
  const rows = await db
    .update(vendors)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(vendors.id, id))
    .returning()
  return rows[0]
}

export async function findVendorById(db: Db, id: string): Promise<VendorRow | undefined> {
  const rows = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1)
  return rows[0]
}

export async function findVendorByCode(
  db: Db,
  organizationId: string,
  code: string,
): Promise<VendorRow | undefined> {
  const rows = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.organizationId, organizationId), eq(vendors.code, code)))
    .limit(1)
  return rows[0]
}

export async function listVendors(db: Db, organizationId: string): Promise<VendorRow[]> {
  return db
    .select()
    .from(vendors)
    .where(eq(vendors.organizationId, organizationId))
    .orderBy(desc(vendors.createdAt))
}

// ---- Purchase Requests ----

export async function createPurchaseRequestIn(
  db: Db,
  input: PurchaseRequestInsert,
): Promise<PurchaseRequestRow> {
  const [row] = await db.insert(purchaseRequests).values(input).returning()
  return row
}

export async function updatePurchaseRequestIn(
  db: Db,
  id: string,
  patch: Partial<PurchaseRequestInsert>,
): Promise<PurchaseRequestRow | undefined> {
  const rows = await db
    .update(purchaseRequests)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(purchaseRequests.id, id))
    .returning()
  return rows[0]
}

export async function findPurchaseRequestForUpdate(
  db: Db,
  id: string,
): Promise<PurchaseRequestRow | undefined> {
  const rows = await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, id))
    .for('update')
  return rows[0]
}

export async function findPurchaseRequestById(
  db: Db,
  id: string,
): Promise<PurchaseRequestRow | undefined> {
  const rows = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).limit(1)
  return rows[0]
}

export async function listPurchaseRequests(
  db: Db,
  organizationId: string,
): Promise<PurchaseRequestRow[]> {
  return db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.organizationId, organizationId))
    .orderBy(desc(purchaseRequests.createdAt))
}

export async function createPurchaseRequestItemsIn(
  db: Db,
  items: PurchaseRequestItemInsert[],
): Promise<PurchaseRequestItemRow[]> {
  if (items.length === 0) return []
  return db.insert(purchaseRequestItems).values(items).returning()
}

export async function findPurchaseRequestItems(
  db: Db,
  purchaseRequestId: string,
): Promise<PurchaseRequestItemRow[]> {
  return db
    .select()
    .from(purchaseRequestItems)
    .where(eq(purchaseRequestItems.purchaseRequestId, purchaseRequestId))
    .orderBy(purchaseRequestItems.createdAt)
}

export async function findPurchaseRequestItemsByIds(
  db: Db,
  ids: string[],
): Promise<PurchaseRequestItemRow[]> {
  if (ids.length === 0) return []
  return db.select().from(purchaseRequestItems).where(inArray(purchaseRequestItems.id, ids))
}

// ---- Purchase Orders ----

export async function createPurchaseOrderIn(
  db: Db,
  input: PurchaseOrderInsert,
): Promise<PurchaseOrderRow> {
  const [row] = await db.insert(purchaseOrders).values(input).returning()
  return row
}

export async function updatePurchaseOrderIn(
  db: Db,
  id: string,
  patch: Partial<PurchaseOrderInsert>,
): Promise<PurchaseOrderRow | undefined> {
  const rows = await db
    .update(purchaseOrders)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, id))
    .returning()
  return rows[0]
}

export async function findPurchaseOrderForUpdate(
  db: Db,
  id: string,
): Promise<PurchaseOrderRow | undefined> {
  const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for('update')
  return rows[0]
}

export async function findPurchaseOrderById(
  db: Db,
  id: string,
): Promise<PurchaseOrderRow | undefined> {
  const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1)
  return rows[0]
}

export async function listPurchaseOrders(
  db: Db,
  organizationId: string,
): Promise<PurchaseOrderRow[]> {
  return db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.organizationId, organizationId))
    .orderBy(desc(purchaseOrders.createdAt))
}

export async function createPurchaseOrderItemsIn(
  db: Db,
  items: PurchaseOrderItemInsert[],
): Promise<PurchaseOrderItemRow[]> {
  if (items.length === 0) return []
  return db.insert(purchaseOrderItems).values(items).returning()
}

export async function findPurchaseOrderItems(
  db: Db,
  purchaseOrderId: string,
): Promise<PurchaseOrderItemRow[]> {
  return db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId))
    .orderBy(purchaseOrderItems.createdAt)
}

export async function findPurchaseOrderItemsByIds(
  db: Db,
  ids: string[],
): Promise<PurchaseOrderItemRow[]> {
  if (ids.length === 0) return []
  return db.select().from(purchaseOrderItems).where(inArray(purchaseOrderItems.id, ids))
}

export async function findPurchaseOrderItemById(
  db: Db,
  id: string,
): Promise<PurchaseOrderItemRow | undefined> {
  const rows = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.id, id))
    .limit(1)
  return rows[0]
}

export async function incrementReceivedQuantity(
  db: Db,
  itemId: string,
  increment: number,
): Promise<PurchaseOrderItemRow | undefined> {
  const rows = await db
    .update(purchaseOrderItems)
    .set({
      receivedQuantity: sql`${purchaseOrderItems.receivedQuantity} + ${increment}`,
    })
    .where(eq(purchaseOrderItems.id, itemId))
    .returning()
  return rows[0]
}

export async function sumOrderedQuantityForRequestItem(
  db: Db,
  purchaseRequestId: string,
  purchaseRequestItemId: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${purchaseOrderItems.quantity}), 0)`,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
    .where(
      and(
        eq(purchaseOrders.purchaseRequestId, purchaseRequestId),
        eq(purchaseOrderItems.purchaseRequestItemId, purchaseRequestItemId),
        ne(purchaseOrders.status, PURCHASE_ORDER_STATUS.CANCELLED),
      ),
    )
  return Number(row?.total ?? 0)
}

// ---- Goods Receipts ----

export async function createGoodsReceiptIn(
  db: Db,
  input: GoodsReceiptInsert,
): Promise<GoodsReceiptRow> {
  const [row] = await db.insert(goodsReceipts).values(input).returning()
  return row
}

export async function createGoodsReceiptItemsIn(
  db: Db,
  items: GoodsReceiptItemInsert[],
): Promise<GoodsReceiptItemRow[]> {
  if (items.length === 0) return []
  return db.insert(goodsReceiptItems).values(items).returning()
}

export async function findGoodsReceiptById(
  db: Db,
  id: string,
): Promise<GoodsReceiptRow | undefined> {
  const rows = await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, id)).limit(1)
  return rows[0]
}

export async function findGoodsReceiptItems(
  db: Db,
  goodsReceiptId: string,
): Promise<GoodsReceiptItemRow[]> {
  return db
    .select()
    .from(goodsReceiptItems)
    .where(eq(goodsReceiptItems.goodsReceiptId, goodsReceiptId))
    .orderBy(goodsReceiptItems.createdAt)
}

export async function findGoodsReceiptItemById(
  db: Db,
  id: string,
): Promise<GoodsReceiptItemRow | undefined> {
  const rows = await db
    .select()
    .from(goodsReceiptItems)
    .where(eq(goodsReceiptItems.id, id))
    .limit(1)
  return rows[0]
}

export async function listGoodsReceipts(
  db: Db,
  organizationId: string,
): Promise<GoodsReceiptRow[]> {
  return db
    .select()
    .from(goodsReceipts)
    .where(eq(goodsReceipts.organizationId, organizationId))
    .orderBy(desc(goodsReceipts.createdAt))
}
