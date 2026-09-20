import { Inject, Injectable } from '@nestjs/common'
import { pingDatabase, type Database } from '@reka/database'
import { DATABASE } from '../common/database.token.js'

export type OverallHealthStatus = 'ok' | 'degraded'
export type DatabaseStatus = 'up' | 'down'

export interface HealthStatus {
  status: OverallHealthStatus
  database: DatabaseStatus
}

export interface LiveHealth {
  status: 'ok'
}

export interface ReadyHealth {
  status: 'ok'
  database: DatabaseStatus
}

@Injectable()
export class HealthService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /** Overall status: degraded when PostgreSQL is unreachable. */
  async status(): Promise<HealthStatus> {
    const database = await this.checkDatabase()
    return { status: database === 'up' ? 'ok' : 'degraded', database }
  }

  /** Liveness: answers whether the process is alive; no dependency checks. */
  async live(): Promise<LiveHealth> {
    return { status: 'ok' }
  }

  /** Readiness: answers whether the process can serve traffic. */
  async ready(): Promise<ReadyHealth> {
    const database = await this.checkDatabase()
    return { status: 'ok', database }
  }

  private async checkDatabase(): Promise<DatabaseStatus> {
    try {
      await pingDatabase(this.database)
      return 'up'
    } catch {
      return 'down'
    }
  }
}
