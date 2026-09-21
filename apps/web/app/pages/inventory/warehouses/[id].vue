<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/inventory/warehouses" class="text-xs text-slate-500 hover:text-slate-700"
          >← Warehouses</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">
          {{ warehouse?.name ?? 'Warehouse' }} ({{ warehouse?.code ?? '…' }})
        </h1>
      </div>
      <UiButton @click="showCreate = !showCreate">{{
        showCreate ? 'Cancel' : 'New location'
      }}</UiButton>
    </div>

    <form
      v-if="showCreate"
      class="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="submitLocation"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <UiInput v-model="form.code" placeholder="Code (e.g. STORAGE-A)" />
        <UiInput v-model="form.name" placeholder="Name" />
      </div>
      <UiErrorText :message="actionError" />
      <div class="mt-3">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Saving…' : 'Create location'
        }}</UiButton>
      </div>
    </form>

    <UiErrorText :message="notice" />

    <p v-if="!warehouse && !error" class="py-8 text-center text-sm text-slate-500">Loading…</p>
    <p
      v-if="warehouse && locations.length === 0"
      class="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500"
    >
      No locations in this warehouse yet.
    </p>
    <ul
      v-if="warehouse && locations.length > 0"
      class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <li
        v-for="loc in locations"
        :key="loc.id"
        class="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
      >
        <div>
          <span class="font-mono text-xs font-medium text-slate-900">{{ loc.code }}</span>
          <span class="ml-2 text-slate-600">{{ loc.name }}</span>
        </div>
        <span
          class="text-xs"
          :class="loc.status === 'ACTIVE' ? 'text-emerald-700' : 'text-slate-500'"
        >
          {{ loc.status }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const warehouseId = route.params.id as string
const { warehouses, locations, error, createLocation, fetchLocations, fetchWarehouses } =
  useInventory()
const showCreate = ref(false)
const saving = ref(false)
const actionError = ref<string | null>(null)
const form = reactive({ code: '', name: '' })

const warehouse = computed(() => warehouses.value.find((w) => w.id === warehouseId))

onMounted(async () => {
  await fetchWarehouses()
  await fetchLocations()
})

const notice = computed(() => error.value ?? actionError.value)

async function submitLocation() {
  actionError.value = null
  if (!form.code.trim() || !form.name.trim()) {
    actionError.value = 'Code and name are required'
    return
  }
  saving.value = true
  try {
    const res = await createLocation({ warehouseId, code: form.code, name: form.name })
    if (res.success) {
      Object.assign(form, { code: '', name: '' })
      showCreate.value = false
    } else {
      actionError.value = res.error ?? 'Could not create location'
    }
  } finally {
    saving.value = false
  }
}
</script>
