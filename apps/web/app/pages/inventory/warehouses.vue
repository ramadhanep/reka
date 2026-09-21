<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/inventory" class="text-xs text-slate-500 hover:text-slate-700"
          >← Inventory</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Warehouses</h1>
        <p class="text-xs text-slate-500">
          Organization warehouses that contain storage locations.
        </p>
      </div>
      <UiButton @click="showCreate = !showCreate">{{
        showCreate ? 'Cancel' : 'New warehouse'
      }}</UiButton>
    </div>

    <form
      v-if="showCreate"
      class="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="submitWarehouse"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <UiInput v-model="form.code" placeholder="Code (e.g. WH-JKT)" />
        <UiInput v-model="form.name" placeholder="Name" />
      </div>
      <UiErrorText :message="actionError" />
      <div class="mt-3">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Saving…' : 'Create warehouse'
        }}</UiButton>
      </div>
    </form>

    <UiErrorText :message="notice" />

    <p v-if="loading && warehouses.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading warehouses…
    </p>
    <p
      v-else-if="warehouses.length === 0"
      class="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500"
    >
      No warehouses yet. Create one to start receiving stock.
    </p>
    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="wh in warehouses"
        :key="wh.id"
        :to="`/inventory/warehouses/${wh.id}`"
        class="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400"
      >
        <div class="flex items-center justify-between">
          <div class="font-mono text-xs font-medium text-slate-900">{{ wh.code }}</div>
          <span
            class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
            :class="
              wh.status === 'ACTIVE'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-600'
            "
          >
            {{ wh.status }}
          </span>
        </div>
        <div class="mt-1 text-sm font-semibold text-slate-900">{{ wh.name }}</div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'module-enabled'] })

const { warehouses, loading, error, fetchWarehouses, createWarehouse } = useInventory()
const showCreate = ref(false)
const saving = ref(false)
const actionError = ref<string | null>(null)
const form = reactive({ code: '', name: '' })

onMounted(() => fetchWarehouses())

const notice = computed(() => error.value ?? actionError.value)

async function submitWarehouse() {
  actionError.value = null
  if (!form.code.trim() || !form.name.trim()) {
    actionError.value = 'Code and name are required'
    return
  }
  saving.value = true
  try {
    const res = await createWarehouse({ code: form.code, name: form.name })
    if (res.success) {
      Object.assign(form, { code: '', name: '' })
      showCreate.value = false
    } else {
      actionError.value = res.error ?? 'Could not create warehouse'
    }
  } finally {
    saving.value = false
  }
}
</script>
