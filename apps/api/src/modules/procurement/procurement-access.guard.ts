import { Injectable } from '@nestjs/common'
import {
  createOrgPermissionGuard,
  orgPermissionsDecorator,
} from '../../common/org-permission.guard.js'

export const REQUIRE_PROCUREMENT_PERMISSIONS = 'REQUIRE_PROCUREMENT_PERMISSIONS'

@Injectable()
export class ProcurementAccessGuard extends createOrgPermissionGuard(
  REQUIRE_PROCUREMENT_PERMISSIONS,
) {}

export function ProcurementPermissions(...permissions: string[]): MethodDecorator {
  return orgPermissionsDecorator(
    REQUIRE_PROCUREMENT_PERMISSIONS,
    ProcurementAccessGuard,
    ...permissions,
  )
}
