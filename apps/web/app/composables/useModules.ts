import type { ModuleSummary } from '@reka/contracts'

export const useModules = () => {
  const modules = useState<ModuleSummary[]>('modules:list', () => [])
  const loading = useState<boolean>('modules:loading', () => false)
  const error = useState<string | null>('modules:error', () => null)

  async function fetchModules() {
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ modules: ModuleSummary[] }>('/api/v1/modules')
      modules.value = res.modules
    } catch (e: any) {
      error.value = e?.data?.message ?? 'Failed to load modules'
    } finally {
      loading.value = false
    }
  }

  async function enableModule(id: string) {
    error.value = null
    try {
      const res = await $fetch<{ module: ModuleSummary }>(`/api/v1/modules/${id}/enable`, {
        method: 'POST',
      })
      const idx = modules.value.findIndex((m) => m.id === id)
      if (idx !== -1) {
        modules.value[idx] = res.module
      }
      return { success: true }
    } catch (e: any) {
      const msg = e?.data?.message ?? `Failed to enable module ${id}`
      error.value = msg
      return { success: false, error: msg }
    }
  }

  async function disableModule(id: string) {
    error.value = null
    try {
      const res = await $fetch<{ module: ModuleSummary }>(`/api/v1/modules/${id}/disable`, {
        method: 'POST',
      })
      const idx = modules.value.findIndex((m) => m.id === id)
      if (idx !== -1) {
        modules.value[idx] = res.module
      }
      return { success: true }
    } catch (e: any) {
      const msg = e?.data?.message ?? `Failed to disable module ${id}`
      error.value = msg
      return { success: false, error: msg }
    }
  }

  const enabledModuleIds = computed(() => modules.value.filter((m) => m.enabled).map((m) => m.id))

  return {
    modules,
    loading,
    error,
    fetchModules,
    enableModule,
    disableModule,
    enabledModuleIds,
  }
}
