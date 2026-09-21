import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { IdentityModule } from '../identity/identity.module.js'
import { ModuleRegistryModule } from '../module-registry/module-registry.module.js'
import { OrganizationModule } from '../organization/organization.module.js'
import { ProcurementModule } from '../procurement/procurement.module.js'
import { InventoryController } from './inventory.controller.js'
import { InventoryAccessGuard } from './inventory-access.guard.js'
import { InventoryService } from './inventory.service.js'

@Module({
  imports: [
    AccessModule,
    AuditModule,
    IdentityModule,
    OrganizationModule,
    ModuleRegistryModule,
    ProcurementModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryAccessGuard],
  exports: [InventoryService],
})
export class InventoryModule {}
