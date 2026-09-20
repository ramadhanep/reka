export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export type StorageProvider = 'local' | 's3-compatible'

export interface RedisConfig {
  enabled: boolean
  url?: string
}

export interface OIDCConfig {
  enabled: boolean
  issuer?: string
  clientId?: string
  clientSecret?: string
  callbackUrl?: string
  scopes?: string[]
}

export interface S3Config {
  enabled: boolean
  endpoint?: string
  bucket?: string
  region?: string
  accessKey?: string
  secretKey?: string
  forcePathStyle?: boolean
}

export interface OTELConfig {
  enabled: boolean
  exporterEndpoint?: string
  serviceName?: string
}

export interface AppConfig {
  env: string
  apiPort: number
  webPort: number
  databaseUrl: string
  logLevel: LogLevel
  corsOrigins: string[]
  cookieSecure: boolean
  openapiEnabled: boolean
  redis: RedisConfig
  oidc: OIDCConfig
  s3: S3Config
  otel: OTELConfig
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

function redisConfigFromEnv(env: NodeJS.ProcessEnv): RedisConfig {
  const enabled = booleanFromEnv(env, 'REDIS_ENABLED', false)
  if (!enabled) {
    return { enabled: false }
  }
  const url = env.REDIS_URL
  if (!url) {
    throw new Error('REDIS_URL is required when REDIS_ENABLED=true')
  }
  return { enabled: true, url }
}

function oidcConfigFromEnv(env: NodeJS.ProcessEnv): OIDCConfig {
  const enabled = booleanFromEnv(env, 'OIDC_ENABLED', false)
  if (!enabled) {
    return { enabled: false }
  }
  const issuer = env.OIDC_ISSUER
  const clientId = env.OIDC_CLIENT_ID
  const clientSecret = env.OIDC_CLIENT_SECRET
  if (!issuer || !clientId || !clientSecret) {
    throw new Error(
      'OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET are required when OIDC_ENABLED=true',
    )
  }
  return {
    enabled: true,
    issuer,
    clientId,
    clientSecret,
    callbackUrl: env.OIDC_CALLBACK_URL,
    scopes: env.OIDC_SCOPES
      ? env.OIDC_SCOPES.split(',').map((s) => s.trim())
      : ['openid', 'profile', 'email'],
  }
}

function s3ConfigFromEnv(env: NodeJS.ProcessEnv): S3Config {
  const enabled =
    booleanFromEnv(env, 'STORAGE_PROVIDER', false) || booleanFromEnv(env, 'S3_ENABLED', false)
  if (!enabled) {
    return { enabled: false }
  }
  const endpoint = env.S3_ENDPOINT
  const bucket = env.S3_BUCKET
  const accessKey = env.S3_ACCESS_KEY
  const secretKey = env.S3_SECRET_KEY
  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error(
      'S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, and S3_SECRET_KEY are required when S3_ENABLED=true',
    )
  }
  return {
    enabled: true,
    endpoint,
    bucket,
    region: env.S3_REGION,
    accessKey,
    secretKey,
    forcePathStyle: booleanFromEnv(env, 'S3_FORCE_PATH_STYLE', false),
  }
}

function otelConfigFromEnv(env: NodeJS.ProcessEnv): OTELConfig {
  const enabled = booleanFromEnv(env, 'OTEL_ENABLED', false)
  if (!enabled) {
    return { enabled: false }
  }
  return {
    enabled: true,
    exporterEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: env.OTEL_SERVICE_NAME ?? 'reka',
  }
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
    redis: redisConfigFromEnv(env),
    oidc: oidcConfigFromEnv(env),
    s3: s3ConfigFromEnv(env),
    otel: otelConfigFromEnv(env),
  }

  return config
}
