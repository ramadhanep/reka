import { getConfig, type LogLevel } from '@reka/config'
import { createDatabase, pingDatabase, type Database } from '@reka/database'
import { createJobWorker } from '@reka/jobs'

function jsonLog(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    module: 'worker',
    message,
    ...fields,
  })
  if (level === 'error' || level === 'fatal') {
    process.stderr.write(`${line}\n`)
  } else {
    process.stdout.write(`${line}\n`)
  }
}

async function run(): Promise<void> {
  const config = getConfig()
  jsonLog('info', 'starting worker', {
    workerId: WORKER_ID,
    env: config.env,
    pollIntervalMs: POLL_INTERVAL_MS,
  })

  const database: Database = createDatabase(config.databaseUrl)
  await pingDatabase(database)
  jsonLog('info', 'worker connected to database')

  const worker = createJobWorker({
    db: () => database,
    workerId: WORKER_ID,
    batchSize: BATCH_SIZE,
    pollIntervalMs: POLL_INTERVAL_MS,
    lockTimeoutMs: LOCK_TIMEOUT_MS,
    backoffBaseMs: 1000,
    handlers: {
      // No-op sample job proving enqueue -> claim -> complete.
      'ops.noop': async () => {
        jsonLog('info', 'executing ops.noop')
      },
    },
    logger: (level, message, fields) => {
      jsonLog(level as LogLevel, message, fields ?? {})
    },
  })

  worker.start()
  jsonLog('info', 'worker polling for jobs', { workerId: WORKER_ID })

  const shutdown = async (signal: string): Promise<void> => {
    jsonLog('warn', `received ${signal}, draining worker`, { workerId: WORKER_ID })
    await worker.stop()
    await database.close()
    jsonLog('info', 'worker stopped cleanly')
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  // Keep the process alive; shutdown is handled by signals.
  await new Promise<never>(() => {})
}

const WORKER_ID = `worker-${process.pid}`
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1000)
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 10)
const LOCK_TIMEOUT_MS = Number(process.env.WORKER_LOCK_TIMEOUT_MS ?? 5 * 60 * 1000)

void run().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level: 'fatal', module: 'worker', message })}\n`,
  )
  process.exitCode = 1
})
