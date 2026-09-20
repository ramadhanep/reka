import type { LoggerService } from '@nestjs/common'
import pino from 'pino'
import type { LogLevel } from '@reka/config'
import { getRequestContext } from './request-context.js'

const REDACT_PATHS = [
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'cookie',
  'password',
  'token',
  '*.password',
  '*.token',
]

export function createPinoLogger(level: LogLevel): pino.Logger {
  return pino({
    level,
    base: { service: 'reka-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  })
}

function contextFields(): Record<string, unknown> {
  return { ...getRequestContext() }
}

function getLastString(optionalParams: unknown[]): string | undefined {
  const last = optionalParams[optionalParams.length - 1]
  return typeof last === 'string' ? last : undefined
}

/**
 * Nest LoggerService backed by pino that emits JSON log lines enriched with
 * the current request context (requestId/userId/organizationId) and the Nest
 * module/context name.
 */
export class StructuredLogger implements LoggerService {
  constructor(private readonly logger: pino.Logger = createPinoLogger('info')) {}

  private forContext(context?: unknown): pino.Logger {
    const module = typeof context === 'string' ? context : undefined
    const child = module ? this.logger.child({ module }) : this.logger
    const ctx = contextFields()
    const hasContext = ctx.requestId !== undefined || ctx.userId !== undefined
    return hasContext ? child.child(ctx) : child
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    const context = getLastString(optionalParams)
    if (typeof message === 'object' && message !== null) {
      this.forContext(context).info({ log: message })
      return
    }
    this.forContext(context).info(String(message))
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const context = getLastString(optionalParams)
    const stack = optionalParams.find((p): p is string => typeof p === 'string' && p.includes('\n'))
    const errorObj: Record<string, unknown> = {}
    if (stack) errorObj.stack = stack
    this.forContext(context).error(errorObj, String(message))
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.forContext(getLastString(optionalParams)).warn(String(message))
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.forContext(getLastString(optionalParams)).debug(String(message))
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.forContext(getLastString(optionalParams)).trace(String(message))
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.forContext(getLastString(optionalParams)).fatal(String(message))
  }
}
