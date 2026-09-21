import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Database, Db } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import type { OnModuleInit } from '@nestjs/common'
import { AccessService } from '../access/access.service.js'
import { AuditService } from '../audit/audit.service.js'
import { ProcurementService } from '../procurement/procurement.service.js'
import {
  createItem,
  createLocation,
  createWarehouse,
  decrementBalance,
  findItemById,
  findItemBySku,
  findLocationByCode,
  findLocationById,
  findMovementByReference,
  findWarehouseByCode,
  findWarehouseById,
  incrementBalance,
  insertMovement,
  listItems,
  listLocations,
  listStockBalances,
  listStockMovements,
  listWarehouses,
  updateItem,
  type StockBalanceView,
  type StockMovementView,
} from './inventory.repo.js'
import {
  assertValidAdjustmentReason,
  assertValidItemStatus,
  assertValidQuantity,
  ITEM_STATUS,
  MOVEMENT_TYPE,
  REFERENCE_TYPE,
  assertLocationEligibleForStock,
} from './inventory.rules.js'
import type {
  InventoryItemRow,
  StockBalanceRow,
  StockMovementRow,
  WarehouseLocationRow,
  WarehouseRow,
} from './inventory.schema.js'

interface InventoryDbError {
  code?: string
}

function isUniqueViolation(error: unknown): boolean {
  return (error as InventoryDbError)?.code === '23505'
}

