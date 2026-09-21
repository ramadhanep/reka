import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { FastifyReply } from 'fastify'
import type { AuthRequest } from '../../common/auth-request.js'
import { ThrottlerGuardWithTestBypass } from '../../common/throttler.guard.js'
import { AuditService } from '../audit/audit.service.js'
import { CurrentUser } from './current-user.decorator.js'
import { LoginDto } from './dto/login.dto.js'
import { ActivateUserDto } from './dto/activate-user.dto.js'
import { SessionGuard } from './session.guard.js'
import { sessionCookieOptions } from './session-cookie.js'
import { SESSION_COOKIE, SessionService } from './session.service.js'
import { UserService } from './user.service.js'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UserService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuardWithTestBypass)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const user = await this.users.authenticate(dto.email, dto.password)
    const token = await this.sessions.create(user.id)
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions())
    await this.audit.record({
      actorId: user.id,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
    })
    return { user: this.users.toViewModel(user) }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.sessions.revoke(request.cookies?.[SESSION_COOKIE])
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    await this.audit.record({
      actorId: request.user?.userId,
      action: 'auth.logout',
      resourceType: 'session',
    })
    return { ok: true }
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Body() dto: ActivateUserDto) {
    const user = await this.users.activateUser(dto.token, dto.password)
    await this.audit.record({
      actorId: user.id,
      action: 'user.activated',
      resourceType: 'user',
      resourceId: user.id,
    })
    return { user: this.users.toViewModel(user) }
  }

  @Get('session')
  @UseGuards(SessionGuard)
  async current(@CurrentUser() current: { userId: string }) {
    const user = await this.users.findById(current.userId)
    return { user: this.users.toViewModel(user!) }
  }
}
