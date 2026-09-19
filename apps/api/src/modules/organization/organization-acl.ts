import {
  applyDecorators,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { Database } from '@reka/database'
import type { AuthRequest } from '../../common/auth-request.js'
import { missingPermissions } from '../../common/rbac.js'
import { DATABASE } from '../../common/database.token.js'
import { AccessService } from '../access/access.service.js'
import { findMemberByOrgAndUser } from './member.repo.js'

export const REQUIRE_ORG_PERMISSIONS = 'REQUIRE_ORG_PERMISSIONS'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Injectable()
export class OrganizationAccessGuard implements CanActivate {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>()
    if (!request.user) {
      throw new UnauthorizedException()
    }
    const params = context.switchToHttp().getRequest().params as Record<string, string>
    const organizationId = params.id
    if (!organizationId) {
      throw new BadRequestException('Missing organization id')
    }
    if (!UUID_RE.test(organizationId)) {
      throw new BadRequestException('Invalid organization id')
    }
    const required = (Reflect.getMetadata(REQUIRE_ORG_PERMISSIONS, context.getHandler()) ??
      []) as string[]

    const membership = await findMemberByOrgAndUser(
      this.database.db,
      organizationId,
      request.user.userId,
    )
    if (!membership || membership.status !== 'active') {
      throw new NotFoundException('Organization not found')
    }

    if (required.length > 0) {
      const keys = await this.access.getRolePermissionKeys(this.database.db, membership.roleId)
      const missing = missingPermissions(required, keys)
      if (missing.length > 0) {
        throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`)
      }
    }

    request.organization = {
      organizationId,
      membershipId: membership.id,
      roleId: membership.roleId,
    }
    return true
  }
}

export function OrgAccess(): MethodDecorator {
  return applyDecorators(
    SetMetadata(REQUIRE_ORG_PERMISSIONS, []),
    UseGuards(OrganizationAccessGuard),
  )
}

export function OrgPermissions(...permissions: string[]): MethodDecorator {
  return applyDecorators(
    SetMetadata(REQUIRE_ORG_PERMISSIONS, permissions),
    UseGuards(OrganizationAccessGuard),
  )
}
