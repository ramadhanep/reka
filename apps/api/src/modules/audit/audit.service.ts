import { Inject, Injectable } from '@nestjs/common'
import type { Database, Db } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import { insertAuditLog, type AuditInput } from './audit.repo.js'

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async record(input: AuditInput, db?: Db): Promise<void> {
    await insertAuditLog(db ?? this.database.db, input)
  }
}
