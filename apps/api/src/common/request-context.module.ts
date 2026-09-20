import { Global, Injectable, Module } from '@nestjs/common'
import {
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type OnModuleInit,
} from '@nestjs/common'
import { APP_INTERCEPTOR, HttpAdapterHost } from '@nestjs/core'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { defer, Observable } from 'rxjs'
import type { AuthRequest } from '../common/auth-request.js'
import { requestContextStore, REQUEST_ID_HEADER, resolveRequestId } from './request-context.js'

/**
 * Fastify onRequest hook that assigns a normalized request ID to every request,
 * exposes it via the `x-request-id` response header, and seeds the
 * AsyncLocalStorage request context before the Nest pipeline runs.
 */
@Injectable()
export class RequestContextHook implements OnModuleInit {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  onModuleInit(): void {
    const adapter = this.httpAdapterHost.httpAdapter
    const fastify = adapter.getInstance() as FastifyInstance
    fastify.addHook('onRequest', (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
      const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER])
      req.id = requestId
      reply.header(REQUEST_ID_HEADER, requestId)
      requestContextStore.run({ requestId }, (): void => done())
    })
  }
}

/**
 * Merges the authenticated actor (guard output) into the request context so
 * structured logs emitted while handling this request carry userId and
 * organizationId.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthRequest>()
    const existing = requestContextStore.getStore() ?? {}
    const merged = {
      ...existing,
      userId: request.user?.userId ?? existing.userId,
      organizationId: request.organization?.organizationId ?? existing.organizationId,
    }
    return defer(() => requestContextStore.run(merged, () => next.handle()))
  }
}

@Global()
@Module({
  providers: [
    RequestContextHook,
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
  exports: [RequestContextHook],
})
export class RequestContextModule {}
