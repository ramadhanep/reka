import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { type Database, type Db } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import { PasswordService } from './password.service.js'
import { countUsers, createUser, findUserByEmail, findUserById, type UserRow } from './user.repo.js'

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

  async findByEmail(email: string): Promise<UserRow | undefined> {
    return findUserByEmail(this.database.db, email.toLowerCase())
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
