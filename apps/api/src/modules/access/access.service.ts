import { Inject, Injectable } from '@nestjs/common'
import type { OnModuleInit } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Database, Db } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import { organizations } from '../organization/organization.schema.js'
import { organizationMembers } from '../organization/organization-member.schema.js'
import { ensurePermissions, findPermissionsByKeys } from './permission.repo.js'
import {
  createRole,
  findPermissionKeysByRoleIds,
  findSystemRoleByKey,
  grantRolePermissions,
  type RoleRow,
} from './role.repo.js'

export const OWNER_ROLE_KEY = 'owner'
export const MEMBER_ROLE_KEY = 'member'

export const permissionCatalog: Record<string, string> = {
  'organization.read': 'Read organization details',
  'organization.update': 'Update organization settings',
  'organization.members.read': 'List organization members',
  'organization.members.manage': 'Add and update organization members',
  'organization.roles.read': 'List organization roles',
  'module.read': 'Read module status',
  'module.manage': 'Enable and disable modules',
  'workflow.definition.read': 'Read workflow definitions',
  'workflow.definition.manage': 'Create and manage workflow definitions',
  'workflow.instance.read': 'Read workflow instances and history',
  'workflow.instance.create': 'Create workflow instances',
  'workflow.instance.transition': 'Execute workflow transitions',
  'audit.read': 'Read audit logs',
  'procurement.vendor.read': 'Read vendors',
  'procurement.vendor.manage': 'Create and update vendors',
  'procurement.purchase_request.read': 'Read purchase requests',
  'procurement.purchase_request.create': 'Create purchase requests',
  'procurement.purchase_request.submit': 'Submit purchase requests',
  'procurement.purchase_request.approve': 'Approve purchase requests',
  'procurement.purchase_request.reject': 'Reject purchase requests',
  'procurement.purchase_order.read': 'Read purchase orders',
  'procurement.purchase_order.create': 'Create purchase orders',
  'procurement.purchase_order.issue': 'Issue purchase orders',
  'procurement.goods_receipt.read': 'Read goods receipts',
  'procurement.goods_receipt.create': 'Create goods receipts',
  'assets.read': 'Read assets',
  'assets.create': 'Create assets',
  'assets.update': 'Update assets',
  'assets.assign': 'Assign assets',
  'assets.return': 'Return assets',
  'assets.maintain': 'Put assets in maintenance',
  'assets.retire': 'Retire assets',
  'inventory.read': 'Read inventory items, warehouses, locations, and stock',
  'inventory.item.manage': 'Create and update inventory items',
  'inventory.warehouse.manage': 'Create and update warehouses and locations',
  'inventory.stock.receive': 'Receive stock from goods receipts',
  'inventory.stock.transfer': 'Transfer stock between locations',
  'inventory.stock.adjust': 'Adjust stock balances',
  'inventory.stock.issue': 'Issue stock',
}

@Injectable()
export class AccessService implements OnModuleInit {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onModuleInit(): Promise<void> {
    await this.seedCatalog()
    await this.backfillPlatformPermissions()
  }

  /**
   * Backfills platform permissions (module.*, workflow.*, audit.*) to existing
   * organization owner roles. Called once at startup; idempotent.
   */
  async backfillPlatformPermissions(): Promise<void> {
    const platformKeys = Object.keys(permissionCatalog).filter(
      (key) => key.startsWith('module.') || key.startsWith('workflow.') || key.startsWith('audit.'),
    )
    await this.backfillOwnerRolePermissions(this.database.db, platformKeys)
  }

  async seedCatalog(): Promise<void> {
    await ensurePermissions(
      this.database.db,
      Object.keys(permissionCatalog),
      (key) => permissionCatalog[key] ?? key,
    )
  }

  async createOrganizationRoles(db: Db, organizationId: string): Promise<RoleRow[]> {
    const owner = await createRole(db, {
      organizationId,
      key: OWNER_ROLE_KEY,
      name: 'Owner',
      system: true,
    })
    const member = await createRole(db, {
      organizationId,
      key: MEMBER_ROLE_KEY,
      name: 'Member',
      system: true,
    })
    const permissionRows = await findPermissionsByKeys(db, Object.keys(permissionCatalog))
    await grantRolePermissions(
      db,
      owner.id,
      permissionRows.map((row) => row.id),
    )
    return [owner, member]
  }

  async getRolePermissionKeys(db: Db, roleId: string): Promise<string[]> {
    return findPermissionKeysByRoleIds(db, [roleId])
  }

  /**
   * Ensures the given permission keys exist and grants them to the `owner`
   * role of every existing organization. Idempotent and non-destructive; used
   * by business modules at bootstrap so pre-existing organizations receive new
   * platform permissions without manual role edits.
   */
  async backfillOwnerRolePermissions(db: Db, keys: string[]): Promise<void> {
    if (keys.length === 0) return
    await ensurePermissions(db, keys, (key) => permissionCatalog[key] ?? key)
    const permissionRows = await findPermissionsByKeys(db, keys)
    const permissionIds = permissionRows.map((row) => row.id)
    if (permissionIds.length === 0) return

    const orgRows = await db.select({ id: organizations.id }).from(organizations)
    for (const org of orgRows) {
      const owner = await findSystemRoleByKey(db, org.id, OWNER_ROLE_KEY)
      if (owner) {
        await grantRolePermissions(db, owner.id, permissionIds)
      }
    }
  }

  async getUserPermissionKeys(db: Db, userId: string, organizationId: string): Promise<string[]> {
    const memberRows = await db
      .select({ roleId: organizationMembers.roleId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, 'active'),
        ),
      )

    if (memberRows.length === 0) return []

    const roleIds = memberRows.map((m) => m.roleId)
    return findPermissionKeysByRoleIds(db, roleIds)
  }

  getPermissionCatalog(): Record<string, string> {
    return permissionCatalog
  }
}
