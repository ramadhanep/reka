import type { RedisClient } from './client.js'

export interface CacheOptions {
  ttl?: number
}

export class RedisCache {
  constructor(private readonly client: RedisClient | null) {}

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null
    try {
      const value = await this.client.get(key)
      if (!value) return null
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }

  async set(key: string, value: unknown, options: CacheOptions = {}): Promise<void> {
    if (!this.client) return
    try {
      const ttl = options.ttl ?? 300
      await this.client.setex(key, ttl, JSON.stringify(value))
    } catch {
      // Cache errors are non-fatal
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client) return
    try {
      await this.client.del(key)
    } catch {
      // Cache errors are non-fatal
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    if (!this.client) return
    try {
      const keys = await this.client.keys(pattern)
      if (keys.length > 0) {
        await this.client.del(...keys)
      }
    } catch {
      // Cache errors are non-fatal
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) return false
    try {
      return (await this.client.exists(key)) === 1
    } catch {
      return false
    }
  }
}

export function createCache(client: RedisClient | null): RedisCache {
  return new RedisCache(client)
}
