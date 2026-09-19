import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { IdentityModule } from '../identity/identity.module.js'
import { OrganizationAccessGuard } from './organization-acl.js'
import { OrganizationController } from './organization.controller.js'
import { OrganizationService } from './organization.service.js'

@Module({
  imports: [IdentityModule, AccessModule, AuditModule],
  controllers: [OrganizationController],
  providers: [OrganizationService, OrganizationAccessGuard],
  exports: [OrganizationService],
})
export class OrganizationModule {}
