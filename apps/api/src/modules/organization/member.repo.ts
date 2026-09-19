import { and, count, eq } from 'drizzle-orm'
import { type Db } from '@reka/database'
import { roles } from '../access/role.schema.js'
import { usersTable } from '../identity/user.schema.js'
import { organizationMembers } from './organization-member.schema.js'

export type OrganizationMemberRow = typeof organizationMembers.$inferSelect

export interface AddMemberInput {
  organizationId: string
  userId: string
  roleId: string
}

export async function addMember(db: Db, input: AddMemberInput): Promise<OrganizationMemberRow> {
  const rows = await db.insert(organizationMembers).values(input).returning()
  return rows[0]
}

export async function findMemberByOrgAndUser(
  db: Db,
  organizationId: string,
  userId: string,
): Promise<OrganizationMemberRow | undefined> {
  const rows = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
      ),
    )
    .limit(1)
  return rows[0]
}

export async function findMemberById(
  db: Db,
  id: string,
): Promise<OrganizationMemberRow | undefined> {
  const rows = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.id, id))
    .limit(1)
  return rows[0]
}

export interface MemberView {
  id: string
  status: string
  roleId: string
  roleKey: string
  userId: string
  email: string
  displayName: string
  createdAt: Date
}

export async function listMembers(db: Db, organizationId: string): Promise<MemberView[]> {
  const rows = await db
    .select({
      id: organizationMembers.id,
      status: organizationMembers.status,
      roleId: organizationMembers.roleId,
      roleKey: roles.key,
      userId: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      createdAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(usersTable, eq(organizationMembers.userId, usersTable.id))
    .innerJoin(roles, eq(organizationMembers.roleId, roles.id))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(organizationMembers.createdAt)
  return rows
}

export async function updateMember(
  db: Db,
  id: string,
  patch: { roleId?: string; status?: string },
): Promise<OrganizationMemberRow | undefined> {
  const rows = await db
    .update(organizationMembers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(organizationMembers.id, id))
    .returning()
  return rows[0]
}

export async function countMembersWithRole(
  db: Db,
  organizationId: string,
  roleId: string,
): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.roleId, roleId),
      ),
    )
  return Number(rows[0]?.count ?? 0)
}
