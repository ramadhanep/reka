import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

export const REQUEST_ID_HEADER = 'x-request-id'

export interface RequestContext {
  requestId?: string
  userId?: string
  organizationId?: string
}

export const requestContextStore = new AsyncLocalStorage<RequestContext>()

export function getRequestContext(): RequestContext {
  return requestContextStore.getStore() ?? {}
}

/**
 * Accepts a caller-supplied request ID only when it is a well-formed, bounded
 * token. Anything else is replaced, so arbitrary caller values are never
 * reflected back into logs or error bodies.
 */
export function normalizeRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (/^[A-Za-z0-9._:/-]{8,128}$/.test(trimmed)) {
    return trimmed
  }
  return undefined
}

export function generateRequestId(): string {
  return `req_${randomUUID()}`
}

export function resolveRequestId(headerValue: unknown): string {
  return normalizeRequestId(headerValue) ?? generateRequestId()
}
