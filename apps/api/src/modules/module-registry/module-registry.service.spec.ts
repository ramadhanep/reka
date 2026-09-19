/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { Database } from '@reka/database'
import type { RekaModule } from '@reka/contracts'
import { detectCircularDependency, ModuleRegistryService } from './module-registry.service.js'

describe('detectCircularDependency', () => {
  it('returns null for an empty or linear acyclic graph', () => {
    const graph = new Map<string, string[]>([
      ['core', []],
      ['identity', ['core']],
      ['access', ['core', 'identity']],
      ['procurement', ['access']],
    ])
    expect(detectCircularDependency(graph)).toBeNull()
  })

  it('detects a direct 2-node cycle', () => {
    const graph = new Map<string, string[]>([
      ['a', ['b']],
      ['b', ['a']],
    ])
    const cycle = detectCircularDependency(graph)
    expect(cycle).not.toBeNull()
    expect(cycle).toEqual(['a', 'b', 'a'])
  })

  it('detects an indirect multi-node cycle', () => {
    const graph = new Map<string, string[]>([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['d']],
      ['d', ['b']],
    ])
    const cycle = detectCircularDependency(graph)
    expect(cycle).not.toBeNull()
    expect(cycle).toEqual(['b', 'c', 'd', 'b'])
  })
})

describe('ModuleRegistryService', () => {
  let service: ModuleRegistryService
  const dbRows = new Map<string, { id: string; version: string; enabled: boolean }>()

  const mockDatabase: Database = {
    pool: {} as Database['pool'],
    db: {
      select: () => ({
        from: () => ({
          where: (_clause: any) => ({
            limit: () => {
              // Find matching row if needed
              return Array.from(dbRows.values())
            },
          }),
          then: (resolve: any) => resolve(Array.from(dbRows.values())),
        }),
      }),
      insert: () => ({
        values: (val: any) => ({
          returning: () => {
            dbRows.set(val.id, { id: val.id, version: val.version, enabled: val.enabled })
            return [{ ...val }]
          },
        }),
      }),
      update: () => ({
        set: (patch: any) => ({
          where: (_clause: any) => ({
            returning: () => {
              return [{ ...patch }]
            },
          }),
        }),
      }),
    } as any,
    close: async () => {},
  }

  beforeEach(() => {
    dbRows.clear()
    service = new ModuleRegistryService(mockDatabase)
  })

  describe('registration & retrieval', () => {
    it('registers and retrieves a module', () => {
      const mod: RekaModule = {
        id: 'test-mod',
        version: '1.0.0',
        displayName: 'Test Module',
        category: 'business',
        dependencies: [],
      }
      service.register(mod)

      const retrieved = service.get('test-mod')
      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe('test-mod')
      expect(retrieved?.displayName).toBe('Test Module')
      expect(retrieved?.enabled).toBe(false)
    })

    it('rejects duplicate module registration with 409 Conflict', () => {
      const mod: RekaModule = {
        id: 'dup-mod',
        version: '1.0.0',
        displayName: 'Duplicate',
        category: 'business',
        dependencies: [],
      }
      service.register(mod)
      expect(() => service.register(mod)).toThrow(ConflictException)
    })

    it('lists registered modules with platform modules first', () => {
      service.register({
        id: 'biz-mod',
        version: '1.0.0',
        displayName: 'Business Mod',
        category: 'business',
        dependencies: [],
      })
      service.register({
        id: 'plat-mod',
        version: '1.0.0',
        displayName: 'Platform Mod',
        category: 'platform',
        dependencies: [],
      })

      const list = service.list()
      expect(list.length).toBe(2)
      expect(list[0].id).toBe('plat-mod')
      expect(list[1].id).toBe('biz-mod')
    })
  })

  describe('dependencies & cycles', () => {
    it('rejects registration that creates a circular dependency', () => {
      service.register({
        id: 'mod-a',
        version: '1.0.0',
        displayName: 'Mod A',
        category: 'business',
        dependencies: ['mod-b'],
      })

      expect(() =>
        service.register({
          id: 'mod-b',
          version: '1.0.0',
          displayName: 'Mod B',
          category: 'business',
          dependencies: ['mod-a'],
        }),
      ).toThrow(BadRequestException)
    })
  })

  describe('enable / disable behavior', () => {
    it('enables a module when all dependencies are enabled', async () => {
      service.register({
        id: 'dep-base',
        version: '1.0.0',
        displayName: 'Dep Base',
        category: 'platform',
        dependencies: [],
      })
      service.register({
        id: 'biz-feature',
        version: '1.0.0',
        displayName: 'Biz Feature',
        category: 'business',
        dependencies: ['dep-base'],
      })

      expect(service.isEnabled('biz-feature')).toBe(false)
      const result = await service.enable('biz-feature')
      expect(result.enabled).toBe(true)
      expect(service.isEnabled('biz-feature')).toBe(true)
    })

    it('rejects enabling when a dependency is missing or not registered', async () => {
      service.register({
        id: 'biz-broken',
        version: '1.0.0',
        displayName: 'Broken',
        category: 'business',
        dependencies: ['non-existent-module'],
      })

      await expect(service.enable('biz-broken')).rejects.toThrow(BadRequestException)
    })

    it('rejects enabling when a registered dependency is disabled', async () => {
      service.register({
        id: 'dep-disabled',
        version: '1.0.0',
        displayName: 'Disabled Dep',
        category: 'business',
        dependencies: [],
      })
      service.register({
        id: 'biz-child',
        version: '1.0.0',
        displayName: 'Child',
        category: 'business',
        dependencies: ['dep-disabled'],
      })

      await expect(service.enable('biz-child')).rejects.toThrow(
        /missing or disabled dependencies: dep-disabled \(disabled\)/,
      )
    })

    it('throws NotFoundException when enabling an unknown module', async () => {
      await expect(service.enable('ghost-mod')).rejects.toThrow(NotFoundException)
    })

    it('disables an enabled business module', async () => {
      service.register({
        id: 'toggle-mod',
        version: '1.0.0',
        displayName: 'Toggle',
        category: 'business',
        dependencies: [],
      })

      await service.enable('toggle-mod')
      expect(service.isEnabled('toggle-mod')).toBe(true)

      await service.disable('toggle-mod')
      expect(service.isEnabled('toggle-mod')).toBe(false)
    })

    it('blocks disabling a platform module', async () => {
      service.register({
        id: 'plat-core',
        version: '1.0.0',
        displayName: 'Core',
        category: 'platform',
        dependencies: [],
      })

      await expect(service.disable('plat-core')).rejects.toThrow(BadRequestException)
    })

    it('blocks disabling a module when another enabled module depends on it', async () => {
      service.register({
        id: 'shared-lib',
        version: '1.0.0',
        displayName: 'Shared Lib',
        category: 'business',
        dependencies: [],
      })
      service.register({
        id: 'consumer-app',
        version: '1.0.0',
        displayName: 'Consumer App',
        category: 'business',
        dependencies: ['shared-lib'],
      })

      await service.enable('shared-lib')
      await service.enable('consumer-app')

      await expect(service.disable('shared-lib')).rejects.toThrow(
        /Cannot disable module 'shared-lib': required by enabled module\(s\): Consumer App/,
      )
    })

    it('throws NotFoundException when disabling an unknown module', async () => {
      await expect(service.disable('unknown-mod')).rejects.toThrow(NotFoundException)
    })
  })
})
