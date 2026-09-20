import type { RedisConfig } from '@reka/config'

export interface RedisClient {
  get(key: string): Promise<string | null>
  setex(key: string, seconds: number, value: string): Promise<'OK'>
  del(...keys: string[]): Promise<number>
  keys(pattern: string): Promise<string[]>
  exists(key: string): Promise<number>
  zremrangebyscore(key: string, min: number, max: number): Promise<number>
  zadd(key: string, score: number, member: string): Promise<number>
  zcard(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<number>
  multi(): RedisMulti
  connect(): Promise<void>
  quit(): Promise<void>
  on(event: string, listener: (...args: unknown[]) => void): this
  status: string
}

export interface RedisMulti {
  zremrangebyscore(key: string, min: number, max: number): this
  zadd(key: string, score: number, member: string): this
  zcard(key: string): this
  expire(key: string, seconds: number): this
  exec(): Promise<Array<[Error | null, unknown]>>
}

let redisClient: RedisClient | null = null

function createClient(url: string): RedisClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Redis = require('ioredis').default as new (url: string, options: unknown) => RedisClient
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (times > 3) {
        return null
      }
      return Math.min(times * 200, 2000)
    },
    lazyConnect: true,
  }) as unknown as RedisClient
}

export function createRedisClient(config: RedisConfig): RedisClient | null {
  if (!config.enabled || !config.url) {
    return null
  }

  if (redisClient) {
    return redisClient
  }

  const client = createClient(config.url)

  client.on('error', (err: unknown) => {
    console.error('[Redis] Connection error:', err instanceof Error ? err.message : String(err))
  })

  redisClient = client
  return redisClient
}

export async function connectRedis(client: RedisClient | null): Promise<void> {
  if (!client) return
  await client.connect()
}

export async function disconnectRedis(client: RedisClient | null): Promise<void> {
  if (!client) return
  await client.quit()
  redisClient = null
}

export function getRedisClient(): RedisClient | null {
  return redisClient
}

export function isRedisAvailable(): boolean {
  return redisClient !== null && redisClient.status === 'ready'
}
