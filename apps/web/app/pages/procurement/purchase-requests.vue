<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/procurement" class="text-xs text-slate-500 hover:text-slate-700"
          >← Procurement</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Purchase Requests</h1>
      </div>
      <UiButton :disabled="loading" @click="fetchRequests">Refresh</UiButton>
    </div>

    <div class="mb-4 flex items-center justify-between">
      <p class="text-xs text-slate-500">
        Requests flow through the workflow: draft → submitted → approved / rejected.
      </p>
      <UiButton @click="showCreate = !showCreate">{{
        showCreate ? 'Cancel' : 'New request'
      }}</UiButton>
    </div>

    <form
      v-if="showCreate"
      class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="create"
    >
      <UiInput v-model="draft.title" placeholder="Title" />
      <UiInput v-model="draft.description" placeholder="Description" class="mt-2" />
      <div class="mt-3">
        <div
          v-for="(item, idx) in draft.items"
          :key="idx"
          class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5"
        >
          <UiInput v-model="item.description" placeholder="Description" class="col-span-2" />
          <UiInput v-model="item.quantity" type="number" min="1" placeholder="Qty" />
          <UiInput v-model="item.unit" placeholder="Unit" />
          <UiInput
            v-model="item.price"
            type="number"
            step="0.01"
            min="0"
            placeholder="Price (USD)"
          />
        </div>
        <UiButton class="mt-2" @click="addItem"> + Add item </UiButton>
      </div>
      <UiErrorText :message="actionError" class="mt-2" />
      <div class="mt-3 flex gap-2">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Saving…' : 'Save draft'
        }}</UiButton>
      </div>
    </form>

    <UiErrorText :message="error" />

    <p v-if="loading && requests.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading purchase requests…
    </p>
    <div
      v-else-if="requests.length === 0"
      class="rounded-lg border border-dashed border-slate-200 p-8 text-center"
    >
      <p class="text-sm text-slate-600">No purchase requests found.</p>
      <p class="mt-1 text-xs text-slate-400">
        Create a request, submit it, then approve or reject it.
      </p>
    </div>
    <ul v-else class="space-y-3">
      <li
        v-for="r in requests"
        :key="r.id"
        class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold text-slate-900">{{ r.number }} · {{ r.title }}</div>
            <div class="mt-0.5 text-xs text-slate-500">
              {{ r.items.length }} items · total {{ formatMoney(requestTotal(r), r.currency) }}
            </div>
          </div>
          <span
            class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
            :class="statusBadge(r.status).className"
          >
            {{ statusBadge(r.status).label }}
          </span>
        </div>
        <ul
          v-if="r.items.length"
          class="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600"
        >
          <li v-for="item in r.items" :key="item.id">
            {{ item.quantity }}× {{ item.description }}
            <span v-if="item.unit">({{ item.unit }})</span>
          </li>
        </ul>
        <div v-if="r.status === 'draft'" class="mt-3 flex gap-2">
          <UiButton :disabled="acting === r.id" @click="act(r.id, 'submit')"
            >Submit for approval</UiButton
          >
        </div>
        <div v-else-if="r.status === 'submitted'" class="mt-3 flex gap-2">
          <UiButton
            class="bg-emerald-600 hover:bg-emerald-500"
            :disabled="acting === r.id"
            @click="act(r.id, 'approve')"
          >
            Approve
          </UiButton>
          <UiButton
            class="bg-red-600 hover:bg-red-500"
            :disabled="acting === r.id"
            @click="act(r.id, 'reject')"
            >Reject</UiButton
          >
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { PurchaseRequest } from '#imports'
import { dollarsToMinorUnits, formatMoney } from '~/utils/money'

definePageMeta({ middleware: ['auth', 'module-enabled'] })

const { requests, loading, error, fetchRequests, createRequest, requestAction } = useProcurement()
const showCreate = ref(false)
const saving = ref(false)
const acting = ref<string | null>(null)
const actionError = ref<string | null>(null)

const draft = reactive<{
  title: string
  description: string
  items: { description: string; quantity: string; unit: string; price: string }[]
}>({ title: '', description: '', items: [] })

onMounted(() => {
  fetchRequests()
})

function addItem() {
  draft.items.push({ description: '', quantity: '1', unit: '', price: '0' })
}

function requestTotal(r: PurchaseRequest): number {
  return r.items.reduce((sum, i) => sum + i.estimatedUnitPrice * i.quantity, 0)
}

async function create() {
  actionError.value = null
  if (!draft.title.trim()) {
    actionError.value = 'Title is required'
    return
  }
  const validItems = draft.items.filter((i) => i.description.trim())
  saving.value = true
  try {
    const res = await createRequest({
      title: draft.title,
      description: draft.description || undefined,
      items: validItems.map((i) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unit: i.unit || undefined,
        estimatedUnitPrice: dollarsToMinorUnits(Number(i.price)),
      })),
    })
    if (res.success) {
      draft.title = ''
      draft.description = ''
      draft.items = []
      showCreate.value = false
    } else {
      actionError.value = res.error ?? 'Could not create request'
    }
  } finally {
    saving.value = false
  }
}

async function act(id: string, action: 'submit' | 'approve' | 'reject') {
  actionError.value = null
  acting.value = id
  try {
    const res = await requestAction(id, action)
    if (!res.success) actionError.value = res.error ?? `Could not ${action} request`
  } finally {
    acting.value = null
  }
}
</script>
