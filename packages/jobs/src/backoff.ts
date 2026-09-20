const DEFAULT_BASE_MS = 1000
const MAX_BACKOFF_MS = 60 * 60 * 1000

/**
 * Exponential backoff for a failed attempt.
 *
 *   attempt 1 -> base
 *   attempt 2 -> base * 2
 *   attempt 3 -> base * 4
 *
 * Capped so a stuck job never sleeps forever. Optional `jitterRatio` adds
 * +/- percentage jitter to spread restarts of many failed jobs.
 */
export function backoffDelay(attempts: number, baseMs = DEFAULT_BASE_MS): number {
  if (attempts < 1) return 0
  const raw = baseMs * 2 ** (attempts - 1)
  return Math.min(Math.floor(raw), MAX_BACKOFF_MS)
}

export function withJitter(delayMs: number, jitterRatio = 0.2): number {
  if (delayMs <= 0) return 0
  const range = delayMs * jitterRatio
  const offset = Math.random() * range * 2 - range
  return Math.max(0, Math.floor(delayMs + offset))
}
