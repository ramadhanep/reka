import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '@reka/database'
import { warehouses } from './inventory.schema.js'
import {
  inventoryItems,
  stockBalances,
  stockMovements,
  warehouseLocations,
} from './inventory.schema.js'
import type {
  InventoryItemInsert,
  InventoryItemRow,
  StockBalanceRow,
  StockMovementInsert,
  StockMovementRow,
  WarehouseInsert,
  WarehouseLocationInsert,
  WarehouseLocationRow,
  WarehouseRow,
} from './inventory.schema.js'

// ---- Inventory items ----

export async function createItem(db: Db, input: InventoryItemInsert): Promise<InventoryItemRow> {
  const [row] = await db.insert(inventoryItems).values(input).returning()
  return row
}

export async function updateItem(
  db: Db,
  id: string,
  patch: Partial<InventoryItemInsert>,
): Promise<InventoryItemRow | undefined> {
  const rows = await db
    .update(inventoryItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(inventoryItems.id, id))
    .returning()
  return rows[0]
}

export async function findItemById(db: Db, id: string): Promise<InventoryItemRow | undefined> {
  const rows = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1)
  return rows[0]
}

export async function findItemBySku(
  db: Db,
  organizationId: string,
  sku: string,
): Promise<InventoryItemRow | undefined> {
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.organizationId, organizationId), eq(inventoryItems.sku, sku)))
    .limit(1)
  return rows[0]
}

export async function listItems(db: Db, organizationId: string): Promise<InventoryItemRow[]> {
  return db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.organizationId, organizationId))
    .orderBy(desc(inventoryItems.createdAt))
}

// ---- Warehouses ----

export async function createWarehouse(db: Db, input: WarehouseInsert): Promise<WarehouseRow> {
  const [row] = await db.insert(warehouses).values(input).returning()
  return row
}

export async function findWarehouseById(db: Db, id: string): Promise<WarehouseRow | undefined> {
  const rows = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1)
  return rows[0]
}

export async function findWarehouseByCode(
  db: Db,
  organizationId: string,
  code: string,
): Promise<WarehouseRow | undefined> {
  const rows = await db
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.organizationId, organizationId), eq(warehouses.code, code)))
    .limit(1)
  return rows[0]
}

export async function listWarehouses(db: Db, organizationId: string): Promise<WarehouseRow[]> {
  return db
    .select()
    .from(warehouses)
    .where(eq(warehouses.organizationId, organizationId))
    .orderBy(warehouses.code)
}

// ---- Locations ----

export async function createLocation(
  db: Db,
  input: WarehouseLocationInsert,
): Promise<WarehouseLocationRow> {
  const [row] = await db.insert(warehouseLocations).values(input).returning()
  return row
}

export async function findLocationById(
  db: Db,
  id: string,
): Promise<WarehouseLocationRow | undefined> {
  const rows = await db
    .select()
    .from(warehouseLocations)
    .where(eq(warehouseLocations.id, id))
    .limit(1)
  return rows[0]
}

export async function findLocationByCode(
  db: Db,
  warehouseId: string,
  code: string,
): Promise<WarehouseLocationRow | undefined> {
  const rows = await db
    .select()
    .from(warehouseLocations)
    .where(and(eq(warehouseLocations.warehouseId, warehouseId), eq(warehouseLocations.code, code)))
    .limit(1)
  return rows[0]
}

export async function listLocations(
  db: Db,
  organizationId: string,
  warehouseId?: string,
): Promise<WarehouseLocationRow[]> {
  const where = warehouseId
    ? and(
        eq(warehouseLocations.organizationId, organizationId),
        eq(warehouseLocations.warehouseId, warehouseId),
      )
    : eq(warehouseLocations.organizationId, organizationId)
  return db.select().from(warehouseLocations).where(where).orderBy(warehouseLocations.code)
}

// ---- Stock balances ----

export async function incrementBalance(
  db: Db,
  organizationId: string,
  inventoryItemId: string,
  locationId: string,
  delta: number,
): Promise<StockBalanceRow> {
  const [row] = await db
    .insert(stockBalances)
    .values({ organizationId, inventoryItemId, locationId, quantity: delta })
    .onConflictDoUpdate({
      target: [
        stockBalances.organizationId,
        stockBalances.inventoryItemId,
        stockBalances.locationId,
      ],
      set: {
        quantity: sql`${stockBalances.quantity} + ${delta}`,
        updatedAt: new Date(),
      },
    })
    .returning()
  return row
}

/**
 * Atomically decrements a balance, row-locking it so concurrent writers
 * serialize. Affects zero rows when the balance does not exist or would go
 * negative; callers turn that into an insufficient-stock error.
 */
