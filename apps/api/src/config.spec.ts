import { describe, expect, it } from 'vitest'
import { getConfig } from '@reka/config'

describe('getConfig', () => {
  it('keeps usable development defaults', () => {
    const config = getConfig({})
    expect(config.env).toBe('development')
    expect(config.apiPort).toBe(4000)
    expect(config.databaseUrl).toBe('postgres://reka:reka@localhost:5432/reka')
    expect(config.logLevel).toBe('debug')
    expect(config.corsOrigins).toEqual(['http://localhost:3000'])
    expect(config.cookieSecure).toBe(false)
    expect(config.openapiEnabled).toBe(true)
  })

  it('rejects production config that silently uses development defaults', () => {
    expect(() => getConfig({ APP_ENV: 'production' })).toThrow(/DATABASE_URL is required/)
    expect(() =>
      getConfig({
        APP_ENV: 'production',
        DATABASE_URL: 'postgres://reka:reka@localhost:5432/reka',
      }),
    ).toThrow(/DATABASE_URL must be overridden/)
    expect(() =>
      getConfig({ APP_ENV: 'production', DATABASE_URL: 'postgres://x:y@db:5432/reka' }),
    ).toThrow(/CORS_ORIGINS is required/)
  })

  it('rejects wildcard CORS in production', () => {
    expect(() =>
      getConfig({
        APP_ENV: 'production',
        DATABASE_URL: 'postgres://x:y@db:5432/reka',
        CORS_ORIGINS: '*',
      }),
    ).toThrow(/must not contain "\*"/)
  })

  it('accepts a valid production configuration', () => {
    const config = getConfig({
      APP_ENV: 'production',
      DATABASE_URL: 'postgres://x:y@db:5432/reka',
      CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
      LOG_LEVEL: 'warn',
    })
    expect(config.env).toBe('production')
    expect(config.logLevel).toBe('warn')
    expect(config.corsOrigins).toEqual(['https://app.example.com', 'https://admin.example.com'])
    expect(config.cookieSecure).toBe(true)
    expect(config.openapiEnabled).toBe(false)
  })

  it('rejects invalid log levels and ports', () => {
    expect(() => getConfig({ LOG_LEVEL: 'loud' })).toThrow(/Invalid LOG_LEVEL/)
    expect(() => getConfig({ API_PORT: 'abc' })).toThrow(/Invalid API_PORT/)
  })
})
