import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { createOrgPermissionGuard } from '../../common/org-permission.guard.js'
import { SessionGuard } from '../../modules/identity/session.guard.js'

export const REQUIRE_ASSETS_PERMISSIONS = 'REQUIRE_ASSETS_PERMISSIONS'

export const AssetsAccessGuard = createOrgPermissionGuard(REQUIRE_ASSETS_PERMISSIONS)

export function AssetsPermissions(...permissions: string[]): MethodDecorator {
  return applyDecorators(
    SetMetadata(REQUIRE_ASSETS_PERMISSIONS, permissions),
    UseGuards(SessionGuard, AssetsAccessGuard),
  )
}
