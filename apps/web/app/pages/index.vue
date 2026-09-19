<template>
  <div>
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold text-slate-900">Organizations</h1>
      <UiButton @click="showCreate = !showCreate">
        {{ showCreate ? 'Cancel' : 'New organization' }}
      </UiButton>
    </div>

    <form
      v-if="showCreate"
      class="mt-3 flex flex-col gap-2 sm:flex-row"
      @submit.prevent="createOrg"
    >
      <UiInput v-model="newName" placeholder="Organization name" />
      <UiButton type="submit" :disabled="creating">{{
        creating ? 'Creating…' : 'Create'
      }}</UiButton>
    </form>
    <UiErrorText :message="createError" />

    <p v-if="pending" class="mt-4 text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="mt-4 text-sm text-red-600">Failed to load organizations.</p>
    <p v-else-if="orgs.length === 0" class="mt-4 text-sm text-slate-500">
      No organizations yet. Create one to get started.
    </p>
    <ul v-else class="mt-4 space-y-2">
      <li v-for="org in orgs" :key="org.id">
        <NuxtLink
          :to="`/organizations/${org.id}`"
          class="block rounded-md border border-slate-200 bg-white px-4 py-3 hover:border-slate-400"
        >
          <div class="text-sm font-medium text-slate-900">{{ org.name }}</div>
          <div class="text-xs text-slate-500">{{ org.roleKey }} · {{ org.slug }}</div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { data, pending, error, refresh } = await useAsyncData(
  'organizations',
  () => $fetch<{ organizations: any[] }>('/api/v1/organizations'),
  { default: () => ({ organizations: [] }) },
)
const orgs = computed(() => data.value?.organizations ?? [])

const showCreate = ref(false)
const newName = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

async function createOrg() {
  createError.value = null
  creating.value = true
  try {
    await $fetch('/api/v1/organizations', { method: 'POST', body: { name: newName.value } })
    newName.value = ''
    showCreate.value = false
    await refresh()
  } catch (e: any) {
    createError.value = e?.data?.message ?? 'Could not create organization'
  } finally {
    creating.value = false
  }
}
</script>
