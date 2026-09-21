import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { createOrgPermissionGuard } from '../../common/org-permission.guard.js'
import { SessionGuard } from '../../modules/identity/session.guard.js'

export const REQUIRE_INVENTORY_PERMISSIONS = 'REQUIRE_INVENTORY_PERMISSIONS'

export const InventoryAccessGuard = createOrgPermissionGuard(REQUIRE_INVENTORY_PERMISSIONS)

export function InventoryPermissions(...permissions: string[]): MethodDecorator {
  return applyDecorators(
    SetMetadata(REQUIRE_INVENTORY_PERMISSIONS, permissions),
    UseGuards(SessionGuard, InventoryAccessGuard),
  )
}
