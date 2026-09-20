import { describe, expect, it } from 'vitest'
import { canManageModules, canManageWorkflows, resolveNavigation } from './navigation.js'

describe('resolveNavigation', () => {
  it('shows platform navigation items by default when no business modules are enabled', () => {
    const nav = resolveNavigation([])
    const labels = nav.map((item) => item.label)

    expect(labels).toContain('Organizations')
    expect(labels).toContain('Modules')
    expect(labels).toContain('Workflows')
    expect(labels).not.toContain('Procurement')
    expect(labels).not.toContain('Assets')
    expect(labels).not.toContain('Finance')
    expect(labels).not.toContain('HR')
  })

  it('shows enabled business module in navigation', () => {
    const nav = resolveNavigation(['assets'])
    const labels = nav.map((item) => item.label)

    expect(labels).toContain('Organizations')
    expect(labels).toContain('Modules')
    expect(labels).toContain('Workflows')
    expect(labels).toContain('Assets')
    expect(labels).not.toContain('Procurement')
    expect(labels).not.toContain('Finance')
  })

  it('hides disabled business modules dynamically when removed from enabled list', () => {
    const beforeDisable = resolveNavigation(['assets', 'procurement'])
    expect(beforeDisable.map((i) => i.label)).toContain('Assets')
    expect(beforeDisable.map((i) => i.label)).toContain('Procurement')

    // Disabling procurement
    const afterDisable = resolveNavigation(['assets'])
    expect(afterDisable.map((i) => i.label)).toContain('Assets')
    expect(afterDisable.map((i) => i.label)).not.toContain('Procurement')
  })
})

describe('canManageModules permission evaluation', () => {
  it('allows owner role', () => {
    expect(canManageModules([], 'owner')).toBe(true)
  })

  it('allows user with explicit module.manage permission', () => {
    expect(canManageModules(['module.manage'], 'member')).toBe(true)
  })

  it('denies user without module.manage permission or owner role', () => {
    expect(canManageModules(['organization.read'], 'member')).toBe(false)
    expect(canManageModules([], 'member')).toBe(false)
    expect(canManageModules(undefined, undefined)).toBe(false)
  })
})

describe('canManageWorkflows permission evaluation', () => {
  it('allows owner role', () => {
    expect(canManageWorkflows([], 'owner')).toBe(true)
  })

  it('allows user with explicit workflow.definition.manage permission', () => {
    expect(canManageWorkflows(['workflow.definition.manage'], 'member')).toBe(true)
  })

  it('denies user without workflow.definition.manage permission or owner role', () => {
    expect(canManageWorkflows(['workflow.definition.read'], 'member')).toBe(false)
    expect(canManageWorkflows([], 'member')).toBe(false)
  })
})
