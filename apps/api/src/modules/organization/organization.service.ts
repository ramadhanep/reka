import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { type Database, type Db } from '@reka/database'
import { slugify } from '../../common/slug.js'
import { DATABASE } from '../../common/database.token.js'
import { AccessService, OWNER_ROLE_KEY } from '../access/access.service.js'
import { AuditService } from '../audit/audit.service.js'
import { UserService } from '../identity/user.service.js'
import {
  addMember,
  countMembersWithRole,
  findMemberById,
  findMemberByOrgAndUser,
  listMembers,
  updateMember,
} from './member.repo.js'
import {
  createOrganization,
  findOrganizationById,
  findOrganizationBySlug,
  findOrganizationsByUser,
  updateOrganization,
  type OrganizationRow,
} from './organization.repo.js'
import { findRoleById, findRolesByOrganization } from '../access/role.repo.js'
import { canChangeMembership } from './member-policy.js'

export interface CreateOrganizationCommand {
  name: string
  slug?: string
  ownerUserId: string
}

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly users: UserService,
  ) {}

  async resolveSlug(db: Db, base: string): Promise<string> {
    for (let i = 1; ; i++) {
      const slug = i === 1 ? base : `${base}-${i}`
      const existing = await findOrganizationBySlug(db, slug)
      if (!existing) {
        return slug
      }
    }
  }

  async createIn(db: Db, command: CreateOrganizationCommand): Promise<OrganizationRow> {
    const slug = await this.resolveSlug(db, command.slug ?? slugify(command.name))
    const organization = await createOrganization(db, { name: command.name, slug })
    const roles = await this.access.createOrganizationRoles(db, organization.id)
    const owner = roles.find((role) => role.key === OWNER_ROLE_KEY)
    if (!owner) {
      throw new Error('owner role not created')
    }
    await addMember(db, {
      organizationId: organization.id,
      userId: command.ownerUserId,
      roleId: owner.id,
    })
    await this.audit.record(
      {
        actorId: command.ownerUserId,
        organizationId: organization.id,
        action: 'organization.created',
        resourceType: 'organization',
        resourceId: organization.id,
        metadata: { name: organization.name },
      },
      db,
    )
    return organization
  }

  async create(command: CreateOrganizationCommand): Promise<OrganizationRow> {
    return this.database.db.transaction(async (tx) => {
      return this.createIn(tx as unknown as Db, command)
    })
  }

  async listForUser(userId: string) {
    const rows = await findOrganizationsByUser(this.database.db, userId)
    return rows.map(({ organization, roleKey }) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      createdAt: organization.createdAt,
      roleKey,
    }))
  }

  async getForUser(userId: string, organizationId: string) {
    const organization = await findOrganizationById(this.database.db, organizationId)
    if (!organization) {
      throw new NotFoundException('Organization not found')
    }
    const membership = await findMemberByOrgAndUser(this.database.db, organizationId, userId)
    if (!membership || membership.status !== 'active') {
      throw new NotFoundException('Organization not found')
    }
    const role = await findRoleById(this.database.db, membership.roleId)
    if (!role) {
      throw new NotFoundException('Role not found')
    }
    const permissions = await this.access.getRolePermissionKeys(this.database.db, role.id)
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      createdAt: organization.createdAt,
      membership: {
        role: { key: role.key, name: role.name },
        permissions,
      },
    }
  }

  async update(organizationId: string, actorId: string, patch: { name?: string; slug?: string }) {
    const existing = await findOrganizationById(this.database.db, organizationId)
    if (!existing) {
      throw new NotFoundException('Organization not found')
    }
    const slug =
      patch.slug !== undefined && patch.slug !== existing.slug
        ? await this.resolveSlug(this.database.db, patch.slug)
        : existing.slug
    const updated = await updateOrganization(this.database.db, organizationId, {
      name: patch.name ?? existing.name,
      slug,
    })
    if (updated) {
      await this.audit.record({
        actorId,
        organizationId,
        action: 'organization.updated',
        resourceType: 'organization',
        resourceId: organizationId,
      })
    }
    return updated
  }

  async listMembers(organizationId: string) {
    return listMembers(this.database.db, organizationId)
  }

  async listRoles(organizationId: string) {
    const rows = await findRolesByOrganization(this.database.db, organizationId)
    return rows.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      system: role.system,
    }))
  }

  async addMember(
    organizationId: string,
    actorId: string,
    input: { email: string; roleId: string },
  ) {
    const role = await findRoleById(this.database.db, input.roleId)
    if (!role || role.organizationId !== organizationId) {
      throw new BadRequestException('Invalid role for this organization')
    }
    const user = await this.users.findOrCreatePendingUser(input.email)
    const existing = await findMemberByOrgAndUser(this.database.db, organizationId, user.id)
    if (existing) {
      throw new ConflictException('User is already a member')
    }
    const member = await addMember(this.database.db, {
      organizationId,
      userId: user.id,
      roleId: role.id,
    })
    await this.audit.record({
      actorId,
      organizationId,
      action: 'organization.member_added',
      resourceType: 'organization_member',
      resourceId: member.id,
      metadata: { email: user.email, roleKey: role.key },
    })
    return {
      id: member.id,
      userId: user.id,
      email: user.email,
      roleId: role.id,
      roleKey: role.key,
      status: member.status,
    }
  }

  async updateMember(
    organizationId: string,
    memberId: string,
    actorId: string,
    patch: { roleId?: string; status?: string },
  ) {
    const member = await findMemberById(this.database.db, memberId)
    if (!member || member.organizationId !== organizationId) {
      throw new NotFoundException('Member not found')
    }
    const currentRole = await findRoleById(this.database.db, member.roleId)
    if (!currentRole) {
      throw new NotFoundException('Role not found')
    }
    const targetRole = patch.roleId
      ? ((await findRoleById(this.database.db, patch.roleId)) ?? undefined)
      : currentRole
    if (!targetRole || targetRole.organizationId !== organizationId) {
      throw new BadRequestException('Invalid role for this organization')
    }

    const ownerCount = await countMembersWithRole(this.database.db, organizationId, member.roleId)
    const allowed = canChangeMembership({
      ownerRoleKey: OWNER_ROLE_KEY,
      currentRoleKey: currentRole.key,
      targetRoleKey: targetRole.key,
      currentStatus: member.status,
      nextStatus: patch.status,
      ownerCount,
    })
    if (!allowed) {
      throw new ForbiddenException('Cannot change the last owner of the organization')
    }

    const updated = await updateMember(this.database.db, memberId, {
      roleId: patch.roleId ?? undefined,
      status: patch.status,
    })
    await this.audit.record({
      actorId,
      organizationId,
      action: 'organization.member_updated',
      resourceType: 'organization_member',
      resourceId: memberId,
      metadata: {
        roleId: targetRole.id,
        roleKey: targetRole.key,
        status: patch.status ?? member.status,
      },
    })
    return {
      id: member.id,
      userId: member.userId,
      roleId: targetRole.id,
      roleKey: targetRole.key,
      status: updated?.status ?? member.status,
    }
  }
}
