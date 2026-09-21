import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { IdentityModule } from '../identity/identity.module.js'
import { ModuleRegistryModule } from '../module-registry/module-registry.module.js'
import { OrganizationModule } from '../organization/organization.module.js'
import { AssetsController } from './assets.controller.js'
import { AssetsAccessGuard } from './assets-access.guard.js'
import { AssetsService } from './assets.service.js'

@Module({
  imports: [AccessModule, AuditModule, IdentityModule, OrganizationModule, ModuleRegistryModule],
  controllers: [AssetsController],
  providers: [AssetsService, AssetsAccessGuard],
  exports: [AssetsService],
})
export class AssetsModule {}
