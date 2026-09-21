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
import { AccessService } from '../access/access.service.js'
import { AuditService } from '../audit/audit.service.js'
import { assets, assetAssignments } from './assets.schema.js'
import {
  createAsset,
  createAssetAssignment,
  findActiveAssignmentByAsset,
  findAssetById,
  findAssetByTag,
  findAssetForUpdate,
  listAssetHistory,
  listAssets,
  updateAsset,
  updateAssetAssignment,
} from './assets.repo.js'
import {
  ASSET_STATUS,
  assertValidCategory,
  assertValidCurrency,
  canAssignAsset,
  canMaintainAsset,
  canRetireAsset,
  canReturnAsset,
  getNextStatusOnAssign,
  getNextStatusOnMaintenance,
  getNextStatusOnRetire,
  getNextStatusOnReturn,
} from './assets.rules.js'

const DEFAULT_CURRENCY = 'USD'

export interface AssetView {
  id: string
  organizationId: string
  assetTag: string
  name: string
  description: string | null
  category: string
  status: string
  serialNumber: string | null
  purchaseDate: string | null
  purchasePrice: number | null
  currency: string | null
  vendorId: string | null
  purchaseOrderId: string | null
  createdAt: string
  updatedAt: string
}

export interface AssetAssignmentView {
  id: string
  organizationId: string
  assetId: string
  assigneeUserId: string
  assignedAt: string
  returnedAt: string | null
  assignedBy: string
  returnedBy: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

@Injectable()
export class AssetsService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seed()
  }

  async seed(): Promise<void> {
    const permissionKeys = Object.keys(this.access.getPermissionCatalog()).filter((key) =>
      key.startsWith('assets.'),
    )
    await this.access.backfillOwnerRolePermissions(this.database.db, permissionKeys)
  }

  // ---- Assets CRUD ----

  async listAssets(organizationId: string): Promise<AssetView[]> {
    const rows = await listAssets(this.database.db, organizationId)
    return rows.map((row) => this.toAssetView(row))
  }

  async getAsset(id: string, organizationId: string): Promise<AssetView> {
    const row = await this.requireAsset(id, organizationId)
    return this.toAssetView(row)
  }

  async createAsset(
    input: {
      assetTag: string
      name: string
      description?: string
      category: string
      serialNumber?: string
      purchaseDate?: string
      purchasePrice?: number
      currency?: string
      vendorId?: string
      purchaseOrderId?: string
    },
    actorId: string,
    organizationId: string,
  ): Promise<AssetView> {
    assertValidCategory(input.category)

    if (input.purchasePrice !== undefined) {
      if (input.purchasePrice < 0) {
        throw new BadRequestException('Purchase price must be non-negative')
      }
    }

    if (input.currency) {
      assertValidCurrency(input.currency)
    }

    const currency = input.currency ?? (input.purchasePrice !== undefined ? DEFAULT_CURRENCY : null)

    if (input.vendorId) {
      // Vendor validation could be added here if needed
    }

    if (input.purchaseOrderId) {
      // Purchase order validation could be added here if needed
    }

    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db

      const existing = await findAssetByTag(db, organizationId, input.assetTag.trim().toUpperCase())
      if (existing) {
        throw new ConflictException(`Asset tag '${input.assetTag}' is already in use`)
      }

      const row = await createAsset(db, {
        organizationId,
        assetTag: input.assetTag.trim().toUpperCase(),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        category: input.category,
        status: ASSET_STATUS.AVAILABLE,
        serialNumber: input.serialNumber?.trim() || null,
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
        purchasePrice: input.purchasePrice ?? null,
        currency,
        vendorId: input.vendorId || null,
        purchaseOrderId: input.purchaseOrderId || null,
      })

      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'asset.created',
          resourceType: 'asset',
          resourceId: row.id,
          metadata: { assetTag: row.assetTag, name: row.name, category: row.category },
        },
        db,
      )

      return this.toAssetView(row)
    })
  }

  async updateAsset(
    id: string,
    input: {
      name?: string
      description?: string
      category?: string
      serialNumber?: string
      purchaseDate?: string
      purchasePrice?: number
      currency?: string
      vendorId?: string
      purchaseOrderId?: string
    },
    actorId: string,
    organizationId: string,
  ): Promise<AssetView> {
    const existing = await this.requireAsset(id, organizationId)

    if (input.category) {
      assertValidCategory(input.category)
    }

    if (input.purchasePrice !== undefined && input.purchasePrice < 0) {
      throw new BadRequestException('Purchase price must be non-negative')
    }

    if (input.currency) {
      assertValidCurrency(input.currency)
    }

    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db

      const patch: Record<string, unknown> = {}
      if (input.name !== undefined) patch.name = input.name.trim()
      if (input.description !== undefined) patch.description = input.description.trim() || null
      if (input.category !== undefined) patch.category = input.category
      if (input.serialNumber !== undefined) patch.serialNumber = input.serialNumber?.trim() || null
      if (input.purchaseDate !== undefined)
        patch.purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : null
      if (input.purchasePrice !== undefined) patch.purchasePrice = input.purchasePrice
      if (input.currency !== undefined) patch.currency = input.currency
      if (input.vendorId !== undefined) patch.vendorId = input.vendorId || null
      if (input.purchaseOrderId !== undefined) patch.purchaseOrderId = input.purchaseOrderId || null

      const row = await updateAsset(db, id, patch)
      if (!row) throw new NotFoundException('Asset not found')

      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'asset.updated',
          resourceType: 'asset',
          resourceId: id,
          metadata: { previousName: existing.name, currentName: row.name },
        },
        db,
      )

      return this.toAssetView(row)
    })
  }

  // ---- Asset Lifecycle Actions ----

  async assignAsset(
    id: string,
    input: {
      assigneeUserId: string
      notes?: string
    },
    actorId: string,
    organizationId: string,
  ): Promise<{ asset: AssetView; assignment: AssetAssignmentView }> {
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db

      const asset = await findAssetForUpdate(db, id)
      if (!asset || asset.organizationId !== organizationId) {
        throw new NotFoundException('Asset not found')
      }

      if (!canAssignAsset(asset.status)) {
        throw new BadRequestException(`Asset cannot be assigned in status '${asset.status}'`)
      }

      const activeAssignment = await findActiveAssignmentByAsset(db, id)
      if (activeAssignment) {
        throw new ConflictException('Asset is already assigned')
      }

      const assignment = await createAssetAssignment(db, {
        organizationId,
        assetId: id,
        assigneeUserId: input.assigneeUserId,
        assignedBy: actorId,
        notes: input.notes?.trim() || null,
      })

      const nextStatus = getNextStatusOnAssign(asset.status)
      await updateAsset(db, id, { status: nextStatus })

      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'asset.assigned',
          resourceType: 'asset',
          resourceId: id,
          metadata: { assigneeUserId: input.assigneeUserId, assignmentId: assignment.id },
        },
        db,
      )

      const updatedAsset = await findAssetById(db, id)
      return {
        asset: this.toAssetView(updatedAsset!),
        assignment: this.toAssignmentView(assignment),
      }
    })
  }

  async returnAsset(
    id: string,
    input: {
      notes?: string
    },
    actorId: string,
    organizationId: string,
  ): Promise<{ asset: AssetView; assignment: AssetAssignmentView }> {
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db

      const asset = await findAssetForUpdate(db, id)
      if (!asset || asset.organizationId !== organizationId) {
        throw new NotFoundException('Asset not found')
      }

      if (!canReturnAsset(asset.status)) {
        throw new BadRequestException(`Asset cannot be returned in status '${asset.status}'`)
      }

      const activeAssignment = await findActiveAssignmentByAsset(db, id)
      if (!activeAssignment) {
        throw new BadRequestException('Asset has no active assignment')
      }

      const updatedAssignment = await updateAssetAssignment(db, activeAssignment.id, {
        returnedAt: new Date(),
        returnedBy: actorId,
        notes: input.notes?.trim() || activeAssignment.notes,
      })

      const nextStatus = getNextStatusOnReturn(asset.status)
      await updateAsset(db, id, { status: nextStatus })

      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'asset.returned',
          resourceType: 'asset',
          resourceId: id,
          metadata: {
            assigneeUserId: activeAssignment.assigneeUserId,
            assignmentId: activeAssignment.id,
          },
        },
        db,
      )

      const updatedAsset = await findAssetById(db, id)
      return {
        asset: this.toAssetView(updatedAsset!),
        assignment: this.toAssignmentView(updatedAssignment!),
      }
    })
  }

  async startMaintenance(id: string, actorId: string, organizationId: string): Promise<AssetView> {
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db

      const asset = await findAssetForUpdate(db, id)
      if (!asset || asset.organizationId !== organizationId) {
        throw new NotFoundException('Asset not found')
      }

      if (!canMaintainAsset(asset.status)) {
        throw new BadRequestException(
          `Asset cannot be put in maintenance in status '${asset.status}'`,
        )
      }

      const activeAssignment = await findActiveAssignmentByAsset(db, id)
      if (activeAssignment) {
        throw new ConflictException(
          'Cannot start maintenance on an assigned asset. Return it first.',
        )
      }

      const nextStatus = getNextStatusOnMaintenance(asset.status)
      const row = await updateAsset(db, id, { status: nextStatus })

      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'asset.maintenance_started',
          resourceType: 'asset',
          resourceId: id,
          metadata: { previousStatus: asset.status },
        },
        db,
      )

      if (!row) throw new NotFoundException('Asset not found')
      return this.toAssetView(row)
    })
  }

  async retireAsset(id: string, actorId: string, organizationId: string): Promise<AssetView> {
    return this.database.db.transaction(async (tx) => {
      const db = tx as unknown as Db

      const asset = await findAssetForUpdate(db, id)
      if (!asset || asset.organizationId !== organizationId) {
        throw new NotFoundException('Asset not found')
      }

      if (!canRetireAsset(asset.status)) {
        throw new BadRequestException(`Asset is already retired`)
      }

      const activeAssignment = await findActiveAssignmentByAsset(db, id)
      if (activeAssignment) {
        throw new ConflictException('Cannot retire an assigned asset. Return it first.')
      }

      const nextStatus = getNextStatusOnRetire(asset.status)
      const row = await updateAsset(db, id, { status: nextStatus })

      await this.audit.record(
        {
          actorId,
          organizationId,
          action: 'asset.retired',
          resourceType: 'asset',
          resourceId: id,
          metadata: { previousStatus: asset.status },
        },
        db,
      )

      if (!row) throw new NotFoundException('Asset not found')
      return this.toAssetView(row)
    })
  }

  // ---- Asset History ----

  async getAssetHistory(id: string, organizationId: string): Promise<AssetAssignmentView[]> {
    await this.requireAsset(id, organizationId)
    const rows = await listAssetHistory(this.database.db, organizationId, id)
    return rows.map((row) => this.toAssignmentView(row))
  }

  // ---- Helpers ----

  private async requireAsset(
    id: string,
    organizationId: string,
  ): Promise<typeof assets.$inferSelect> {
    const row = await findAssetById(this.database.db, id)
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Asset not found')
    }
    return row
  }

  private toAssetView(row: typeof assets.$inferSelect): AssetView {
    return {
      id: row.id,
      organizationId: row.organizationId,
      assetTag: row.assetTag,
      name: row.name,
      description: row.description,
      category: row.category,
      status: row.status,
      serialNumber: row.serialNumber,
      purchaseDate: row.purchaseDate?.toISOString() ?? null,
      purchasePrice: row.purchasePrice ?? null,
      currency: row.currency,
      vendorId: row.vendorId,
      purchaseOrderId: row.purchaseOrderId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toAssignmentView(row: typeof assetAssignments.$inferSelect): AssetAssignmentView {
    return {
      id: row.id,
      organizationId: row.organizationId,
      assetId: row.assetId,
      assigneeUserId: row.assigneeUserId,
      assignedAt: row.assignedAt.toISOString(),
      returnedAt: row.returnedAt?.toISOString() ?? null,
      assignedBy: row.assignedBy,
      returnedBy: row.returnedBy ?? null,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
