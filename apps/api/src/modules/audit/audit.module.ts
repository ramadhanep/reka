import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { SessionModule } from '../identity/session.module.js'
import { AuditController } from './audit.controller.js'
import { AuditService } from './audit.service.js'

@Module({
  imports: [AccessModule, SessionModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
