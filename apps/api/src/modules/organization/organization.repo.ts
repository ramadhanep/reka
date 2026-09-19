import { and, eq } from 'drizzle-orm'
import { type Db } from '@reka/database'
import { roles } from '../access/role.schema.js'
import { organizationMembers } from './organization-member.schema.js'
import { organizations } from './organization.schema.js'

export type OrganizationRow = typeof organizations.$inferSelect

export interface CreateOrganizationInput {
  name: string
  slug: string
}

export async function createOrganization(
  db: Db,
  input: CreateOrganizationInput,
): Promise<OrganizationRow> {
  const rows = await db.insert(organizations).values(input).returning()
  return rows[0]
}

export async function findOrganizationById(
  db: Db,
  id: string,
): Promise<OrganizationRow | undefined> {
  const rows = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1)
  return rows[0]
}

export async function findOrganizationBySlug(
  db: Db,
  slug: string,
): Promise<OrganizationRow | undefined> {
  const rows = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1)
  return rows[0]
}

export async function updateOrganization(
  db: Db,
  id: string,
  patch: { name?: string; slug?: string },
): Promise<OrganizationRow | undefined> {
  const rows = await db
    .update(organizations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(organizations.id, id))
    .returning()
  return rows[0]
}

export interface OrganizationWithRole {
  organization: OrganizationRow
  roleKey: string
}

export async function findOrganizationsByUser(
  db: Db,
  userId: string,
): Promise<OrganizationWithRole[]> {
  const rows = await db
    .select({
      organization: organizations,
      roleKey: roles.key,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .innerJoin(roles, eq(organizationMembers.roleId, roles.id))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, 'active')))
  return rows.map((row) => ({ organization: row.organization, roleKey: row.roleKey }))
}
