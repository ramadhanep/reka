import type { WorkflowDefinitionSummary } from '@reka/contracts'

export const useWorkflows = () => {
  const workflows = useState<WorkflowDefinitionSummary[]>('workflows:list', () => [])
  const currentWorkflow = useState<WorkflowDefinitionSummary | null>(
    'workflows:current',
    () => null,
  )
  const loading = useState<boolean>('workflows:loading', () => false)
  const error = useState<string | null>('workflows:error', () => null)

  async function fetchWorkflows() {
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ workflows: WorkflowDefinitionSummary[] }>('/api/v1/workflows')
      workflows.value = res.workflows
    } catch (e: unknown) {
      const err = e as { data?: { message?: string } }
      error.value = err?.data?.message ?? 'Failed to load workflow definitions'
    } finally {
      loading.value = false
    }
  }

  async function fetchWorkflow(id: string) {
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ workflow: WorkflowDefinitionSummary }>(`/api/v1/workflows/${id}`)
      currentWorkflow.value = res.workflow
      return res.workflow
    } catch (e: unknown) {
      const err = e as { data?: { message?: string } }
      error.value = err?.data?.message ?? `Failed to load workflow ${id}`
      return null
    } finally {
      loading.value = false
    }
  }

  async function publishWorkflow(id: string) {
    error.value = null
    try {
      const res = await $fetch<{ workflow: WorkflowDefinitionSummary }>(
        `/api/v1/workflows/${id}/publish`,
        { method: 'POST' },
      )
      const idx = workflows.value.findIndex((w) => w.id === id)
      if (idx !== -1) {
        workflows.value[idx] = res.workflow
      }
      if (currentWorkflow.value?.id === id) {
        currentWorkflow.value = res.workflow
      }
      return { success: true, workflow: res.workflow }
    } catch (e: unknown) {
      const err = e as { data?: { message?: string } }
      const msg = err?.data?.message ?? `Failed to publish workflow ${id}`
      error.value = msg
      return { success: false, error: msg }
    }
  }

  async function createVersion(id: string) {
    error.value = null
    try {
      const res = await $fetch<{ workflow: WorkflowDefinitionSummary }>(
        `/api/v1/workflows/${id}/version`,
        { method: 'POST' },
      )
      workflows.value.unshift(res.workflow)
      return { success: true, workflow: res.workflow }
    } catch (e: unknown) {
      const err = e as { data?: { message?: string } }
      const msg = err?.data?.message ?? `Failed to create version for workflow ${id}`
      error.value = msg
      return { success: false, error: msg }
    }
  }

  return {
    workflows,
    currentWorkflow,
    loading,
    error,
    fetchWorkflows,
    fetchWorkflow,
    publishWorkflow,
    createVersion,
  }
}
