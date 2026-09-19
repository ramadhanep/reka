import { getConfig } from '@reka/config'
import { createDatabase, pingDatabase } from '@reka/database'

const config = getConfig()
const database = createDatabase(config.databaseUrl)

try {
  await pingDatabase(database)
  console.log('worker started (no jobs registered yet)')
} catch (error) {
  console.error('worker failed to reach the database', error)
  process.exitCode = 1
} finally {
  await database.close()
}
