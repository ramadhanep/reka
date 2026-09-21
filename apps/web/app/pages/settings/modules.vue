<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/" class="text-xs text-slate-500 hover:text-slate-700"
          >← Organizations</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Settings: Modules</h1>
        <p class="text-xs text-slate-500">
          Manage system and business capabilities. Platform modules are required and cannot be
          disabled.
        </p>
      </div>
      <UiButton :disabled="loading" @click="refresh">Refresh</UiButton>
    </div>

    <div v-if="actionError" class="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
      <div class="flex items-center justify-between">
        <p class="text-sm text-red-700">{{ actionError }}</p>
        <button class="text-xs text-red-500 hover:text-red-700" @click="actionError = null">
          Dismiss
        </button>
      </div>
    </div>

    <div v-if="loading && modules.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading modules…
    </div>

    <div v-else-if="error" class="py-8 text-center text-sm text-red-600">
      {{ error }}
    </div>

    <div v-else class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-xs font-medium uppercase text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3">Module</th>
            <th scope="col" class="px-4 py-3">Type</th>
            <th scope="col" class="px-4 py-3">Version</th>
            <th scope="col" class="px-4 py-3">Dependencies</th>
            <th scope="col" class="px-4 py-3">Status</th>
            <th scope="col" class="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="mod in modules" :key="mod.id" class="hover:bg-slate-50">
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900">{{ mod.displayName }}</div>
              <div class="text-xs text-slate-400">id: {{ mod.id }}</div>
              <div v-if="mod.description" class="mt-0.5 text-xs text-slate-500">
                {{ mod.description }}
              </div>
            </td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                :class="
                  mod.category === 'platform'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-purple-50 text-purple-700'
                "
              >
                {{ mod.category }}
              </span>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600">v{{ mod.version }}</td>
            <td class="px-4 py-3 text-xs text-slate-600">
              <span v-if="mod.dependencies.length">
                {{ mod.dependencies.join(', ') }}
              </span>
              <span v-else class="text-slate-400">none</span>
            </td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                :class="
                  mod.enabled
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                "
              >
                {{ mod.enabled ? 'Enabled' : 'Disabled' }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <span v-if="mod.category === 'platform'" class="text-xs text-slate-400 italic">
                Platform required
              </span>
              <div v-else class="flex justify-end gap-2">
                <UiButton
                  v-if="!mod.enabled"
                  :disabled="pendingActionId === mod.id || !hasManagePermission"
                  @click="toggleModule(mod.id, true)"
                >
                  {{ pendingActionId === mod.id ? 'Enabling…' : 'Enable' }}
                </UiButton>
                <UiButton
                  v-else
                  :disabled="pendingActionId === mod.id || !hasManagePermission"
                  @click="toggleModule(mod.id, false)"
                >
                  {{ pendingActionId === mod.id ? 'Disabling…' : 'Disable' }}
                </UiButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!hasManagePermission" class="mt-4 text-xs text-slate-400">
      * Note: Enable and disable actions require administrator (module.manage) permission.
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const api = useApi()

const { modules, loading, error, fetchModules, enableModule, disableModule } = useModules()
const actionError = ref<string | null>(null)
const pendingActionId = ref<string | null>(null)

// Check user permissions via organizations
const { data: orgData } = await useAsyncData(
  'user-orgs-settings',
  () => api<{ organizations: any[] }>('/api/v1/organizations'),
  { default: () => ({ organizations: [] }) },
)

const hasManagePermission = computed(() => {
  const orgs = orgData.value?.organizations ?? []
  return orgs.some((org: any) => org.roleKey === 'owner')
})

onMounted(async () => {
  await fetchModules()
})

async function refresh() {
  actionError.value = null
  await fetchModules()
}

async function toggleModule(id: string, enable: boolean) {
  actionError.value = null
  pendingActionId.value = id
  try {
    const result = enable ? await enableModule(id) : await disableModule(id)
    if (!result.success) {
      actionError.value = result.error ?? 'Action failed'
    }
  } finally {
    pendingActionId.value = null
  }
}
</script>
