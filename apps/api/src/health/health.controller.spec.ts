import { Test } from '@nestjs/testing'
import { describe, expect, it } from 'vitest'
import type { FastifyReply } from 'fastify'
import type { Database } from '@reka/database'
import { HealthController } from './health.controller.js'
import { HealthService } from './health.service.js'

function fakeDatabase(reachable: boolean): Database {
  return {
    pool: {
      query: (() =>
        Promise.resolve(
          reachable ? { rows: [] } : Promise.reject(new Error('connection refused')),
        )) as (_text: string) => Promise<{ rows: unknown[] }>,
    } as unknown as Database['pool'],
    db: {} as Database['db'],
    close: () => Promise.resolve(),
  } as unknown as Database
}

function fakeReply(): FastifyReply {
  return { status: () => fakeReply() } as unknown as FastifyReply
}

describe('HealthService', () => {
  it('reports ok when the database responds', async () => {
    const service = new HealthService(fakeDatabase(true))
    await expect(service.status()).resolves.toEqual({ status: 'ok', database: 'up' })
  })

  it('reports degraded when the database is unreachable (overall status)', async () => {
    const service = new HealthService(fakeDatabase(false))
    await expect(service.status()).resolves.toEqual({ status: 'degraded', database: 'down' })
  })

  it('liveness always succeeds without dependencies', async () => {
    const service = new HealthService(fakeDatabase(false))
    await expect(service.live()).resolves.toEqual({ status: 'ok' })
  })

  it('readiness succeeds only when the database is up', async () => {
    await expect(new HealthService(fakeDatabase(true)).ready()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    })
    await expect(new HealthService(fakeDatabase(false)).ready()).resolves.toEqual({
      status: 'ok',
      database: 'down',
    })
  })
})

describe('HealthController', () => {
  it('exposes overall, live, and ready status', async () => {
    const underlying = new HealthService(fakeDatabase(true))
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: underlying }],
    }).compile()
    const controller = moduleRef.get(HealthController)

    await expect(controller.status()).resolves.toEqual({ status: 'ok', database: 'up' })
    await expect(controller.live()).resolves.toEqual({ status: 'ok' })
    await expect(controller.ready(fakeReply())).resolves.toEqual({ status: 'ok', database: 'up' })
  })

  it('returns not_ready with a 503 flag when the database is down', async () => {
    const reply = {
      status: (code: number) => {
        expect(code).toBe(503)
        return reply
      },
    } as unknown as FastifyReply
    const service = new HealthService(fakeDatabase(false))
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: service }],
    }).compile()
    const controller = moduleRef.get(HealthController)

    await expect(controller.ready(reply)).resolves.toEqual({
      status: 'not_ready',
      database: 'down',
    })
  })
})
