import { describe, expect, it } from 'vitest'
import { PasswordService } from './password.service.js'

describe('PasswordService', () => {
  const service = new PasswordService()

  it('produces an Argon2id hash and verifies the correct password', async () => {
    const hashed = await service.hash('correct horse battery staple')
    expect(hashed.startsWith('$argon2id$')).toBe(true)
    await expect(service.verify(hashed, 'correct horse battery staple')).resolves.toBe(true)
  })

  it('rejects the wrong password', async () => {
    const hashed = await service.hash('secret')
    await expect(service.verify(hashed, 'wrong')).resolves.toBe(false)
  })

  it('does not store the plaintext password', async () => {
    const hashed = await service.hash('plain')
    expect(hashed).not.toContain('plain')
  })

  it('uses a unique salt per hash', async () => {
    const a = await service.hash('same password')
    const b = await service.hash('same password')
    expect(a).not.toBe(b)
  })

  it('returns false for a malformed stored hash instead of throwing', async () => {
    await expect(service.verify('not-an-argon2-hash', 'whatever')).resolves.toBe(false)
  })
})
