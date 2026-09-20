import {
  applyDecorators,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import type { CanActivate, ExecutionContext, Type } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Database } from '@reka/database'
import type { AuthRequest } from './auth-request.js'
import { DATABASE } from './database.token.js'
import { missingPermissions } from './rbac.js'
import { AccessService } from '../modules/access/access.service.js'
import { SessionGuard } from '../modules/identity/session.guard.js'
import { findMemberByOrgAndUser } from '../modules/organization/member.repo.js'
import { findOrganizationsByUser } from '../modules/organization/organization.repo.js'

/**
 * Shared organization-scoped permission guard.
 *
 * Resolves the effective organization from the `x-organization-id` header, the
 * `organizationId` query/body value, or the actor's first eligible membership,
 * then verifies membership and the required permission keys. All module guards
 * (workflow, module-registry, procurement) delegate here so the authorization
 * logic is defined once.
 */
export function createOrgPermissionGuard(metadataKey: string): Type<CanActivate> {
  @Injectable()
  class OrgPermissionGuard implements CanActivate {
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
        metadataKey,
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
  return OrgPermissionGuard
}

export function orgPermissionsDecorator(
  metadataKey: string,
  guard: Type<CanActivate>,
  ...permissions: string[]
): MethodDecorator {
  return applyDecorators(SetMetadata(metadataKey, permissions), UseGuards(SessionGuard, guard))
}
