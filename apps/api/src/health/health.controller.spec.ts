import { Test } from '@nestjs/testing'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '@reka/database'
import { HealthController } from './health.controller.js'
import { HealthService } from './health.service.js'

function fakeDatabase(reachable: boolean): Database {
  return {
    pool: {
      query: vi
        .fn()
        .mockImplementation(() =>
          reachable
            ? Promise.resolve({ rows: [] })
            : Promise.reject(new Error('connection refused')),
        ),
    },
    db: {} as Database['db'],
    close: vi.fn(),
  } as unknown as Database
}

describe('HealthService', () => {
  it('reports ok when the database responds', async () => {
    const service = new HealthService(fakeDatabase(true))
    await expect(service.status()).resolves.toEqual({ status: 'ok', database: 'up' })
  })

  it('reports degraded when the database is unreachable', async () => {
    const service = new HealthService(fakeDatabase(false))
    await expect(service.status()).resolves.toEqual({ status: 'degraded', database: 'down' })
  })
})

describe('HealthController', () => {
  it('exposes the service status over the endpoint', async () => {
    const service = { status: vi.fn().mockResolvedValue({ status: 'ok', database: 'up' }) }

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: service }],
    }).compile()

    const controller = moduleRef.get(HealthController)
    await expect(controller.status()).resolves.toEqual({ status: 'ok', database: 'up' })
  })
})
