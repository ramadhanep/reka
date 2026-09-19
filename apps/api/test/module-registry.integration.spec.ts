/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Controller, Get, UseGuards, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import fastifyCookie from '@fastify/cookie'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { API_PREFIX } from '@reka/contracts'
import { AppModule } from '../src/app.module.js'
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js'
import { AccessService } from '../src/modules/access/access.service.js'
import { auditLogs } from '../src/modules/audit/audit-log.schema.js'
import { UserService } from '../src/modules/identity/user.service.js'
import { ModuleEnabledGuard } from '../src/modules/module-registry/module-enabled.guard.js'
import { ModuleRegistryService } from '../src/modules/module-registry/module-registry.service.js'
import { ModuleRegistryModule } from '../src/modules/module-registry/module-registry.module.js'
import { platformModules } from '../src/modules/module-registry/module.schema.js'
import { RequireModule } from '../src/modules/module-registry/require-module.decorator.js'
import {
  extractSessionCookie,
  migrateTestDatabase,
  resetTestDatabase,
  TEST_DB_URL,
  truncateAllExcept,
  type Database,
} from './support.js'

@Controller('test-assets')
@RequireModule('assets')
@UseGuards(ModuleEnabledGuard)
class TestAssetsFeatureController {
  @Get('items')
  getItems() {
    return { items: ['laptop-01', 'monitor-02'] }
  }
}

interface ApiResponse {
  status: number
  json: any
  setCookie: string | undefined
}

const ADMIN_EMAIL = 'admin@example.com'
const ADMIN_PASSWORD = 'strong-password-123'

