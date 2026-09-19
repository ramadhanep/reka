export const API_MAJOR_VERSION = 1

export const API_PREFIX = `/api/v${API_MAJOR_VERSION}`

export type ApiErrorCode =
  'validation' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'internal'

export interface ApiError {
  code: ApiErrorCode
  message: string
  details?: unknown
}
