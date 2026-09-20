import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { IdentityModule } from '../identity/identity.module.js'
import { ModuleRegistryModule } from '../module-registry/module-registry.module.js'
import { OrganizationModule } from '../organization/organization.module.js'
import { WorkflowAccessGuard } from './workflow-access.guard.js'
import { WorkflowDefinitionController } from './workflow-definition.controller.js'
import { WorkflowInstanceController } from './workflow-instance.controller.js'
import { WorkflowNotificationHook } from './workflow-notification.hook.js'
import { WorkflowService } from './workflow.service.js'

@Module({
  imports: [AccessModule, AuditModule, IdentityModule, ModuleRegistryModule, OrganizationModule],
  controllers: [WorkflowDefinitionController, WorkflowInstanceController],
  providers: [WorkflowService, WorkflowNotificationHook, WorkflowAccessGuard],
  exports: [WorkflowService, WorkflowNotificationHook],
})
export class WorkflowModule {}
