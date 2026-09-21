import { Inject, Injectable } from '@nestjs/common'
import type { Database, Db } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import {
  insertAuditLog,
  queryAuditLogs,
  type AuditInput,
  type AuditLogRow,
  type AuditQueryFilters,
} from './audit.repo.js'

export interface AuditLogView {
  id: string
  actorId: string | null
  organizationId: string | null
  action: string
  resourceType: string
  resourceId: string | null
  metadata: Record<string, unknown>
  occurredAt: string
}

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async record(input: AuditInput, db?: Db): Promise<void> {
    await insertAuditLog(db ?? this.database.db, input)
  }

  async listAuditLogs(filters: AuditQueryFilters, limit?: number): Promise<AuditLogView[]> {
    const rows = await queryAuditLogs(this.database.db, filters, limit)
    return rows.map((row) => this.toView(row))
  }

  private toView(row: AuditLogRow): AuditLogView {
    return {
      id: row.id,
      actorId: row.actorId,
      organizationId: row.organizationId,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: row.metadata,
      occurredAt: row.occurredAt.toISOString(),
    }
  }
}
