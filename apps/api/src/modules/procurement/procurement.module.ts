import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { IdentityModule } from '../identity/identity.module.js'
import { ModuleRegistryModule } from '../module-registry/module-registry.module.js'
import { OrganizationModule } from '../organization/organization.module.js'
import { WorkflowModule } from '../workflow/workflow.module.js'
import { GoodsReceiptsController } from './goods-receipts.controller.js'
import { ProcurementAccessGuard } from './procurement-access.guard.js'
import { ProcurementService } from './procurement.service.js'
import { PurchaseOrdersController } from './purchase-orders.controller.js'
import { PurchaseRequestsController } from './purchase-requests.controller.js'
import { VendorsController } from './vendors.controller.js'

@Module({
  imports: [
    AccessModule,
    AuditModule,
    IdentityModule,
    OrganizationModule,
    WorkflowModule,
    ModuleRegistryModule,
  ],
  controllers: [
    VendorsController,
    PurchaseRequestsController,
    PurchaseOrdersController,
    GoodsReceiptsController,
  ],
  providers: [ProcurementService, ProcurementAccessGuard],
  exports: [ProcurementService],
})
export class ProcurementModule {}
