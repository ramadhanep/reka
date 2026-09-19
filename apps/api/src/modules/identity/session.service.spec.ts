import { describe, expect, it } from 'vitest'
import type { Database } from '@reka/database'
import { SessionService } from './session.service.js'

function blankDatabase(): Database {
  return { pool: {} as Database['pool'], db: {} as Database['db'], close: async () => {} }
}

describe('SessionService token handling', () => {
  const service = new SessionService(blankDatabase())

  it('produces a fixed-length hex digest of the session token', () => {
    const digest = service.hashToken('opaque-session-token')
    expect(digest).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not expose the raw token in the stored digest', () => {
    const token = 'super-secret-session-token'
    const digest = service.hashToken(token)
    expect(digest).not.toContain(token)
  })

  it('hashes deterministically, enabling lookup by token', () => {
    expect(service.hashToken('t')).toBe(service.hashToken('t'))
    expect(service.hashToken('t')).not.toBe(service.hashToken('u'))
  })
})
