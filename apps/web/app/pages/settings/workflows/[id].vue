<template>
  <div>
    <div class="mb-4">
      <NuxtLink to="/settings/workflows" class="text-xs text-slate-500 hover:text-slate-700"
        >← Workflows</NuxtLink
      >
    </div>

    <div v-if="loading && !workflow" class="py-8 text-center text-sm text-slate-500">
      Loading workflow definition…
    </div>

    <div v-else-if="error && !workflow" class="py-8 text-center text-sm text-red-600">
      {{ error }}
    </div>

    <div v-else-if="workflow">
      <!-- Header -->
      <div class="mb-6 flex items-start justify-between">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-slate-900">{{ workflow.name }}</h1>
            <span class="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
              v{{ workflow.version }}
            </span>
            <span
              class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
              :class="statusBadgeClass(workflow.status)"
            >
              {{ workflow.status }}
            </span>
          </div>
          <p class="mt-1 font-mono text-xs text-slate-500">key: {{ workflow.key }}</p>
          <p v-if="workflow.description" class="mt-1 text-sm text-slate-600">
            {{ workflow.description }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UiButton v-if="workflow.status === 'draft'" @click="onPublish">
            Publish to Active
          </UiButton>
          <UiButton v-if="workflow.status === 'active'" @click="onNewVersion">
            New Version
          </UiButton>
        </div>
      </div>

      <!-- Alert banners -->
      <div v-if="actionMessage" class="mb-4 rounded-md border border-green-200 bg-green-50 p-3">
        <p class="text-sm text-green-700">{{ actionMessage }}</p>
      </div>
      <div v-if="actionError" class="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
        <p class="text-sm text-red-700">{{ actionError }}</p>
      </div>

      <!-- States Section -->
      <div class="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-700">
          States ({{ workflow.states?.length ?? 0 }})
        </h2>
        <div class="overflow-hidden rounded border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead class="bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th scope="col" class="px-4 py-2">Key</th>
                <th scope="col" class="px-4 py-2">Name</th>
                <th scope="col" class="px-4 py-2">Properties</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="state in workflow.states" :key="state.id" class="hover:bg-slate-50">
                <td class="px-4 py-2 font-mono text-xs text-slate-800">{{ state.key }}</td>
                <td class="px-4 py-2 font-medium text-slate-900">{{ state.name }}</td>
                <td class="px-4 py-2 space-x-1">
                  <span
                    v-if="state.isInitial"
                    class="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                  >
                    Initial
                  </span>
                  <span
                    v-if="state.isTerminal"
                    class="inline-flex items-center rounded bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700"
                  >
                    Terminal
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Transitions Section -->
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-700">
          Allowed Transitions ({{ workflow.transitions?.length ?? 0 }})
        </h2>
        <div class="overflow-hidden rounded border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead class="bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th scope="col" class="px-4 py-2">Transition Key</th>
                <th scope="col" class="px-4 py-2">Name</th>
                <th scope="col" class="px-4 py-2">From State</th>
                <th scope="col" class="px-4 py-2"></th>
                <th scope="col" class="px-4 py-2">To State</th>
                <th scope="col" class="px-4 py-2">Required Permission</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="t in workflow.transitions" :key="t.id" class="hover:bg-slate-50">
                <td class="px-4 py-2 font-mono text-xs text-slate-800">{{ t.key }}</td>
                <td class="px-4 py-2 font-medium text-slate-900">{{ t.name }}</td>
                <td class="px-4 py-2 font-mono text-xs text-slate-600">
                  {{ resolveStateKey(t.fromStateId) }}
                </td>
                <td class="px-2 py-2 text-slate-400">→</td>
                <td class="px-4 py-2 font-mono text-xs text-slate-600">
                  {{ resolveStateKey(t.toStateId) }}
                </td>
                <td class="px-4 py-2 font-mono text-xs text-slate-500">
                  {{ t.requiredPermission ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WorkflowDefinitionStatus, WorkflowDefinitionSummary } from '@reka/contracts'

definePageMeta({
  middleware: ['auth'],
})

const route = useRoute()
const router = useRouter()
const id = route.params.id as string

const { loading, error, fetchWorkflow, publishWorkflow, createVersion } = useWorkflows()
const workflow = ref<WorkflowDefinitionSummary | null>(null)
const actionMessage = ref<string | null>(null)
const actionError = ref<string | null>(null)

onMounted(async () => {
  const result = await fetchWorkflow(id)
  if (result) {
    workflow.value = result
  }
})

function resolveStateKey(stateId: string): string {
  const st = workflow.value?.states?.find((s) => s.id === stateId)
  return st ? st.key : stateId
}

function statusBadgeClass(status?: WorkflowDefinitionStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700'
    case 'draft':
      return 'bg-amber-50 text-amber-700'
    case 'archived':
      return 'bg-slate-100 text-slate-600'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

async function onPublish() {
  actionError.value = null
  actionMessage.value = null
  const res = await publishWorkflow(id)
  if (res.success && res.workflow) {
    workflow.value = res.workflow
    actionMessage.value = 'Workflow successfully published to active'
  } else {
    actionError.value = res.error ?? 'Failed to publish workflow'
  }
}

async function onNewVersion() {
  actionError.value = null
  actionMessage.value = null
  const res = await createVersion(id)
  if (res.success && res.workflow) {
    router.push(`/settings/workflows/${res.workflow.id}`)
  } else {
    actionError.value = res.error ?? 'Failed to create new version'
  }
}
</script>
