import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export type Db = NodePgDatabase

export interface Database {
  pool: Pool
  db: Db
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
