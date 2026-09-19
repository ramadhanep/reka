export interface AppConfig {
  env: string
  apiPort: number
  webPort: number
  databaseUrl: string
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') {
    return fallback
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer, got "${raw}"`)
  }
  return parsed
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    env: env.APP_ENV ?? 'development',
    apiPort: numberFromEnv('API_PORT', 4000),
    webPort: numberFromEnv('WEB_PORT', 3000),
    databaseUrl: env.DATABASE_URL ?? 'postgres://reka:reka@localhost:5432/reka',
  }
}
