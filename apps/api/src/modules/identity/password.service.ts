import { hash, verify } from '@node-rs/argon2'
import { Injectable } from '@nestjs/common'

const ARGON2ID = 2 // @node-rs/argon2 Algorithm.Argon2id (ambient const enum, not importable under verbatimModuleSyntax)

@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return hash(plain, {
      algorithm: ARGON2ID,
      timeCost: 3,
      memoryCost: 19456,
      parallelism: 1,
    })
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain)
    } catch {
      return false
    }
  }
}
