import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../common/database.module.js'
import { AccessModule } from '../access/access.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { IdentityModule } from '../identity/identity.module.js'
import { ModuleAccessGuard } from './module-access.guard.js'
import { ModuleEnabledGuard } from './module-enabled.guard.js'
import { ModuleController } from './module.controller.js'
import { ModuleRegistryService } from './module-registry.service.js'

@Module({
  imports: [DatabaseModule, AccessModule, AuditModule, IdentityModule],
  controllers: [ModuleController],
  providers: [ModuleRegistryService, ModuleEnabledGuard, ModuleAccessGuard],
  exports: [ModuleRegistryService, ModuleEnabledGuard, ModuleAccessGuard],
})
export class ModuleRegistryModule {}
