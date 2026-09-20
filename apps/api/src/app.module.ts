import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { DatabaseModule } from './common/database.module.js'
import { RequestContextModule } from './common/request-context.module.js'
import { HealthModule } from './health/health.module.js'
import { AccessModule } from './modules/access/access.module.js'
import { AuditModule } from './modules/audit/audit.module.js'
import { CoreModule } from './modules/core/core.module.js'
import { IdentityModule } from './modules/identity/identity.module.js'
import { ModuleRegistryModule } from './modules/module-registry/module-registry.module.js'
import { OrganizationModule } from './modules/organization/organization.module.js'
import { ProcurementModule } from './modules/procurement/procurement.module.js'
import { WorkflowModule } from './modules/workflow/workflow.module.js'

@Module({
  imports: [
    DatabaseModule,
    RequestContextModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    AuditModule,
    HealthModule,
    AccessModule,
    IdentityModule,
    OrganizationModule,
    CoreModule,
    ModuleRegistryModule,
    WorkflowModule,
    ProcurementModule,
  ],
})
export class AppModule {}
