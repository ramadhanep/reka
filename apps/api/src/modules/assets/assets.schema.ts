import { bigint, index, pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core'
import { organizations } from '../organization/organization.schema.js'
import { usersTable } from '../identity/user.schema.js'
import { vendors } from '../procurement/procurement.schema.js'
import { purchaseOrders } from '../procurement/procurement.schema.js'

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    assetTag: text('asset_tag').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull(),
    status: text('status').notNull().default('AVAILABLE'),
    serialNumber: text('serial_number'),
    purchaseDate: timestamp('purchase_date', { withTimezone: true }),
    purchasePrice: bigint('purchase_price', { mode: 'number' }),
    currency: text('currency'),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('assets_org_asset_tag_unique').on(table.organizationId, table.assetTag),
    index('assets_org_idx').on(table.organizationId),
    index('assets_org_status_idx').on(table.organizationId, table.status),
    index('assets_vendor_idx').on(table.vendorId),
    index('assets_purchase_order_idx').on(table.purchaseOrderId),
  ],
)

export const assetAssignments = pgTable(
  'asset_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    assigneeUserId: uuid('assignee_user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'restrict' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'restrict' }),
    returnedBy: uuid('returned_by').references(() => usersTable.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('asset_assignments_org_idx').on(table.organizationId),
    index('asset_assignments_asset_idx').on(table.assetId),
    index('asset_assignments_assignee_idx').on(table.assigneeUserId),
    index('asset_assignments_active_idx').on(table.assetId, table.returnedAt),
  ],
)

export type AssetRow = typeof assets.$inferSelect
export type AssetInsert = typeof assets.$inferInsert
export type AssetAssignmentRow = typeof assetAssignments.$inferSelect
export type AssetAssignmentInsert = typeof assetAssignments.$inferInsert
