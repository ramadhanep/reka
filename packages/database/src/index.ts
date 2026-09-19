import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export interface Database {
  pool: Pool
  db: NodePgDatabase
  close: () => Promise<void>
}

export function createDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString })
  return {
    pool,
    db: drizzle(pool),
    close: () => pool.end(),
  }
}

export async function pingDatabase(database: Database): Promise<void> {
  await database.pool.query('SELECT 1')
}

export type { NodePgDatabase }
