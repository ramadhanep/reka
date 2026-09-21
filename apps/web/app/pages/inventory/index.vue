<template>
  <div>
    <h1 class="text-lg font-semibold text-slate-900">Inventory</h1>
    <p class="text-xs text-slate-500">
      Track stock-keeping items, warehouses, locations, and stock movements.
    </p>

    <UiErrorText :message="error" />

    <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <NuxtLink
        v-for="card in cards"
        :key="card.path"
        :to="card.path"
        class="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400"
      >
        <div class="text-sm font-semibold text-slate-900">{{ card.title }}</div>
        <div class="mt-0.5 text-xs text-slate-500">{{ card.subtitle }}</div>
        <div class="mt-2 text-lg font-semibold text-slate-900">
          {{ loading ? '…' : card.count }}
        </div>
      </NuxtLink>
    </div>

    <p v-if="loading" class="mt-4 text-sm text-slate-500">Loading…</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'module-enabled'] })

const { items, warehouses, balances, loading, error, fetchItems, fetchWarehouses, fetchStock } =
  useInventory()

onMounted(() => {
  Promise.all([fetchItems(), fetchWarehouses(), fetchStock()])
})

const cards = computed(() => [
  {
    title: 'Items',
    subtitle: 'Stock-keeping catalog',
    path: '/inventory/items',
    count: items.value.length,
  },
  {
    title: 'Warehouses',
    subtitle: 'Sites and locations',
    path: '/inventory/warehouses',
    count: warehouses.value.length,
  },
  {
    title: 'Stock',
    subtitle: 'Current balances',
    path: '/inventory/stock',
    count: balances.value.length,
  },
  {
    title: 'Movements',
    subtitle: 'Stock ledger history',
    path: '/inventory/movements',
    count: '—',
  },
])
</script>
