import { Controller, Get, HttpCode, HttpStatus, Query, Req, Res } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { getConfig } from '@reka/config'
import { createAuthProvider } from '@reka/auth'
import { SessionService } from './session.service.js'
import { SESSION_COOKIE, sessionCookieOptions } from './session-cookie.js'
import { UserService } from './user.service.js'
import { AuditService } from '../audit/audit.service.js'

@Controller('auth/oidc')
export class OIDCController {
  private readonly oidcProvider: ReturnType<typeof createAuthProvider> | null = null

  constructor(
    private readonly sessions: SessionService,
    private readonly users: UserService,
    private readonly audit: AuditService,
  ) {
    const config = getConfig()
    if (config.oidc.enabled) {
      this.oidcProvider = createAuthProvider({
        kind: 'oidc',
        issuer: config.oidc.issuer!,
        clientId: config.oidc.clientId!,
        clientSecret: config.oidc.clientSecret!,
        callbackUrl: config.oidc.callbackUrl!,
        scopes: config.oidc.scopes,
      })
    }
  }

  @Get('login')
  login(@Res({ passthrough: true }) reply: FastifyReply, @Req() _request: FastifyRequest): void {
    if (!this.oidcProvider) {
      reply.status(HttpStatus.NOT_IMPLEMENTED).send({ message: 'OIDC not configured' })
      return
    }

    const state = crypto.randomUUID()
    const authUrl = this.oidcProvider.getAuthUrl!(state)

    reply.setCookie('oidc_state', state, {
      ...sessionCookieOptions(),
      maxAge: 600,
      path: '/api/v1/auth/oidc',
    })

    reply.redirect(authUrl)
  }

  @Get('callback')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Query() params: Record<string, string>,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Req() request: FastifyRequest,
  ): Promise<{ user: { id: string; email: string; name: string } }> {
    if (!this.oidcProvider) {
      reply.status(HttpStatus.NOT_IMPLEMENTED).send({ message: 'OIDC not configured' })
      return { user: { id: '', email: '', name: '' } }
    }

    const storedState = request.cookies?.oidc_state
    const receivedState = params.state

    if (!storedState || storedState !== receivedState) {
      reply.status(HttpStatus.BAD_REQUEST).send({ message: 'Invalid state parameter' })
      return { user: { id: '', email: '', name: '' } }
    }

    reply.clearCookie('oidc_state', { path: '/api/v1/auth/oidc' })

    try {
      const actor = await this.oidcProvider.handleCallback!(params)

      let user = await this.users.findByProviderId('oidc', actor.providerId!)
      if (!user) {
        user = await this.users.createWithOIDC({
          email: actor.email!,
          displayName: actor.name ?? actor.email!,
          provider: 'oidc',
          providerId: actor.providerId!,
        })
      }

      const token = await this.sessions.create(user.id)
      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions())

      await this.audit.record({
        actorId: user.id,
        action: 'auth.oidc.login',
        resourceType: 'user',
        resourceId: user.id,
      })

      const viewModel = this.users.toViewModel(user)
      return { user: { id: viewModel.id, email: viewModel.email, name: viewModel.displayName } }
    } catch {
      reply.status(HttpStatus.UNAUTHORIZED).send({ message: 'OIDC authentication failed' })
      return { user: { id: '', email: '', name: '' } }
    }
  }

  @Get('status')
  status(): { enabled: boolean; issuer?: string } {
    const config = getConfig()
    return {
      enabled: config.oidc.enabled,
      issuer: config.oidc.issuer,
    }
  }
}
