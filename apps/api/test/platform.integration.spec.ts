/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import fastifyCookie from '@fastify/cookie'
import type { FastifyInstance } from 'fastify'
import { API_PREFIX } from '@reka/contracts'
import { AppModule } from '../src/app.module.js'
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js'
import { AccessService } from '../src/modules/access/access.service.js'
import { auditLogs } from '../src/modules/audit/audit-log.schema.js'
import { UserService } from '../src/modules/identity/user.service.js'
import {
  extractSessionCookie,
  migrateTestDatabase,
  resetTestDatabase,
  TEST_DB_URL,
  truncateAllExcept,
  type Database,
} from './support.js'

interface ApiResponse {
  status: number
  json: any
  setCookie: string | undefined
}

const ADMIN_EMAIL = 'admin@example.com'
const ADMIN_PASSWORD = 'strong-password-123'

describe('platform integration (identity, organization, authorization, audit)', () => {
  let app: NestFastifyApplication
  let server: FastifyInstance
  let database: Database
  let access: AccessService
  let users: UserService

  beforeAll(async () => {
    process.env.APP_ENV = 'test'
    process.env.DATABASE_URL = TEST_DB_URL
    await resetTestDatabase()
    database = await migrateTestDatabase()

    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
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
  })

  beforeEach(async () => {
    await truncateAllExcept(database, [])
    await access.seedCatalog()
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
    opts: { payload?: unknown; cookie?: string } = {},
  ): Promise<ApiResponse> {
    const res = await server.inject({
      method,
      url,
      payload: opts.payload !== undefined ? JSON.stringify(opts.payload) : undefined,
      headers: {
        ...(opts.payload !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
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
    const cookie = res.setCookie!
    expect(cookie).toMatch(/^reka_session=/)
    return cookie
  }

  async function asAdmin(): Promise<{ cookie: string; orgId: string }> {
    const cookie = await runSetup()
    return { cookie, orgId: await firstOrg(cookie) }
  }

  async function firstOrg(cookie: string): Promise<string> {
    const orgs = await api('GET', `${API_PREFIX}/organizations`, { cookie })
    return orgs.json.organizations[0].id
  }

  async function rolesFor(orgId: string, cookie: string): Promise<any[]> {
    const res = await api('GET', `${API_PREFIX}/organizations/${orgId}/roles`, { cookie })
    return res.json.roles
  }

  async function createActiveUser(
    email: string,
    password: string,
    displayName: string,
  ): Promise<void> {
    await users.createWithPassword({ email, password, displayName })
  }

  async function actor(
    roleKey: 'owner' | 'member',
    email: string,
    admin: { cookie: string; orgId: string },
  ): Promise<string> {
    await createActiveUser(email, 'actor-password-123', email.split('@')[0])
    const roles = await rolesFor(admin.orgId, admin.cookie)
    const role = roles.find((r) => r.key === roleKey)
    await api('POST', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
      payload: { email, roleId: role.id },
      cookie: admin.cookie,
    })
    const login = await api('POST', `${API_PREFIX}/auth/login`, {
      payload: { email, password: 'actor-password-123' },
    })
    return login.setCookie!
  }

  describe('setup bootstrap', () => {
    it('creates the first user, organization, and session atomically', async () => {
      await runSetup()
    })

    it('rejects a second setup with 409', async () => {
      await runSetup()
      const res = await api('POST', `${API_PREFIX}/setup`, {
        payload: {
          email: 'second@example.com',
          password: 'another-strong-password',
          displayName: 'Second',
          organizationName: 'Second Org',
        },
      })
      expect(res.status).toBe(409)
      expect(res.json.code).toBe('conflict')
    })
  })

  describe('authentication', () => {
    it('requires no session then validates the active one', async () => {
      const admin = await asAdmin()
      const session = await api('GET', `${API_PREFIX}/auth/session`, { cookie: admin.cookie })
      expect(session.status).toBe(200)
      expect(session.json.user.email).toBe(ADMIN_EMAIL)
    })

    it('returns 401 for unauthenticated access', async () => {
      const res = await api('GET', `${API_PREFIX}/organizations`)
      expect(res.status).toBe(401)
      expect(res.json.code).toBe('unauthorized')
    })

    it('returns a generic message for wrong password and unknown email', async () => {
      await runSetup()
      const wrong = await api('POST', `${API_PREFIX}/auth/login`, {
        payload: { email: ADMIN_EMAIL, password: 'not-the-password' },
      })
      expect(wrong.status).toBe(401)
      expect(wrong.json.message).toBe('Invalid credentials')

      const unknown = await api('POST', `${API_PREFIX}/auth/login`, {
        payload: { email: 'ghost@example.com', password: ADMIN_PASSWORD },
      })
      expect(unknown.status).toBe(401)
      expect(unknown.json.message).toBe('Invalid credentials')
    })

    it('rejects a tampered cookie', async () => {
      await runSetup()
      const res = await api('GET', `${API_PREFIX}/auth/session`, {
        cookie: 'reka_session=garbage-token-value',
      })
      expect(res.status).toBe(401)
    })

    it('revokes the session on logout', async () => {
      const admin = await asAdmin()
      const logout = await api('POST', `${API_PREFIX}/auth/logout`, { cookie: admin.cookie })
      expect(logout.status).toBe(200)
      const after = await api('GET', `${API_PREFIX}/auth/session`, { cookie: admin.cookie })
      expect(after.status).toBe(401)
    })

    it('blocks a pending (invited) user from logging in', async () => {
      const admin = await asAdmin()
      const roles = await rolesFor(admin.orgId, admin.cookie)
      const member = roles.find((r) => r.key === 'member')
      await api('POST', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
        payload: { email: 'invited@example.com', roleId: member.id },
        cookie: admin.cookie,
      })
      const res = await api('POST', `${API_PREFIX}/auth/login`, {
        payload: { email: 'invited@example.com', password: 'does-not-matter-1' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('organizations', () => {
    it('lists, creates, and shows detail with owner permissions', async () => {
      const admin = await asAdmin()
      expect(
        await (
          await api('GET', `${API_PREFIX}/organizations`, { cookie: admin.cookie })
        ).json.organizations[0].name,
      ).toBe('Acme')

      const created = await api('POST', `${API_PREFIX}/organizations`, {
        payload: { name: 'Beta Corp' },
        cookie: admin.cookie,
      })
      expect(created.status).toBe(201)
      expect(created.json.organization.name).toBe('Beta Corp')

      const detail = await api(
        'GET',
        `${API_PREFIX}/organizations/${created.json.organization.id}`,
        {
          cookie: admin.cookie,
        },
      )
      expect(detail.json.organization.membership.role.key).toBe('owner')
      expect(detail.json.organization.membership.permissions).toContain('organization.update')
      expect(detail.json.organization.membership.permissions).toContain(
        'organization.members.manage',
      )
    })

    it('lets an owner update the organization', async () => {
      const admin = await asAdmin()
      const res = await api('PATCH', `${API_PREFIX}/organizations/${admin.orgId}`, {
        payload: { name: 'Acme Industries' },
        cookie: admin.cookie,
      })
      expect(res.status).toBe(200)
      expect(res.json.organization.name).toBe('Acme Industries')
    })

    it('does not expose an organization to a non-member (404)', async () => {
      const admin = await asAdmin()
      await createActiveUser('second@example.com', 'actor-password-123', 'Second')
      const login2 = await api('POST', `${API_PREFIX}/auth/login`, {
        payload: { email: 'second@example.com', password: 'actor-password-123' },
      })
      const cookie2 = login2.setCookie!
      const created = await api('POST', `${API_PREFIX}/organizations`, {
        payload: { name: 'Rival Org' },
        cookie: cookie2,
      })
      const rivalOrgId = created.json.organization.id

      const cross = await api('GET', `${API_PREFIX}/organizations/${rivalOrgId}`, {
        cookie: admin.cookie,
      })
      expect(cross.status).toBe(404)
      expect(cross.json.code).toBe('not_found')
    })
  })

  describe('authorization matrix', () => {
    it('allows an owner and forbids a plain member (403)', async () => {
      const admin = await asAdmin()
      const viewerCookie = await actor('member', 'viewer@example.com', admin)
      const viewerSession = await api('GET', `${API_PREFIX}/auth/session`, { cookie: viewerCookie })
      expect(viewerSession.status).toBe(200)

      const forbidden = await api('PATCH', `${API_PREFIX}/organizations/${admin.orgId}`, {
        payload: { name: 'Hacked' },
        cookie: viewerCookie,
      })
      expect(forbidden.status).toBe(403)
      expect(forbidden.json.code).toBe('forbidden')

      const allowed = await api('PATCH', `${API_PREFIX}/organizations/${admin.orgId}`, {
        payload: { name: 'Owner Writes' },
        cookie: admin.cookie,
      })
      expect(allowed.status).toBe(200)
    })

    it('promotes a member to owner on the backend, granting permissions immediately', async () => {
      const admin = await asAdmin()
      const promotedCookie = await actor('member', 'promoted@example.com', admin)

      const before = await api('GET', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
        cookie: promotedCookie,
      })
      expect(before.status).toBe(403)

      const roles = await rolesFor(admin.orgId, admin.cookie)
      const ownerRole = roles.find((r) => r.key === 'owner')
      const members = await api('GET', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
        cookie: admin.cookie,
      })
      const promoted = members.json.members.find((m: any) => m.email === 'promoted@example.com')

      const patch = await api(
        'PATCH',
        `${API_PREFIX}/organizations/${admin.orgId}/members/${promoted.id}`,
        {
          payload: { roleId: ownerRole.id },
          cookie: admin.cookie,
        },
      )
      expect(patch.status).toBe(200)

      const after = await api('GET', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
        cookie: promotedCookie,
      })
      expect(after.status).toBe(200)
    })

    it('protects the last owner from demotion or deactivation', async () => {
      const admin = await asAdmin()
      const members = await api('GET', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
        cookie: admin.cookie,
      })
      const owner = members.json.members.find((m: any) => m.roleKey === 'owner')
      const roles = await rolesFor(admin.orgId, admin.cookie)
      const memberRole = roles.find((r) => r.key === 'member')

      const demote = await api(
        'PATCH',
        `${API_PREFIX}/organizations/${admin.orgId}/members/${owner.id}`,
        {
          payload: { roleId: memberRole.id },
          cookie: admin.cookie,
        },
      )
      expect(demote.status).toBe(403)

      const deactivate = await api(
        'PATCH',
        `${API_PREFIX}/organizations/${admin.orgId}/members/${owner.id}`,
        {
          payload: { status: 'inactive' },
          cookie: admin.cookie,
        },
      )
      expect(deactivate.status).toBe(403)
    })

    it('blocks duplicate memberships at the database level', async () => {
      const admin = await asAdmin()
      const roles = await rolesFor(admin.orgId, admin.cookie)
      const member = roles.find((r) => r.key === 'member')
      await api('POST', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
        payload: { email: 'dup@example.com', roleId: member.id },
        cookie: admin.cookie,
      })
      const second = await api('POST', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
        payload: { email: 'dup@example.com', roleId: member.id },
        cookie: admin.cookie,
      })
      expect(second.status).toBe(409)
      expect(second.json.code).toBe('conflict')
    })

    it('validates payloads and returns a consistent error shape', async () => {
      const admin = await asAdmin()
      const bad = await api('POST', `${API_PREFIX}/auth/login`, {
        payload: { email: 'nope', password: '' },
      })
      expect(bad.status).toBe(400)
      expect(bad.json.code).toBe('validation')
      expect(bad.json.details).toBeDefined()

      const unknownOrg = await api('GET', `${API_PREFIX}/organizations/not-a-uuid`, {
        cookie: admin.cookie,
      })
      expect([400, 404]).toContain(unknownOrg.status)
    })
  })

  describe('audit trail', () => {
    it('records setup, login, organization, and membership events with actor context', async () => {
      const admin = await asAdmin()
      await api('POST', `${API_PREFIX}/auth/login`, {
        payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      })
      const roles = await rolesFor(admin.orgId, admin.cookie)
      const member = roles.find((r) => r.key === 'member')
      await api('POST', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
        payload: { email: 'audited@example.com', roleId: member.id },
        cookie: admin.cookie,
      })
      await api('POST', `${API_PREFIX}/auth/logout`, { cookie: admin.cookie })

      const rows = await database.db.select().from(auditLogs)
      const actions = rows.map((row) => row.action)
      expect(actions).toContain('setup.initialized')
      expect(actions).toContain('auth.login')
      expect(actions).toContain('organization.created')
      expect(actions).toContain('organization.member_added')
      expect(actions).toContain('auth.logout')
    })
  })

  describe('audit read endpoint', () => {
    it('requires authentication (401 without a session, not a permanent 401)', async () => {
      const res = await api('GET', `${API_PREFIX}/audit?organizationId=${crypto.randomUUID()}`)
      expect(res.status).toBe(401)
    })

    it('lets an owner read organization-scoped audit logs', async () => {
      const admin = await asAdmin()
      const updated = await api('PATCH', `${API_PREFIX}/organizations/${admin.orgId}`, {
        payload: { name: 'Acme Updated' },
        cookie: admin.cookie,
      })
      expect(updated.status).toBe(200)

      const res = await api('GET', `${API_PREFIX}/audit?organizationId=${admin.orgId}`, {
        cookie: admin.cookie,
      })
      expect(res.status).toBe(200)
      expect(res.json.logs.some((log: any) => log.action === 'organization.updated')).toBe(true)
    })

    it('forbids a member without audit.read', async () => {
      const admin = await asAdmin()
      const viewerCookie = await actor('member', 'auditor@example.com', admin)
      const res = await api('GET', `${API_PREFIX}/audit?organizationId=${admin.orgId}`, {
        cookie: viewerCookie,
      })
      expect(res.status).toBe(403)
    })
  })

  describe('member activation', () => {
    it('issues a single-use activation token that activates the pending account', async () => {
      const admin = await asAdmin()
      const roles = await rolesFor(admin.orgId, admin.cookie)
      const member = roles.find((r) => r.key === 'member')

      const invite = await api('POST', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
        payload: { email: 'newbie@example.com', roleId: member.id },
        cookie: admin.cookie,
      })
      expect(invite.status).toBe(201)
      const token = invite.json.member.activation.token
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(20)

      const before = await api('POST', `${API_PREFIX}/auth/login`, {
        payload: { email: 'newbie@example.com', password: 'not-set-yet-1' },
      })
      expect(before.status).toBe(401)

      const activate = await api('POST', `${API_PREFIX}/auth/activate`, {
        payload: { token, password: 'newbie-password-1' },
      })
      expect(activate.status).toBe(200)

      const login = await api('POST', `${API_PREFIX}/auth/login`, {
        payload: { email: 'newbie@example.com', password: 'newbie-password-1' },
      })
      expect(login.status).toBe(200)

      const reuse = await api('POST', `${API_PREFIX}/auth/activate`, {
        payload: { token, password: 'another-password-1' },
      })
      expect(reuse.status).toBe(400)
    })
  })
})
