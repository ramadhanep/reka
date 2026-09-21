<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/procurement" class="text-xs text-slate-500 hover:text-slate-700"
          >← Procurement</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Goods Receipts</h1>
      </div>
      <UiButton :disabled="loading" @click="fetchReceipts">Refresh</UiButton>
    </div>

    <div class="mb-4 flex items-center justify-between">
      <p class="text-xs text-slate-500">Record goods received against an issued purchase order.</p>
      <UiButton @click="showCreate = !showCreate">{{
        showCreate ? 'Cancel' : 'Receive goods'
      }}</UiButton>
    </div>

    <form
      v-if="showCreate"
      class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="submitReceipt"
    >
      <select
        v-model="selectedOrderId"
        class="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      >
        <option value="" disabled>Issued purchase order…</option>
        <option v-for="o in receivableOrders" :key="o.id" :value="o.id">
          {{ o.number }} · {{ o.vendorName }}
        </option>
      </select>

      <div v-if="selectedOrder" class="mt-3 border-t border-slate-200 pt-3">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
          Received quantities
        </p>
        <div
          v-for="item in selectedOrder.items"
          :key="item.id"
          class="mt-2 flex items-center gap-3 text-sm"
        >
          <span class="flex-1 text-slate-700">{{ item.description }}</span>
          <UiInput
            v-model="quantities[item.id]"
            type="number"
            min="0"
            :placeholder="`outstanding ${item.quantity - item.receivedQuantity}`"
            class="w-24"
          />
          <span class="text-xs text-slate-500">
            {{ item.quantity - item.receivedQuantity }}/{{ item.quantity }} outstanding
          </span>
        </div>
        <UiInput v-model="note" placeholder="Note (optional)" class="mt-2" />
      </div>

      <UiErrorText :message="actionError" class="mt-2" />
      <div class="mt-3">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Recording…' : 'Record receipt'
        }}</UiButton>
      </div>
    </form>

    <UiErrorText :message="error" />

    <p v-if="loading && receipts.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading goods receipts…
    </p>
    <div
      v-else-if="receipts.length === 0"
      class="rounded-lg border border-dashed border-slate-200 p-8 text-center"
    >
      <p class="text-sm text-slate-600">No goods receipts found.</p>
      <p class="mt-1 text-xs text-slate-400">
        Record a receipt when goods arrive against an issued order.
      </p>
    </div>
    <ul v-else class="space-y-3">
      <li
        v-for="g in receipts"
        :key="g.id"
        class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold text-slate-900">{{ g.number }}</div>
            <div class="mt-0.5 text-xs text-slate-500">
              against {{ g.purchaseOrderNumber }} · received {{ formatDate(g.receivedAt) }}
            </div>
          </div>
          <span class="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {{ g.items.reduce((sum, i) => sum + i.quantity, 0) }} units
          </span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { PurchaseOrder } from '#imports'

definePageMeta({ middleware: ['auth', 'module-enabled'] })

const { orders, receipts, loading, error, fetchReceipts, fetchOrders, createReceipt } =
  useProcurement()
const showCreate = ref(false)
const saving = ref(false)
const actionError = ref<string | null>(null)
const selectedOrderId = ref('')
const note = ref('')
const quantities = reactive<Record<string, string>>({})

onMounted(async () => {
  await Promise.all([fetchReceipts(), fetchOrders()])
})

const receivableOrders = computed<PurchaseOrder[]>(() =>
  orders.value.filter((o) => o.status === 'issued' || o.status === 'partially_received'),
)

const selectedOrder = computed<PurchaseOrder | undefined>(() =>
  receivableOrders.value.find((o) => o.id === selectedOrderId.value),
)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US')
}

function resetForm() {
  selectedOrderId.value = ''
  note.value = ''
  Object.keys(quantities).forEach((k) => delete quantities[k])
}

async function submitReceipt() {
  actionError.value = null
  const order = selectedOrder.value
  if (!order) {
    actionError.value = 'Select a purchase order'
    return
  }
  const items = order.items
    .map((i) => ({ item: i, qty: Number(quantities[i.id]) }))
    .filter((entry) => Number.isInteger(entry.qty) && entry.qty > 0)
  if (items.length === 0) {
    actionError.value = 'Enter at least one received quantity'
    return
  }
  saving.value = true
  try {
    const res = await createReceipt({
      purchaseOrderId: order.id,
      note: note.value || undefined,
      items: items.map(({ item, qty }) => ({
        purchaseOrderItemId: item.id,
        quantity: qty,
      })),
    })
    if (res.success) {
      resetForm()
      showCreate.value = false
    } else {
      actionError.value = res.error ?? 'Could not record receipt'
    }
  } finally {
    saving.value = false
  }
}
</script>
