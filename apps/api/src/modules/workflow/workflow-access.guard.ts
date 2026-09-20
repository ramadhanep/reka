import { Injectable } from '@nestjs/common'
import {
  createOrgPermissionGuard,
  orgPermissionsDecorator,
} from '../../common/org-permission.guard.js'

export const REQUIRE_WORKFLOW_PERMISSIONS = 'REQUIRE_WORKFLOW_PERMISSIONS'

@Injectable()
export class WorkflowAccessGuard extends createOrgPermissionGuard(REQUIRE_WORKFLOW_PERMISSIONS) {}

export function WorkflowPermissions(...permissions: string[]): MethodDecorator {
  return orgPermissionsDecorator(REQUIRE_WORKFLOW_PERMISSIONS, WorkflowAccessGuard, ...permissions)
}
