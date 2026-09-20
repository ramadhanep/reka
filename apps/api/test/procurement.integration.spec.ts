/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import fastifyCookie from '@fastify/cookie'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { API_PREFIX } from '@reka/contracts'
import { AppModule } from '../src/app.module.js'
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js'
import { AccessService } from '../src/modules/access/access.service.js'
import { grantRolePermissions, type RoleRow } from '../src/modules/access/role.repo.js'
import { ensurePermissions, findPermissionsByKeys } from '../src/modules/access/permission.repo.js'
import { auditLogs } from '../src/modules/audit/audit-log.schema.js'
import { ModuleRegistryService } from '../src/modules/module-registry/module-registry.service.js'
import { ProcurementService } from '../src/modules/procurement/procurement.service.js'
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

describe('Procurement Integration (Vendors, Requests, Workflow Approvals, Orders, Receipts, Isolation, RBAC, Audit, Concurrency)', () => {
  let app: NestFastifyApplication
  let server: FastifyInstance
  let database: Database
  let access: AccessService
  let users: UserService
  let registry: ModuleRegistryService
  let procurement: ProcurementService

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
    procurement = app.get(ProcurementService)
  })

  beforeEach(async () => {
    await truncateAllExcept(database, [])
    await access.seedCatalog()
    await registry.init()
    await registry.enable('procurement')
    await procurement.seed()
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

  interface Session {
    cookie: string
    orgId: string
  }

  async function runSetup(): Promise<Session> {
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

  async function createSecondOrg(session: Session): Promise<string> {
    const res = await api('POST', `${API_PREFIX}/organizations`, {
      cookie: session.cookie,
      payload: { name: 'Beta Industries', slug: 'beta-ind' },
    })
    expect(res.status).toBe(201)
    return res.json.organization.id
  }

  async function memberFor(
    session: Session,
    email: string,
    permissions: string[] = [],
  ): Promise<{ cookie: string; userId: string; orgId: string }> {
    const user = await users.createWithPassword({
      email,
      password: 'password-1234',
      displayName: email.split('@')[0],
    })
    const rolesRes = await api('GET', `${API_PREFIX}/organizations/${session.orgId}/roles`, {
      cookie: session.cookie,
    })
    const memberRole = rolesRes.json.roles.find((r: RoleRow) => r.key === 'member')
    await api('POST', `${API_PREFIX}/organizations/${session.orgId}/members`, {
      cookie: session.cookie,
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
    expect(loginRes.status).toBe(200)
    return { cookie: loginRes.setCookie!, userId: user.id, orgId: session.orgId }
  }

  function orgHeaders(session: Session): Record<string, string> {
    return { 'x-organization-id': session.orgId }
  }

  async function createVendor(
    session: Session,
    payload = { name: 'PT Sumber Jaya', code: 'SUMBER01' },
  ) {
    const res = await api('POST', `${API_PREFIX}/vendors`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload,
    })
    expect(res.status).toBe(201)
    return res.json.vendor
  }

  async function createRequest(session: Session, payload: Record<string, unknown>): Promise<any> {
    const res = await api('POST', `${API_PREFIX}/purchase-requests`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload,
    })
    expect(res.status).toBe(201)
    return res.json.purchaseRequest
  }

  function requestPayload(
    items = [{ description: 'Laptop', quantity: 5, estimatedUnitPrice: 15000000 }],
  ) {
    return { title: 'IT Equipment', description: 'Q3 hardware', items }
  }

  describe('Module registration & enablement', () => {
    it('registers procurement as a business module depending on workflow', async () => {
      const mod = registry.get('procurement')
      expect(mod).toBeDefined()
      expect(mod?.category).toBe('business')
      expect(mod?.dependencies).toEqual(['organization', 'access', 'audit', 'workflow'])
      expect(mod?.enabled).toBe(true)
      expect(mod?.permissions).toContain('procurement.purchase_request.approve')
    })

    it('blocks procurement API access when the module is disabled', async () => {
      const session = await runSetup()
      await registry.disable('procurement')
      const res = await api('GET', `${API_PREFIX}/vendors`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(res.status).toBe(404)
    })
  })

  describe('Vendor CRUD', () => {
    it('creates, lists, reads, and updates a vendor with audit', async () => {
      const session = await runSetup()
      const vendor = await createVendor(session)
      expect(vendor.number).toBeUndefined()
      expect(vendor.name).toBe('PT Sumber Jaya')
      expect(vendor.code).toBe('SUMBER01')
      expect(vendor.status).toBe('active')

      const list = await api('GET', `${API_PREFIX}/vendors`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(list.status).toBe(200)
      expect(list.json.vendors).toHaveLength(1)

      const updated = await api('PATCH', `${API_PREFIX}/vendors/${vendor.id}`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { phone: '+62123', address: 'Jakarta' },
      })
      expect(updated.status).toBe(200)
      expect(updated.json.vendor.phone).toBe('+62123')

      const audits = await database.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'procurement.vendor.created'))
      expect(audits).toHaveLength(1)
      expect(audits[0].actorId).toBeDefined()
      expect(audits[0].resourceId).toBe(vendor.id)
    })

    it('rejects duplicate vendor code within the same organization', async () => {
      const session = await runSetup()
      await createVendor(session)
      const res = await api('POST', `${API_PREFIX}/vendors`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { name: 'Another', code: 'SUMBER01' },
      })
      expect(res.status).toBe(409)
    })
  })

  describe('Purchase request lifecycle through workflow', () => {
    it('drives draft -> submitted -> approved with a second actor as requester', async () => {
      const session = await runSetup()
      const requester = await memberFor(session, 'requester@example.com', [
        'procurement.purchase_request.create',
        'procurement.purchase_request.submit',
      ])

      // Requester creates and submits
      const request = await api('POST', `${API_PREFIX}/purchase-requests`, {
        cookie: requester.cookie,
        headers: orgHeaders(session),
        payload: requestPayload(),
      })
      expect(request.status).toBe(201)
      const pr = request.json.purchaseRequest
      expect(pr.status).toBe('draft')
      expect(pr.number).toBe('PR-000001')
      expect(pr.requesterId).toBe(requester.userId)

      const submitted = await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: requester.cookie,
        headers: orgHeaders(session),
        payload: { comment: 'Please review' },
      })
      expect(submitted.status).toBe(200)
      expect(submitted.json.purchaseRequest.status).toBe('submitted')
      expect(submitted.json.purchaseRequest.workflowInstanceId).toBeDefined()

      // Owner approves
      const approved = await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { comment: 'Approved' },
      })
      expect(approved.status).toBe(200)
      expect(approved.json.purchaseRequest.status).toBe('approved')

      // Audit uses the actual actor (admin), not the requester
      const audits = await database.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'procurement.purchase_request.approved'))
      expect(audits).toHaveLength(1)
      expect(audits[0].actorId).not.toBe(requester.userId)
      expect(audits[0].metadata).toMatchObject({ number: 'PR-000001' })
    })

    it('cannot submit an empty request and only valid states may transition', async () => {
      const session = await runSetup()
      const requester = await memberFor(session, 'req@example.com', [
        'procurement.purchase_request.create',
        'procurement.purchase_request.submit',
      ])
      const pr = await createRequest(requester, {
        title: 'No Items',
        items: [],
      })
      const res = await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: requester.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      expect(res.status).toBe(400)

      const created = await api('POST', `${API_PREFIX}/purchase-requests`, {
        cookie: requester.cookie,
        headers: orgHeaders(session),
        payload: requestPayload([{ description: 'A', quantity: 1, estimatedUnitPrice: 100 }]),
      })
      const pr2 = created.json.purchaseRequest
      await api('POST', `${API_PREFIX}/purchase-requests/${pr2.id}/submit`, {
        cookie: requester.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      // approve from a draft request must be rejected (that create is already submitted above)
      const wasDraft = await createRequest(requester, { title: 'Draft Only', items: [] })
      const draftApprove = await api(
        'POST',
        `${API_PREFIX}/purchase-requests/${wasDraft.id}/approve`,
        {
          cookie: session.cookie,
          headers: orgHeaders(session),
          payload: {},
        },
      )
      expect(draftApprove.status).toBe(400)
    })

    it('creates a workflow instance and transition history during submit', async () => {
      const session = await runSetup()
      const requester = await memberFor(session, 'wf@example.com', [
        'procurement.purchase_request.create',
        'procurement.purchase_request.submit',
      ])
      const pr = await createRequest(requester, requestPayload([{ description: 'B', quantity: 2 }]))
      const submitted = await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: requester.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      const instanceId = submitted.json.purchaseRequest.workflowInstanceId
      const history = await api('GET', `${API_PREFIX}/workflow-instances/${instanceId}/history`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(history.status).toBe(200)
      expect(history.json.history.map((h: any) => h.transitionKey)).toContain('submit')
    })
  })

  describe('Authorization (RBAC)', () => {
    it('forbids request creation without a granted permission', async () => {
      const session = await runSetup()
      const outsider = await memberFor(session, 'no-perms@example.com')
      const res = await api('POST', `${API_PREFIX}/purchase-requests`, {
        cookie: outsider.cookie,
        headers: orgHeaders(session),
        payload: requestPayload(),
      })
      expect(res.status).toBe(403)
    })

    it('forbids submit without the submit permission, and approve without approve permission', async () => {
      const session = await runSetup()
      const creator = await memberFor(session, 'creator@example.com', [
        'procurement.purchase_request.create',
      ])
      const pr = await createRequest(creator, requestPayload())

      const submitNoPerm = await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: creator.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      expect(submitNoPerm.status).toBe(403)

      const submitter = await memberFor(session, 'sub@example.com', [
        'procurement.purchase_request.submit',
      ])
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: submitter.cookie,
        headers: orgHeaders(session),
        payload: {},
      })

      const unprivileged = await memberFor(session, 'reviewer@example.com')
      const approveNoPerm = await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
        cookie: unprivileged.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      expect(approveNoPerm.status).toBe(403)
    })
  })

  describe('Organization isolation', () => {
    it('isolates vendors, requests, orders, and receipts across organizations', async () => {
      const session = await runSetup()
      const otherOrgId = await createSecondOrg(session)
      const vendor = await createVendor(session)
      const pr = await createRequest(session, requestPayload())

      // Request hidden from other org
      const crossList = await api('GET', `${API_PREFIX}/purchase-requests`, {
        cookie: session.cookie,
        headers: { 'x-organization-id': otherOrgId },
      })
      expect(crossList.json.purchaseRequests).toHaveLength(0)

      const crossGet = await api('GET', `${API_PREFIX}/purchase-requests/${pr.id}`, {
        cookie: session.cookie,
        headers: { 'x-organization-id': otherOrgId },
      })
      expect(crossGet.status).toBe(404)

      const crossVendor = await api('GET', `${API_PREFIX}/vendors/${vendor.id}`, {
        cookie: session.cookie,
        headers: { 'x-organization-id': otherOrgId },
      })
      expect(crossVendor.status).toBe(404)

      // Approve in org A so an order could be created
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })

      // Order in org B referencing org A's vendor/request must 404
      const crossOrder = await api('POST', `${API_PREFIX}/purchase-orders`, {
        cookie: session.cookie,
        headers: { 'x-organization-id': otherOrgId },
        payload: {
          purchaseRequestId: pr.id,
          vendorId: vendor.id,
          items: pr.items.map((i: any) => ({
            purchaseRequestItemId: i.id,
            quantity: i.quantity,
            unitPrice: 100,
          })),
        },
      })
      expect(crossOrder.status).toBe(404)
    })
  })

  describe('Purchase order & goods receipt', () => {
    async function approvedRequest(): Promise<{ session: Session; pr: any }> {
      const session = await runSetup()
      const pr = await createRequest(session, requestPayload())
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      return { session, pr }
    }

    async function createAndIssueOrder(session: Session, pr: any): Promise<any> {
      const vendor = await createVendor(session)
      const res = await api('POST', `${API_PREFIX}/purchase-orders`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseRequestId: pr.id,
          vendorId: vendor.id,
          items: pr.items.map((i: any) => ({
            purchaseRequestItemId: i.id,
            quantity: i.quantity,
            unitPrice: 15000000,
          })),
        },
      })
      expect(res.status).toBe(201)
      const order = res.json.purchaseOrder
      expect(order.status).toBe('draft')
      expect(order.number).toBe('PO-000001')
      const issued = await api('POST', `${API_PREFIX}/purchase-orders/${order.id}/issue`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      expect(issued.status).toBe(200)
      expect(issued.json.purchaseOrder.status).toBe('issued')
      return issued.json.purchaseOrder
    }

    it('rejects an order when the request is not approved', async () => {
      const session = await runSetup()
      const vendor = await createVendor(session)
      const pr = await createRequest(session, requestPayload())
      const res = await api('POST', `${API_PREFIX}/purchase-orders`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseRequestId: pr.id,
          vendorId: vendor.id,
          items: pr.items.map((i: any) => ({
            purchaseRequestItemId: i.id,
            quantity: i.quantity,
            unitPrice: 1,
          })),
        },
      })
      expect(res.status).toBe(400)
    })

    it('rejects an order item that exceeds the requested quantity', async () => {
      const { session, pr } = await approvedRequest()
      const vendor = await createVendor(session)
      const res = await api('POST', `${API_PREFIX}/purchase-orders`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseRequestId: pr.id,
          vendorId: vendor.id,
          items: [
            {
              purchaseRequestItemId: pr.items[0].id,
              quantity: pr.items[0].quantity + 10,
              unitPrice: 10,
            },
          ],
        },
      })
      expect(res.status).toBe(400)
    })

    it('rejects a second issue of the same order', async () => {
      const { session, pr } = await approvedRequest()
      const order = await createAndIssueOrder(session, pr)
      const second = await api('POST', `${API_PREFIX}/purchase-orders/${order.id}/issue`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      expect(second.status).toBe(400)
    })

    it('records partial and full receipts and rolls the order status forward', async () => {
      const session = await runSetup()
      const pr = await createRequest(
        session,
        requestPayload([{ description: 'Steel', quantity: 10, estimatedUnitPrice: 5000 }]),
      )
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      const order = await createAndIssueOrder(session, pr)
      const poItemId = order.items[0].id

      const partial = await api('POST', `${API_PREFIX}/goods-receipts`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseOrderId: order.id,
          items: [{ purchaseOrderItemId: poItemId, quantity: 4 }],
        },
      })
      expect(partial.status).toBe(201)
      expect(partial.json.goodsReceipt.number).toBe('GR-000001')

      const orderAfterPartial = await api('GET', `${API_PREFIX}/purchase-orders/${order.id}`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(orderAfterPartial.json.purchaseOrder.status).toBe('partially_received')
      expect(orderAfterPartial.json.purchaseOrder.items[0].receivedQuantity).toBe(4)

      const full = await api('POST', `${API_PREFIX}/goods-receipts`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseOrderId: order.id,
          items: [{ purchaseOrderItemId: poItemId, quantity: 6 }],
        },
      })
      expect(full.status).toBe(201)

      const orderAfterFull = await api('GET', `${API_PREFIX}/purchase-orders/${order.id}`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(orderAfterFull.json.purchaseOrder.status).toBe('received')
    })

    it('rejects receipt over the outstanding quantity and receipt against a draft order', async () => {
      const session = await runSetup()
      const pr = await createRequest(
        session,
        requestPayload([{ description: 'Copper', quantity: 10 }]),
      )
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      const vendor = await createVendor(session)
      const createRes = await api('POST', `${API_PREFIX}/purchase-orders`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseRequestId: pr.id,
          vendorId: vendor.id,
          items: pr.items.map((i: any) => ({
            purchaseRequestItemId: i.id,
            quantity: i.quantity,
            unitPrice: 50,
          })),
        },
      })
      const order = createRes.json.purchaseOrder

      // Draft order cannot be received
      const draftReceipt = await api('POST', `${API_PREFIX}/goods-receipts`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseOrderId: order.id,
          items: [{ purchaseOrderItemId: order.items[0].id, quantity: 1 }],
        },
      })
      expect(draftReceipt.status).toBe(400)

      // Issue then over-receive
      await api('POST', `${API_PREFIX}/purchase-orders/${order.id}/issue`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      const over = await api('POST', `${API_PREFIX}/goods-receipts`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseOrderId: order.id,
          items: [{ purchaseOrderItemId: order.items[0].id, quantity: 11 }],
        },
      })
      expect(over.status).toBe(400)
    })
  })

  describe('Audit trail', () => {
    it('emits the expected procurement audit events with the acting user', async () => {
      const session = await runSetup()
      const requester = await memberFor(session, 'client@example.com', [
        'procurement.purchase_request.create',
        'procurement.purchase_request.submit',
      ])
      const vendor = await createVendor(session)
      const prRes = await api('POST', `${API_PREFIX}/purchase-requests`, {
        cookie: requester.cookie,
        headers: orgHeaders(session),
        payload: requestPayload(),
      })
      const pr = prRes.json.purchaseRequest
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: requester.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      const orderRes = await api('POST', `${API_PREFIX}/purchase-orders`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseRequestId: pr.id,
          vendorId: vendor.id,
          items: [
            {
              purchaseRequestItemId: pr.items[0].id,
              quantity: pr.items[0].quantity,
              unitPrice: 100,
            },
          ],
        },
      })
      const order = orderRes.json.purchaseOrder
      await api('POST', `${API_PREFIX}/purchase-orders/${order.id}/issue`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      await api('POST', `${API_PREFIX}/goods-receipts`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseOrderId: order.id,
          items: [{ purchaseOrderItemId: order.items[0].id, quantity: order.items[0].quantity }],
        },
      })

      const actions = [
        'procurement.vendor.created',
        'procurement.purchase_request.created',
        'procurement.purchase_request.submitted',
        'procurement.purchase_request.approved',
        'procurement.purchase_order.created',
        'procurement.purchase_order.issued',
        'procurement.goods_receipt.created',
      ]
      for (const action of actions) {
        const rows = await database.db.select().from(auditLogs).where(eq(auditLogs.action, action))
        expect(rows.length, `expected audit rows for ${action}`).toBe(1)
        expect(rows[0].organizationId).toBe(session.orgId)
      }

      // The submitted/approve events must carry the actor and requester metadata
      const submitted = await database.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'procurement.purchase_request.submitted'))
      expect(submitted[0].actorId).toBe(requester.userId)
      expect(submitted[0].metadata).toMatchObject({ requesterId: requester.userId })
    })
  })

  describe('Security hardening (review findings)', () => {
    it('blocks organization-scoped mutation of the system-wide workflow definition', async () => {
      const session = await runSetup()
      const workflows = await api('GET', `${API_PREFIX}/workflows`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      const purchaseWorkflow = workflows.json.workflows.find(
        (w: any) => w.key === 'purchase-request' && w.organizationId === null,
      )
      expect(purchaseWorkflow).toBeDefined()

      const tamper = await api('PATCH', `${API_PREFIX}/workflows/${purchaseWorkflow.id}`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { status: 'archived' },
      })
      expect(tamper.status).toBe(403)

      const version = await api('POST', `${API_PREFIX}/workflows/${purchaseWorkflow.id}/version`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(version.status).toBe(403)
    })

    it('prevents an order from exceeding the cumulative requested quantity across multiple orders', async () => {
      const session = await runSetup()
      const pr = await createRequest(
        session,
        requestPayload([{ description: 'Pipes', quantity: 5 }]),
      )
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      const vendor = await createVendor(session)
      const first = await api('POST', `${API_PREFIX}/purchase-orders`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseRequestId: pr.id,
          vendorId: vendor.id,
          items: [
            {
              purchaseRequestItemId: pr.items[0].id,
              quantity: pr.items[0].quantity,
              unitPrice: 10,
            },
          ],
        },
      })
      expect(first.status).toBe(201)

      const second = await api('POST', `${API_PREFIX}/purchase-orders`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseRequestId: pr.id,
          vendorId: vendor.id,
          items: [{ purchaseRequestItemId: pr.items[0].id, quantity: 1, unitPrice: 10 }],
        },
      })
      expect(second.status).toBe(400)
    })
  })

  describe('Concurrency', () => {
    it('allows only one concurrent submit', async () => {
      const session = await runSetup()
      const requester = await memberFor(session, 'race-sub@example.com', [
        'procurement.purchase_request.create',
        'procurement.purchase_request.submit',
      ])
      const pr = await createRequest(requester, requestPayload())
      const [a, b] = await Promise.all([
        api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
          cookie: requester.cookie,
          headers: orgHeaders(session),
          payload: {},
        }),
        api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
          cookie: requester.cookie,
          headers: orgHeaders(session),
          payload: {},
        }),
      ])
      const statuses = [a.status, b.status].sort()
      expect(statuses).toEqual([200, 400])
    })

    it('allows only one concurrent approval', async () => {
      const session = await runSetup()
      const requester = await memberFor(session, 'race-approve@example.com', [
        'procurement.purchase_request.create',
        'procurement.purchase_request.submit',
      ])
      const pr = await createRequest(requester, requestPayload())
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: requester.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      const [a, b] = await Promise.all([
        api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
          cookie: session.cookie,
          headers: orgHeaders(session),
          payload: {},
        }),
        api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
          cookie: session.cookie,
          headers: orgHeaders(session),
          payload: {},
        }),
      ])
      const statuses = [a.status, b.status].sort()
      expect(statuses).toEqual([200, 400])
    })

    it('prevents concurrent receipts from exceeding the outstanding quantity', async () => {
      const session = await runSetup()
      const pr = await createRequest(
        session,
        requestPayload([{ description: 'Wire', quantity: 15 }]),
      )
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      const vendor = await createVendor(session)
      const createRes = await api('POST', `${API_PREFIX}/purchase-orders`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          purchaseRequestId: pr.id,
          vendorId: vendor.id,
          items: [{ purchaseRequestItemId: pr.items[0].id, quantity: 15, unitPrice: 3 }],
        },
      })
      const order = createRes.json.purchaseOrder
      await api('POST', `${API_PREFIX}/purchase-orders/${order.id}/issue`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {},
      })
      const poItemId = order.items[0].id
      const [a, b] = await Promise.all([
        api('POST', `${API_PREFIX}/goods-receipts`, {
          cookie: session.cookie,
          headers: orgHeaders(session),
          payload: {
            purchaseOrderId: order.id,
            items: [{ purchaseOrderItemId: poItemId, quantity: 10 }],
          },
        }),
        api('POST', `${API_PREFIX}/goods-receipts`, {
          cookie: session.cookie,
          headers: orgHeaders(session),
          payload: {
            purchaseOrderId: order.id,
            items: [{ purchaseOrderItemId: poItemId, quantity: 10 }],
          },
        }),
      ])
      const statuses = [a.status, b.status].sort()
      expect(statuses).toEqual([201, 400])
    })

    it('allocates unique consecutive document numbers under concurrency', async () => {
      const session = await runSetup()
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          api('POST', `${API_PREFIX}/purchase-requests`, {
            cookie: session.cookie,
            headers: orgHeaders(session),
            payload: { title: `Concurrent ${i}`, items: [{ description: 'x', quantity: 1 }] },
          }),
        ),
      )
      const numbers = results.map((r) => r.json.purchaseRequest.number)
      expect(new Set(numbers).size).toBe(12)
      expect(numbers.sort()).toEqual(
        Array.from({ length: 12 }, (_, i) => `PR-${String(i + 1).padStart(6, '0')}`),
      )
    })
  })
})
