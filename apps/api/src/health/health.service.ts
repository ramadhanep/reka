import { Inject, Injectable } from '@nestjs/common'
import { pingDatabase, type Database } from '@reka/database'
import { DATABASE } from '../common/database.token.js'

export interface HealthStatus {
  status: 'ok' | 'degraded'
  database: 'up' | 'down'
}

@Injectable()
export class HealthService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async status(): Promise<HealthStatus> {
    try {
      await pingDatabase(this.database)
      return { status: 'ok', database: 'up' }
    } catch {
      return { status: 'degraded', database: 'down' }
    }
  }
}