export async function decrementBalance(
  db: Db,
  organizationId: string,
  inventoryItemId: string,
  locationId: string,
  delta: number,
): Promise<StockBalanceRow | undefined> {
  const rows = await db
    .update(stockBalances)
    .set({
      quantity: sql`${stockBalances.quantity} - ${delta}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stockBalances.organizationId, organizationId),
        eq(stockBalances.inventoryItemId, inventoryItemId),
        eq(stockBalances.locationId, locationId),
        gte(stockBalances.quantity, delta),
      ),
    )
    .returning()
  return rows[0]
}

export async function findBalance(
  db: Db,
  organizationId: string,
  inventoryItemId: string,
  locationId: string,
): Promise<StockBalanceRow | undefined> {
  const rows = await db
    .select()
    .from(stockBalances)
    .where(
      and(
        eq(stockBalances.organizationId, organizationId),
        eq(stockBalances.inventoryItemId, inventoryItemId),
        eq(stockBalances.locationId, locationId),
      ),
    )
    .limit(1)
  return rows[0]
}

export interface StockBalanceView {
  id: string
  organizationId: string
  inventoryItemId: string
  sku: string
  itemName: string
  unit: string
  locationId: string
  locationCode: string
  locationName: string
  warehouseId: string
  warehouseCode: string
  quantity: number
  updatedAt: string
}

export async function listStockBalances(
  db: Db,
  organizationId: string,
  filters: { itemId?: string; locationId?: string; warehouseId?: string },
): Promise<StockBalanceView[]> {
  const conditions = [eq(stockBalances.organizationId, organizationId)]
  if (filters.itemId) conditions.push(eq(stockBalances.inventoryItemId, filters.itemId))
  if (filters.locationId) conditions.push(eq(stockBalances.locationId, filters.locationId))
  if (filters.warehouseId) conditions.push(eq(warehouseLocations.warehouseId, filters.warehouseId))

  const rows = await db
    .select({
      id: stockBalances.id,
      organizationId: stockBalances.organizationId,
      inventoryItemId: stockBalances.inventoryItemId,
      sku: inventoryItems.sku,
      itemName: inventoryItems.name,
      unit: inventoryItems.unit,
      locationId: stockBalances.locationId,
      locationCode: warehouseLocations.code,
      locationName: warehouseLocations.name,
      warehouseId: warehouseLocations.warehouseId,
      warehouseCode: warehouses.code,
      quantity: stockBalances.quantity,
      updatedAt: stockBalances.updatedAt,
    })
    .from(stockBalances)
    .innerJoin(inventoryItems, eq(stockBalances.inventoryItemId, inventoryItems.id))
    .innerJoin(warehouseLocations, eq(stockBalances.locationId, warehouseLocations.id))
    .innerJoin(warehouses, eq(warehouseLocations.warehouseId, warehouses.id))
    .where(and(...conditions))
    .orderBy(desc(stockBalances.updatedAt))

  return rows.map((row) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
  }))
}

// ---- Stock movements ----

export async function insertMovement(
  db: Db,
  input: StockMovementInsert,
): Promise<StockMovementRow> {
  const [row] = await db.insert(stockMovements).values(input).returning()
  return row
}

export async function findMovementByReference(
  db: Db,
  organizationId: string,
  referenceType: string,
  referenceId: string,
): Promise<StockMovementRow | undefined> {
  const rows = await db
    .select()
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.organizationId, organizationId),
        eq(stockMovements.referenceType, referenceType),
        eq(stockMovements.referenceId, referenceId),
      ),
    )
    .limit(1)
  return rows[0]
}

export interface StockMovementView {
  id: string
  organizationId: string
  inventoryItemId: string
  sku: string
  itemName: string
  locationId: string
  locationCode: string
  locationName: string
  warehouseId: string
  warehouseCode: string
  type: string
  quantity: number
  referenceType: string
  referenceId: string | null
  reason: string | null
  reference: string | null
  notes: string | null
  actorId: string
  createdAt: string
}

export async function listStockMovements(
  db: Db,
  organizationId: string,
  filters: { itemId?: string; locationId?: string; warehouseId?: string; type?: string },
  limit = 200,
): Promise<StockMovementView[]> {
  const conditions = [eq(stockMovements.organizationId, organizationId)]
  if (filters.itemId) conditions.push(eq(stockMovements.inventoryItemId, filters.itemId))
  if (filters.locationId) conditions.push(eq(stockMovements.locationId, filters.locationId))
  if (filters.type) conditions.push(eq(stockMovements.type, filters.type))
  if (filters.warehouseId) conditions.push(eq(warehouseLocations.warehouseId, filters.warehouseId))

  const rows = await db
    .select({
      id: stockMovements.id,
      organizationId: stockMovements.organizationId,
      inventoryItemId: stockMovements.inventoryItemId,
      sku: inventoryItems.sku,
      itemName: inventoryItems.name,
      locationId: stockMovements.locationId,
      locationCode: warehouseLocations.code,
      locationName: warehouseLocations.name,
      warehouseId: warehouseLocations.warehouseId,
      warehouseCode: warehouses.code,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      referenceType: stockMovements.referenceType,
      referenceId: stockMovements.referenceId,
      reason: stockMovements.reason,
      reference: stockMovements.reference,
      notes: stockMovements.notes,
      actorId: stockMovements.actorId,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .innerJoin(inventoryItems, eq(stockMovements.inventoryItemId, inventoryItems.id))
    .innerJoin(warehouseLocations, eq(stockMovements.locationId, warehouseLocations.id))
    .innerJoin(warehouses, eq(warehouseLocations.warehouseId, warehouses.id))
    .where(and(...conditions))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }))
}
