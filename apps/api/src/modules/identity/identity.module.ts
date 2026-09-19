import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { AuthController } from './auth.controller.js'
import { PasswordService } from './password.service.js'
import { SessionGuard } from './session.guard.js'
import { SessionService } from './session.service.js'
import { UserService } from './user.service.js'

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [PasswordService, SessionService, SessionGuard, UserService],
  exports: [SessionService, SessionGuard, UserService, PasswordService],
})
export class IdentityModule {}
