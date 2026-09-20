import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { OnModuleInit } from '@nestjs/common'
import type { Database, Db } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import { permissionCatalog } from '../access/access.service.js'
import { ensurePermissions, findPermissionsByKeys } from '../access/permission.repo.js'
import { findSystemRoleByKey, grantRolePermissions } from '../access/role.repo.js'
import { AuditService } from '../audit/audit.service.js'
import { organizations } from '../organization/organization.schema.js'
import { WorkflowService } from '../workflow/workflow.service.js'
import {
  allocateDocumentNumber,
  DOCUMENT_CODE_GR,
  DOCUMENT_CODE_PO,
  DOCUMENT_CODE_PR,
} from './procurement-numbering.js'
import {
  assertNonNegativePrice,
  assertPositiveQuantity,
  validatePurchaseOrderItems,
  validateRequestItemFields,
  validateRequestItemsForSubmit,
} from './procurement-rules.js'
import {
  createGoodsReceiptIn,
  createGoodsReceiptItemsIn,
  createPurchaseOrderIn,
  createPurchaseOrderItemsIn,
  createPurchaseRequestIn,
  createPurchaseRequestItemsIn,
  createVendorIn,
  findGoodsReceiptById,
  findGoodsReceiptItems,
  findPurchaseOrderById,
  findPurchaseOrderForUpdate,
  findPurchaseOrderItems,
  findPurchaseOrderItemsByIds,
  findPurchaseRequestById,
  findPurchaseRequestForUpdate,
  findPurchaseRequestItems,
  findPurchaseRequestItemsByIds,
  findVendorById,
  findVendorByCode,
  incrementReceivedQuantity,
  listGoodsReceipts,
  listPurchaseOrders,
  listPurchaseRequests,
  listVendors,
  sumOrderedQuantityForRequestItem,
  updatePurchaseOrderIn,
  updatePurchaseRequestIn,
  updateVendorIn,
} from './procurement.repo.js'
import {
  PURCHASE_ORDER_STATUS,
  PURCHASE_REQUEST_STATUS,
  PURCHASE_REQUEST_WORKFLOW_KEY,
  procurementWorkflowDefinitionInput,
} from './procurement-workflow.js'

const DEFAULT_CURRENCY = 'USD'

