<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/inventory" class="text-xs text-slate-500 hover:text-slate-700"
          >← Inventory</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Stock</h1>
        <p class="text-xs text-slate-500">Current balances by item and location.</p>
      </div>
      <div class="flex gap-2">
        <UiButton @click="toggle('receive')">Receive</UiButton>
        <UiButton @click="toggle('transfer')">Transfer</UiButton>
        <UiButton @click="toggle('adjust')">Adjust</UiButton>
        <UiButton @click="toggle('issue')">Issue</UiButton>
      </div>
    </div>

    <UiErrorText :message="notice" />
    <p
      v-if="actionMessage"
      class="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
    >
      {{ actionMessage }}
    </p>

    <form
      v-if="activeForm === 'receive'"
      class="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="doReceive"
    >
      <h3 class="mb-2 text-sm font-semibold text-slate-900">Receive from Goods Receipt</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500">
          Receipt
          <select
            v-model="receiveForm.receiptId"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select goods receipt…</option>
            <option v-for="gr in receipts" :key="gr.id" :value="gr.id">
              {{ gr.number }} (PO {{ gr.purchaseOrderNumber }})
            </option>
          </select>
        </label>
        <label class="text-xs text-slate-500">
          Receipt line
          <select
            v-model="receiveForm.goodsReceiptItemId"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            @change="onReceiptLineChange"
          >
            <option value="">Select line…</option>
            <option v-for="li in selectedReceiptItems" :key="li.id" :value="li.id">
              {{ li.description }} ({{ li.quantity }})
            </option>
          </select>
        </label>
        <label class="text-xs text-slate-500">
          Item
          <select
            v-model="receiveForm.inventoryItemId"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select item…</option>
            <option v-for="it in items" :key="it.id" :value="it.id">
              {{ it.sku }} — {{ it.name }}
            </option>
          </select>
        </label>
        <label class="text-xs text-slate-500">
          Destination location
          <select
            v-model="receiveForm.locationId"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select location…</option>
            <option v-for="loc in locations" :key="loc.id" :value="loc.id">
              {{ warehouseCode(loc.warehouseId) }} — {{ loc.code }}
            </option>
          </select>
        </label>
        <UiInput v-model="receiveForm.quantity" type="number" placeholder="Quantity" />
      </div>
      <div class="mt-3">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Saving…' : 'Receive stock'
        }}</UiButton>
      </div>
    </form>

    <form
      v-if="activeForm === 'transfer'"
      class="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="doTransfer"
    >
      <h3 class="mb-2 text-sm font-semibold text-slate-900">Transfer between locations</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500">
          Item
          <select
            v-model="transferForm.itemId"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select item…</option>
            <option v-for="it in items" :key="it.id" :value="it.id">
              {{ it.sku }} — {{ it.name }}
            </option>
          </select>
        </label>
        <UiInput v-model="transferForm.quantity" type="number" placeholder="Quantity" />
        <label class="text-xs text-slate-500">
          From
          <select
            v-model="transferForm.fromLocationId"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select source…</option>
            <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.code }}</option>
          </select>
        </label>
        <label class="text-xs text-slate-500">
          To
          <select
            v-model="transferForm.toLocationId"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select destination…</option>
            <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.code }}</option>
          </select>
        </label>
      </div>
      <div class="mt-3">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Saving…' : 'Transfer stock'
        }}</UiButton>
      </div>
    </form>

    <form
      v-if="activeForm === 'adjust'"
      class="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="doAdjust"
    >
      <h3 class="mb-2 text-sm font-semibold text-slate-900">Stock adjustment</h3>
      <p class="mb-2 text-xs text-slate-500">
        Positive quantity adds stock, negative removes it. A reason is required.
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500">
          Item
          <select
            v-model="adjustForm.itemId"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select item…</option>
            <option v-for="it in items" :key="it.id" :value="it.id">
              {{ it.sku }} — {{ it.name }}
            </option>
          </select>
        </label>
        <label class="text-xs text-slate-500">
          Location
          <select
            v-model="adjustForm.locationId"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select location…</option>
            <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.code }}</option>
          </select>
        </label>
        <UiInput v-model="adjustForm.quantity" type="number" placeholder="Quantity (signed)" />
        <label class="text-xs text-slate-500">
          Reason
          <select
            v-model="adjustForm.reason"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select reason…</option>
            <option v-for="r in adjustmentReasons" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>
      </div>
      <div class="mt-3">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Saving…' : 'Adjust stock'
        }}</UiButton>
      </div>
    </form>

    <form
      v-if="activeForm === 'issue'"
      class="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="doIssue"
    >
      <h3 class="mb-2 text-sm font-semibold text-slate-900">Issue stock</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500">
          Item
          <select
            v-model="issueForm.itemId"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select item…</option>
            <option v-for="it in items" :key="it.id" :value="it.id">
              {{ it.sku }} — {{ it.name }}
            </option>
          </select>
        </label>
        <label class="text-xs text-slate-500">
          Location
          <select
            v-model="issueForm.locationId"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select location…</option>
            <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.code }}</option>
          </select>
        </label>
        <UiInput v-model="issueForm.quantity" type="number" placeholder="Quantity" />
        <UiInput v-model="issueForm.reason" placeholder="Reason (optional)" />
        <UiInput v-model="issueForm.reference" placeholder="Reference (e.g. REQ-001)" />
      </div>
      <div class="mt-3">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Saving…' : 'Issue stock'
        }}</UiButton>
      </div>
    </form>

    <p v-if="loading && balances.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading stock…
    </p>
    <p
      v-else-if="balances.length === 0"
      class="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500"
    >
      No stock on hand. Receive, adjust, or transfer to start tracking balances.
    </p>
    <div v-else class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-xs font-medium uppercase text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3">Item</th>
            <th scope="col" class="px-4 py-3">Location</th>
            <th scope="col" class="px-4 py-3">Warehouse</th>
            <th scope="col" class="px-4 py-3 text-right">On hand</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="b in balances" :key="b.id" class="hover:bg-slate-50">
            <td class="px-4 py-3">
              <span class="font-mono text-xs font-medium text-slate-900">{{ b.sku }}</span>
              <span class="text-slate-600"> — {{ b.itemName }}</span>
            </td>
            <td class="px-4 py-3 text-slate-600">{{ b.locationCode }}</td>
            <td class="px-4 py-3 text-slate-600">{{ b.warehouseCode }}</td>
            <td class="px-4 py-3 text-right font-semibold text-slate-900">
              {{ b.quantity }} <span class="text-xs font-normal text-slate-500">{{ b.unit }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const {
  items,
  locations,
  warehouses,
  balances,
  loading,
  error,
  actionMessage,
  clearAction,
  fetchItems,
  fetchLocations,
  fetchWarehouses,
  fetchStock,
  receiveStock,
  transferStock,
  adjustStock,
  issueStock,
} = useInventory()
const { receipts, fetchReceipts } = useProcurement()

const activeForm = ref<'receive' | 'transfer' | 'adjust' | 'issue' | null>(null)
const saving = ref(false)
const actionError = ref<string | null>(null)
const adjustmentReasons = ['DAMAGED', 'LOST', 'COUNT_CORRECTION', 'FOUND', 'OTHER']

const receiveForm = reactive({
  receiptId: '',
  goodsReceiptItemId: '',
  inventoryItemId: '',
  locationId: '',
  quantity: '',
})
const transferForm = reactive({ itemId: '', fromLocationId: '', toLocationId: '', quantity: '' })
const adjustForm = reactive({ itemId: '', locationId: '', quantity: '', reason: '' })
const issueForm = reactive({ itemId: '', locationId: '', quantity: '', reason: '', reference: '' })

const selectedReceiptItems = computed(() => {
  const gr = receipts.value.find((r) => r.id === receiveForm.receiptId)
  return gr?.items ?? []
})

function warehouseCode(warehouseId: string): string {
  return warehouses.value.find((w) => w.id === warehouseId)?.code ?? warehouseId.slice(0, 8)
}

onMounted(() => {
  fetchItems()
  fetchLocations()
  fetchWarehouses()
  fetchStock()
  fetchReceipts()
})

const notice = computed(() => error.value ?? actionError.value)

function toggle(form: 'receive' | 'transfer' | 'adjust' | 'issue') {
  clearAction()
  actionError.value = null
  activeForm.value = activeForm.value === form ? null : form
}

function onReceiptLineChange() {
  const li = selectedReceiptItems.value.find((i) => i.id === receiveForm.goodsReceiptItemId)
  if (li) receiveForm.quantity = String(li.quantity)
}

async function runAction(
  action: (body: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>,
  body: Record<string, unknown>,
) {
  actionError.value = null
  saving.value = true
  try {
    const res = await action(body)
    if (!res.success) actionError.value = res.error ?? 'Action failed'
    return res.success
  } finally {
    saving.value = false
  }
}

async function doReceive() {
  const body = {
    goodsReceiptItemId: receiveForm.goodsReceiptItemId,
    inventoryItemId: receiveForm.inventoryItemId,
    locationId: receiveForm.locationId,
    quantity: Number(receiveForm.quantity),
  }
  const ok = await runAction(receiveStock, body)
  if (ok) {
    Object.assign(receiveForm, {
      receiptId: '',
      goodsReceiptItemId: '',
      inventoryItemId: '',
      locationId: '',
      quantity: '',
    })
    activeForm.value = null
  }
}

async function doTransfer() {
  const ok = await runAction(transferStock, {
    inventoryItemId: transferForm.itemId,
    fromLocationId: transferForm.fromLocationId,
    toLocationId: transferForm.toLocationId,
    quantity: Number(transferForm.quantity),
  })
  if (ok) {
    Object.assign(transferForm, { itemId: '', fromLocationId: '', toLocationId: '', quantity: '' })
    activeForm.value = null
  }
}

async function doAdjust() {
  const ok = await runAction(adjustStock, {
    inventoryItemId: adjustForm.itemId,
    locationId: adjustForm.locationId,
    quantity: Number(adjustForm.quantity),
    reason: adjustForm.reason,
  })
  if (ok) {
    Object.assign(adjustForm, { itemId: '', locationId: '', quantity: '', reason: '' })
    activeForm.value = null
  }
}

async function doIssue() {
  const ok = await runAction(issueStock, {
    inventoryItemId: issueForm.itemId,
    locationId: issueForm.locationId,
    quantity: Number(issueForm.quantity),
    reason: issueForm.reason || undefined,
    reference: issueForm.reference || undefined,
  })
  if (ok) {
    Object.assign(issueForm, {
      itemId: '',
      locationId: '',
      quantity: '',
      reason: '',
      reference: '',
    })
    activeForm.value = null
  }
}
</script>
