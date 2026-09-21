import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { type Database, type Db } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import { PasswordService } from './password.service.js'
import {
  createActivationToken,
  findValidToken,
  markTokenUsed,
  type ActivationTokenRow,
} from './activation-token.repo.js'
import { usersTable } from './user.schema.js'
import {
  countUsers,
  createUser,
  findUserByEmail,
  findUserById,
  findUserByProviderId,
  type UserRow,
} from './user.repo.js'

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=3,p=1$1kddLgivMHyyA/tbisWKVw$LMN9j4Ue8hMZOnb6wDZgUZ9dIWx9q54rfT4whxFSGmQ'

@Injectable()
export class UserService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly password: PasswordService,
  ) {}

  async isInitialized(db: Db = this.database.db): Promise<boolean> {
    return (await countUsers(db)) > 0
  }

  async createWithPassword(
    input: {
      email: string
      password: string
      displayName: string
    },
    db: Db = this.database.db,
  ): Promise<UserRow> {
    const passwordHash = await this.password.hash(input.password)
    return createUser(db, { ...input, passwordHash })
  }

  async createWithOIDC(
    input: {
      email: string
      displayName: string
      provider: string
      providerId: string
    },
    db: Db = this.database.db,
  ): Promise<UserRow> {
    const unusableHash = await this.password.hash(randomBytes(24).toString('base64url'))
    return createUser(db, {
      email: input.email.toLowerCase(),
      passwordHash: unusableHash,
      displayName: input.displayName,
      provider: input.provider,
      providerId: input.providerId,
    })
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    return findUserByEmail(this.database.db, email.toLowerCase())
  }

  async findByProviderId(provider: string, providerId: string): Promise<UserRow | undefined> {
    return findUserByProviderId(this.database.db, provider, providerId)
  }

  async findById(id: string): Promise<UserRow | undefined> {
    return findUserById(this.database.db, id)
  }

  async findOrCreatePendingUser(email: string): Promise<UserRow> {
    const normalized = email.toLowerCase()
    const existing = await findUserByEmail(this.database.db, normalized)
    if (existing) {
      return existing
    }
    const unusableHash = await this.password.hash(randomBytes(24).toString('base64url'))
    const displayName =
      normalized
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .trim() || normalized
    return createUser(this.database.db, {
      email: normalized,
      passwordHash: unusableHash,
      displayName,
      status: 'pending',
    })
  }

  async authenticate(email: string, password: string): Promise<UserRow> {
    const user = await findUserByEmail(this.database.db, email.toLowerCase())
    let valid = false
    try {
      const hashed = user?.passwordHash ?? DUMMY_PASSWORD_HASH
      valid = await this.password.verify(hashed, password)
    } catch {
      // treat malformed hashes as failed verification
    }
    if (!user || !valid || user.status !== 'active') {
      throw new UnauthorizedException('Invalid credentials')
    }
    return user
  }

  async createActivationToken(userId: string): Promise<ActivationTokenRow> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    return createActivationToken(this.database.db, userId, expiresAt)
  }

  async activateUser(token: string, password: string): Promise<UserRow> {
    const tokenRow = await findValidToken(this.database.db, token)
    if (!tokenRow) {
      throw new BadRequestException('Invalid or expired activation token')
    }
    if (tokenRow.expiresAt < new Date()) {
      throw new BadRequestException('Activation token has expired')
    }

    const user = await findUserById(this.database.db, tokenRow.userId)
    if (!user) {
      throw new BadRequestException('User not found')
    }
    if (user.status !== 'pending') {
      throw new BadRequestException('User is not pending activation')
    }

    const passwordHash = await this.password.hash(password)
    const [updated] = await this.database.db
      .update(usersTable)
      .set({ passwordHash, status: 'active' })
      .where(eq(usersTable.id, user.id))
      .returning()

    await markTokenUsed(this.database.db, tokenRow.id)
    return updated
  }

  toViewModel(user: UserRow) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      createdAt: user.createdAt,
    }
  }
}
