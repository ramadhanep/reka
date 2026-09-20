import { Injectable } from '@nestjs/common'
import {
  createOrgPermissionGuard,
  orgPermissionsDecorator,
} from '../../common/org-permission.guard.js'

export const REQUIRE_MODULE_PERMISSIONS = 'REQUIRE_MODULE_PERMISSIONS'

@Injectable()
export class ModuleAccessGuard extends createOrgPermissionGuard(REQUIRE_MODULE_PERMISSIONS) {}

export function ModulePermissions(...permissions: string[]): MethodDecorator {
  return orgPermissionsDecorator(REQUIRE_MODULE_PERMISSIONS, ModuleAccessGuard, ...permissions)
}
