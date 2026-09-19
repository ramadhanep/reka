import { describe, expect, it } from 'vitest'
import { NotFoundException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ModuleEnabledGuard } from './module-enabled.guard.js'
import { ModuleRegistryService } from './module-registry.service.js'

describe('ModuleEnabledGuard', () => {
  const reflector = new Reflector()

  function createGuard(enabledModules: Set<string>): ModuleEnabledGuard {
    const fakeRegistry = {
      isEnabled: (id: string) => enabledModules.has(id),
    } as unknown as ModuleRegistryService
    return new ModuleEnabledGuard(reflector, fakeRegistry)
  }

  function mockContext(moduleKey?: string): ExecutionContext {
    const handler = () => {}
    if (moduleKey) {
      Reflect.defineMetadata('REQUIRE_MODULE_KEY', moduleKey, handler)
    }
    return {
      getHandler: () => handler,
      getClass: () => class {},
    } as unknown as ExecutionContext
  }

  it('allows access when no module requirement is defined on the route', () => {
    const guard = createGuard(new Set())
    const context = mockContext(undefined)
    expect(guard.canActivate(context)).toBe(true)
  })

  it('allows access when the required module is enabled', () => {
    const guard = createGuard(new Set(['assets']))
    const context = mockContext('assets')
    expect(guard.canActivate(context)).toBe(true)
  })

  it('blocks access with 404 NotFoundException when the required module is disabled', () => {
    const guard = createGuard(new Set())
    const context = mockContext('assets')
    expect(() => guard.canActivate(context)).toThrow(NotFoundException)
    expect(() => guard.canActivate(context)).toThrow("Module 'assets' is disabled")
  })
})
