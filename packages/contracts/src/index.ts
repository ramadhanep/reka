export const API_MAJOR_VERSION = 1

export const API_PREFIX = `/api/v${API_MAJOR_VERSION}`

export type ApiErrorCode =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal'

export interface ApiError {
  code: ApiErrorCode
  message: string
  details?: unknown
}

export type ModuleCategory = 'platform' | 'business'

export interface ModuleMenuItem {
  id: string
  label: string
  path: string
  icon?: string
  order?: number
}

export interface RekaModule {
  id: string
  version: string
  displayName: string
  description?: string
  category: ModuleCategory
  dependencies: string[]
  permissions?: string[]
  routes?: string[]
  menus?: ModuleMenuItem[]
  migrations?: string[]
}

export interface ModuleSummary {
  id: string
  version: string
  displayName: string
  description?: string
  category: ModuleCategory
  dependencies: string[]
  permissions: string[]
  routes: string[]
  menus: ModuleMenuItem[]
  enabled: boolean
}