describe('module registry integration (API, authorization, dependencies, lifecycle, audit)', () => {
  let app: NestFastifyApplication
  let server: FastifyInstance
  let database: Database
  let access: AccessService
  let users: UserService
  let registry: ModuleRegistryService

  beforeAll(async () => {
    process.env.APP_ENV = 'test'
    process.env.DATABASE_URL = TEST_DB_URL
    await resetTestDatabase()
    database = await migrateTestDatabase()

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ModuleRegistryModule],
      controllers: [TestAssetsFeatureController],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    )
    await app.register(
      fastifyCookie as unknown as Parameters<NestFastifyApplication['register']>[0],
    )
    app.setGlobalPrefix(API_PREFIX)
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.init()
    server = app.getHttpAdapter().getInstance()
    access = app.get(AccessService)
    users = app.get(UserService)
    registry = app.get(ModuleRegistryService)
  })

  beforeEach(async () => {
    await truncateAllExcept(database, [])
    await access.seedCatalog()
    await registry.init()
  })

  afterAll(async () => {
    await database.close()
    await app.close()
    delete process.env.APP_ENV
    delete process.env.DATABASE_URL
  })

  async function api(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    opts: { payload?: unknown; cookie?: string; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse> {
    const res = await server.inject({
      method,
      url,
      payload: opts.payload !== undefined ? JSON.stringify(opts.payload) : undefined,
      headers: {
        ...(opts.payload !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...(opts.headers ?? {}),
      },
    })
    return {
      status: res.statusCode,
      json: res.json(),
      setCookie: extractSessionCookie(res.headers['set-cookie']),
    }
  }

  async function runSetup(): Promise<string> {
    const res = await api('POST', `${API_PREFIX}/setup`, {
      payload: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        displayName: 'Admin',
        organizationName: 'Acme',
      },
    })
    expect(res.status).toBe(200)
    return res.setCookie!
  }

  async function asAdmin(): Promise<{ cookie: string; orgId: string }> {
    const cookie = await runSetup()
    const orgs = await api('GET', `${API_PREFIX}/organizations`, { cookie })
    return { cookie, orgId: orgs.json.organizations[0].id }
  }

  async function createMember(
    admin: { cookie: string; orgId: string },
    email: string,
  ): Promise<string> {
    await users.createWithPassword({
      email,
      password: 'member-password-123',
      displayName: 'Member',
    })
    const rolesRes = await api('GET', `${API_PREFIX}/organizations/${admin.orgId}/roles`, {
      cookie: admin.cookie,
    })
    const memberRole = rolesRes.json.roles.find((r: any) => r.key === 'member')
    await api('POST', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
      payload: { email, roleId: memberRole.id },
      cookie: admin.cookie,
    })
    const login = await api('POST', `${API_PREFIX}/auth/login`, {
      payload: { email, password: 'member-password-123' },
    })
    return login.setCookie!
  }

  describe('module listing and retrieval', () => {
    it('returns all registered platform and business modules for an authorized user', async () => {
      const admin = await asAdmin()
      const res = await api('GET', `${API_PREFIX}/modules`, { cookie: admin.cookie })

      expect(res.status).toBe(200)
      expect(res.json.modules).toBeDefined()
      const moduleIds = res.json.modules.map((m: any) => m.id)

      // Platform modules must be present and enabled
      expect(moduleIds).toContain('core')
      expect(moduleIds).toContain('identity')
      expect(moduleIds).toContain('access')
      expect(moduleIds).toContain('organization')
      expect(moduleIds).toContain('audit')
      expect(moduleIds).toContain('module-registry')

      const identityMod = res.json.modules.find((m: any) => m.id === 'identity')
      expect(identityMod.enabled).toBe(true)
      expect(identityMod.category).toBe('platform')

      // Business modules must be present and initially disabled
      expect(moduleIds).toContain('assets')
      expect(moduleIds).toContain('procurement')
      const assetsMod = res.json.modules.find((m: any) => m.id === 'assets')
      expect(assetsMod.enabled).toBe(false)
      expect(assetsMod.category).toBe('business')
    })

    it('returns a single module detail by id', async () => {
      const admin = await asAdmin()
      const res = await api('GET', `${API_PREFIX}/modules/assets`, { cookie: admin.cookie })

      expect(res.status).toBe(200)
      expect(res.json.module.id).toBe('assets')
      expect(res.json.module.displayName).toBe('Asset Management')
      expect(res.json.module.dependencies).toEqual(['organization', 'access', 'audit'])
    })

    it('returns 404 when module does not exist', async () => {
      const admin = await asAdmin()
      const res = await api('GET', `${API_PREFIX}/modules/non-existent-xyz`, {
        cookie: admin.cookie,
      })
      expect(res.status).toBe(404)
    })
  })

  describe('authorization matrix', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await api('GET', `${API_PREFIX}/modules`)
      expect(res.status).toBe(401)

      const enableRes = await api('POST', `${API_PREFIX}/modules/assets/enable`)
      expect(enableRes.status).toBe(401)
    })

    it('rejects a regular member without module.manage permission with 403', async () => {
      const admin = await asAdmin()
      const memberCookie = await createMember(admin, 'member@example.com')

      const enableRes = await api('POST', `${API_PREFIX}/modules/assets/enable`, {
        cookie: memberCookie,
      })
      expect(enableRes.status).toBe(403)
      expect(enableRes.json.code).toBe('forbidden')

      const disableRes = await api('POST', `${API_PREFIX}/modules/assets/disable`, {
        cookie: memberCookie,
      })
      expect(disableRes.status).toBe(403)
    })

    it('allows an authorized organization admin (owner) to enable and disable modules', async () => {
      const admin = await asAdmin()
      const enableRes = await api('POST', `${API_PREFIX}/modules/assets/enable`, {
        cookie: admin.cookie,
      })
      expect(enableRes.status).toBe(200)
      expect(enableRes.json.module.enabled).toBe(true)

      const disableRes = await api('POST', `${API_PREFIX}/modules/assets/disable`, {
        cookie: admin.cookie,
      })
      expect(disableRes.status).toBe(200)
      expect(disableRes.json.module.enabled).toBe(false)
    })
  })

  describe('dependency validation and lifecycle', () => {
    it('blocks enabling a module when required dependencies are unavailable', async () => {
      const admin = await asAdmin()
      // procurement depends on ['organization', 'access', 'audit', 'workflow']
      // workflow is not implemented/registered
      const res = await api('POST', `${API_PREFIX}/modules/procurement/enable`, {
        cookie: admin.cookie,
      })

      expect(res.status).toBe(400)
      expect(res.json.message).toContain('missing or disabled dependencies')
      expect(res.json.message).toContain('workflow (missing)')
    })

    it('blocks disabling a required platform module', async () => {
      const admin = await asAdmin()
      const res = await api('POST', `${API_PREFIX}/modules/identity/disable`, {
        cookie: admin.cookie,
      })

      expect(res.status).toBe(400)
      expect(res.json.message).toContain("Cannot disable platform module 'identity'")
    })

    it('blocks disabling a module when another enabled module depends on it', async () => {
      const admin = await asAdmin()

      // First enable assets
      const enableAssets = await api('POST', `${API_PREFIX}/modules/assets/enable`, {
        cookie: admin.cookie,
      })
      expect(enableAssets.status).toBe(200)

      // Inventory depends on organization and assets
      const enableInventory = await api('POST', `${API_PREFIX}/modules/inventory/enable`, {
        cookie: admin.cookie,
      })
      expect(enableInventory.status).toBe(200)
      expect(enableInventory.json.module.enabled).toBe(true)

      // Now attempt to disable assets while inventory is enabled
      const disableAssets = await api('POST', `${API_PREFIX}/modules/assets/disable`, {
        cookie: admin.cookie,
      })
      expect(disableAssets.status).toBe(400)
      expect(disableAssets.json.message).toContain(
        "Cannot disable module 'assets': required by enabled module(s): Inventory",
      )

      // Once inventory is disabled, disabling assets succeeds
      const disableInventory = await api('POST', `${API_PREFIX}/modules/inventory/disable`, {
        cookie: admin.cookie,
      })
      expect(disableInventory.status).toBe(200)

      const disableAssetsAgain = await api('POST', `${API_PREFIX}/modules/assets/disable`, {
        cookie: admin.cookie,
      })
      expect(disableAssetsAgain.status).toBe(200)
      expect(disableAssetsAgain.json.module.enabled).toBe(false)
    })

    it('preserves database rows and does not drop tables on disable (disable != delete)', async () => {
      const admin = await asAdmin()

      await api('POST', `${API_PREFIX}/modules/assets/enable`, { cookie: admin.cookie })
      let dbRow = await database.db
        .select()
        .from(platformModules)
        .where(eq(platformModules.id, 'assets'))
      expect(dbRow[0].enabled).toBe(true)

      await api('POST', `${API_PREFIX}/modules/assets/disable`, { cookie: admin.cookie })
      dbRow = await database.db
        .select()
        .from(platformModules)
        .where(eq(platformModules.id, 'assets'))
      expect(dbRow.length).toBe(1)
      expect(dbRow[0].enabled).toBe(false)
      expect(dbRow[0].version).toBe('0.1.0')
    })
  })

  describe('audit trail', () => {
    it('records module.enabled and module.disabled audit events with actor and org context', async () => {
      const admin = await asAdmin()

      await api('POST', `${API_PREFIX}/modules/assets/enable`, { cookie: admin.cookie })
      await api('POST', `${API_PREFIX}/modules/assets/disable`, { cookie: admin.cookie })

      const rows = await database.db.select().from(auditLogs)
      const enableLogs = rows.filter((r) => r.action === 'module.enabled')
      const disableLogs = rows.filter((r) => r.action === 'module.disabled')

      expect(enableLogs.length).toBeGreaterThan(0)
      expect(disableLogs.length).toBeGreaterThan(0)

      const enableLog = enableLogs[0]
      expect(enableLog.resourceType).toBe('module')
      expect(enableLog.resourceId).toBe('assets')
      expect(enableLog.organizationId).toBe(admin.orgId)
      expect(enableLog.actorId).toBeDefined()
      expect((enableLog.metadata as any)?.displayName).toBe('Asset Management')

      const disableLog = disableLogs[0]
      expect(disableLog.resourceType).toBe('module')
      expect(disableLog.resourceId).toBe('assets')
      expect(disableLog.organizationId).toBe(admin.orgId)
      expect(disableLog.actorId).toBeDefined()
    })
  })

  describe('module route protection (@RequireModule)', () => {
    it('blocks HTTP access with 404 when module is disabled, and allows access when enabled', async () => {
      // assets is disabled initially
      const resDisabled = await api('GET', `${API_PREFIX}/test-assets/items`)
      expect(resDisabled.status).toBe(404)
      expect(resDisabled.json.message).toContain("Module 'assets' is disabled")

      // Enable assets
      const admin = await asAdmin()
      const enableRes = await api('POST', `${API_PREFIX}/modules/assets/enable`, {
        cookie: admin.cookie,
      })
      expect(enableRes.status).toBe(200)

      // Now endpoint is accessible
      const resEnabled = await api('GET', `${API_PREFIX}/test-assets/items`)
      expect(resEnabled.status).toBe(200)
      expect(resEnabled.json.items).toEqual(['laptop-01', 'monitor-02'])

      // Disable assets
      const disableRes = await api('POST', `${API_PREFIX}/modules/assets/disable`, {
        cookie: admin.cookie,
      })
      expect(disableRes.status).toBe(200)

      // Endpoint is blocked again
      const resDisabledAgain = await api('GET', `${API_PREFIX}/test-assets/items`)
      expect(resDisabledAgain.status).toBe(404)
    })
  })
})
