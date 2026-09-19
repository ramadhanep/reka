import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { IdentityModule } from '../identity/identity.module.js'
import { OrganizationModule } from '../organization/organization.module.js'
import { SetupController } from './setup.controller.js'
import { SetupService } from './setup.service.js'

@Module({
  imports: [IdentityModule, OrganizationModule, AuditModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class CoreModule {}
