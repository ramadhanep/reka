import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { FastifyReply } from 'fastify'
import { ThrottlerGuardWithTestBypass } from '../../common/throttler.guard.js'
import { SESSION_COOKIE } from '../identity/session.service.js'
import { sessionCookieOptions } from '../identity/session-cookie.js'
import { SetupDto } from './dto/setup.dto.js'
import { SetupService } from './setup.service.js'

@Controller('setup')
@UseGuards(ThrottlerGuardWithTestBypass)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async setup(@Body() dto: SetupDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.setupService.initialize(dto)
    reply.setCookie(SESSION_COOKIE, result.token, sessionCookieOptions())
    return { user: result.user, organization: result.organization }
  }
}
