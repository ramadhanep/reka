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
