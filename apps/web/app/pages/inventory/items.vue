<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/inventory" class="text-xs text-slate-500 hover:text-slate-700"
          >← Inventory</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Items</h1>
        <p class="text-xs text-slate-500">Stock-keeping items tracked by SKU.</p>
      </div>
      <UiButton @click="showCreate = !showCreate">{{
        showCreate ? 'Cancel' : 'New item'
      }}</UiButton>
    </div>

    <form
      v-if="showCreate"
      class="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="submitItem"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <UiInput v-model="form.sku" placeholder="SKU (e.g. HDMI-CABLE-2M)" />
        <UiInput v-model="form.name" placeholder="Name" />
        <UiInput v-model="form.unit" placeholder="Unit (e.g. pcs, kg, box)" />
        <UiInput v-model="form.description" placeholder="Description" />
      </div>
      <UiErrorText :message="actionError" />
      <div class="mt-3">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Saving…' : 'Create item'
        }}</UiButton>
      </div>
    </form>

    <UiErrorText :message="notice" />

    <p v-if="loading && items.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading items…
    </p>
    <p
      v-else-if="items.length === 0"
      class="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500"
    >
      No items yet. Create your first stock-keeping item.
    </p>
    <div v-else class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-xs font-medium uppercase text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3">SKU</th>
            <th scope="col" class="px-4 py-3">Name</th>
            <th scope="col" class="px-4 py-3">Unit</th>
            <th scope="col" class="px-4 py-3">Status</th>
            <th scope="col" class="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="item in items" :key="item.id" class="hover:bg-slate-50">
            <td class="px-4 py-3 font-mono text-xs font-medium text-slate-900">{{ item.sku }}</td>
            <td class="px-4 py-3 text-slate-900">{{ item.name }}</td>
            <td class="px-4 py-3 text-slate-600">{{ item.unit }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                :class="
                  item.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                "
              >
                {{ item.status }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <button class="text-xs text-blue-600 hover:text-blue-800" @click="toggleStatus(item)">
                {{ item.status === 'ACTIVE' ? 'Deactivate' : 'Activate' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { items, loading, error, fetchItems, createItem, updateItem } = useInventory()
const showCreate = ref(false)
const saving = ref(false)
const actionError = ref<string | null>(null)
const form = reactive({ sku: '', name: '', unit: '', description: '' })

onMounted(() => fetchItems())

const notice = computed(() => error.value ?? actionError.value)

async function submitItem() {
  actionError.value = null
  if (!form.sku.trim() || !form.name.trim()) {
    actionError.value = 'SKU and name are required'
    return
  }
  saving.value = true
  try {
    const res = await createItem({
      sku: form.sku,
      name: form.name,
      unit: form.unit || 'pcs',
      description: form.description || undefined,
    })
    if (res.success) {
      Object.assign(form, { sku: '', name: '', unit: '', description: '' })
      showCreate.value = false
    } else {
      actionError.value = res.error ?? 'Could not create item'
    }
  } finally {
    saving.value = false
  }
}

async function toggleStatus(item: { id: string; status: string }) {
  await updateItem(item.id, { status: item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
}
</script>
