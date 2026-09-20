export const API_MAJOR_VERSION = 1

export const API_PREFIX = `/api/v${API_MAJOR_VERSION}`

export type ApiErrorCode =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'
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

export type WorkflowDefinitionStatus = 'draft' | 'active' | 'archived'

export type WorkflowInstanceStatus = 'active' | 'completed' | 'canceled'

export interface WorkflowStateSummary {
  id: string
  workflowDefinitionId: string
  key: string
  name: string
  isInitial: boolean
  isTerminal: boolean
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WorkflowTransitionSummary {
  id: string
  workflowDefinitionId: string
  key: string
  name: string
  fromStateId: string
  toStateId: string
  requiredPermission?: string | null
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WorkflowDefinitionSummary {
  id: string
  organizationId?: string | null
  key: string
  name: string
  description?: string | null
  version: number
  status: WorkflowDefinitionStatus
  states?: WorkflowStateSummary[]
  transitions?: WorkflowTransitionSummary[]
  createdAt: string
  updatedAt: string
}

export interface WorkflowInstanceSummary {
  id: string
  organizationId: string
  workflowDefinitionId: string
  subjectType: string
  subjectId: string
  currentStateId: string
  currentStateKey?: string
  currentStateName?: string
  status: WorkflowInstanceStatus
  availableTransitions?: WorkflowTransitionSummary[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface WorkflowTransitionHistorySummary {
  id: string
  instanceId: string
  organizationId: string
  transitionId?: string | null
  transitionKey: string
  fromStateId?: string | null
  fromStateKey: string
  toStateId?: string | null
  toStateKey: string
  actorId: string
  comment?: string | null
  metadata?: Record<string, unknown>
  createdAt: string
}
