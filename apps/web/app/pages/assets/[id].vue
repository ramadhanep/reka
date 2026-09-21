<template>
  <div v-if="asset">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/assets/list" class="text-xs text-slate-500 hover:text-slate-700"
          >← All Assets</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">
          {{ asset.name }} ({{ asset.assetTag }})
        </h1>
      </div>
      <div class="flex gap-2">
        <UiButton v-if="asset.status === 'AVAILABLE'" @click="showAssign = true">Assign</UiButton>
        <UiButton v-else-if="asset.status === 'ASSIGNED'" @click="showReturn = true"
          >Return</UiButton
        >
        <UiButton
          v-if="['AVAILABLE', 'ASSIGNED'].includes(asset.status)"
          @click="handleMaintenance(asset.id)"
          >Maintenance</UiButton
        >
        <UiButton v-if="asset.status !== 'RETIRED'" variant="danger" @click="handleRetire(asset.id)"
          >Retire</UiButton
        >
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 class="text-sm font-semibold text-slate-900">Details</h2>
        <dl class="mt-3 grid gap-2 text-xs text-slate-600">
          <div class="flex justify-between">
            <dt class="font-medium text-slate-500">Status</dt>
            <dd>{{ asset.status }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="font-medium text-slate-500">Category</dt>
            <dd>{{ asset.category }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="font-medium text-slate-500">Serial Number</dt>
            <dd>{{ asset.serialNumber ?? '—' }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="font-medium text-slate-500">Purchase Date</dt>
            <dd>
              {{ asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : '—' }}
            </dd>
          </div>
          <div class="flex justify-between">
            <dt class="font-medium text-slate-500">Price</dt>
            <dd>{{ formatAssetMoney(asset.purchasePrice, asset.currency ?? undefined) }}</dd>
          </div>
        </dl>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 class="text-sm font-semibold text-slate-900">Assignment History</h2>
        <div class="mt-3 divide-y divide-slate-100">
          <div v-for="h in history" :key="h.id" class="py-2 text-xs">
            <div class="flex justify-between">
              <span class="font-medium text-slate-900">User: {{ h.assigneeUserId }}</span>
              <span class="text-slate-500">{{ new Date(h.assignedAt).toLocaleDateString() }}</span>
            </div>
            <div v-if="h.returnedAt" class="text-slate-500">
              Returned: {{ new Date(h.returnedAt).toLocaleDateString() }}
            </div>
          </div>
          <p v-if="history.length === 0" class="text-xs text-slate-500 italic">No history yet.</p>
        </div>
      </div>
    </div>

    <!-- Modals (simplified as forms) -->
    <div v-if="showAssign" class="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <h3 class="font-semibold text-slate-900">Assign Asset</h3>
      <div class="mt-2">
        <label class="mb-1 block text-xs text-slate-600">Assign to</label>
        <select
          v-model="assignForm.assigneeUserId"
          class="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
        >
          <option value="">Select a member</option>
          <option v-for="member in orgMembers" :key="member.userId" :value="member.userId">
            {{ member.displayName || member.email }} ({{ member.email }})
          </option>
        </select>
      </div>
      <UiInput v-model="assignForm.notes" placeholder="Notes" class="mt-3" />
      <div class="mt-3 flex gap-2">
        <UiButton @click="handleAssign">Assign</UiButton>
        <UiButton variant="secondary" @click="showAssign = false">Cancel</UiButton>
      </div>
    </div>
    <div v-if="showReturn" class="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <h3 class="font-semibold text-slate-900">Return Asset</h3>
      <UiInput v-model="returnForm.notes" placeholder="Notes" />
      <div class="mt-2 flex gap-2">
        <UiButton @click="handleReturn">Return</UiButton>
        <UiButton variant="secondary" @click="showReturn = false">Cancel</UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const route = useRoute()
const assetId = route.params.id as string

const {
  fetchAsset,
  fetchAssetHistory,
  history,
  assignAsset,
  returnAsset,
  startMaintenance,
  retireAsset,
  formatAssetMoney,
} = useAssets()
const asset = ref<Asset | null>(null)
const showAssign = ref(false)
const showReturn = ref(false)
const assignForm = reactive({ assigneeUserId: '', notes: '' })
const returnForm = reactive({ notes: '' })
const orgContext = useOrganizationContext()
const orgMembers = ref<Array<{ userId: string; email: string; displayName: string }>>([])
const loadingMembers = ref(false)

onMounted(async () => {
  const res = await fetchAsset(assetId)
  if (res.success) asset.value = res.data!.asset
  fetchAssetHistory(assetId)
  
  // Load organization members for assignee picker
  const activeOrg = orgContext.activeOrganization.value
  if (activeOrg) {
    loadingMembers.value = true
    try {
      const membersRes = await $fetch<{ members: any[] }>(`/api/v1/organizations/${activeOrg.id}/members`)
      orgMembers.value = membersRes.members.map(m => ({
        userId: m.userId,
        email: m.email,
        displayName: m.displayName || m.email
      }))
    } finally {
      loadingMembers.value = false
    }
  }
})

async function handleAssign() {
  await assignAsset(assetId, assignForm)
  showAssign.value = false
  const res = await fetchAsset(assetId)
  if (res.success) asset.value = res.data!.asset
  fetchAssetHistory(assetId)
}

async function handleReturn() {
  await returnAsset(assetId, returnForm)
  showReturn.value = false
  const res = await fetchAsset(assetId)
  if (res.success) asset.value = res.data!.asset
  fetchAssetHistory(assetId)
}

async function handleMaintenance(id: string) {
  await startMaintenance(id)
  const res = await fetchAsset(assetId)
  if (res.success) asset.value = res.data!.asset
}

async function handleRetire(id: string) {
  await retireAsset(id)
  const res = await fetchAsset(assetId)
  if (res.success) asset.value = res.data!.asset
}
</script>
