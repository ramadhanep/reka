import { Inject, Injectable } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { type Db, type Database } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import { createSession, findSessionByTokenHash, revokeSession } from './session.repo.js'
import { findUserById } from './user.repo.js'

export const SESSION_COOKIE = 'reka_session'
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

export interface ResolvedSession {
  sessionId: string
  userId: string
}

@Injectable()
export class SessionService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  async create(userId: string, db: Db = this.database.db, now: Date = new Date()): Promise<string> {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS)
    await createSession(db, { userId, tokenHash: this.hashToken(token), expiresAt })
    return token
  }

  async resolve(
    token: string | undefined,
    now: Date = new Date(),
  ): Promise<ResolvedSession | null> {
    if (!token) {
      return null
    }
    const row = await findSessionByTokenHash(this.database.db, this.hashToken(token), now)
    if (!row) {
      return null
    }
    const user = await findUserById(this.database.db, row.userId)
    if (!user || user.status === 'inactive') {
      return null
    }
    return { sessionId: row.id, userId: user.id }
  }

  async revoke(token: string | undefined, now: Date = new Date()): Promise<void> {
    if (!token) {
      return
    }
    await revokeSession(this.database.db, this.hashToken(token), now)
  }
}
