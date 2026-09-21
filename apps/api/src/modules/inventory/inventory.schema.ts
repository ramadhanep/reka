import { sql } from 'drizzle-orm'
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { usersTable } from '../identity/user.schema.js'
import { organizations } from '../organization/organization.schema.js'

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    unit: text('unit').notNull().default('pcs'),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('inventory_items_org_sku_unique').on(table.organizationId, table.sku),
    index('inventory_items_org_idx').on(table.organizationId),
    index('inventory_items_org_status_idx').on(table.organizationId, table.status),
  ],
)

export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('warehouses_org_code_unique').on(table.organizationId, table.code),
    index('warehouses_org_idx').on(table.organizationId),
  ],
)

export const warehouseLocations = pgTable(
  'warehouse_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('warehouse_locations_warehouse_code_unique').on(table.warehouseId, table.code),
    index('warehouse_locations_org_idx').on(table.organizationId),
    index('warehouse_locations_warehouse_idx').on(table.warehouseId),
  ],
)

export const stockBalances = pgTable(
  'stock_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inventoryItemId: uuid('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => warehouseLocations.id, { onDelete: 'cascade' }),
    quantity: numeric('quantity', { precision: 18, scale: 4, mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('stock_balances_org_item_location_unique').on(
      table.organizationId,
      table.inventoryItemId,
      table.locationId,
    ),
    check('stock_balances_quantity_nonnegative', sql`${table.quantity} >= 0`),
    index('stock_balances_org_idx').on(table.organizationId),
    index('stock_balances_item_idx').on(table.inventoryItemId),
    index('stock_balances_location_idx').on(table.locationId),
  ],
)

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inventoryItemId: uuid('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => warehouseLocations.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4, mode: 'number' }).notNull(),
    referenceType: text('reference_type').notNull(),
    referenceId: uuid('reference_id'),
    reason: text('reason'),
    reference: text('reference'),
    notes: text('notes'),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('stock_movements_goods_receipt_unique')
      .on(table.organizationId, table.referenceId)
      .where(sql`${table.referenceType} = 'GOODS_RECEIPT'`),
    check('stock_movements_quantity_positive', sql`${table.quantity} > 0`),
    index('stock_movements_org_idx').on(table.organizationId),
    index('stock_movements_item_idx').on(table.inventoryItemId),
    index('stock_movements_location_idx').on(table.locationId),
    index('stock_movements_org_type_idx').on(table.organizationId, table.type),
    index('stock_movements_item_type_idx').on(table.inventoryItemId, table.type),
  ],
)

export type InventoryItemRow = typeof inventoryItems.$inferSelect
export type InventoryItemInsert = typeof inventoryItems.$inferInsert
export type WarehouseRow = typeof warehouses.$inferSelect
export type WarehouseInsert = typeof warehouses.$inferInsert
export type WarehouseLocationRow = typeof warehouseLocations.$inferSelect
export type WarehouseLocationInsert = typeof warehouseLocations.$inferInsert
export type StockBalanceRow = typeof stockBalances.$inferSelect
export type StockBalanceInsert = typeof stockBalances.$inferInsert
export type StockMovementRow = typeof stockMovements.$inferSelect
export type StockMovementInsert = typeof stockMovements.$inferInsert
