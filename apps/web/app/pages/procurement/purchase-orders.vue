<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/procurement" class="text-xs text-slate-500 hover:text-slate-700"
          >← Procurement</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Purchase Orders</h1>
      </div>
      <UiButton :disabled="loading" @click="fetchOrders">Refresh</UiButton>
    </div>

    <div class="mb-4 flex items-center justify-between">
      <p class="text-xs text-slate-500">
        Orders are created from approved requests, issued to the vendor, then received.
      </p>
      <UiButton @click="showCreate = !showCreate">{{
        showCreate ? 'Cancel' : 'New order'
      }}</UiButton>
    </div>

    <form
      v-if="showCreate"
      class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="submitOrder"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <select
          v-model="selectedRequestId"
          class="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="" disabled>Approved purchase request…</option>
          <option v-for="r in approvedRequests" :key="r.id" :value="r.id">
            {{ r.number }} · {{ r.title }}
          </option>
        </select>
        <select
          v-model="selectedVendorId"
          class="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="" disabled>Vendor…</option>
          <option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option>
        </select>
      </div>

      <div v-if="selectedRequest" class="mt-3 border-t border-slate-200 pt-3">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Line items</p>
        <div
          v-for="item in selectedRequest.items"
          :key="item.id"
          class="mt-2 flex items-center gap-3 text-sm"
        >
          <span class="flex-1 text-slate-700">{{ item.description }}</span>
          <UiInput
            v-model="quantities[item.id]"
            type="number"
            min="1"
            :placeholder="`max ${item.quantity}`"
            class="w-24"
          />
          <span class="text-xs text-slate-500">/ {{ item.quantity }}</span>
        </div>
      </div>

      <UiErrorText :message="actionError" class="mt-2" />
      <div class="mt-3">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Saving…' : 'Create order'
        }}</UiButton>
      </div>
    </form>

    <UiErrorText :message="error" />

    <p v-if="loading && orders.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading purchase orders…
    </p>
    <div
      v-else-if="orders.length === 0"
      class="rounded-lg border border-dashed border-slate-200 p-8 text-center"
    >
      <p class="text-sm text-slate-600">No purchase orders found.</p>
      <p class="mt-1 text-xs text-slate-400">
        Create an order from an approved request and issue it.
      </p>
    </div>
    <ul v-else class="space-y-3">
      <li
        v-for="o in orders"
        :key="o.id"
        class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold text-slate-900">
              {{ o.number }} · {{ o.vendorName ?? '—' }}
            </div>
            <div class="mt-0.5 text-xs text-slate-500">
              from {{ o.purchaseRequestNumber }} · {{ o.items.length }} items
            </div>
          </div>
          <span
            class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
            :class="statusBadge(o.status).className"
          >
            {{ statusBadge(o.status).label }}
          </span>
        </div>
        <div v-if="o.status === 'draft'" class="mt-3">
          <UiButton :disabled="issuing === o.id" @click="issue(o.id)">Issue order</UiButton>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { PurchaseRequest } from '#imports'

definePageMeta({ middleware: 'auth' })

const {
  orders,
  requests,
  vendors,
  loading,
  error,
  fetchOrders,
  fetchRequests,
  fetchVendors,
  createOrder,
  issueOrder,
} = useProcurement()
const showCreate = ref(false)
const saving = ref(false)
const issuing = ref<string | null>(null)
const actionError = ref<string | null>(null)
const selectedRequestId = ref('')
const selectedVendorId = ref('')
const quantities = reactive<Record<string, string>>({})

onMounted(async () => {
  await Promise.all([fetchOrders(), fetchRequests(), fetchVendors()])
})

const approvedRequests = computed<PurchaseRequest[]>(() =>
  requests.value.filter((r) => r.status === 'approved'),
)

const selectedRequest = computed<PurchaseRequest | undefined>(() =>
  approvedRequests.value.find((r) => r.id === selectedRequestId.value),
)

function resetForm() {
  selectedRequestId.value = ''
  selectedVendorId.value = ''
  Object.keys(quantities).forEach((k) => delete quantities[k])
}

async function submitOrder() {
  actionError.value = null
  const request = selectedRequest.value
  if (!request || !selectedVendorId.value) {
    actionError.value = 'Select an approved request and a vendor'
    return
  }
  const items = request.items
    .map((i) => ({ item: i, qty: Number(quantities[i.id]) }))
    .filter((entry) => Number.isInteger(entry.qty) && entry.qty > 0)
  if (items.length === 0) {
    actionError.value = 'Specify at least one line quantity'
    return
  }
  saving.value = true
  try {
    const res = await createOrder({
      purchaseRequestId: request.id,
      vendorId: selectedVendorId.value,
      items: items.map(({ item, qty }) => ({
        purchaseRequestItemId: item.id,
        quantity: qty,
        unitPrice: item.estimatedUnitPrice,
      })),
    })
    if (res.success) {
      resetForm()
      showCreate.value = false
    } else {
      actionError.value = res.error ?? 'Could not create order'
    }
  } finally {
    saving.value = false
  }
}

async function issue(id: string) {
  actionError.value = null
  issuing.value = id
  try {
    const res = await issueOrder(id)
    if (!res.success) actionError.value = res.error ?? 'Could not issue order'
  } finally {
    issuing.value = null
  }
}
</script>
