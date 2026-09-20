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
import { grantRolePermissions, type RoleRow } from '../src/modules/access/role.repo.js'
import { ensurePermissions, findPermissionsByKeys } from '../src/modules/access/permission.repo.js'
import { auditLogs } from '../src/modules/audit/audit-log.schema.js'
import { ModuleRegistryService } from '../src/modules/module-registry/module-registry.service.js'
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

describe('Workflow Engine Integration (Definitions, Instances, Transitions, Concurrency, RBAC, Audit)', () => {
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

  async function runSetup(): Promise<{ cookie: string; orgId: string }> {
    const res = await api('POST', `${API_PREFIX}/setup`, {
      payload: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        displayName: 'Admin User',
        organizationName: 'Acme Corp',
      },
    })
    expect(res.status).toBe(200)
    const cookie = res.setCookie!
    const orgs = await api('GET', `${API_PREFIX}/organizations`, { cookie })
    return { cookie, orgId: orgs.json.organizations[0].id }
  }

  async function createSecondOrg(cookie: string): Promise<string> {
    const res = await api('POST', `${API_PREFIX}/organizations`, {
      cookie,
      payload: { name: 'Beta Industries', slug: 'beta-ind' },
    })
    return res.json.organization.id
  }

  async function createMemberUser(
    admin: { cookie: string; orgId: string },
    email: string,
    permissions: string[] = [],
  ): Promise<{ cookie: string; userId: string }> {
    const user = await users.createWithPassword({
      email,
      password: 'password-1234',
      displayName: email.split('@')[0],
    })

    const rolesRes = await api('GET', `${API_PREFIX}/organizations/${admin.orgId}/roles`, {
      cookie: admin.cookie,
    })
    const memberRole = rolesRes.json.roles.find((r: RoleRow) => r.key === 'member')

    // Add as member
    await api('POST', `${API_PREFIX}/organizations/${admin.orgId}/members`, {
      cookie: admin.cookie,
      payload: { email: user.email, roleId: memberRole.id },
    })

    if (permissions.length > 0) {
      await ensurePermissions(database.db, permissions, (k) => k)
      const pRows = await findPermissionsByKeys(database.db, permissions)
      await grantRolePermissions(
        database.db,
        memberRole.id,
        pRows.map((r) => r.id),
      )
    }

    const loginRes = await api('POST', `${API_PREFIX}/auth/login`, {
      payload: { email, password: 'password-1234' },
    })
    return { cookie: loginRes.setCookie!, userId: user.id }
  }

  const samplePurchaseWorkflow = {
    key: 'purchase-request',
    name: 'Purchase Request Workflow',
    description: 'Standard 3-step purchase approval',
    states: [
      { key: 'draft', name: 'Draft', isInitial: true },
      { key: 'submitted', name: 'Submitted' },
      { key: 'approved', name: 'Approved', isTerminal: true },
      { key: 'rejected', name: 'Rejected', isTerminal: true },
    ],
    transitions: [
      { key: 'submit', name: 'Submit Request', fromStateKey: 'draft', toStateKey: 'submitted' },
      {
        key: 'approve',
        name: 'Approve Request',
        fromStateKey: 'submitted',
        toStateKey: 'approved',
        requiredPermission: 'purchase_request.approve',
      },
      { key: 'reject', name: 'Reject Request', fromStateKey: 'submitted', toStateKey: 'rejected' },
    ],
  }

  describe('Workflow Definitions & Lifecycle', () => {
    it('creates a draft workflow definition and rejects instance creation before activation', async () => {
      const admin = await runSetup()

      const createRes = await api('POST', `${API_PREFIX}/workflows`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: samplePurchaseWorkflow,
      })

      expect(createRes.status).toBe(201)
      const workflow = createRes.json.workflow
      expect(workflow.key).toBe('purchase-request')
      expect(workflow.version).toBe(1)
      expect(workflow.status).toBe('draft')
      expect(workflow.states).toHaveLength(4)
      expect(workflow.transitions).toHaveLength(3)

      // Starting instance on draft definition must fail
      const startRes = await api('POST', `${API_PREFIX}/workflow-instances`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: {
          workflowDefinitionId: workflow.id,
          subjectType: 'purchase_request',
          subjectId: 'PR-001',
        },
      })
      expect(startRes.status).toBe(400)
      expect(startRes.json.message).toContain('Definition must be active')
    })

    it('publishes a definition to active and allows starting instances', async () => {
      const admin = await runSetup()

      const createRes = await api('POST', `${API_PREFIX}/workflows`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: samplePurchaseWorkflow,
      })
      const defId = createRes.json.workflow.id

      // Publish
      const pubRes = await api('POST', `${API_PREFIX}/workflows/${defId}/publish`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })
      expect(pubRes.status).toBe(200)
      expect(pubRes.json.workflow.status).toBe('active')

      // Now start instance succeeds
      const startRes = await api('POST', `${API_PREFIX}/workflow-instances`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: {
          workflowDefinitionKey: 'purchase-request',
          subjectType: 'purchase_request',
          subjectId: 'PR-002',
        },
      })
      expect(startRes.status).toBe(201)
      expect(startRes.json.instance.currentStateKey).toBe('draft')
      expect(startRes.json.instance.status).toBe('active')
      expect(startRes.json.instance.availableTransitions).toHaveLength(1)
      expect(startRes.json.instance.availableTransitions[0].key).toBe('submit')
    })

    it('creates next version (v2) from existing definition', async () => {
      const admin = await runSetup()

      const createRes = await api('POST', `${API_PREFIX}/workflows`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: samplePurchaseWorkflow,
      })
      const defId = createRes.json.workflow.id

      const v2Res = await api('POST', `${API_PREFIX}/workflows/${defId}/version`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })

      expect(v2Res.status).toBe(201)
      expect(v2Res.json.workflow.version).toBe(2)
      expect(v2Res.json.workflow.status).toBe('draft')
      expect(v2Res.json.workflow.states).toHaveLength(4)
      expect(v2Res.json.workflow.transitions).toHaveLength(3)
    })
  })

  describe('State Machine Rules & Transitions', () => {
    it('executes valid transitions until reaching a terminal state', async () => {
      const admin = await runSetup()

      // Grant purchase_request.approve to owner
      await ensurePermissions(database.db, ['purchase_request.approve'], (k) => k)
      const roles = await api('GET', `${API_PREFIX}/organizations/${admin.orgId}/roles`, {
        cookie: admin.cookie,
      })
      const ownerRole = roles.json.roles.find((r: any) => r.key === 'owner')
      const pRows = await findPermissionsByKeys(database.db, ['purchase_request.approve'])
      await grantRolePermissions(
        database.db,
        ownerRole.id,
        pRows.map((r) => r.id),
      )

      const createRes = await api('POST', `${API_PREFIX}/workflows`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: samplePurchaseWorkflow,
      })
      const defId = createRes.json.workflow.id
      await api('POST', `${API_PREFIX}/workflows/${defId}/publish`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })

      const instRes = await api('POST', `${API_PREFIX}/workflow-instances`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: {
          workflowDefinitionId: defId,
          subjectType: 'purchase_request',
          subjectId: 'PR-101',
        },
      })
      const instanceId = instRes.json.instance.id

      // Step 1: Execute submit (draft -> submitted)
      const t1 = await api(
        'POST',
        `${API_PREFIX}/workflow-instances/${instanceId}/transitions/submit`,
        {
          cookie: admin.cookie,
          headers: { 'x-organization-id': admin.orgId },
          payload: { comment: 'Submitting purchase request for $500 laptop' },
        },
      )
      expect(t1.status).toBe(200)
      expect(t1.json.instance.currentStateKey).toBe('submitted')
      expect(t1.json.instance.status).toBe('active')
      expect(t1.json.instance.availableTransitions).toHaveLength(2)

      // Step 2: Execute approve (submitted -> approved, which is terminal)
      const t2 = await api(
        'POST',
        `${API_PREFIX}/workflow-instances/${instanceId}/transitions/approve`,
        {
          cookie: admin.cookie,
          headers: { 'x-organization-id': admin.orgId },
          payload: { comment: 'Approved by finance' },
        },
      )
      expect(t2.status).toBe(200)
      expect(t2.json.instance.currentStateKey).toBe('approved')
      expect(t2.json.instance.status).toBe('completed')
      expect(t2.json.instance.availableTransitions).toHaveLength(0)

      // Step 3: Terminal state prevents any further transitions
      const t3 = await api(
        'POST',
        `${API_PREFIX}/workflow-instances/${instanceId}/transitions/reject`,
        {
          cookie: admin.cookie,
          headers: { 'x-organization-id': admin.orgId },
          payload: { comment: 'Trying to reject after approved' },
        },
      )
      expect(t3.status).toBe(400)
      expect(t3.json.message).toContain("Cannot transition workflow instance in 'completed' status")
    })

    it('rejects an invalid transition not defined for the current state', async () => {
      const admin = await runSetup()
      const createRes = await api('POST', `${API_PREFIX}/workflows`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: samplePurchaseWorkflow,
      })
      const defId = createRes.json.workflow.id
      await api('POST', `${API_PREFIX}/workflows/${defId}/publish`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })

      const instRes = await api('POST', `${API_PREFIX}/workflow-instances`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: {
          workflowDefinitionId: defId,
          subjectType: 'purchase_request',
          subjectId: 'PR-102',
        },
      })
      const instanceId = instRes.json.instance.id

      // Instance is in 'draft'. Attempting 'approve' directly must be rejected
      const res = await api(
        'POST',
        `${API_PREFIX}/workflow-instances/${instanceId}/transitions/approve`,
        {
          cookie: admin.cookie,
          headers: { 'x-organization-id': admin.orgId },
        },
      )
      expect(res.status).toBe(400)
      expect(res.json.message).toContain(
        "Transition 'approve' cannot be executed from current state 'draft'",
      )
    })
  })

  describe('Transition Authorization & RBAC', () => {
    it('blocks a user without the transition required permission with 403', async () => {
      const admin = await runSetup()

      const createRes = await api('POST', `${API_PREFIX}/workflows`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: samplePurchaseWorkflow,
      })
      const defId = createRes.json.workflow.id
      await api('POST', `${API_PREFIX}/workflows/${defId}/publish`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })

      const instRes = await api('POST', `${API_PREFIX}/workflow-instances`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: {
          workflowDefinitionId: defId,
          subjectType: 'purchase_request',
          subjectId: 'PR-103',
        },
      })
      const instanceId = instRes.json.instance.id

      // Advance to 'submitted'
      await api('POST', `${API_PREFIX}/workflow-instances/${instanceId}/transitions/submit`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })

      // Create a regular member who has 'workflow.instance.transition' but NOT 'purchase_request.approve'
      const member = await createMemberUser(admin, 'employee@example.com', [
        'workflow.instance.read',
        'workflow.instance.transition',
      ])

      const approveRes = await api(
        'POST',
        `${API_PREFIX}/workflow-instances/${instanceId}/transitions/approve`,
        {
          cookie: member.cookie,
          headers: { 'x-organization-id': admin.orgId },
        },
      )
      expect(approveRes.status).toBe(403)
      expect(approveRes.json.message).toContain(
        'Missing required permission: purchase_request.approve',
      )
    })

    it('allows transition when member role is granted the required permission', async () => {
      const admin = await runSetup()

      const createRes = await api('POST', `${API_PREFIX}/workflows`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: samplePurchaseWorkflow,
      })
      const defId = createRes.json.workflow.id
      await api('POST', `${API_PREFIX}/workflows/${defId}/publish`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })

      const instRes = await api('POST', `${API_PREFIX}/workflow-instances`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: {
          workflowDefinitionId: defId,
          subjectType: 'purchase_request',
          subjectId: 'PR-104',
        },
      })
      const instanceId = instRes.json.instance.id

      await api('POST', `${API_PREFIX}/workflow-instances/${instanceId}/transitions/submit`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })

      // Create manager with both workflow.instance.transition and purchase_request.approve
      const manager = await createMemberUser(admin, 'manager@example.com', [
        'workflow.instance.read',
        'workflow.instance.transition',
        'purchase_request.approve',
      ])

      const approveRes = await api(
        'POST',
        `${API_PREFIX}/workflow-instances/${instanceId}/transitions/approve`,
        {
          cookie: manager.cookie,
          headers: { 'x-organization-id': admin.orgId },
          payload: { comment: 'Approved by manager' },
        },
      )
      expect(approveRes.status).toBe(200)
      expect(approveRes.json.instance.currentStateKey).toBe('approved')
    })
  })

  describe('Organization Tenant Isolation', () => {
    it('prevents a user from Org A from accessing or mutating instances belonging to Org B', async () => {
      const admin = await runSetup()
      const orgBId = await createSecondOrg(admin.cookie)

      // Admin has owner access to org A and org B, but create a user who is ONLY in Org B
      const userB = await createActiveUser('user-b@example.com', 'pw-123456', 'User B')
      const rolesB = await api('GET', `${API_PREFIX}/organizations/${orgBId}/roles`, {
        cookie: admin.cookie,
      })
      const memberRoleB = rolesB.json.roles.find((r: any) => r.key === 'owner')
      await api('POST', `${API_PREFIX}/organizations/${orgBId}/members`, {
        cookie: admin.cookie,
        payload: { email: userB.email, roleId: memberRoleB.id },
      })
      const loginB = await api('POST', `${API_PREFIX}/auth/login`, {
        payload: { email: 'user-b@example.com', password: 'pw-123456' },
      })

      // Create workflow and instance in Org A
      const createRes = await api('POST', `${API_PREFIX}/workflows`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: samplePurchaseWorkflow,
      })
      const defId = createRes.json.workflow.id
      await api('POST', `${API_PREFIX}/workflows/${defId}/publish`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })

      const instRes = await api('POST', `${API_PREFIX}/workflow-instances`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: {
          workflowDefinitionId: defId,
          subjectType: 'purchase_request',
          subjectId: 'PR-105',
        },
      })
      const instanceId = instRes.json.instance.id

      // User B tries to read Org A instance using Org B header
      const readRes = await api('GET', `${API_PREFIX}/workflow-instances/${instanceId}`, {
        cookie: loginB.setCookie,
        headers: { 'x-organization-id': orgBId },
      })
      expect(readRes.status).toBe(403)
      expect(readRes.json.message).toContain(
        'Cannot access workflow instance from another organization',
      )

      // User B tries to transition Org A instance
      const transRes = await api(
        'POST',
        `${API_PREFIX}/workflow-instances/${instanceId}/transitions/submit`,
        {
          cookie: loginB.setCookie,
          headers: { 'x-organization-id': orgBId },
        },
      )
      expect(transRes.status).toBe(403)
      expect(transRes.json.message).toContain(
        'Cannot access workflow instance from another organization',
      )
    })
  })

  describe('Transition History & Audit Logging', () => {
    it('records immutable transition history and audit events', async () => {
      const admin = await runSetup()

      const createRes = await api('POST', `${API_PREFIX}/workflows`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: samplePurchaseWorkflow,
      })
      const defId = createRes.json.workflow.id
      await api('POST', `${API_PREFIX}/workflows/${defId}/publish`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })

      const instRes = await api('POST', `${API_PREFIX}/workflow-instances`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: {
          workflowDefinitionId: defId,
          subjectType: 'purchase_request',
          subjectId: 'PR-106',
        },
      })
      const instanceId = instRes.json.instance.id

      // Execute submit
      await api('POST', `${API_PREFIX}/workflow-instances/${instanceId}/transitions/submit`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: { comment: 'First step submitted' },
      })

      // Execute reject
      await api('POST', `${API_PREFIX}/workflow-instances/${instanceId}/transitions/reject`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: { comment: 'Budget exceeded' },
      })

      // Query history
      const historyRes = await api(
        'GET',
        `${API_PREFIX}/workflow-instances/${instanceId}/history`,
        {
          cookie: admin.cookie,
          headers: { 'x-organization-id': admin.orgId },
        },
      )
      expect(historyRes.status).toBe(200)
      const history = historyRes.json.history
      expect(history).toHaveLength(2)

      // Most recent first: reject
      expect(history[0].transitionKey).toBe('reject')
      expect(history[0].fromStateKey).toBe('submitted')
      expect(history[0].toStateKey).toBe('rejected')
      expect(history[0].comment).toBe('Budget exceeded')

      // Older: submit
      expect(history[1].transitionKey).toBe('submit')
      expect(history[1].fromStateKey).toBe('draft')
      expect(history[1].toStateKey).toBe('submitted')
      expect(history[1].comment).toBe('First step submitted')

      // Verify audit logs in PostgreSQL
      const logs = await database.db.select().from(auditLogs)
      const actions = logs.map((l) => l.action)
      expect(actions).toContain('workflow.definition.created')
      expect(actions).toContain('workflow.definition.published')
      expect(actions).toContain('workflow.instance.created')
      expect(actions).toContain('workflow.transition.executed')
    })
  })

  describe('Concurrency Control', () => {
    it('prevents two concurrent transitions on the same instance from corrupting state', async () => {
      const admin = await runSetup()

      // Grant approve permission
      await ensurePermissions(database.db, ['purchase_request.approve'], (k) => k)
      const roles = await api('GET', `${API_PREFIX}/organizations/${admin.orgId}/roles`, {
        cookie: admin.cookie,
      })
      const ownerRole = roles.json.roles.find((r: any) => r.key === 'owner')
      const pRows = await findPermissionsByKeys(database.db, ['purchase_request.approve'])
      await grantRolePermissions(
        database.db,
        ownerRole.id,
        pRows.map((r) => r.id),
      )

      const createRes = await api('POST', `${API_PREFIX}/workflows`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: samplePurchaseWorkflow,
      })
      const defId = createRes.json.workflow.id
      await api('POST', `${API_PREFIX}/workflows/${defId}/publish`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })

      const instRes = await api('POST', `${API_PREFIX}/workflow-instances`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
        payload: {
          workflowDefinitionId: defId,
          subjectType: 'purchase_request',
          subjectId: 'PR-RACE',
        },
      })
      const instanceId = instRes.json.instance.id

      // Move to 'submitted'
      await api('POST', `${API_PREFIX}/workflow-instances/${instanceId}/transitions/submit`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })

      // Now fire two conflicting transitions simultaneously: approve vs reject
      // Request A: approve (submitted -> approved)
      // Request B: reject  (submitted -> rejected)
      const [resA, resB] = await Promise.all([
        api('POST', `${API_PREFIX}/workflow-instances/${instanceId}/transitions/approve`, {
          cookie: admin.cookie,
          headers: { 'x-organization-id': admin.orgId },
          payload: { comment: 'Concurrent approve' },
        }),
        api('POST', `${API_PREFIX}/workflow-instances/${instanceId}/transitions/reject`, {
          cookie: admin.cookie,
          headers: { 'x-organization-id': admin.orgId },
          payload: { comment: 'Concurrent reject' },
        }),
      ])

      const statuses = [resA.status, resB.status]
      // Exactly ONE request must succeed (200), and the other must be rejected (400)
      expect(statuses).toContain(200)
      expect(statuses).toContain(400)

      // Verify the instance ended up in exactly ONE terminal state
      const finalInstance = await api('GET', `${API_PREFIX}/workflow-instances/${instanceId}`, {
        cookie: admin.cookie,
        headers: { 'x-organization-id': admin.orgId },
      })
      expect(finalInstance.json.instance.status).toBe('completed')
      expect(['approved', 'rejected']).toContain(finalInstance.json.instance.currentStateKey)

      // Verify history only has 2 transitions: submit and whichever won the race!
      const historyRes = await api(
        'GET',
        `${API_PREFIX}/workflow-instances/${instanceId}/history`,
        {
          cookie: admin.cookie,
          headers: { 'x-organization-id': admin.orgId },
        },
      )
      expect(historyRes.json.history).toHaveLength(2)
    })
  })

  async function createActiveUser(
    email: string,
    password: string,
    displayName: string,
  ): Promise<{ id: string }> {
    return users.createWithPassword({ email, password, displayName })
  }
})
