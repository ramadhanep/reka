<template>
  <div>
    <h1 class="text-lg font-semibold text-slate-900">Procurement</h1>
    <p class="text-xs text-slate-500">
      Vendors, purchase requests, approvals, orders, and goods receipt.
    </p>

    <UiErrorText :message="error" />

    <div class="mt-4 grid gap-3 sm:grid-cols-2">
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

const {
  requests,
  orders,
  vendors,
  receipts,
  loading,
  error,
  fetchRequests,
  fetchOrders,
  fetchVendors,
  fetchReceipts,
} = useProcurement()

onMounted(() => {
  fetchRequests()
  fetchOrders()
  fetchVendors()
  fetchReceipts()
})

const cards = computed(() => [
  {
    title: 'Vendors',
    subtitle: 'Company contacts you purchase from',
    path: '/procurement/vendors',
    count: vendors.value.length,
  },
  {
    title: 'Purchase Requests',
    subtitle: 'Requests awaiting or past approval',
    path: '/procurement/purchase-requests',
    count: requests.value.length,
  },
  {
    title: 'Purchase Orders',
    subtitle: 'Orders issued to vendors',
    path: '/procurement/purchase-orders',
    count: orders.value.length,
  },
  {
    title: 'Goods Receipts',
    subtitle: 'Goods received against orders',
    path: '/procurement/goods-receipts',
    count: receipts.value.length,
  },
])
</script>
