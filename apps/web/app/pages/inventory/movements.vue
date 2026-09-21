<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/inventory" class="text-xs text-slate-500 hover:text-slate-700"
          >← Inventory</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Movements</h1>
        <p class="text-xs text-slate-500">
          Append-only stock ledger. Every change writes a movement.
        </p>
      </div>
      <label class="flex items-center gap-2 text-xs text-slate-500">
        Type
        <select
          v-model="typeFilter"
          class="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          @change="applyFilter"
        >
          <option value="">All</option>
          <option v-for="t in movementTypes" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
    </div>

    <UiErrorText :message="error" />

    <p v-if="loading && movements.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading movements…
    </p>
    <p
      v-else-if="movements.length === 0"
      class="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500"
    >
      No movements recorded yet.
    </p>
    <div v-else class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-xs font-medium uppercase text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3">When</th>
            <th scope="col" class="px-4 py-3">Type</th>
            <th scope="col" class="px-4 py-3">Item</th>
            <th scope="col" class="px-4 py-3">Location</th>
            <th scope="col" class="px-4 py-3 text-right">Quantity</th>
            <th scope="col" class="px-4 py-3">Reference</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="m in movements" :key="m.id" class="hover:bg-slate-50">
            <td class="px-4 py-3 text-xs text-slate-500">
              {{ new Date(m.createdAt).toLocaleString() }}
            </td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                :class="badgeClass(m.type)"
              >
                {{ m.type }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span class="font-mono text-xs font-medium text-slate-900">{{ m.sku }}</span>
              <span class="text-slate-600"> — {{ m.itemName }}</span>
            </td>
            <td class="px-4 py-3 text-slate-600">{{ m.locationCode }}</td>
            <td class="px-4 py-3 text-right font-semibold text-slate-900">{{ m.quantity }}</td>
            <td class="px-4 py-3 text-xs text-slate-500">
              {{ m.referenceType }}<template v-if="m.reason"> · {{ m.reason }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { movements, loading, error, fetchMovements } = useInventory()
const typeFilter = ref('')
const movementTypes = [
  'RECEIPT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'ISSUE',
]

onMounted(() => fetchMovements())

function badgeClass(type: string) {
  if (type === 'RECEIPT') return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  if (type === 'ISSUE') return 'bg-rose-50 text-rose-700 border border-rose-200'
  if (type === 'TRANSFER_IN' || type === 'TRANSFER_OUT')
    return 'bg-blue-50 text-blue-700 border border-blue-200'
  return 'bg-amber-50 text-amber-700 border border-amber-200'
}

function applyFilter() {
  if (!typeFilter.value) {
    fetchMovements()
    return
  }
  loading.value = true
  error.value = null
  $fetch<{ movements: typeof movements.value }>(
    `/api/v1/inventory/movements?type=${typeFilter.value}`,
  )
    .then((res) => (movements.value = res.movements))
    .catch(
      (e: { data?: { message?: string } }) =>
        (error.value = e?.data?.message ?? 'Failed to load movements'),
    )
    .finally(() => (loading.value = false))
}
</script>
