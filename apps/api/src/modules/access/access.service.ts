import { Inject, Injectable } from '@nestjs/common'
import type { OnModuleInit } from '@nestjs/common'
import type { Database, Db } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import { ensurePermissions, findPermissionsByKeys } from './permission.repo.js'
import {
  createRole,
  findPermissionKeysByRoleIds,
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
}

@Injectable()
export class AccessService implements OnModuleInit {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onModuleInit(): Promise<void> {
    await this.seedCatalog()
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
}
