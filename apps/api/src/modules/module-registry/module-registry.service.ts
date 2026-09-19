import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common'
import type { Database } from '@reka/database'
import type { ModuleSummary, RekaModule } from '@reka/contracts'
import { DATABASE } from '../../common/database.token.js'
import { initialBusinessManifests, platformManifests } from './module-manifests.js'
import {
  findPlatformModules,
  setPlatformModuleEnabled,
  upsertPlatformModule,
} from './module.repo.js'

export function detectCircularDependency(graph: Map<string, string[]>): string[] | null {
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const stack: string[] = []

  function dfs(current: string): string[] | null {
    if (inStack.has(current)) {
      const cycleStartIndex = stack.indexOf(current)
      return [...stack.slice(cycleStartIndex), current]
    }
    if (visited.has(current)) {
      return null
    }

    visited.add(current)
    inStack.add(current)
    stack.push(current)

    const neighbors = graph.get(current) ?? []
    for (const neighbor of neighbors) {
      if (graph.has(neighbor)) {
        const cycle = dfs(neighbor)
        if (cycle) {
          return cycle
        }
      }
    }

    stack.pop()
    inStack.delete(current)
    return null
  }

  for (const node of graph.keys()) {
    const cycle = dfs(node)
    if (cycle) {
      return cycle
    }
  }

  return null
}

@Injectable()
export class ModuleRegistryService implements OnModuleInit {
  private readonly modules = new Map<string, RekaModule>()
  private readonly enabledMap = new Map<string, boolean>()

  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onModuleInit(): Promise<void> {
    await this.init()
  }

  async init(): Promise<void> {
    for (const manifest of platformManifests) {
      if (!this.modules.has(manifest.id)) {
        this.register(manifest)
      }
    }

    for (const manifest of initialBusinessManifests) {
      if (!this.modules.has(manifest.id)) {
        this.register(manifest)
      }
    }

    await this.syncWithDatabase()
  }

  register(module: RekaModule): void {
    if (this.modules.has(module.id)) {
      throw new ConflictException(`Module '${module.id}' is already registered`)
    }

    const testGraph = new Map<string, string[]>()
    for (const [id, m] of this.modules.entries()) {
      testGraph.set(id, [...m.dependencies])
    }
    testGraph.set(module.id, [...module.dependencies])

    const cycle = detectCircularDependency(testGraph)
    if (cycle) {
      throw new BadRequestException(`Circular dependency detected: ${cycle.join(' -> ')}`)
    }

    this.modules.set(module.id, module)
    if (!this.enabledMap.has(module.id)) {
      this.enabledMap.set(module.id, module.category === 'platform')
    }
  }

  unregisterForTest(id: string): void {
    this.modules.delete(id)
    this.enabledMap.delete(id)
  }

  get(moduleId: string): ModuleSummary | undefined {
    const mod = this.modules.get(moduleId)
    if (!mod) {
      return undefined
    }
    return this.toSummary(mod)
  }

  getRaw(moduleId: string): RekaModule | undefined {
    return this.modules.get(moduleId)
  }

  list(): ModuleSummary[] {
    const summaries = Array.from(this.modules.values()).map((m) => this.toSummary(m))
    return summaries.sort((a, b) => {
      if (a.category === b.category) {
        return a.id.localeCompare(b.id)
      }
      return a.category === 'platform' ? -1 : 1
    })
  }

  isEnabled(moduleId: string): boolean {
    return this.enabledMap.get(moduleId) === true
  }

  async enable(moduleId: string): Promise<ModuleSummary> {
    const mod = this.modules.get(moduleId)
    if (!mod) {
      throw new NotFoundException(`Module '${moduleId}' not found`)
    }

    if (this.isEnabled(moduleId)) {
      return this.toSummary(mod)
    }

    const missingOrDisabled: string[] = []
    for (const depId of mod.dependencies) {
      const dep = this.modules.get(depId)
      if (!dep) {
        missingOrDisabled.push(`${depId} (missing)`)
      } else if (!this.isEnabled(depId)) {
        missingOrDisabled.push(`${depId} (disabled)`)
      }
    }

    if (missingOrDisabled.length > 0) {
      throw new BadRequestException(
        `Cannot enable module '${mod.id}': missing or disabled dependencies: ${missingOrDisabled.join(', ')}`,
      )
    }

    await upsertPlatformModule(this.database.db, {
      id: mod.id,
      version: mod.version,
      enabled: true,
    })

    this.enabledMap.set(mod.id, true)
    return this.toSummary(mod)
  }

  async disable(moduleId: string): Promise<ModuleSummary> {
    const mod = this.modules.get(moduleId)
    if (!mod) {
      throw new NotFoundException(`Module '${moduleId}' not found`)
    }

    if (mod.category === 'platform') {
      throw new BadRequestException(`Cannot disable platform module '${mod.id}'`)
    }

    const activeDependents: string[] = []
    for (const [id, m] of this.modules.entries()) {
      if (id !== moduleId && this.isEnabled(id) && m.dependencies.includes(moduleId)) {
        activeDependents.push(m.displayName || id)
      }
    }

    if (activeDependents.length > 0) {
      throw new BadRequestException(
        `Cannot disable module '${mod.id}': required by enabled module(s): ${activeDependents.join(', ')}`,
      )
    }

    if (!this.isEnabled(moduleId)) {
      return this.toSummary(mod)
    }

    await setPlatformModuleEnabled(this.database.db, mod.id, false)
    this.enabledMap.set(mod.id, false)
    return this.toSummary(mod)
  }

  async syncWithDatabase(): Promise<void> {
    const rows = await findPlatformModules(this.database.db)
    const rowMap = new Map(rows.map((row) => [row.id, row]))

    for (const mod of this.modules.values()) {
      if (mod.category === 'platform') {
        await upsertPlatformModule(this.database.db, {
          id: mod.id,
          version: mod.version,
          enabled: true,
        })
        this.enabledMap.set(mod.id, true)
      } else {
        const row = rowMap.get(mod.id)
        if (row) {
          this.enabledMap.set(mod.id, row.enabled)
        } else {
          await upsertPlatformModule(this.database.db, {
            id: mod.id,
            version: mod.version,
            enabled: false,
          })
          this.enabledMap.set(mod.id, false)
        }
      }
    }
  }

  private toSummary(mod: RekaModule): ModuleSummary {
    return {
      id: mod.id,
      version: mod.version,
      displayName: mod.displayName,
      description: mod.description,
      category: mod.category,
      dependencies: [...mod.dependencies],
      permissions: mod.permissions ? [...mod.permissions] : [],
      routes: mod.routes ? [...mod.routes] : [],
      menus: mod.menus ? [...mod.menus] : [],
      enabled: this.isEnabled(mod.id),
    }
  }
}
