import {
  bigint,
  integer,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { usersTable } from '../identity/user.schema.js'
import { organizations } from '../organization/organization.schema.js'
import { workflowInstances } from '../workflow/workflow.schema.js'

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('vendors_org_code_unique').on(table.organizationId, table.code),
    index('vendors_org_idx').on(table.organizationId),
  ],
)

export const purchaseRequests = pgTable(
  'purchase_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => usersTable.id),
    number: text('number').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('draft'),
    workflowInstanceId: uuid('workflow_instance_id').references(() => workflowInstances.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('purchase_requests_org_number_unique').on(table.organizationId, table.number),
    index('purchase_requests_org_idx').on(table.organizationId),
    index('purchase_requests_requester_idx').on(table.requesterId),
  ],
)

export const purchaseRequestItems = pgTable(
  'purchase_request_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purchaseRequestId: uuid('purchase_request_id')
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    unit: text('unit'),
    estimatedUnitPrice: bigint('estimated_unit_price', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('purchase_request_items_request_idx').on(table.purchaseRequestId)],
)

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'restrict' }),
    purchaseRequestId: uuid('purchase_request_id')
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: 'restrict' }),
    number: text('number').notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('draft'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('purchase_orders_org_number_unique').on(table.organizationId, table.number),
    index('purchase_orders_org_idx').on(table.organizationId),
    index('purchase_orders_vendor_idx').on(table.vendorId),
    index('purchase_orders_request_idx').on(table.purchaseRequestId),
  ],
)

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    purchaseRequestItemId: uuid('purchase_request_item_id')
      .notNull()
      .references(() => purchaseRequestItems.id, { onDelete: 'restrict' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
    receivedQuantity: integer('received_quantity').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('purchase_order_items_order_idx').on(table.purchaseOrderId)],
)

export const goodsReceipts = pgTable(
  'goods_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    number: text('number').notNull(),
    receivedBy: uuid('received_by')
      .notNull()
      .references(() => usersTable.id),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('goods_receipts_org_number_unique').on(table.organizationId, table.number),
    index('goods_receipts_org_idx').on(table.organizationId),
    index('goods_receipts_po_idx').on(table.purchaseOrderId),
  ],
)

export const goodsReceiptItems = pgTable(
  'goods_receipt_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goodsReceiptId: uuid('goods_receipt_id')
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: 'cascade' }),
    purchaseOrderItemId: uuid('purchase_order_item_id')
      .notNull()
      .references(() => purchaseOrderItems.id, { onDelete: 'restrict' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('goods_receipt_items_receipt_idx').on(table.goodsReceiptId)],
)

export const documentSequences = pgTable(
  'document_sequences',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    value: integer('value').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.code] })],
)

export type VendorRow = typeof vendors.$inferSelect
export type VendorInsert = typeof vendors.$inferInsert

export type PurchaseRequestRow = typeof purchaseRequests.$inferSelect
export type PurchaseRequestInsert = typeof purchaseRequests.$inferInsert

export type PurchaseRequestItemRow = typeof purchaseRequestItems.$inferSelect
export type PurchaseRequestItemInsert = typeof purchaseRequestItems.$inferInsert

export type PurchaseOrderRow = typeof purchaseOrders.$inferSelect
export type PurchaseOrderInsert = typeof purchaseOrders.$inferInsert

export type PurchaseOrderItemRow = typeof purchaseOrderItems.$inferSelect
export type PurchaseOrderItemInsert = typeof purchaseOrderItems.$inferInsert

export type GoodsReceiptRow = typeof goodsReceipts.$inferSelect
export type GoodsReceiptInsert = typeof goodsReceipts.$inferInsert

export type GoodsReceiptItemRow = typeof goodsReceiptItems.$inferSelect
export type GoodsReceiptItemInsert = typeof goodsReceiptItems.$inferInsert

export type DocumentSequenceRow = typeof documentSequences.$inferSelect
