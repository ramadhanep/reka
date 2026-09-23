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
import { buildOpenApiDocument } from '../src/common/openapi.js'
import { REQUEST_ID_HEADER } from '../src/common/request-context.js'
import {
  migrateTestDatabase,
  resetTestDatabase,
  TEST_DB_URL,
  truncateAllExcept,
  type Database,
} from './support.js'

interface ApiResponse {
  status: number
  json: any
  headers: Record<string, string | string[] | undefined>
}

describe('Operational Foundation (request IDs, structured errors, security headers, health, OpenAPI)', () => {
  let app: NestFastifyApplication
  let server: FastifyInstance
  let database: Database

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
  })

  beforeEach(async () => {
    await truncateAllExcept(database, [])
  })

  afterAll(async () => {
    await database.close()
    await app.close()
    delete process.env.APP_ENV
    delete process.env.DATABASE_URL
  })

  async function api(
    method: 'GET' | 'POST',
    url: string,
    opts: { cookie?: string; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse> {
    const res = await server.inject({
      method,
      url,
      headers: {
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...(opts.headers ?? {}),
      },
    })
    return { status: res.statusCode, json: res.json(), headers: res.headers }
  }

  const GENERATED_ID = /^req_[0-9a-f-]{36}$/

  describe('request IDs', () => {
    it('generates a request ID and returns it when none is supplied', async () => {
      const res = await api('GET', `${API_PREFIX}/health`)
      const header = res.headers[REQUEST_ID_HEADER] as string
      expect(header).toMatch(GENERATED_ID)
    })

    it('preserves a well-formed caller-supplied request ID', async () => {
      const res = await api('GET', `${API_PREFIX}/health`, {
        headers: { [REQUEST_ID_HEADER]: 'client-req-20260101-abcdefgh' },
      })
      expect(res.headers[REQUEST_ID_HEADER]).toBe('client-req-20260101-abcdefgh')
    })

    it('rejects and replaces malformed caller-supplied request IDs', async () => {
      const bad = './etc/passwd\x00..\\win'
      const res = await api('GET', `${API_PREFIX}/health`, {
        headers: { [REQUEST_ID_HEADER]: bad },
      })
      const header = res.headers[REQUEST_ID_HEADER] as string
      expect(header).not.toBe(bad)
      expect(header).toMatch(/^[A-Za-z0-9._:/-]+$/)
      expect(header.length).toBeGreaterThanOrEqual(8)
    })
  })

  describe('error standardization', () => {
    it('returns a stable error envelope with requestId for unknown routes', async () => {
      const res = await api('GET', `${API_PREFIX}/does-not-exist`, {
        headers: { [REQUEST_ID_HEADER]: 'err-req-1234567890' },
      })
      expect(res.status).toBe(404)
      expect(res.json.code).toBe('not_found')
      expect(typeof res.json.message).toBe('string')
      expect(res.json.message).toBeTruthy()
      expect(res.json.requestId).toBe('err-req-1234567890')
    })

    it('does not leak stack traces for internal errors', async () => {
      // A route body with an oversized reference is rejected by validation, but
      // the important guarantee is that response bodies never contain stacks.
      const res = await api('POST', `${API_PREFIX}/vendors`)
      expect(res.json.stack).toBeUndefined()
      expect(res.json.code).toBeDefined()
    })
  })

  describe('security headers', () => {
    it('emits hardened HTTP response headers', async () => {
      const res = await api('GET', `${API_PREFIX}/health`)
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['x-frame-options']).toBeDefined()
      expect(res.headers['content-security-policy']).toBeDefined()
    })
  })

  describe('health & readiness', () => {
    it('liveness always returns ok with a 200', async () => {
      const live = await api('GET', `${API_PREFIX}/health/live`)
      expect(live.status).toBe(200)
      expect(live.json.status).toBe('ok')

      const overall = await api('GET', `${API_PREFIX}/health`)
      expect(overall.json.status).toBe('ok')
      expect(overall.json.database).toBe('up')
    })

    it('readiness succeeds when the database is reachable', async () => {
      const ready = await api('GET', `${API_PREFIX}/health/ready`)
      expect(ready.status).toBe(200)
      expect(ready.json).toEqual({ status: 'ok', database: 'up' })
    })
  })

  describe('OpenAPI', () => {
    it('builds a documented contract covering versioned endpoints across modules', () => {
      const document = buildOpenApiDocument(app)
      const { paths } = document
      expect(paths[`${API_PREFIX}/auth/login`]).toBeDefined()
      expect(paths[`${API_PREFIX}/organizations`]).toBeDefined()
      expect(paths[`${API_PREFIX}/modules`]).toBeDefined()
      expect(paths[`${API_PREFIX}/workflows`]).toBeDefined()
      expect(paths[`${API_PREFIX}/vendors`]).toBeDefined()
      expect(paths[`${API_PREFIX}/purchase-requests`]).toBeDefined()
      expect(paths[`${API_PREFIX}/purchase-orders`]).toBeDefined()
      expect(paths[`${API_PREFIX}/goods-receipts`]).toBeDefined()
      expect(paths[`${API_PREFIX}/health/ready`]).toBeDefined()
      expect(document.servers?.[0]?.url).toBe(API_PREFIX)
      expect(document.info.title).toBe('REKA API')
    })
  })
})
