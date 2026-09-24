import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { AuthCleanupScheduler } from './auth-cleanup.scheduler.js'
import { AuthController } from './auth.controller.js'
import { OIDCController } from './oidc.controller.js'
import { PasswordService } from './password.service.js'
import { SessionModule } from './session.module.js'
import { UserService } from './user.service.js'

@Module({
  imports: [AuditModule, SessionModule],
  controllers: [AuthController, OIDCController],
  providers: [PasswordService, UserService, AuthCleanupScheduler],
  exports: [SessionModule, UserService, PasswordService],
})
export class IdentityModule {}
