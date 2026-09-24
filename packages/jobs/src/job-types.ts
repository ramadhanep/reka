/**
 * Shared job type vocabulary.
 *
 * Job types are plain strings stored in the jobs table. Keeping them in one
 * place prevents the API and worker from drifting apart.
 */

/** Recurring auth-hygiene job: deletes expired sessions and activation tokens. */
export const AUTH_CLEANUP_JOB = 'ops.auth-cleanup'
