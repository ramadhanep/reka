import type { RedisClient } from './client.js'

export interface RateLimitOptions {
  key: string
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  total: number
}

export class RedisRateLimiter {
  constructor(private readonly client: RedisClient | null) {}

  async checkLimit(options: RateLimitOptions): Promise<RateLimitResult> {
    if (!this.client) {
      return {
        allowed: true,
        remaining: options.limit,
        resetTime: Date.now() + options.windowMs,
        total: options.limit,
      }
    }

    const now = Date.now()
    const windowStart = now - options.windowMs
    const key = `ratelimit:${options.key}`

    try {
      const multi = this.client.multi()
      multi.zremrangebyscore(key, 0, windowStart)
      multi.zadd(key, now, `${now}-${Math.random()}`)
      multi.zcard(key)
      multi.expire(key, Math.ceil(options.windowMs / 1000))
      const results = await multi.exec()

      const count = (results?.[2]?.[1] as number) ?? 0
      const allowed = count <= options.limit
      const remaining = Math.max(0, options.limit - count)

      return { allowed, remaining, resetTime: now + options.windowMs, total: options.limit }
    } catch {
      return {
        allowed: true,
        remaining: options.limit,
        resetTime: now + options.windowMs,
        total: options.limit,
      }
    }
  }

  async reset(key: string): Promise<void> {
    if (!this.client) return
    try {
      await this.client.del(`ratelimit:${key}`)
    } catch {
      // Non-fatal
    }
  }
}

export function createRateLimiter(client: RedisClient | null): RedisRateLimiter {
  return new RedisRateLimiter(client)
}
