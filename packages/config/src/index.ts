export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export interface AppConfig {
  env: string
  apiPort: number
  webPort: number
  databaseUrl: string
  logLevel: LogLevel
  corsOrigins: string[]
  cookieSecure: boolean
  openapiEnabled: boolean
}

const DEV_DATABASE_URL = 'postgres://reka:reka@localhost:5432/reka'

const LOG_LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

function numberFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]
  if (raw === undefined || raw === '') {
    return fallback
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer, got "${raw}"`)
  }
  return parsed
}

function logLevelFromEnv(env: NodeJS.ProcessEnv, production: boolean): LogLevel {
  const raw = env.LOG_LEVEL
  if (raw === undefined || raw === '') {
    return production ? 'info' : 'debug'
  }
  const level = raw.toLowerCase()
  if (!LOG_LEVELS.includes(level as LogLevel)) {
    throw new Error(`Invalid LOG_LEVEL: expected one of ${LOG_LEVELS.join(', ')}, got "${raw}"`)
  }
  return level as LogLevel
}

function booleanFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]
  if (raw === undefined || raw === '') {
    return fallback
  }
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  throw new Error(`Invalid ${name}: expected true/false, got "${raw}"`)
}

function corsOriginsFromEnv(env: NodeJS.ProcessEnv, production: boolean): string[] {
  const raw = env.CORS_ORIGINS
  if (raw === undefined || raw === '') {
    if (production) {
      throw new Error(
        'CORS_ORIGINS is required in production: comma-separated allowed origins (e.g. https://app.example.com)',
      )
    }
    return ['http://localhost:3000']
  }
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one origin')
  }
  if (production && origins.includes('*')) {
    throw new Error('CORS_ORIGINS must not contain "*" in production')
  }
  return origins
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnv = env.APP_ENV ?? 'development'
  const production = appEnv === 'production'

  const databaseUrl = env.DATABASE_URL
  if (production) {
    if (env.DATABASE_URL === undefined || env.DATABASE_URL === '') {
      throw new Error(
        'DATABASE_URL is required in production; development defaults are not allowed to leak into production',
      )
    }
    if (env.DATABASE_URL === DEV_DATABASE_URL) {
      throw new Error(
        'DATABASE_URL must be overridden in production (use a secure storage rather than the localhost development default)',
      )
    }
  }

  const config: AppConfig = {
    env: appEnv,
    apiPort: numberFromEnv(env, 'API_PORT', 4000),
    webPort: numberFromEnv(env, 'WEB_PORT', 3000),
    databaseUrl: databaseUrl || DEV_DATABASE_URL,
    logLevel: logLevelFromEnv(env, production),
    corsOrigins: corsOriginsFromEnv(env, production),
    cookieSecure: booleanFromEnv(env, 'COOKIE_SECURE', production),
    openapiEnabled: booleanFromEnv(env, 'OPENAPI_ENABLED', !production),
  }

  return config
}
