<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/assets" class="text-xs text-slate-500 hover:text-slate-700"
          >← Assets</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Asset Inventory</h1>
      </div>
      <UiButton :disabled="loading" @click="fetchAssets">Refresh</UiButton>
    </div>

    <div class="mb-4 flex items-center justify-between">
      <p class="text-xs text-slate-500">Track and manage individual business assets.</p>
      <UiButton @click="showCreate = !showCreate">{{
        showCreate ? 'Cancel' : 'New asset'
      }}</UiButton>
    </div>

    <form
      v-if="showCreate"
      class="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="submitAsset"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <UiInput v-model="form.assetTag" placeholder="Asset Tag (e.g. LAP-001)" />
        <UiInput v-model="form.name" placeholder="Asset Name" />
        <UiInput v-model="form.category" placeholder="Category (e.g. Laptop)" />
        <UiInput v-model="form.serialNumber" placeholder="Serial Number" />
        <UiInput v-model="form.purchaseDate" type="date" placeholder="Purchase Date" />
        <UiInput v-model="form.purchasePrice" type="number" placeholder="Price (minor units)" />
        <UiInput v-model="form.description" placeholder="Description" class="sm:col-span-2" />
      </div>
      <UiErrorText :message="actionError" />
      <div class="mt-3">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Saving…' : 'Create asset'
        }}</UiButton>
      </div>
    </form>

    <UiErrorText :message="error" />

    <p v-if="loading && assets.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading assets…
    </p>
    <p
      v-else-if="filteredAssets.length === 0"
      class="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500"
    >
      No assets found.
    </p>
    <div v-else class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-xs font-medium uppercase text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3">Asset Tag</th>
            <th scope="col" class="px-4 py-3">Name</th>
            <th scope="col" class="px-4 py-3">Category</th>
            <th scope="col" class="px-4 py-3">Status</th>
            <th scope="col" class="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="a in filteredAssets" :key="a.id" class="hover:bg-slate-50">
            <td class="px-4 py-3 font-mono text-xs font-medium text-slate-900">{{ a.assetTag }}</td>
            <td class="px-4 py-3 text-slate-900">{{ a.name }}</td>
            <td class="px-4 py-3 text-slate-600">{{ a.category }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                :class="statusBadge(a.status).className"
              >
                {{ statusBadge(a.status).label }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <NuxtLink :to="`/assets/${a.id}`" class="text-xs text-blue-600 hover:text-blue-800"
                >View Details</NuxtLink
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { assets, loading, error, fetchAssets, createAsset } = useAssets()
const route = useRoute()
const showCreate = ref(false)
const saving = ref(false)
const actionError = ref<string | null>(null)
const form = reactive({
  assetTag: '',
  name: '',
  category: '',
  description: '',
  serialNumber: '',
  purchaseDate: '',
  purchasePrice: '',
})

const filteredAssets = computed(() => {
  const status = route.query.status as string
  if (!status) return assets.value
  return assets.value.filter((a) => a.status === status)
})

onMounted(() => {
  fetchAssets()
})

async function submitAsset() {
  actionError.value = null
  if (!form.assetTag.trim() || !form.name.trim() || !form.category.trim()) {
    actionError.value = 'Tag, name, and category are required'
    return
  }
  saving.value = true
  try {
    const res = await createAsset({
      assetTag: form.assetTag,
      name: form.name,
      category: form.category,
      description: form.description || undefined,
      serialNumber: form.serialNumber || undefined,
      purchaseDate: form.purchaseDate || undefined,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
    })
    if (res.success) {
      Object.assign(form, {
        assetTag: '',
        name: '',
        category: '',
        description: '',
        serialNumber: '',
        purchaseDate: '',
        purchasePrice: '',
      })
      showCreate.value = false
    } else {
      actionError.value = res.error ?? 'Could not create asset'
    }
  } finally {
    saving.value = false
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'AVAILABLE':
      return {
        label: 'Available',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      }
    case 'ASSIGNED':
      return { label: 'Assigned', className: 'bg-blue-50 text-blue-700 border border-blue-200' }
    case 'MAINTENANCE':
      return {
        label: 'Maintenance',
        className: 'bg-amber-50 text-amber-700 border border-amber-200',
      }
    case 'RETIRED':
      return { label: 'Retired', className: 'bg-slate-50 text-slate-700 border border-slate-200' }
    default:
      return { label: status, className: 'bg-slate-50 text-slate-700 border border-slate-200' }
  }
}
</script>
