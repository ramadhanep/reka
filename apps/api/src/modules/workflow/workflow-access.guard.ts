import {
  applyDecorators,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Database } from '@reka/database'
import type { AuthRequest } from '../../common/auth-request.js'
import { DATABASE } from '../../common/database.token.js'
import { missingPermissions } from '../../common/rbac.js'
import { AccessService } from '../access/access.service.js'
import { SessionGuard } from '../identity/session.guard.js'
import { findMemberByOrgAndUser } from '../organization/member.repo.js'
import { findOrganizationsByUser } from '../organization/organization.repo.js'

export const REQUIRE_WORKFLOW_PERMISSIONS = 'REQUIRE_WORKFLOW_PERMISSIONS'

@Injectable()
export class WorkflowAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>()
    if (!request.user) {
      throw new UnauthorizedException()
    }

    const required = (this.reflector.get<string[] | undefined>(
      REQUIRE_WORKFLOW_PERMISSIONS,
      context.getHandler(),
    ) ?? []) as string[]

    const httpRequest = context.switchToHttp().getRequest()
    const headerOrgId = httpRequest.headers?.['x-organization-id'] as string | undefined
    const queryOrgId = httpRequest.query?.organizationId as string | undefined
    const bodyOrgId = httpRequest.body?.organizationId as string | undefined
    const requestedOrgId = headerOrgId || queryOrgId || bodyOrgId

    if (requestedOrgId) {
      const membership = await findMemberByOrgAndUser(
        this.database.db,
        requestedOrgId,
        request.user.userId,
      )
      if (!membership || membership.status !== 'active') {
        throw new ForbiddenException('Not an active member of the specified organization')
      }

      if (required.length > 0) {
        const keys = await this.access.getRolePermissionKeys(this.database.db, membership.roleId)
        const missing = missingPermissions(required, keys)
        if (missing.length > 0) {
          throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`)
        }
      }

      request.organization = {
        organizationId: requestedOrgId,
        membershipId: membership.id,
        roleId: membership.roleId,
      }
      return true
    }

    // If no org specified in request, check user's active organizations
    const userOrgs = await findOrganizationsByUser(this.database.db, request.user.userId)
    if (!userOrgs || userOrgs.length === 0) {
      throw new ForbiddenException('No active organization membership')
    }

    for (const orgEntry of userOrgs) {
      const membership = await findMemberByOrgAndUser(
        this.database.db,
        orgEntry.organization.id,
        request.user.userId,
      )
      if (membership && membership.status === 'active') {
        const keys = await this.access.getRolePermissionKeys(this.database.db, membership.roleId)
        const missing = missingPermissions(required, keys)
        if (missing.length === 0) {
          request.organization = {
            organizationId: orgEntry.organization.id,
            membershipId: membership.id,
            roleId: membership.roleId,
          }
          return true
        }
      }
    }

    throw new ForbiddenException(`Missing permission: ${required.join(', ')} in any organization`)
  }
}

export function WorkflowPermissions(...permissions: string[]): MethodDecorator {
  return applyDecorators(
    SetMetadata(REQUIRE_WORKFLOW_PERMISSIONS, permissions),
    UseGuards(SessionGuard, WorkflowAccessGuard),
  )
}
