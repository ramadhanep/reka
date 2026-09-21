/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import fastifyCookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import type { FastifyInstance } from 'fastify'
import { API_PREFIX } from '@reka/contracts'
import { AppModule } from '../src/app.module.js'
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js'
import { AccessService } from '../src/modules/access/access.service.js'
import { grantRolePermissions, type RoleRow } from '../src/modules/access/role.repo.js'
import { ensurePermissions, findPermissionsByKeys } from '../src/modules/access/permission.repo.js'
import { auditLogs } from '../src/modules/audit/audit-log.schema.js'
import { InventoryService } from '../src/modules/inventory/inventory.service.js'
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

interface Session {
  cookie: string
  orgId: string
}

const ADMIN_EMAIL = 'admin@example.com'
const ADMIN_PASSWORD = 'strong-password-123'

describe('Inventory Integration (items, warehouses, stock ops, procurement receipt, isolation, RBAC, audit, concurrency)', () => {
  let app: NestFastifyApplication
  let server: FastifyInstance
  let database: Database
  let access: AccessService
  let users: UserService
  let registry: ModuleRegistryService
  let inventory: InventoryService
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
    await app.register(helmet as unknown as Parameters<NestFastifyApplication['register']>[0], {
      crossOriginEmbedderPolicy: false,
    })
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
    inventory = app.get(InventoryService)
    procurement = app.get(ProcurementService)
  })

  beforeEach(async () => {
    await truncateAllExcept(database, [])
    await access.seedCatalog()
    await registry.init()
    await procurement.seed()
    await registry.enable('procurement')
    await registry.enable('assets')
    await registry.enable('inventory')
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
  ): Promise<string> {
    await users.createWithPassword({
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
      payload: { email, roleId: memberRole.id },
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
    const login = await api('POST', `${API_PREFIX}/auth/login`, {
      payload: { email, password: 'password-1234' },
    })
    return login.setCookie!
  }

  function orgHeaders(session: Session): Record<string, string> {
    return { 'x-organization-id': session.orgId }
  }

  // ---- Inventory helpers ----

  async function createItem(
    session: Session,
    payload: Record<string, unknown> = { sku: 'LAPTOP-BAG-01', name: 'Laptop Bag', unit: 'pcs' },
  ): Promise<any> {
    const res = await api('POST', `${API_PREFIX}/inventory/items`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload,
    })
    expect(res.status).toBe(201)
    return res.json.item
  }

  async function createWarehouse(
    session: Session,
    payload: Record<string, unknown> = { code: 'WH-JKT', name: 'Jakarta Warehouse' },
  ): Promise<any> {
    const res = await api('POST', `${API_PREFIX}/inventory/warehouses`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload,
    })
    expect(res.status).toBe(201)
    return res.json.warehouse
  }

  async function createLocation(
    session: Session,
    warehouseId: string,
    code: string,
    name = `${code} Location`,
  ): Promise<any> {
    const res = await api('POST', `${API_PREFIX}/inventory/locations`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload: { warehouseId, code, name },
    })
    expect(res.status).toBe(201)
    return res.json.location
  }

  // ---- Procurement chain helpers ----

  async function createVendor(session: Session): Promise<any> {
    const res = await api('POST', `${API_PREFIX}/vendors`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload: { name: 'PT Sumber Jaya', code: 'SUMBER01' },
    })
    expect(res.status).toBe(201)
    return res.json.vendor
  }

  async function approvedRequest(session: Session): Promise<any> {
    const res = await api('POST', `${API_PREFIX}/purchase-requests`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload: {
        title: 'IT Equipment',
        items: [
          { description: 'Laptop', quantity: 5, estimatedUnitPrice: 15000000 },
          { description: 'Monitor', quantity: 10, estimatedUnitPrice: 3000000 },
        ],
      },
    })
    expect(res.status).toBe(201)
    const pr = res.json.purchaseRequest
    const submit = await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/submit`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload: {},
    })
    expect(submit.status).toBe(200)
    const approve = await api('POST', `${API_PREFIX}/purchase-requests/${pr.id}/approve`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload: {},
    })
    expect(approve.status).toBe(200)
    return pr
  }

  async function issuedOrder(session: Session, pr: any): Promise<any> {
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
          unitPrice: 1000000,
        })),
      },
    })
    expect(res.status).toBe(201)
    const order = res.json.purchaseOrder
    const issued = await api('POST', `${API_PREFIX}/purchase-orders/${order.id}/issue`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload: {},
    })
    expect(issued.status).toBe(200)
    return issued.json.purchaseOrder
  }

  async function goodsReceipt(session: Session, order: any, quantities: number[]): Promise<any> {
    const res = await api('POST', `${API_PREFIX}/goods-receipts`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload: {
        purchaseOrderId: order.id,
        items: order.items.map((i: any, idx: number) => ({
          purchaseOrderItemId: i.id,
          quantity: quantities[idx],
        })),
      },
    })
    expect(res.status).toBe(201)
    return res.json.goodsReceipt
  }

  async function receive(
    session: Session,
    payload: Record<string, unknown>,
    expectedStatus = 201,
  ): Promise<any> {
    const res = await api('POST', `${API_PREFIX}/inventory/receive`, {
      cookie: session.cookie,
      headers: orgHeaders(session),
      payload,
    })
    expect(res.status).toBe(expectedStatus)
    return res.json
  }

  // ---- Tests: items ----

  describe('item CRUD', () => {
    it('creates, lists, gets, and updates an inventory item with audit', async () => {
      const session = await runSetup()
      const item = await createItem(session, { sku: 'laptop-bag-01', name: 'Laptop Bag' })
      expect(item.sku).toBe('LAPTOP-BAG-01')
      expect(item.unit).toBe('pcs')
      expect(item.status).toBe('ACTIVE')

      const list = await api('GET', `${API_PREFIX}/inventory/items`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(list.status).toBe(200)
      expect(list.json.items).toHaveLength(1)

      const got = await api('GET', `${API_PREFIX}/inventory/items/${item.id}`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(got.status).toBe(200)
      expect(got.json.item.id).toBe(item.id)

      const updated = await api('PATCH', `${API_PREFIX}/inventory/items/${item.id}`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { status: 'INACTIVE' },
      })
      expect(updated.status).toBe(200)
      expect(updated.json.item.status).toBe('INACTIVE')

      const logs = await database.db.select().from(auditLogs)
      expect(logs.map((l) => l.action)).toContain('inventory.item.created')
      expect(logs.map((l) => l.action)).toContain('inventory.item.updated')
      const createdLog = logs.find((l) => l.action === 'inventory.item.created')
      expect(createdLog!.organizationId).toBe(session.orgId)
      expect(createdLog!.actorId).toBeDefined()
    })

    it('rejects a duplicate SKU within the same organization', async () => {
      const session = await runSetup()
      await createItem(session)
      const res = await api('POST', `${API_PREFIX}/inventory/items`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { sku: 'LAPTOP-BAG-01', name: 'Second bag' },
      })
      expect(res.status).toBe(409)
    })
  })

  // ---- Tests: warehouses & locations ----

  describe('warehouse and location CRUD', () => {
    it('creates warehouses and locations, with warehouse detail listing locations', async () => {
      const session = await runSetup()
      const wh = await createWarehouse(session)
      expect(wh.code).toBe('WH-JKT')

      const a = await createLocation(session, wh.id, 'STORAGE-A')
      await createLocation(session, wh.id, 'STORAGE-B')
      expect(a.code).toBe('STORAGE-A')

      const detail = await api('GET', `${API_PREFIX}/inventory/warehouses/${wh.id}`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(detail.status).toBe(200)
      expect(detail.json.locations.map((l: any) => l.code).sort()).toEqual([
        'STORAGE-A',
        'STORAGE-B',
      ])

      const locations = await api('GET', `${API_PREFIX}/inventory/locations`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(locations.json.locations).toHaveLength(2)

      const logs = await database.db.select().from(auditLogs)
      expect(logs.map((l) => l.action)).toContain('inventory.warehouse.created')
      expect(logs.map((l) => l.action)).toContain('inventory.location.created')
    })

    it('rejects duplicate warehouse codes and duplicate location codes within a warehouse', async () => {
      const session = await runSetup()
      const wh = await createWarehouse(session)
      const dupWh = await api('POST', `${API_PREFIX}/inventory/warehouses`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { code: 'WH-JKT', name: 'Other' },
      })
      expect(dupWh.status).toBe(409)

      await createLocation(session, wh.id, 'STORAGE-A')
      const dupLoc = await api('POST', `${API_PREFIX}/inventory/locations`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { warehouseId: wh.id, code: 'STORAGE-A', name: 'Again' },
      })
      expect(dupLoc.status).toBe(409)

      const wh2 = await createWarehouse(session, { code: 'WH-BDG', name: 'Bandung' })
      const sameCodeOtherWh = await createLocation(session, wh2.id, 'STORAGE-A')
      expect(sameCodeOtherWh.code).toBe('STORAGE-A')
    })
  })

  // ---- Tests: receive through procurement ----

  describe('stock receipt from goods receipt', () => {
    it('receives a goods receipt item into inventory and creates exactly one RECEIPT movement', async () => {
      const session = await runSetup()
      const pr = await approvedRequest(session)
      const order = await issuedOrder(session, pr)
      const gr = await goodsReceipt(session, order, [5, 10])

      const item = await createItem(session, { sku: 'LAP-01', name: 'Laptop' })
      const wh = await createWarehouse(session)
      const loc = await createLocation(session, wh.id, 'RECEIVING')
      const grItemId = gr.items[0].id

      const res = await receive(session, {
        goodsReceiptItemId: grItemId,
        inventoryItemId: item.id,
        locationId: loc.id,
        quantity: 5,
      })
      expect(res.result.balance.quantity).toBe(5)
      expect(res.result.goodsReceiptNumber).toBe(gr.number)
      expect(res.result.type).toBe('RECEIPT')

      const balances = await api('GET', `${API_PREFIX}/inventory/stock`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(balances.json.balances).toHaveLength(1)
      expect(balances.json.balances[0].quantity).toBe(5)
      expect(balances.json.balances[0].sku).toBe('LAP-01')

      const movements = await api('GET', `${API_PREFIX}/inventory/movements`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(movements.json.movements).toHaveLength(1)
      expect(movements.json.movements[0].type).toBe('RECEIPT')
      expect(movements.json.movements[0].referenceType).toBe('GOODS_RECEIPT')
      expect(movements.json.movements[0].referenceId).toBe(grItemId)

      const logs = await database.db.select().from(auditLogs)
      expect(logs.map((l) => l.action)).toContain('inventory.stock.received')
    })

    it('blocks double-processing: a goods receipt item can be received into stock only once', async () => {
      const session = await runSetup()
      const pr = await approvedRequest(session)
      const order = await issuedOrder(session, pr)
      const gr = await goodsReceipt(session, order, [5, 10])
      const item = await createItem(session, { sku: 'LAP-01', name: 'Laptop' })
      const wh = await createWarehouse(session)
      const loc = await createLocation(session, wh.id, 'RECEIVING')
      const grItemId = gr.items[0].id

      await receive(session, {
        goodsReceiptItemId: grItemId,
        inventoryItemId: item.id,
        locationId: loc.id,
        quantity: 5,
      })
      await receive(
        session,
        {
          goodsReceiptItemId: grItemId,
          inventoryItemId: item.id,
          locationId: loc.id,
          quantity: 5,
        },
        409,
      )
    })

    it('rejects a received quantity that does not match the goods receipt item', async () => {
      const session = await runSetup()
      const pr = await approvedRequest(session)
      const order = await issuedOrder(session, pr)
      const gr = await goodsReceipt(session, order, [5, 10])
      const item = await createItem(session, { sku: 'LAP-01', name: 'Laptop' })
      const wh = await createWarehouse(session)
      const loc = await createLocation(session, wh.id, 'RECEIVING')
      await receive(
        session,
        {
          goodsReceiptItemId: gr.items[0].id,
          inventoryItemId: item.id,
          locationId: loc.id,
          quantity: 999,
        },
        400,
      )
    })

    it('rejects receiving a goods receipt item that does not exist', async () => {
      const session = await runSetup()
      const item = await createItem(session, { sku: 'LAP-01', name: 'Laptop' })
      const wh = await createWarehouse(session)
      const loc = await createLocation(session, wh.id, 'RECEIVING')
      await receive(
        session,
        {
          goodsReceiptItemId: '00000000-0000-0000-0000-000000000000',
          inventoryItemId: item.id,
          locationId: loc.id,
          quantity: 5,
        },
        404,
      )
    })
  })

  // ---- Tests: transfer ----

  describe('stock transfer', () => {
    async function setupTransferOrg(session: Session): Promise<{ item: any; a: any; b: any }> {
      const item = await createItem(session, { sku: 'CABLE-2M', name: 'HDMI Cable' })
      const wh = await createWarehouse(session)
      const a = await createLocation(session, wh.id, 'STORAGE-A')
      const b = await createLocation(session, wh.id, 'STORAGE-B')
      return { item, a, b }
    }

    async function seedStock(
      session: Session,
      item: any,
      locationId: string,
      quantity: number,
    ): Promise<void> {
      const { stockBalances } = await import('../src/modules/inventory/inventory.schema.js')
      await database.db
        .insert(stockBalances)
        .values({
          organizationId: session.orgId,
          inventoryItemId: item.id,
          locationId,
          quantity,
        })
        .onConflictDoNothing()
    }

    it('moves stock between locations atomically with TRANSFER_OUT and TRANSFER_IN movements', async () => {
      const session = await runSetup()
      const seeds = await setupTransferOrg(session)
      await seedStock(session, seeds.item, seeds.a.id, 10)

      const res = await api('POST', `${API_PREFIX}/inventory/transfer`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          inventoryItemId: seeds.item.id,
          fromLocationId: seeds.a.id,
          toLocationId: seeds.b.id,
          quantity: 4,
        },
      })
      expect(res.status).toBe(201)
      expect(res.json.result.fromBalance.quantity).toBe(6)
      expect(res.json.result.toBalance.quantity).toBe(4)
      const types = res.json.result.movements.map((m: any) => m.type).sort()
      expect(types).toEqual(['TRANSFER_IN', 'TRANSFER_OUT'])
      expect(res.json.result.movements[0].referenceType).toBe('TRANSFER')

      const logs = await database.db.select().from(auditLogs)
      expect(logs.map((l) => l.action)).toContain('inventory.stock.transferred')
    })

    it('rejects a transfer when source stock is insufficient without changing balances', async () => {
      const session = await runSetup()
      const seeds = await setupTransferOrg(session)
      await seedStock(session, seeds.item, seeds.a.id, 2)

      const res = await api('POST', `${API_PREFIX}/inventory/transfer`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          inventoryItemId: seeds.item.id,
          fromLocationId: seeds.a.id,
          toLocationId: seeds.b.id,
          quantity: 5,
        },
      })
      expect(res.status).toBe(400)
      const balances = await inventory.listStock(session.orgId, {})
      expect(balances.find((b: any) => b.locationId === seeds.a.id)?.quantity).toBe(2)
    })

    it('rejects transfer to the same location', async () => {
      const session = await runSetup()
      const seeds = await setupTransferOrg(session)
      await seedStock(session, seeds.item, seeds.a.id, 5)
      const res = await api('POST', `${API_PREFIX}/inventory/transfer`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          inventoryItemId: seeds.item.id,
          fromLocationId: seeds.a.id,
          toLocationId: seeds.a.id,
          quantity: 1,
        },
      })
      expect(res.status).toBe(400)
    })
  })

  // ---- Tests: adjustment ----

  describe('stock adjustment', () => {
    async function adjustSetup(session: Session): Promise<{ item: any; wh: any; loc: any }> {
      const item = await createItem(session, { sku: 'A4-PAPER', name: 'A4 Paper' })
      const wh = await createWarehouse(session)
      const loc = await createLocation(session, wh.id, 'STORAGE-A')
      return { item, wh, loc }
    }

    it('adds stock with ADJUSTMENT_IN and removes with ADJUSTMENT_OUT, requiring a reason', async () => {
      const session = await runSetup()
      const { item, loc } = await adjustSetup(session)

      const up = await api('POST', `${API_PREFIX}/inventory/adjust`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          inventoryItemId: item.id,
          locationId: loc.id,
          quantity: 12,
          reason: 'COUNT_CORRECTION',
        },
      })
      expect(up.status).toBe(201)
      expect(up.json.result.balance.quantity).toBe(12)
      expect(up.json.result.type).toBe('ADJUSTMENT_IN')

      const down = await api('POST', `${API_PREFIX}/inventory/adjust`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          inventoryItemId: item.id,
          locationId: loc.id,
          quantity: -2,
          reason: 'COUNT_CORRECTION',
        },
      })
      expect(down.status).toBe(201)
      expect(down.json.result.balance.quantity).toBe(10)
      expect(down.json.result.type).toBe('ADJUSTMENT_OUT')

      const logs = await database.db.select().from(auditLogs)
      expect(
        logs.map((l) => l.action).filter((a) => a === 'inventory.stock.adjusted'),
      ).toHaveLength(2)
    })

    it('rejects an adjustment without a valid reason and an OUT that exceeds stock', async () => {
      const session = await runSetup()
      const { item, loc } = await adjustSetup(session)

      const badReason = await api('POST', `${API_PREFIX}/inventory/adjust`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { inventoryItemId: item.id, locationId: loc.id, quantity: 1, reason: 'SHRUNK' },
      })
      expect(badReason.status).toBe(400)

      const insufficient = await api('POST', `${API_PREFIX}/inventory/adjust`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          inventoryItemId: item.id,
          locationId: loc.id,
          quantity: -1,
          reason: 'LOST',
        },
      })
      expect(insufficient.status).toBe(400)
    })
  })

  // ---- Tests: issue ----

  describe('stock issue', () => {
    it('decreases stock and records an ISSUE movement', async () => {
      const session = await runSetup()
      const item = await createItem(session, { sku: 'OFFICE-CHAIR', name: 'Chair' })
      const wh = await createWarehouse(session)
      const loc = await createLocation(session, wh.id, 'DISPATCH')
      await api('POST', `${API_PREFIX}/inventory/adjust`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { inventoryItemId: item.id, locationId: loc.id, quantity: 10, reason: 'FOUND' },
      })

      const res = await api('POST', `${API_PREFIX}/inventory/issue`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          inventoryItemId: item.id,
          locationId: loc.id,
          quantity: 2,
          reason: 'office use',
          reference: 'REQ-001',
        },
      })
      expect(res.status).toBe(201)
      expect(res.json.result.balance.quantity).toBe(8)
      expect(res.json.result.type).toBe('ISSUE')

      const logs = await database.db.select().from(auditLogs)
      expect(logs.map((l) => l.action)).toContain('inventory.stock.issued')
    })

    it('rejects an issue that exceeds available stock', async () => {
      const session = await runSetup()
      const item = await createItem(session, { sku: 'PAPER', name: 'Paper' })
      const wh = await createWarehouse(session)
      const loc = await createLocation(session, wh.id, 'STORAGE-A')
      const res = await api('POST', `${API_PREFIX}/inventory/issue`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { inventoryItemId: item.id, locationId: loc.id, quantity: 1 },
      })
      expect(res.status).toBe(400)
    })
  })

  // ---- Tests: balance consistency & history ----

  describe('balance consistency and movement history', () => {
    it('keeps the ledger consistent with balances across a full lifecycle', async () => {
      const session = await runSetup()
      const item = await createItem(session, { sku: 'CABLE-2M', name: 'HDMI Cable' })
      const wh = await createWarehouse(session)
      const a = await createLocation(session, wh.id, 'STORAGE-A')
      const b = await createLocation(session, wh.id, 'STORAGE-B')

      await api('POST', `${API_PREFIX}/inventory/adjust`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { inventoryItemId: item.id, locationId: a.id, quantity: 12, reason: 'FOUND' },
      })
      await api('POST', `${API_PREFIX}/inventory/transfer`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          inventoryItemId: item.id,
          fromLocationId: a.id,
          toLocationId: b.id,
          quantity: 5,
        },
      })
      await api('POST', `${API_PREFIX}/inventory/issue`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { inventoryItemId: item.id, locationId: a.id, quantity: 2, reason: 'demo' },
      })

      const balances = await inventory.listStock(session.orgId, {})
      const aBal = balances.find((b: any) => b.locationId === a.id)?.quantity ?? 0
      const bBal = balances.find((x: any) => x.locationId === b.id)?.quantity ?? 0
      expect(aBal).toBe(5)
      expect(bBal).toBe(5)

      const movements = await inventory.listMovements(session.orgId, {})
      const signed = {
        ADJUSTMENT_IN: (q: number) => q,
        ADJUSTMENT_OUT: (q: number) => -q,
        ISSUE: (q: number) => -q,
        TRANSFER_OUT: (q: number) => -q,
        TRANSFER_IN: (q: number) => q,
        RECEIPT: (q: number) => q,
      }
      const byLocation = new Map<string, number>()
      for (const m of movements) {
        const current = byLocation.get(m.locationId) ?? 0
        byLocation.set(m.locationId, current + signed[m.type as keyof typeof signed](m.quantity))
      }
      expect(byLocation.get(a.id)).toBe(5)
      expect(byLocation.get(b.id)).toBe(5)
      expect(movements).toHaveLength(4)
    })
  })

  // ---- Tests: RBAC ----

  describe('authorization', () => {
    it('rejects a member without inventory.read with 403', async () => {
      const session = await runSetup()
      const noPermCookie = await memberFor(session, 'noperm@example.com')

      const noPerm = await api('GET', `${API_PREFIX}/inventory/items`, {
        cookie: noPermCookie,
        headers: orgHeaders(session),
      })
      expect(noPerm.status).toBe(403)
    })

    it('allows a member with inventory.read to read but not write stock', async () => {
      const session = await runSetup()
      const readOnlyCookie = await memberFor(session, 'reader@example.com', ['inventory.read'])

      const readOnly = await api('GET', `${API_PREFIX}/inventory/items`, {
        cookie: readOnlyCookie,
        headers: orgHeaders(session),
      })
      expect(readOnly.status).toBe(200)

      const stockWrite = await api('POST', `${API_PREFIX}/inventory/adjust`, {
        cookie: readOnlyCookie,
        headers: orgHeaders(session),
        payload: {
          inventoryItemId: '00000000-0000-0000-0000-000000000000',
          locationId: '00000000-0000-0000-0000-000000000000',
          quantity: 1,
          reason: 'FOUND',
        },
      })
      expect(stockWrite.status).toBe(403)
    })

    it('rejects unauthenticated access with 401', async () => {
      const res = await api('GET', `${API_PREFIX}/inventory/items`)
      expect(res.status).toBe(401)
    })
  })

  // ---- Tests: organization isolation ----

  describe('organization isolation', () => {
    it('isolates items, warehouses, locations, and stock across organizations', async () => {
      const session = await runSetup()
      const otherOrgId = await createSecondOrg(session)
      const item = await createItem(session)
      const wh = await createWarehouse(session)
      const loc = await createLocation(session, wh.id, 'STORAGE-A')

      const otherHeaders = { 'x-organization-id': otherOrgId }

      const items = await api('GET', `${API_PREFIX}/inventory/items`, {
        cookie: session.cookie,
        headers: otherHeaders,
      })
      expect(items.json.items).toHaveLength(0)

      const got = await api('GET', `${API_PREFIX}/inventory/items/${item.id}`, {
        cookie: session.cookie,
        headers: otherHeaders,
      })
      expect(got.status).toBe(404)

      const gotWh = await api('GET', `${API_PREFIX}/inventory/warehouses/${wh.id}`, {
        cookie: session.cookie,
        headers: otherHeaders,
      })
      expect(gotWh.status).toBe(404)

      const transfer = await api('POST', `${API_PREFIX}/inventory/transfer`, {
        cookie: session.cookie,
        headers: otherHeaders,
        payload: {
          inventoryItemId: item.id,
          fromLocationId: loc.id,
          toLocationId: '00000000-0000-4000-8000-000000000001',
          quantity: 1,
        },
      })
      expect(transfer.status).toBe(404)

      const adjust = await api('POST', `${API_PREFIX}/inventory/adjust`, {
        cookie: session.cookie,
        headers: otherHeaders,
        payload: { inventoryItemId: item.id, locationId: loc.id, quantity: 5, reason: 'FOUND' },
      })
      expect(adjust.status).toBe(404)
    })

    it('blocks receiving stock from org A into an org B location', async () => {
      const session = await runSetup()
      const otherOrgId = await createSecondOrg(session)
      const otherHeaders = { 'x-organization-id': otherOrgId }

      const pr = await approvedRequest(session)
      const order = await issuedOrder(session, pr)
      const gr = await goodsReceipt(session, order, [5, 10])
      const item = await createItem(session, { sku: 'LAP-01', name: 'Laptop' })

      // Location created in org B only
      await api('POST', `${API_PREFIX}/inventory/warehouses`, {
        cookie: session.cookie,
        headers: otherHeaders,
        payload: { code: 'WH-B', name: 'Warehouse B' },
      })
      const whB = await api('GET', `${API_PREFIX}/inventory/warehouses`, {
        cookie: session.cookie,
        headers: otherHeaders,
      })
      const res = await api('POST', `${API_PREFIX}/inventory/locations`, {
        cookie: session.cookie,
        headers: otherHeaders,
        payload: { warehouseId: whB.json.warehouses[0].id, code: 'RECV', name: 'Recv' },
      })
      const locB = res.json.location

      // Item lives in org A; location in org B -> not found for A's receive.
      await receive(
        session,
        {
          goodsReceiptItemId: gr.items[0].id,
          inventoryItemId: item.id,
          locationId: locB.id,
          quantity: 5,
        },
        404,
      )
    })
  })

  // ---- Tests: concurrency (live PostgreSQL) ----

  describe('concurrency safety', () => {
    async function actorUserId(session: Session): Promise<string> {
      const res = await api('GET', `${API_PREFIX}/auth/session`, { cookie: session.cookie })
      expect(res.status).toBe(200)
      return res.json.user.id
    }

    async function makeGoodsReceipt(session: Session): Promise<{ order: any; gr: any }> {
      const pr = await approvedRequest(session)
      const order = await issuedOrder(session, pr)
      const gr = await goodsReceipt(session, order, [5, 10])
      return { order, gr }
    }

    it('two concurrent receipts into the same location sum correctly', async () => {
      const session = await runSetup()
      const actor = await actorUserId(session)
      const { gr } = await makeGoodsReceipt(session)
      const item = await createItem(session, { sku: 'LAP-01', name: 'Laptop' })
      const wh = await createWarehouse(session)
      const loc = await createLocation(session, wh.id, 'RECEIVING')

      const results = await Promise.allSettled([
        inventory.receiveStock(
          {
            goodsReceiptItemId: gr.items[0].id,
            inventoryItemId: item.id,
            locationId: loc.id,
            quantity: 5,
          },
          actor,
          session.orgId,
        ),
        inventory.receiveStock(
          {
            goodsReceiptItemId: gr.items[1].id,
            inventoryItemId: item.id,
            locationId: loc.id,
            quantity: 10,
          },
          actor,
          session.orgId,
        ),
      ])
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true)

      const balances = await inventory.listStock(session.orgId, {})
      expect(balances).toHaveLength(1)
      expect(balances[0].quantity).toBe(15)
    })

    it('two concurrent receipts of the same goods receipt item allow exactly one', async () => {
      const session = await runSetup()
      const actor = await actorUserId(session)
      const { gr } = await makeGoodsReceipt(session)
      const item = await createItem(session, { sku: 'LAP-01', name: 'Laptop' })
      const wh = await createWarehouse(session)
      const loc = await createLocation(session, wh.id, 'RECEIVING')

      const results = await Promise.allSettled([
        inventory.receiveStock(
          {
            goodsReceiptItemId: gr.items[0].id,
            inventoryItemId: item.id,
            locationId: loc.id,
            quantity: 5,
          },
          actor,
          session.orgId,
        ),
        inventory.receiveStock(
          {
            goodsReceiptItemId: gr.items[0].id,
            inventoryItemId: item.id,
            locationId: loc.id,
            quantity: 5,
          },
          actor,
          session.orgId,
        ),
      ])
      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)

      const balances = await inventory.listStock(session.orgId, {})
      expect(balances[0].quantity).toBe(5)
    })

    it('two concurrent issues never drive stock negative and keep ledger consistent', async () => {
      const session = await runSetup()
      const actor = await actorUserId(session)
      const item = await createItem(session, { sku: 'CABLE-2M', name: 'HDMI Cable' })
      const wh = await createWarehouse(session)
      const loc = await createLocation(session, wh.id, 'STORAGE-A')
      await inventory.adjustStock(
        { inventoryItemId: item.id, locationId: loc.id, quantity: 10, reason: 'FOUND' },
        actor,
        session.orgId,
      )

      const results = await Promise.allSettled([
        inventory.issueStock(
          { inventoryItemId: item.id, locationId: loc.id, quantity: 7, reason: 'rack' },
          actor,
          session.orgId,
        ),
        inventory.issueStock(
          { inventoryItemId: item.id, locationId: loc.id, quantity: 7, reason: 'rack' },
          actor,
          session.orgId,
        ),
      ])
      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)

      const balances = await inventory.listStock(session.orgId, {})
      const balance = balances.find((b: any) => b.locationId === loc.id)!
      expect(balance.quantity).toBeGreaterThanOrEqual(0)
      expect(balance.quantity).toBe(3)

      const movements = await inventory.listMovements(session.orgId, { locationId: loc.id })
      const issueSum = movements
        .filter((m) => m.type === 'ISSUE')
        .reduce((sum: number, m) => sum + m.quantity, 0)
      expect(issueSum).toBe(7)
    })

    it('two concurrent transfers in opposite directions do not deadlock or corrupt stock', async () => {
      const session = await runSetup()
      const actor = await actorUserId(session)
      const item = await createItem(session, { sku: 'CABLE-2M', name: 'HDMI Cable' })
      const wh = await createWarehouse(session)
      const a = await createLocation(session, wh.id, 'STORAGE-A')
      const b = await createLocation(session, wh.id, 'STORAGE-B')
      await inventory.adjustStock(
        { inventoryItemId: item.id, locationId: a.id, quantity: 10, reason: 'FOUND' },
        actor,
        session.orgId,
      )
      await inventory.adjustStock(
        { inventoryItemId: item.id, locationId: b.id, quantity: 5, reason: 'FOUND' },
        actor,
        session.orgId,
      )

      const results = await Promise.allSettled([
        inventory.transferStock(
          { inventoryItemId: item.id, fromLocationId: a.id, toLocationId: b.id, quantity: 3 },
          actor,
          session.orgId,
        ),
        inventory.transferStock(
          { inventoryItemId: item.id, fromLocationId: b.id, toLocationId: a.id, quantity: 2 },
          actor,
          session.orgId,
        ),
      ])
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true)

      const balances = await inventory.listStock(session.orgId, {})
      const aQty = balances.find((x: any) => x.locationId === a.id)?.quantity ?? 0
      const bQty = balances.find((x: any) => x.locationId === b.id)?.quantity ?? 0
      expect(aQty).toBe(9)
      expect(bQty).toBe(6)
      expect(aQty).toBeGreaterThanOrEqual(0)
      expect(bQty).toBeGreaterThanOrEqual(0)
    })
  })

  // ---- Tests: full HTTP e2e flow ----

  describe('end-to-end flow', () => {
    it('login → warehouse → location → item → receive → balance → transfer → issue → history', async () => {
      const session = await runSetup()
      const item = await createItem(session, { sku: 'HDMI-CABLE-2M', name: 'HDMI Cable' })
      const wh = await createWarehouse(session)
      const receiving = await createLocation(session, wh.id, 'RECEIVING')
      const dispatch = await createLocation(session, wh.id, 'DISPATCH')

      const pr = await approvedRequest(session)
      const order = await issuedOrder(session, pr)
      const gr = await goodsReceipt(session, order, [5, 10])

      const received = await receive(session, {
        goodsReceiptItemId: gr.items[0].id,
        inventoryItemId: item.id,
        locationId: receiving.id,
        quantity: 5,
      })
      expect(received.result.balance.quantity).toBe(5)

      const balanceCheck = await api('GET', `${API_PREFIX}/inventory/stock`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(balanceCheck.json.balances[0].quantity).toBe(5)

      const transfer = await api('POST', `${API_PREFIX}/inventory/transfer`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: {
          inventoryItemId: item.id,
          fromLocationId: receiving.id,
          toLocationId: dispatch.id,
          quantity: 2,
        },
      })
      expect(transfer.status).toBe(201)

      const issue = await api('POST', `${API_PREFIX}/inventory/issue`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
        payload: { inventoryItemId: item.id, locationId: dispatch.id, quantity: 1, reason: 'demo' },
      })
      expect(issue.status).toBe(201)

      const history = await api('GET', `${API_PREFIX}/inventory/movements?itemId=${item.id}`, {
        cookie: session.cookie,
        headers: orgHeaders(session),
      })
      expect(history.status).toBe(200)
      const types = history.json.movements.map((m: any) => m.type)
      expect(types).toContain('RECEIPT')
      expect(types).toContain('TRANSFER_IN')
      expect(types).toContain('TRANSFER_OUT')
      expect(types).toContain('ISSUE')

      const balances = await inventory.listStock(session.orgId, {})
      const receivingQty = balances.find((x: any) => x.locationId === receiving.id)?.quantity ?? 0
      const dispatchQty = balances.find((x: any) => x.locationId === dispatch.id)?.quantity ?? 0
      expect(receivingQty).toBe(3)
      expect(dispatchQty).toBe(1)
    })
  })
})
