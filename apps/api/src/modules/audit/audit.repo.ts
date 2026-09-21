import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm'
import { type Db } from '@reka/database'
import { auditLogs } from './audit-log.schema.js'

export interface AuditInput {
  actorId?: string | null
  organizationId?: string | null
  action: string
  resourceType: string
  resourceId?: string | null
  metadata?: Record<string, unknown>
}

export interface AuditLogRow {
  id: string
  actorId: string | null
  organizationId: string | null
  action: string
  resourceType: string
  resourceId: string | null
  metadata: Record<string, unknown>
  occurredAt: Date
}

export interface AuditQueryFilters {
  organizationId: string
  actorId?: string
  resourceType?: string
  resourceId?: string
  action?: string
  fromDate?: Date
  toDate?: Date
}

export async function insertAuditLog(db: Db, input: AuditInput): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: input.actorId ?? null,
    organizationId: input.organizationId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? {},
  })
}

export async function queryAuditLogs(
  db: Db,
  filters: AuditQueryFilters,
  limit = 100,
): Promise<AuditLogRow[]> {
  const conditions: SQL[] = [eq(auditLogs.organizationId, filters.organizationId)]

  if (filters.actorId) {
    conditions.push(eq(auditLogs.actorId, filters.actorId))
  }
  if (filters.resourceType) {
    conditions.push(eq(auditLogs.resourceType, filters.resourceType))
  }
  if (filters.resourceId) {
    conditions.push(eq(auditLogs.resourceId, filters.resourceId))
  }
  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action))
  }
  if (filters.fromDate) {
    conditions.push(gte(auditLogs.occurredAt, filters.fromDate))
  }
  if (filters.toDate) {
    conditions.push(lte(auditLogs.occurredAt, filters.toDate))
  }

  return db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.occurredAt))
    .limit(limit)
}
