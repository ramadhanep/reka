<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/" class="text-xs text-slate-500 hover:text-slate-700"
          >← Organizations</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Settings: Workflows</h1>
        <p class="text-xs text-slate-500">
          Generic state machines and transition rules for operational workflows.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UiButton :disabled="loading" @click="fetchWorkflows">Refresh</UiButton>
      </div>
    </div>

    <div v-if="actionMessage" class="mb-4 rounded-md border border-green-200 bg-green-50 p-3">
      <div class="flex items-center justify-between">
        <p class="text-sm text-green-700">{{ actionMessage }}</p>
        <button class="text-xs text-green-500 hover:text-green-700" @click="actionMessage = null">
          Dismiss
        </button>
      </div>
    </div>

    <div v-if="actionError" class="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
      <div class="flex items-center justify-between">
        <p class="text-sm text-red-700">{{ actionError }}</p>
        <button class="text-xs text-red-500 hover:text-red-700" @click="actionError = null">
          Dismiss
        </button>
      </div>
    </div>

    <div v-if="loading && workflows.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading workflow definitions…
    </div>

    <div v-else-if="error" class="py-8 text-center text-sm text-red-600">
      {{ error }}
    </div>

    <div
      v-else-if="workflows.length === 0"
      class="rounded-lg border border-dashed border-slate-200 p-8 text-center"
    >
      <p class="text-sm text-slate-600">No workflow definitions found.</p>
      <p class="mt-1 text-xs text-slate-400">
        Workflow definitions describe reusable state machines used by business modules.
      </p>
    </div>

    <div v-else class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-xs font-medium uppercase text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3">Workflow</th>
            <th scope="col" class="px-4 py-3">Key</th>
            <th scope="col" class="px-4 py-3">Version</th>
            <th scope="col" class="px-4 py-3">Status</th>
            <th scope="col" class="px-4 py-3">Scope</th>
            <th scope="col" class="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="w in workflows" :key="w.id" class="hover:bg-slate-50">
            <td class="px-4 py-3">
              <NuxtLink
                :to="`/settings/workflows/${w.id}`"
                class="font-medium text-slate-900 hover:underline"
              >
                {{ w.name }}
              </NuxtLink>
              <div v-if="w.description" class="mt-0.5 text-xs text-slate-500">
                {{ w.description }}
              </div>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600">{{ w.key }}</td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600">v{{ w.version }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                :class="statusBadgeClass(w.status)"
              >
                {{ w.status }}
              </span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500">
              {{ w.organizationId ? 'Organization' : 'System Template' }}
            </td>
            <td class="px-4 py-3 text-right space-x-2">
              <NuxtLink
                :to="`/settings/workflows/${w.id}`"
                class="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                Inspect
              </NuxtLink>
              <button
                v-if="w.status === 'draft'"
                class="text-xs font-medium text-emerald-600 hover:text-emerald-800"
                @click="onPublish(w.id)"
              >
                Publish
              </button>
              <button
                v-if="w.status === 'active'"
                class="text-xs font-medium text-purple-600 hover:text-purple-800"
                @click="onNewVersion(w.id)"
              >
                New Version
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WorkflowDefinitionStatus } from '@reka/contracts'

definePageMeta({
  middleware: ['auth'],
})

const { workflows, loading, error, fetchWorkflows, publishWorkflow, createVersion } = useWorkflows()
const actionMessage = ref<string | null>(null)
const actionError = ref<string | null>(null)

onMounted(() => {
  fetchWorkflows()
})

function statusBadgeClass(status: WorkflowDefinitionStatus): string {
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

async function onPublish(id: string) {
  actionError.value = null
  actionMessage.value = null
  const res = await publishWorkflow(id)
  if (res.success) {
    actionMessage.value = 'Workflow successfully published to active'
  } else {
    actionError.value = res.error ?? 'Failed to publish workflow'
  }
}

async function onNewVersion(id: string) {
  actionError.value = null
  actionMessage.value = null
  const res = await createVersion(id)
  if (res.success) {
    actionMessage.value = `Created version ${res.workflow?.version} (Draft)`
  } else {
    actionError.value = res.error ?? 'Failed to create new version'
  }
}
</script>
