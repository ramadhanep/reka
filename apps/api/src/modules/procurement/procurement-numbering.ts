import { sql } from 'drizzle-orm'
import { type Db } from '@reka/database'
import { documentSequences } from './procurement.schema.js'

export const DOCUMENT_CODE_PR = 'PR'
export const DOCUMENT_CODE_PO = 'PO'
export const DOCUMENT_CODE_GR = 'GR'

const PAD_WIDTH = 6

export function formatDocumentNumber(code: string, value: number): string {
  return `${code}-${String(value).padStart(PAD_WIDTH, '0')}`
}

/**
 * Allocates the next document number for an organization/code pair.
 * Uses a single atomic upsert so concurrent requests never observe the
 * same sequence value. Must be called inside the surrounding write
 * transaction so the number is committed together with the document row.
 */
export async function allocateDocumentNumber(
  db: Db,
  organizationId: string,
  code: string,
): Promise<string> {
  const [row] = await db
    .insert(documentSequences)
    .values({ organizationId, code, value: 1 })
    .onConflictDoUpdate({
      target: [documentSequences.organizationId, documentSequences.code],
      set: { value: sql`${documentSequences.value} + 1` },
    })
    .returning()
  if (!row) {
    throw new Error(`Failed to allocate ${code} document number`)
  }
  return formatDocumentNumber(code, row.value)
}
