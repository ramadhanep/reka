import { describe, expect, it } from 'vitest'
import { slugify } from './common/slug.js'
import { missingPermissions } from './common/rbac.js'
import { canChangeMembership } from './modules/organization/member-policy.js'

describe('slugify', () => {
  it('lower-cases, trims, and dashes non-alphanumeric runs', () => {
    expect(slugify('Acme Corp & Co.')).toBe('acme-corp-co')
    expect(slugify('  My  Org  ')).toBe('my-org')
  })

  it('falls back to a stable value for empty input', () => {
    expect(slugify('!!!')).toBe('organization')
  })

  it('limits length', () => {
    expect(slugify('x'.repeat(200))).toHaveLength(64)
  })
})

describe('missingPermissions', () => {
  it('returns keys that are required but not granted', () => {
    expect(
      missingPermissions(['organization.read', 'organization.update'], ['organization.read']),
    ).toEqual(['organization.update'])
  })

  it('returns empty when all required permissions are granted', () => {
    expect(missingPermissions(['a', 'b'], ['a', 'b', 'c'])).toEqual([])
  })
})

describe('canChangeMembership (last-owner rule)', () => {
  const ownerRoleKey = 'owner'

  it('allows changing a non-owner member', () => {
    expect(
      canChangeMembership({
        ownerRoleKey,
        currentRoleKey: 'member',
        targetRoleKey: 'owner',
        currentStatus: 'active',
        nextStatus: 'inactive',
        ownerCount: 1,
      }),
    ).toBe(true)
  })

  it('allows changing the owner when another owner exists', () => {
    expect(
      canChangeMembership({
        ownerRoleKey,
        currentRoleKey: 'owner',
        targetRoleKey: 'member',
        currentStatus: 'active',
        ownerCount: 2,
      }),
    ).toBe(true)
  })

  it('blocks demoting the sole owner', () => {
    expect(
      canChangeMembership({
        ownerRoleKey,
        currentRoleKey: 'owner',
        targetRoleKey: 'member',
        currentStatus: 'active',
        ownerCount: 1,
      }),
    ).toBe(false)
  })

  it('blocks deactivating the sole owner', () => {
    expect(
      canChangeMembership({
        ownerRoleKey,
        currentRoleKey: 'owner',
        targetRoleKey: 'owner',
        currentStatus: 'active',
        nextStatus: 'inactive',
        ownerCount: 1,
      }),
    ).toBe(false)
  })

  it('allows role-preserving no-op on the sole owner', () => {
    expect(
      canChangeMembership({
        ownerRoleKey,
        currentRoleKey: 'owner',
        targetRoleKey: 'owner',
        currentStatus: 'active',
        ownerCount: 1,
      }),
    ).toBe(true)
  })
})
