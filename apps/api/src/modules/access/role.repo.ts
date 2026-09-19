import { and, eq, inArray } from 'drizzle-orm'
import { type Db } from '@reka/database'
import { permissions } from './permission.schema.js'
import { rolePermissions } from './role-permission.schema.js'
import { roles } from './role.schema.js'

export type RoleRow = typeof roles.$inferSelect

export interface CreateRoleInput {
  organizationId: string
  key: string
  name: string
  system?: boolean
}

export async function createRole(db: Db, input: CreateRoleInput): Promise<RoleRow> {
  const rows = await db
    .insert(roles)
    .values({ ...input, system: input.system ?? false })
    .returning()
  return rows[0]
}

export async function findRoleById(db: Db, id: string): Promise<RoleRow | undefined> {
  const rows = await db.select().from(roles).where(eq(roles.id, id)).limit(1)
  return rows[0]
}

export async function findRolesByOrganization(db: Db, organizationId: string): Promise<RoleRow[]> {
  return db.select().from(roles).where(eq(roles.organizationId, organizationId))
}

export async function findSystemRoleByKey(
  db: Db,
  organizationId: string,
  key: string,
): Promise<RoleRow | undefined> {
  const rows = await db
    .select()
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), eq(roles.key, key)))
    .limit(1)
  return rows[0]
}

export async function grantRolePermissions(
  db: Db,
  roleId: string,
  permissionIds: string[],
): Promise<void> {
  if (permissionIds.length === 0) {
    return
  }
  await db
    .insert(rolePermissions)
    .values(permissionIds.map((permissionId) => ({ roleId, permissionId })))
    .onConflictDoNothing()
}

export async function findPermissionKeysByRoleIds(db: Db, roleIds: string[]): Promise<string[]> {
  if (roleIds.length === 0) {
    return []
  }
  const rows = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(inArray(rolePermissions.roleId, roleIds))
  return rows.map((row) => row.key)
}
