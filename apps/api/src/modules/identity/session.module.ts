import { Module } from '@nestjs/common'
import { SessionGuard } from './session.guard.js'
import { SessionService } from './session.service.js'

/**
 * Session authentication primitives.
 *
 * Kept separate from IdentityModule so modules that need to authenticate a
 * request (for example AuditModule) can depend on sessions without importing
 * the whole identity module and creating a circular dependency with the audit
 * service.
 */
@Module({
  providers: [SessionService, SessionGuard],
  exports: [SessionService, SessionGuard],
})
export class SessionModule {}
