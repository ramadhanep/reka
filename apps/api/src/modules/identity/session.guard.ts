import { Injectable, UnauthorizedException } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { AuthRequest } from '../../common/auth-request.js'
import { SESSION_COOKIE, SessionService } from './session.service.js'

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>()
    const token = request.cookies?.[SESSION_COOKIE]
    const resolved = await this.sessionService.resolve(token)
    if (!resolved) {
      throw new UnauthorizedException()
    }
    request.user = { userId: resolved.userId }
    return true
  }
}
