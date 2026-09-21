import { Inject, Injectable } from '@nestjs/common'
import type { OnModuleInit } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Database, Db } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import { organizations } from '../organization/organization.schema.js'
import { organizationMembers } from '../organization/organization-member.schema.js'
import { ensurePermissions, findPermissionsByKeys } from './permission.repo.js'
import { MEMBER_ROLE_KEY, OWNER_ROLE_KEY, permissionCatalog } from './permission-catalog.js'
import {
  createRole,
  findPermissionKeysByRoleIds,
  findSystemRoleByKey,
  grantRolePermissions,
  type RoleRow,
} from './role.repo.js'

export { MEMBER_ROLE_KEY, OWNER_ROLE_KEY, permissionCatalog } from './permission-catalog.js'

@Injectable()
export class AccessService implements OnModuleInit {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onModuleInit(): Promise<void> {
    await this.seedCatalog()
    await this.backfillPlatformPermissions()
  }

  /**
   * Backfills platform permissions (organization.*, module.*, workflow.*,
   * audit.*) to existing organization owner roles. Called once at startup;
   * idempotent. Organization permissions are included so owner roles created
   * before the organization permission set existed (and direct-DB seeded orgs)
   * receive member/role read+manage capabilities.
   */
  async backfillPlatformPermissions(): Promise<void> {
    const platformKeys = Object.keys(permissionCatalog).filter(
      (key) =>
        key.startsWith('organization.') ||
        key.startsWith('module.') ||
        key.startsWith('workflow.') ||
        key.startsWith('audit.'),
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
