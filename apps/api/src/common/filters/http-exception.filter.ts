import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { FastifyReply } from 'fastify'
import type { ApiErrorCode } from '@reka/contracts'
import { getRequestContext } from '../request-context.js'

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'validation'
    case HttpStatus.UNAUTHORIZED:
      return 'unauthorized'
    case HttpStatus.FORBIDDEN:
      return 'forbidden'
    case HttpStatus.NOT_FOUND:
      return 'not_found'
    case HttpStatus.CONFLICT:
      return 'conflict'
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'rate_limited'
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'unavailable'
    default:
      return 'internal'
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const reply = ctx.getResponse<FastifyReply>()
    const request = ctx.getRequest<{
      headers: Record<string, string | undefined>
      id?: string
    }>()

    const isHttp = exception instanceof HttpException
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    let message = 'Internal server error'
    let details: unknown

    if (isHttp) {
      const response = exception.getResponse()
      if (typeof response === 'string') {
        message = response
      } else if (response && typeof response === 'object') {
        const body = response as { message?: unknown; error?: string }
        if (Array.isArray(body.message)) {
          details = body.message
          message = 'Validation failed'
        } else if (typeof body.message === 'string') {
          message = body.message
        } else if (typeof body.error === 'string') {
          message = body.error
        }
      }
    }

    const requestId = getRequestContext().requestId ?? request.id ?? randomUUID()
    if (status >= 500) {
      this.logger.error(
        `request=${requestId} status=${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      )
    }

    reply.status(status).send({ code: codeForStatus(status), message, details, requestId })
  }
}
