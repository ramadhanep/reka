<template>
  <div>
    <div class="mb-4">
      <NuxtLink to="/" class="text-xs text-slate-500 hover:text-slate-700"
        >← Organizations</NuxtLink
      >
      <h1 class="mt-1 text-lg font-semibold text-slate-900">Settings: Audit Logs</h1>
      <p class="text-xs text-slate-500">
        View audit trail of actions performed within your organization.
      </p>
    </div>

    <div v-if="error" class="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
      <p class="text-sm text-red-700">{{ error }}</p>
    </div>

    <div v-if="loading && logs.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading audit logs…
    </div>

    <div v-else-if="logs.length === 0" class="py-8 text-center text-sm text-slate-500">
      No audit logs found.
    </div>

    <div v-else class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-xs font-medium uppercase text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3">Timestamp</th>
            <th scope="col" class="px-4 py-3">Action</th>
            <th scope="col" class="px-4 py-3">Resource</th>
            <th scope="col" class="px-4 py-3">Actor</th>
            <th scope="col" class="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="log in logs" :key="log.id" class="hover:bg-slate-50">
            <td class="px-4 py-3 text-xs text-slate-600">
              {{ formatTimestamp(log.occurredAt) }}
            </td>
            <td class="px-4 py-3">
              <span class="font-medium text-slate-900">{{ log.action }}</span>
            </td>
            <td class="px-4 py-3">
              <div class="text-slate-900">{{ log.resourceType }}</div>
              <div v-if="log.resourceId" class="text-xs text-slate-400">
                {{ log.resourceId }}
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-600">
              {{ log.actorId || 'System' }}
            </td>
            <td class="px-4 py-3 text-xs text-slate-500">
              <span v-if="Object.keys(log.metadata).length > 0" class="font-mono">
                {{ JSON.stringify(log.metadata) }}
              </span>
              <span v-else class="text-slate-400">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

interface AuditLog {
  id: string
  actorId: string | null
  organizationId: string | null
  action: string
  resourceType: string
  resourceId: string | null
  metadata: Record<string, unknown>
  occurredAt: string
}

const logs = ref<AuditLog[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const api = useApi()
const orgContext = useOrganizationContext()

// Use the organization selected in the org switcher, not a hardcoded first org.
const { data: orgData } = await useAsyncData(
  'user-orgs-audit',
  () => api<{ organizations: any[] }>('/api/v1/organizations'),
  { default: () => ({ organizations: [] }) },
)

const organizationId = computed(
  () => orgContext.activeOrgId.value || orgData.value?.organizations[0]?.id,
)

async function fetchAuditLogs() {
  if (!organizationId.value) return

  loading.value = true
  error.value = null
  try {
    const response = await api<{ logs: AuditLog[] }>('/api/v1/audit', {
      query: { organizationId: organizationId.value },
    })
    logs.value = response.logs
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Failed to load audit logs'
  } finally {
    loading.value = false
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(async () => {
  await fetchAuditLogs()
})

watch(organizationId, (id) => {
  if (id) fetchAuditLogs()
})
</script>