export interface VendorView {
  id: string
  organizationId: string
  name: string
  code: string
  email: string | null
  phone: string | null
  address: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface PurchaseRequestItemView {
  id: string
  description: string
  quantity: number
  unit: string | null
  estimatedUnitPrice: number
}

export interface PurchaseRequestView {
  id: string
  organizationId: string
  number: string
  title: string
  description: string | null
  currency: string
  status: string
  requesterId: string
  workflowInstanceId: string | null
  createdAt: string
  updatedAt: string
  items: PurchaseRequestItemView[]
}

export interface PurchaseOrderView {
  id: string
  organizationId: string
  number: string
  vendorId: string
  vendorName: string | null
  purchaseRequestId: string
  purchaseRequestNumber: string | null
  currency: string
  status: string
  issuedAt: string | null
  createdAt: string
  updatedAt: string
  items: PurchaseOrderItemView[]
}

export interface PurchaseOrderItemView {
  id: string
  purchaseRequestItemId: string
  description: string
  quantity: number
  unitPrice: number
  receivedQuantity: number
}

export interface GoodsReceiptView {
  id: string
  organizationId: string
  number: string
  purchaseOrderId: string
  purchaseOrderNumber: string | null
  receivedBy: string
  receivedAt: string
  note: string | null
  createdAt: string
  items: GoodsReceiptItemView[]
}

export interface GoodsReceiptItemView {
  id: string
  purchaseOrderItemId: string
  description: string
  quantity: number
}

@Injectable()
export class ProcurementService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly workflowService: WorkflowService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed()
  }

  /**
   * Idempotently seeds the procurement permissions (and grants them to the
   * owner role of every existing organization) and registers the generic
   * purchase-request workflow definition through the workflow module.
   * Kept as a public method so tests can re-seed after truncation.
   */
  async seed(): Promise<void> {
    const db = this.database.db
    const permissionKeys = Object.keys(permissionCatalog).filter((key) =>
      key.startsWith('procurement.'),
    )
    await ensurePermissions(db, permissionKeys, (key) => permissionCatalog[key] ?? key)
    const permissionRows = await findPermissionsByKeys(db, permissionKeys)
    const permissionIds = permissionRows.map((row) => row.id)

    const orgRows = await db.select({ id: organizations.id }).from(organizations)
    for (const org of orgRows) {
      const ownerRole = await findSystemRoleByKey(db, org.id, 'owner')
      if (ownerRole) {
        await grantRolePermissions(db, ownerRole.id, permissionIds)
      }
    }

    await this.workflowService.ensureGlobalDefinition(procurementWorkflowDefinitionInput(), null)
  }

  // ---- Vendors ----

  async listVendors(organizationId: string): Promise<VendorView[]> {
    const rows = await listVendors(this.database.db, organizationId)
    return rows.map((row) => this.toVendorView(row))
  }

  async getVendor(id: string, organizationId: string): Promise<VendorView> {
    const row = await this.requireVendor(id, organizationId)
    return this.toVendorView(row)
  }

  async createVendor(
    input: { name: string; code: string; email?: string; phone?: string; address?: string },
    actorId: string,
    organizationId: string,
  ): Promise<VendorView> {
    const code = input.code.trim().toUpperCase()
    return this.database.db.transaction(async (tx) => {
      const existing = await findVendorByCode(tx as unknown as Db, organizationId, code)
      if (existing) {
        throw new ConflictException(`Vendor code '${code}' is already in use`)
      }
      const row = await createVendorIn(tx as unknown as Db, {
        organizationId,
        name: input.name.trim(),
        code,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
      })
      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'procurement.vendor.created',
          resourceType: 'vendor',
          resourceId: row.id,
          metadata: { name: row.name, code: row.code },
        },
        tx as unknown as Db,
      )
      return this.toVendorView(row)
    })
  }

  async updateVendor(
    id: string,
    input: {
      name?: string
      code?: string
      email?: string
      phone?: string
      address?: string
      status?: string
    },
    actorId: string,
    organizationId: string,
  ): Promise<VendorView> {
    const existing = await this.requireVendor(id, organizationId)
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const patch: Record<string, string> = {}
      if (input.name !== undefined) patch.name = input.name.trim()
      if (input.code !== undefined) {
        patch.code = input.code.trim().toUpperCase()
        const clash = await findVendorByCode(db, organizationId, patch.code)
        if (clash && clash.id !== id) {
          throw new ConflictException(`Vendor code '${patch.code}' is already in use`)
        }
      }
      if (input.email !== undefined) patch.email = input.email.trim() || ''
      if (input.phone !== undefined) patch.phone = input.phone.trim() || ''
      if (input.address !== undefined) patch.address = input.address.trim() || ''
      if (input.status !== undefined) patch.status = input.status
      const row = await updateVendorIn(db, id, patch)
      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'procurement.vendor.updated',
          resourceType: 'vendor',
          resourceId: id,
          metadata: { previousCode: existing.code, currentCode: row?.code },
        },
        tx as unknown as Db,
      )
      if (!row) throw new NotFoundException('Vendor not found')
      return this.toVendorView(row)
    })
  }

  // ---- Purchase Requests ----

  async listPurchaseRequests(organizationId: string): Promise<PurchaseRequestView[]> {
    const rows = await listPurchaseRequests(this.database.db, organizationId)
    const views = await Promise.all(
      rows.map(async (row) => {
        const items = await findPurchaseRequestItems(this.database.db, row.id)
        return this.toRequestView(row, items)
      }),
    )
    return views
  }

  async getPurchaseRequest(id: string, organizationId: string): Promise<PurchaseRequestView> {
    const row = await this.requirePurchaseRequest(id, organizationId)
    const items = await findPurchaseRequestItems(this.database.db, row.id)
    return this.toRequestView(row, items)
  }

  async createPurchaseRequest(
    input: {
      title: string
      description?: string
      currency?: string
      items?: {
        description: string
        quantity: number
        unit?: string
        estimatedUnitPrice?: number
      }[]
    },
    actorId: string,
    organizationId: string,
  ): Promise<PurchaseRequestView> {
    const items = input.items ?? []
    validateRequestItemFields(items)
    return this.database.db.transaction(async (tx) => {
      const number = await allocateDocumentNumber(
        tx as unknown as Db,
        organizationId,
        DOCUMENT_CODE_PR,
      )
      const row = await createPurchaseRequestIn(tx as unknown as Db, {
        organizationId,
        requesterId: actorId,
        number,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        currency: input.currency ?? DEFAULT_CURRENCY,
        status: PURCHASE_REQUEST_STATUS.DRAFT,
      })
      const itemRows = await createPurchaseRequestItemsIn(
        tx as unknown as Db,
        items.map((item) => ({
          purchaseRequestId: row.id,
          description: item.description.trim(),
          quantity: item.quantity,
          unit: item.unit?.trim() || null,
          estimatedUnitPrice: item.estimatedUnitPrice ?? 0,
        })),
      )
      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'procurement.purchase_request.created',
          resourceType: 'purchase_request',
          resourceId: row.id,
          metadata: { number: row.number, title: row.title },
        },
        tx as unknown as Db,
      )
      return this.toRequestView(row, itemRows)
    })
  }

  async submitPurchaseRequest(
    id: string,
    input: { comment?: string },
    actorId: string,
    organizationId: string,
  ): Promise<PurchaseRequestView> {
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const row = await this.requirePurchaseRequestForUpdate(db, id, organizationId)
      if (row.status !== PURCHASE_REQUEST_STATUS.DRAFT) {
        throw new BadRequestException(
          `Only draft purchase requests can be submitted (current status: ${row.status})`,
        )
      }
      const items = await findPurchaseRequestItems(db, row.id)
      validateRequestItemsForSubmit(items)

      let instanceId = row.workflowInstanceId
      if (!instanceId) {
        const instance = await this.workflowService.createInstance(
          {
            workflowDefinitionKey: PURCHASE_REQUEST_WORKFLOW_KEY,
            subjectType: 'purchase_request',
            subjectId: row.id,
          },
          actorId,
          organizationId,
          db,
        )
        instanceId = instance.id
      }

      await this.workflowService.executeTransition(
        instanceId,
        'submit',
        { comment: input.comment ?? null },
        actorId,
        organizationId,
        db,
      )

      const updated = await updatePurchaseRequestIn(db, row.id, {
        workflowInstanceId: instanceId,
        status: PURCHASE_REQUEST_STATUS.SUBMITTED,
      })
      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'procurement.purchase_request.submitted',
          resourceType: 'purchase_request',
          resourceId: row.id,
          metadata: {
            number: row.number,
            requesterId: row.requesterId,
            comment: input.comment ?? null,
          },
        },
        db,
      )
      if (!updated) throw new NotFoundException('Purchase request not found')
      return this.toRequestView(updated, items)
    })
  }

  async reviewPurchaseRequest(
    id: string,
    decision: 'approve' | 'reject',
    input: { comment?: string },
    actorId: string,
    organizationId: string,
  ): Promise<PurchaseRequestView> {
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const row = await this.requirePurchaseRequestForUpdate(db, id, organizationId)
      if (row.status !== PURCHASE_REQUEST_STATUS.SUBMITTED) {
        throw new BadRequestException(
          `Only submitted purchase requests can be ${decision}d (current status: ${row.status})`,
        )
      }
      if (!row.workflowInstanceId) {
        throw new BadRequestException('Purchase request has no workflow instance')
      }

      await this.workflowService.executeTransition(
        row.workflowInstanceId,
        decision,
        { comment: input.comment ?? null },
        actorId,
        organizationId,
        db,
      )

      const nextStatus =
        decision === 'approve' ? PURCHASE_REQUEST_STATUS.APPROVED : PURCHASE_REQUEST_STATUS.REJECTED
      const updated = await updatePurchaseRequestIn(db, row.id, { status: nextStatus })
      const action =
        decision === 'approve'
          ? 'procurement.purchase_request.approved'
          : 'procurement.purchase_request.rejected'
      await this.audit.record(
        {
          actorId,
          organizationId,
          action,
          resourceType: 'purchase_request',
          resourceId: row.id,
          metadata: {
            number: row.number,
            requesterId: row.requesterId,
            comment: input.comment ?? null,
          },
        },
        db,
      )
      if (!updated) throw new NotFoundException('Purchase request not found')
      const items = await findPurchaseRequestItems(db, row.id)
      return this.toRequestView(updated, items)
    })
  }

  // ---- Purchase Orders ----

  async listPurchaseOrders(organizationId: string): Promise<PurchaseOrderView[]> {
    const rows = await listPurchaseOrders(this.database.db, organizationId)
    const views = await Promise.all(rows.map(async (row) => this.toOrderView(row)))
    return views
  }

  async getPurchaseOrder(id: string, organizationId: string): Promise<PurchaseOrderView> {
    const row = await this.requirePurchaseOrder(id, organizationId)
    return this.toOrderView(row)
  }

  async createPurchaseOrder(
    input: {
      purchaseRequestId: string
      vendorId: string
      currency?: string
      items: { purchaseRequestItemId: string; quantity: number; unitPrice: number }[]
    },
    actorId: string,
    organizationId: string,
  ): Promise<PurchaseOrderView> {
    validatePurchaseOrderItems(input.items)
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const request = await this.requirePurchaseRequestForUpdate(
        db,
        input.purchaseRequestId,
        organizationId,
      )
      if (request.status !== PURCHASE_REQUEST_STATUS.APPROVED) {
        throw new BadRequestException(
          'A purchase order requires an approved purchase request (current status: ' +
            request.status +
            ')',
        )
      }

      const vendor = await findVendorById(db, input.vendorId)
      if (!vendor || vendor.organizationId !== organizationId) {
        throw new NotFoundException('Vendor not found')
      }
      if (vendor.status !== 'active') {
        throw new BadRequestException('Vendor must be active to create a purchase order')
      }

      const requestItems = await findPurchaseRequestItemsByIds(
        db,
        input.items.map((item) => item.purchaseRequestItemId),
      )
      const requestItemMap = new Map(requestItems.map((item) => [item.id, item]))
      const seenRequestItems = new Set<string>()
      for (const item of input.items) {
        if (seenRequestItems.has(item.purchaseRequestItemId)) {
          throw new BadRequestException('Duplicate purchase order item in request')
        }
        seenRequestItems.add(item.purchaseRequestItemId)
        const source = requestItemMap.get(item.purchaseRequestItemId)
        if (!source || source.purchaseRequestId !== request.id) {
          throw new BadRequestException(
            'Purchase order item does not belong to the purchase request',
          )
        }
        assertPositiveQuantity(item.quantity, 'Purchase order item')
        assertNonNegativePrice(item.unitPrice, 'Unit price')
        const outstanding =
          source.quantity -
          (await sumOrderedQuantityForRequestItem(db, request.id, item.purchaseRequestItemId))
        if (item.quantity > outstanding) {
          throw new BadRequestException(
            `Ordered quantity exceeds outstanding requested quantity for item '${source.description}' (outstanding: ${outstanding})`,
          )
        }
      }

      const number = await allocateDocumentNumber(db, organizationId, DOCUMENT_CODE_PO)
      const order = await createPurchaseOrderIn(db, {
        organizationId,
        vendorId: input.vendorId,
        purchaseRequestId: request.id,
        number,
        currency: input.currency ?? DEFAULT_CURRENCY,
        status: PURCHASE_ORDER_STATUS.DRAFT,
      })
      const itemRows = await createPurchaseOrderItemsIn(
        db,
        input.items.map((item) => {
          const source = requestItemMap.get(item.purchaseRequestItemId)!
          return {
            purchaseOrderId: order.id,
            purchaseRequestItemId: item.purchaseRequestItemId,
            description: source.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          }
        }),
      )
      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'procurement.purchase_order.created',
          resourceType: 'purchase_order',
          resourceId: order.id,
          metadata: { number: order.number, purchaseRequestId: request.id },
        },
        db,
      )
      return {
        ...(await this.toOrderView(order, db)),
        vendorName: vendor.name,
        purchaseRequestNumber: request.number,
        items: itemRows.map((item) => this.toOrderItemView(item)),
      }
    })
  }

  async issuePurchaseOrder(
    id: string,
    actorId: string,
    organizationId: string,
  ): Promise<PurchaseOrderView> {
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const order = await this.requirePurchaseOrderForUpdate(db, id, organizationId)
      if (order.status !== PURCHASE_ORDER_STATUS.DRAFT) {
        throw new BadRequestException(
          `Only draft purchase orders can be issued (current status: ${order.status})`,
        )
      }
      const items = await findPurchaseOrderItems(db, order.id)
      validatePurchaseOrderItems(items)

      const request = await this.requirePurchaseRequest(order.purchaseRequestId, organizationId, db)
      if (request.status !== PURCHASE_REQUEST_STATUS.APPROVED) {
        throw new BadRequestException('Cannot issue a purchase order for a non-approved request')
      }

      const updated = await updatePurchaseOrderIn(db, order.id, {
        status: PURCHASE_ORDER_STATUS.ISSUED,
        issuedAt: new Date(),
      })
      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'procurement.purchase_order.issued',
          resourceType: 'purchase_order',
          resourceId: order.id,
          metadata: { number: order.number, vendorId: order.vendorId, issuedAt: new Date() },
        },
        db,
      )
      if (!updated) throw new NotFoundException('Purchase order not found')
      const vendor = await findVendorById(db, order.vendorId)
      return {
        ...(await this.toOrderView(updated, db)),
        vendorName: vendor?.name ?? null,
        purchaseRequestNumber: request.number,
        items: items.map((item) => this.toOrderItemView(item)),
      }
    })
  }

  // ---- Goods Receipts ----

  async listGoodsReceipts(organizationId: string): Promise<GoodsReceiptView[]> {
    const rows = await listGoodsReceipts(this.database.db, organizationId)
    const views = await Promise.all(rows.map(async (row) => this.toReceiptView(row)))
    return views
  }

  async getGoodsReceipt(id: string, organizationId: string): Promise<GoodsReceiptView> {
    const row = await this.requireGoodsReceipt(id, organizationId)
    return this.toReceiptView(row)
  }

  async createGoodsReceipt(
    input: {
      purchaseOrderId: string
      receivedAt?: string
      note?: string
      items: { purchaseOrderItemId: string; quantity: number }[]
    },
    actorId: string,
    organizationId: string,
  ): Promise<GoodsReceiptView> {
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const order = await this.requirePurchaseOrderForUpdate(
        db,
        input.purchaseOrderId,
        organizationId,
      )
      if (order.status === PURCHASE_ORDER_STATUS.CANCELLED) {
        throw new BadRequestException('Cannot receive goods against a cancelled purchase order')
      }
      if (
        order.status !== PURCHASE_ORDER_STATUS.ISSUED &&
        order.status !== PURCHASE_ORDER_STATUS.PARTIALLY_RECEIVED
      ) {
        throw new BadRequestException(
          `Cannot receive goods against a purchase order in status '${order.status}'`,
        )
      }
      if (!input.items || input.items.length === 0) {
        throw new BadRequestException('A goods receipt must contain at least one item')
      }

      const orderItems = await findPurchaseOrderItemsByIds(
        db,
        input.items.map((item) => item.purchaseOrderItemId),
      )
      const orderItemMap = new Map(orderItems.map((item) => [item.id, item]))
      const seen = new Set<string>()
      for (const item of input.items) {
        assertPositiveQuantity(item.quantity, 'Goods receipt item')
        if (seen.has(item.purchaseOrderItemId)) {
          throw new BadRequestException('Duplicate goods receipt item')
        }
        seen.add(item.purchaseOrderItemId)
        const target = orderItemMap.get(item.purchaseOrderItemId)
        if (!target || target.purchaseOrderId !== order.id) {
          throw new BadRequestException('Goods receipt item does not belong to the purchase order')
        }
        const outstanding = target.quantity - target.receivedQuantity
        if (item.quantity > outstanding) {
          throw new BadRequestException(
            `Received quantity cannot exceed outstanding quantity for item '${target.description}' (outstanding: ${outstanding})`,
          )
        }
      }

      const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date()
      const number = await allocateDocumentNumber(db, organizationId, DOCUMENT_CODE_GR)
      const receipt = await createGoodsReceiptIn(db, {
        organizationId,
        purchaseOrderId: order.id,
        number,
        receivedBy: actorId,
        receivedAt,
        note: input.note?.trim() || null,
      })
      const itemRows = await createGoodsReceiptItemsIn(
        db,
        input.items.map((item) => {
          const target = orderItemMap.get(item.purchaseOrderItemId)!
          return {
            goodsReceiptId: receipt.id,
            purchaseOrderItemId: item.purchaseOrderItemId,
            description: target.description,
            quantity: item.quantity,
          }
        }),
      )
      void itemRows

      for (const item of input.items) {
        await incrementReceivedQuantity(db, item.purchaseOrderItemId, item.quantity)
      }

      const refreshedItems = await findPurchaseOrderItems(db, order.id)
      const allFullyReceived = refreshedItems.every(
        (item) => item.receivedQuantity >= item.quantity,
      )
      const anyReceived = refreshedItems.some((item) => item.receivedQuantity > 0)
      const nextStatus = allFullyReceived
        ? PURCHASE_ORDER_STATUS.RECEIVED
        : anyReceived
          ? PURCHASE_ORDER_STATUS.PARTIALLY_RECEIVED
          : order.status
      if (nextStatus !== order.status) {
        await updatePurchaseOrderIn(db, order.id, { status: nextStatus })
      }

      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'procurement.goods_receipt.created',
          resourceType: 'goods_receipt',
          resourceId: receipt.id,
          metadata: {
            number: receipt.number,
            purchaseOrderId: order.id,
            purchaseOrderNumber: order.number,
            receivedAt,
          },
        },
        db,
      )

      return this.toReceiptView(receipt, db)
    })
  }

  // ---- helpers ----

  private async requireVendor(id: string, organizationId: string) {
    const row = await findVendorById(this.database.db, id)
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Vendor not found')
    }
    return row
  }

  private async requirePurchaseRequest(
    id: string,
    organizationId: string,
    db: Db = this.database.db,
  ) {
    const row = await findPurchaseRequestById(db, id)
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Purchase request not found')
    }
    return row
  }

  private async requirePurchaseRequestForUpdate(db: Db, id: string, organizationId: string) {
    const row = await findPurchaseRequestForUpdate(db, id)
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Purchase request not found')
    }
    return row
  }

  private async requirePurchaseOrder(id: string, organizationId: string) {
    const row = await findPurchaseOrderById(this.database.db, id)
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Purchase order not found')
    }
    return row
  }

  private async requirePurchaseOrderForUpdate(db: Db, id: string, organizationId: string) {
    const row = await findPurchaseOrderForUpdate(db, id)
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Purchase order not found')
    }
    return row
  }

  private async requireGoodsReceipt(id: string, organizationId: string) {
    const row = await findGoodsReceiptById(this.database.db, id)
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Goods receipt not found')
    }
    return row
  }

  private async toOrderView(
    row: PurchaseOrderType,
    db: Db = this.database.db,
  ): Promise<PurchaseOrderView> {
    const [vendor, request, items] = await Promise.all([
      findVendorById(db, row.vendorId),
      findPurchaseRequestById(db, row.purchaseRequestId),
      findPurchaseOrderItems(db, row.id),
    ])
    return {
      id: row.id,
      organizationId: row.organizationId,
      number: row.number,
      vendorId: row.vendorId,
      vendorName: vendor?.name ?? null,
      purchaseRequestId: row.purchaseRequestId,
      purchaseRequestNumber: request?.number ?? null,
      currency: row.currency,
      status: row.status,
      issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items: items.map((item) => this.toOrderItemView(item)),
    }
  }

  private async toReceiptView(
    row: GoodsReceiptType,
    db: Db = this.database.db,
  ): Promise<GoodsReceiptView> {
    const [order, items] = await Promise.all([
      findPurchaseOrderById(db, row.purchaseOrderId),
      findGoodsReceiptItems(db, row.id),
    ])
    return {
      id: row.id,
      organizationId: row.organizationId,
      number: row.number,
      purchaseOrderId: row.purchaseOrderId,
      purchaseOrderNumber: order?.number ?? null,
      receivedBy: row.receivedBy,
      receivedAt: row.receivedAt.toISOString(),
      note: row.note ?? null,
      createdAt: row.createdAt.toISOString(),
      items: items.map((item) => ({
        id: item.id,
        purchaseOrderItemId: item.purchaseOrderItemId,
        description: item.description,
        quantity: item.quantity,
      })),
    }
  }

  private toVendorView(row: VendorRowType): VendorView {
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      code: row.code,
      email: row.email ?? null,
      phone: row.phone ?? null,
      address: row.address ?? null,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toRequestView(
    row: PurchaseRequestRowType,
    items: PurchaseRequestItemRowType[],
  ): PurchaseRequestView {
    return {
      id: row.id,
      organizationId: row.organizationId,
      number: row.number,
      title: row.title,
      description: row.description ?? null,
      currency: row.currency,
      status: row.status,
      requesterId: row.requesterId,
      workflowInstanceId: row.workflowInstanceId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items: items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit ?? null,
        estimatedUnitPrice: item.estimatedUnitPrice,
      })),
    }
  }

  private toOrderItemView(row: PurchaseOrderItemRowType): PurchaseOrderItemView {
    return {
      id: row.id,
      purchaseRequestItemId: row.purchaseRequestItemId,
      description: row.description,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      receivedQuantity: row.receivedQuantity,
    }
  }
}

type PurchaseOrderType = import('./procurement.schema.js').PurchaseOrderRow
type GoodsReceiptType = import('./procurement.schema.js').GoodsReceiptRow
type VendorRowType = import('./procurement.schema.js').VendorRow
type PurchaseRequestRowType = import('./procurement.schema.js').PurchaseRequestRow
type PurchaseRequestItemRowType = import('./procurement.schema.js').PurchaseRequestItemRow
type PurchaseOrderItemRowType = import('./procurement.schema.js').PurchaseOrderItemRow
