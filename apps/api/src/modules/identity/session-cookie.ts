export const SESSION_COOKIE = 'reka_session'

import type { CookieSerializeOptions } from '@fastify/cookie'
import { SESSION_DURATION_MS } from './session.service.js'

export function sessionCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  }
}