export interface InventoryItemView {
  id: string
  organizationId: string
  sku: string
  name: string
  description: string | null
  unit: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface WarehouseView {
  id: string
  organizationId: string
  code: string
  name: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface LocationView {
  id: string
  organizationId: string
  warehouseId: string
  code: string
  name: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface StockBalanceResult {
  id: string
  organizationId: string
  inventoryItemId: string
  locationId: string
  quantity: number
  updatedAt: string
}

export interface StockMovementResult {
  id: string
  organizationId: string
  inventoryItemId: string
  locationId: string
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

export interface TransferResult {
  fromBalance: StockBalanceResult
  toBalance: StockBalanceResult
  movements: StockMovementResult[]
}

export interface OpenStockMovementResult extends StockMovementResult {
  balance: StockBalanceResult
}

export interface ReceiveResult extends OpenStockMovementResult {
  goodsReceiptNumber: string
  goodsReceiptItemId: string
}

@Injectable()
export class InventoryService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly procurement: ProcurementService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed()
  }

  async seed(): Promise<void> {
    const permissionKeys = Object.keys(this.access.getPermissionCatalog()).filter((key) =>
      key.startsWith('inventory.'),
    )
    await this.access.backfillOwnerRolePermissions(this.database.db, permissionKeys)
  }

  // ---- Items ----

  async listItems(organizationId: string): Promise<InventoryItemView[]> {
    const rows = await listItems(this.database.db, organizationId)
    return rows.map((row) => this.toItemView(row))
  }

  async getItem(id: string, organizationId: string): Promise<InventoryItemView> {
    return this.toItemView(await this.requireItem(this.database.db, id, organizationId))
  }

  async createItem(
    input: { sku: string; name: string; description?: string; unit?: string; status?: string },
    actorId: string,
    organizationId: string,
  ): Promise<InventoryItemView> {
    const sku = input.sku.trim().toUpperCase()
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const existing = await findItemBySku(db, organizationId, sku)
      if (existing) {
        throw new ConflictException(`SKU '${sku}' is already in use`)
      }
      const row = await createItem(db, {
        organizationId,
        sku,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        unit: input.unit?.trim() || 'pcs',
        status: input.status ?? ITEM_STATUS.ACTIVE,
      })
      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'inventory.item.created',
          resourceType: 'inventory_item',
          resourceId: row.id,
          metadata: { sku: row.sku, name: row.name, unit: row.unit },
        },
        db,
      )
      return this.toItemView(row)
    })
  }

  async updateItem(
    id: string,
    input: { name?: string; description?: string; unit?: string; status?: string },
    actorId: string,
    organizationId: string,
  ): Promise<InventoryItemView> {
    const existing = await this.requireItem(this.database.db, id, organizationId)
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const patch: Record<string, string> = {}
      if (input.name !== undefined) patch.name = input.name.trim()
      if (input.description !== undefined) patch.description = input.description.trim()
      if (input.unit !== undefined) patch.unit = input.unit.trim()
      if (input.status !== undefined) {
        assertValidItemStatus(input.status)
        patch.status = input.status
      }
      const row = await updateItem(db, id, patch)
      if (!row) throw new NotFoundException('Inventory item not found')
      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'inventory.item.updated',
          resourceType: 'inventory_item',
          resourceId: id,
          metadata: { previousName: existing.name, currentName: row.name },
        },
        db,
      )
      return this.toItemView(row)
    })
  }

  // ---- Warehouses ----

  async listWarehouses(organizationId: string): Promise<WarehouseView[]> {
    const rows = await listWarehouses(this.database.db, organizationId)
    return rows.map((row) => this.toWarehouseView(row))
  }

  async getWarehouse(
    id: string,
    organizationId: string,
  ): Promise<{ warehouse: WarehouseView; locations: LocationView[] }> {
    const warehouse = await this.requireWarehouse(this.database.db, id, organizationId)
    const locations = await listLocations(this.database.db, organizationId, warehouse.id)
    return {
      warehouse: this.toWarehouseView(warehouse),
      locations: locations.map(this.toLocationView),
    }
  }

  async createWarehouse(
    input: { code: string; name: string; status?: string },
    actorId: string,
    organizationId: string,
  ): Promise<WarehouseView> {
    const code = input.code.trim().toUpperCase()
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const existing = await findWarehouseByCode(db, organizationId, code)
      if (existing) {
        throw new ConflictException(`Warehouse code '${code}' is already in use`)
      }
      const row = await createWarehouse(db, {
        organizationId,
        code,
        name: input.name.trim(),
        status: input.status ?? 'ACTIVE',
      })
      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'inventory.warehouse.created',
          resourceType: 'warehouse',
          resourceId: row.id,
          metadata: { code: row.code, name: row.name },
        },
        db,
      )
      return this.toWarehouseView(row)
    })
  }

  // ---- Locations ----

  async listLocations(organizationId: string, warehouseId?: string): Promise<LocationView[]> {
    const rows = await listLocations(this.database.db, organizationId, warehouseId)
    return rows.map((row) => this.toLocationView(row))
  }

  async createLocation(
    input: { warehouseId: string; code: string; name: string; status?: string },
    actorId: string,
    organizationId: string,
  ): Promise<LocationView> {
    const code = input.code.trim().toUpperCase()
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const warehouse = await findWarehouseById(db, input.warehouseId)
      if (!warehouse || warehouse.organizationId !== organizationId) {
        throw new NotFoundException('Warehouse not found')
      }
      const existing = await findLocationByCode(db, input.warehouseId, code)
      if (existing) {
        throw new ConflictException(`Location code '${code}' already exists in this warehouse`)
      }
      const row = await createLocation(db, {
        organizationId,
        warehouseId: warehouse.id,
        code,
        name: input.name.trim(),
        status: input.status ?? 'ACTIVE',
      })
      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'inventory.location.created',
          resourceType: 'warehouse_location',
          resourceId: row.id,
          metadata: { warehouseId: warehouse.id, warehouseCode: warehouse.code, code: row.code },
        },
        db,
      )
      return this.toLocationView(row)
    })
  }

  // ---- Stock queries ----

  async listStock(
    organizationId: string,
    filters: { itemId?: string; locationId?: string; warehouseId?: string },
  ): Promise<StockBalanceView[]> {
    return listStockBalances(this.database.db, organizationId, filters)
  }

  async listMovements(
    organizationId: string,
    filters: { itemId?: string; locationId?: string; warehouseId?: string; type?: string },
  ): Promise<StockMovementView[]> {
    return listStockMovements(this.database.db, organizationId, filters)
  }

  // ---- Receive ----

  async receiveStock(
    input: {
      goodsReceiptItemId: string
      inventoryItemId: string
      locationId: string
      quantity: number
      notes?: string
    },
    actorId: string,
    organizationId: string,
  ): Promise<ReceiveResult> {
    assertValidQuantity(input.quantity, 'Quantity')
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const gr = await this.procurement.getGoodsReceiptItemForStock(
        db,
        organizationId,
        input.goodsReceiptItemId,
      )
      const item = await this.requireItem(db, input.inventoryItemId, organizationId)
      const location = await this.requireLocation(db, input.locationId, organizationId)
      assertLocationEligibleForStock(location.status, location.code, item.status)

      if (input.quantity !== gr.goodsReceiptItem.quantity) {
        throw new BadRequestException(
          `Received quantity must match the goods receipt item quantity (${gr.goodsReceiptItem.quantity})`,
        )
      }

      const existing = await findMovementByReference(
        db,
        organizationId,
        REFERENCE_TYPE.GOODS_RECEIPT,
        gr.goodsReceiptItem.id,
      )
      if (existing) {
        throw new ConflictException(
          'This goods receipt item has already been received into inventory',
        )
      }

      const balance = await incrementBalance(
        db,
        organizationId,
        item.id,
        location.id,
        input.quantity,
      )

      let movement: StockMovementRow
      try {
        movement = await insertMovement(db, {
          organizationId,
          inventoryItemId: item.id,
          locationId: location.id,
          type: MOVEMENT_TYPE.RECEIPT,
          quantity: input.quantity,
          referenceType: REFERENCE_TYPE.GOODS_RECEIPT,
          referenceId: gr.goodsReceiptItem.id,
          notes: input.notes?.trim() || null,
          actorId,
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            'This goods receipt item has already been received into inventory',
          )
        }
        throw error
      }

      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'inventory.stock.received',
          resourceType: 'stock_movement',
          resourceId: movement.id,
          metadata: {
            inventoryItemId: item.id,
            sku: item.sku,
            locationId: location.id,
            quantity: input.quantity,
            goodsReceiptItemId: gr.goodsReceiptItem.id,
            goodsReceiptNumber: gr.goodsReceipt.number,
          },
        },
        db,
      )

      return {
        ...this.toMovementResult(movement),
        balance: this.toBalanceResult(balance),
        goodsReceiptNumber: gr.goodsReceipt.number,
        goodsReceiptItemId: gr.goodsReceiptItem.id,
      }
    })
  }

  // ---- Transfer ----

  async transferStock(
    input: {
      inventoryItemId: string
      fromLocationId: string
      toLocationId: string
      quantity: number
      notes?: string
    },
    actorId: string,
    organizationId: string,
  ): Promise<TransferResult> {
    assertValidQuantity(input.quantity, 'Quantity')
    if (input.fromLocationId === input.toLocationId) {
      throw new BadRequestException('Source and destination locations must be different')
    }
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const item = await this.requireItem(db, input.inventoryItemId, organizationId)
      const source = await this.requireLocation(db, input.fromLocationId, organizationId)
      const destination = await this.requireLocation(db, input.toLocationId, organizationId)
      assertLocationEligibleForStock(source.status, source.code, item.status)
      assertLocationEligibleForStock(destination.status, destination.code, item.status)

      let fromBalance!: StockBalanceRow
      let toBalance!: StockBalanceRow
      const [firstId, secondId] = [source.id, destination.id].sort()
      for (const locationId of [firstId, secondId]) {
        if (locationId === source.id) {
          const decreased = await decrementBalance(
            db,
            organizationId,
            item.id,
            source.id,
            input.quantity,
          )
          if (!decreased) {
            throw new BadRequestException(
              `Insufficient stock at location '${source.code}' for item '${item.sku}'`,
            )
          }
          fromBalance = decreased
        } else {
          toBalance = await incrementBalance(
            db,
            organizationId,
            item.id,
            destination.id,
            input.quantity,
          )
        }
      }

      const outMovement = await insertMovement(db, {
        organizationId,
        inventoryItemId: item.id,
        locationId: source.id,
        type: MOVEMENT_TYPE.TRANSFER_OUT,
        quantity: input.quantity,
        referenceType: REFERENCE_TYPE.TRANSFER,
        notes: input.notes?.trim() || null,
        actorId,
      })
      const inMovement = await insertMovement(db, {
        organizationId,
        inventoryItemId: item.id,
        locationId: destination.id,
        type: MOVEMENT_TYPE.TRANSFER_IN,
        quantity: input.quantity,
        referenceType: REFERENCE_TYPE.TRANSFER,
        referenceId: outMovement.id,
        notes: input.notes?.trim() || null,
        actorId,
      })

      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'inventory.stock.transferred',
          resourceType: 'stock_movement',
          resourceId: outMovement.id,
          metadata: {
            inventoryItemId: item.id,
            sku: item.sku,
            fromLocationId: source.id,
            fromLocationCode: source.code,
            toLocationId: destination.id,
            toLocationCode: destination.code,
            quantity: input.quantity,
            transferInMovementId: inMovement.id,
          },
        },
        db,
      )

      return {
        fromBalance: this.toBalanceResult(fromBalance),
        toBalance: this.toBalanceResult(toBalance),
        movements: [this.toMovementResult(outMovement), this.toMovementResult(inMovement)],
      }
    })
  }

  // ---- Adjustment ----

  async adjustStock(
    input: {
      inventoryItemId: string
      locationId: string
      quantity: number
      reason: string
      notes?: string
    },
    actorId: string,
    organizationId: string,
  ): Promise<OpenStockMovementResult> {
    if (input.quantity === 0) {
      throw new BadRequestException('Adjustment quantity must be non-zero')
    }
    assertValidQuantity(Math.abs(input.quantity), 'Quantity')
    assertValidAdjustmentReason(input.reason)
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const item = await this.requireItem(db, input.inventoryItemId, organizationId)
      const location = await this.requireLocation(db, input.locationId, organizationId)
      assertLocationEligibleForStock(location.status, location.code, item.status)

      const direction = input.quantity > 0 ? 'IN' : 'OUT'
      const delta = Math.abs(input.quantity)
      const type = direction === 'IN' ? MOVEMENT_TYPE.ADJUSTMENT_IN : MOVEMENT_TYPE.ADJUSTMENT_OUT

      let balance: StockBalanceRow
      if (direction === 'IN') {
        balance = await incrementBalance(db, organizationId, item.id, location.id, delta)
      } else {
        const decreased = await decrementBalance(db, organizationId, item.id, location.id, delta)
        if (!decreased) {
          throw new BadRequestException(
            `Insufficient stock at location '${location.code}' for item '${item.sku}'`,
          )
        }
        balance = decreased
      }

      const movement = await insertMovement(db, {
        organizationId,
        inventoryItemId: item.id,
        locationId: location.id,
        type,
        quantity: delta,
        referenceType: REFERENCE_TYPE.ADJUSTMENT,
        reason: input.reason,
        notes: input.notes?.trim() || null,
        actorId,
      })

      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'inventory.stock.adjusted',
          resourceType: 'stock_movement',
          resourceId: movement.id,
          metadata: {
            inventoryItemId: item.id,
            sku: item.sku,
            locationId: location.id,
            direction,
            quantity: delta,
            reason: input.reason,
          },
        },
        db,
      )

      return {
        ...this.toMovementResult(movement),
        balance: this.toBalanceResult(balance),
      }
    })
  }

  // ---- Issue ----

  async issueStock(
    input: {
      inventoryItemId: string
      locationId: string
      quantity: number
      reason?: string
      reference?: string
      notes?: string
    },
    actorId: string,
    organizationId: string,
  ): Promise<OpenStockMovementResult> {
    assertValidQuantity(input.quantity, 'Quantity')
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db
      const item = await this.requireItem(db, input.inventoryItemId, organizationId)
      const location = await this.requireLocation(db, input.locationId, organizationId)
      assertLocationEligibleForStock(location.status, location.code, item.status)

      const decreased = await decrementBalance(
        db,
        organizationId,
        item.id,
        location.id,
        input.quantity,
      )
      if (!decreased) {
        throw new BadRequestException(
          `Insufficient stock at location '${location.code}' for item '${item.sku}'`,
        )
      }

      const movement = await insertMovement(db, {
        organizationId,
        inventoryItemId: item.id,
        locationId: location.id,
        type: MOVEMENT_TYPE.ISSUE,
        quantity: input.quantity,
        referenceType: REFERENCE_TYPE.ISSUE,
        reason: input.reason?.trim() || null,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        actorId,
      })

      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'inventory.stock.issued',
          resourceType: 'stock_movement',
          resourceId: movement.id,
          metadata: {
            inventoryItemId: item.id,
            sku: item.sku,
            locationId: location.id,
            quantity: input.quantity,
            reason: input.reason ?? null,
          },
        },
        db,
      )

      return {
        ...this.toMovementResult(movement),
        balance: this.toBalanceResult(decreased),
      }
    })
  }

  // ---- Helpers ----

  private async requireItem(db: Db, id: string, organizationId: string): Promise<InventoryItemRow> {
    const row = await findItemById(db, id)
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Inventory item not found')
    }
    return row
  }

  private async requireWarehouse(
    db: Db,
    id: string,
    organizationId: string,
  ): Promise<WarehouseRow> {
    const row = await findWarehouseById(db, id)
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Warehouse not found')
    }
    return row
  }

  private async requireLocation(
    db: Db,
    id: string,
    organizationId: string,
  ): Promise<WarehouseLocationRow> {
    const row = await findLocationById(db, id)
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Location not found')
    }
    return row
  }

  private toItemView(row: InventoryItemRow): InventoryItemView {
    return {
      id: row.id,
      organizationId: row.organizationId,
      sku: row.sku,
      name: row.name,
      description: row.description,
      unit: row.unit,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toWarehouseView(row: WarehouseRow): WarehouseView {
    return {
      id: row.id,
      organizationId: row.organizationId,
      code: row.code,
      name: row.name,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toLocationView(row: WarehouseLocationRow): LocationView {
    return {
      id: row.id,
      organizationId: row.organizationId,
      warehouseId: row.warehouseId,
      code: row.code,
      name: row.name,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toBalanceResult(row: StockBalanceRow): StockBalanceResult {
    return {
      id: row.id,
      organizationId: row.organizationId,
      inventoryItemId: row.inventoryItemId,
      locationId: row.locationId,
      quantity: row.quantity,
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toMovementResult(row: StockMovementRow): StockMovementResult {
    return {
      id: row.id,
      organizationId: row.organizationId,
      inventoryItemId: row.inventoryItemId,
      locationId: row.locationId,
      type: row.type,
      quantity: row.quantity,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      reason: row.reason,
      reference: row.reference,
      notes: row.notes,
      actorId: row.actorId,
      createdAt: row.createdAt.toISOString(),
    }
  }
}
