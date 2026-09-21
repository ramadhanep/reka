<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <NuxtLink to="/procurement" class="text-xs text-slate-500 hover:text-slate-700"
          >← Procurement</NuxtLink
        >
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Vendors</h1>
      </div>
      <UiButton :disabled="loading" @click="fetchVendors">Refresh</UiButton>
    </div>

    <div class="mb-4 flex items-center justify-between">
      <p class="text-xs text-slate-500">Vendors are organization-scoped supplier records.</p>
      <UiButton @click="showCreate = !showCreate">{{
        showCreate ? 'Cancel' : 'New vendor'
      }}</UiButton>
    </div>

    <form
      v-if="showCreate"
      class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      @submit.prevent="submitVendor"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <UiInput v-model="form.name" placeholder="Name" />
        <UiInput v-model="form.code" placeholder="Code (e.g. SUMBER01)" />
        <UiInput v-model="form.email" type="email" placeholder="Email" />
        <UiInput v-model="form.phone" placeholder="Phone" />
        <UiInput v-model="form.address" placeholder="Address" class="sm:col-span-2" />
      </div>
      <UiErrorText :message="actionError" />
      <div class="mt-3">
        <UiButton type="submit" :disabled="saving">{{
          saving ? 'Saving…' : 'Create vendor'
        }}</UiButton>
      </div>
    </form>

    <UiErrorText :message="error" />

    <p v-if="loading && vendors.length === 0" class="py-8 text-center text-sm text-slate-500">
      Loading vendors…
    </p>
    <p
      v-else-if="vendors.length === 0"
      class="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500"
    >
      No vendors yet. Create your first vendor above.
    </p>
    <div v-else class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-xs font-medium uppercase text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3">Name</th>
            <th scope="col" class="px-4 py-3">Code</th>
            <th scope="col" class="px-4 py-3">Email</th>
            <th scope="col" class="px-4 py-3">Phone</th>
            <th scope="col" class="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="v in vendors" :key="v.id" class="hover:bg-slate-50">
            <td class="px-4 py-3 font-medium text-slate-900">{{ v.name }}</td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600">{{ v.code }}</td>
            <td class="px-4 py-3 text-xs text-slate-600">{{ v.email ?? '—' }}</td>
            <td class="px-4 py-3 text-xs text-slate-600">{{ v.phone ?? '—' }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                :class="statusBadge(v.status).className"
              >
                {{ statusBadge(v.status).label }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'module-enabled'] })

const { vendors, loading, error, fetchVendors, createVendor } = useProcurement()
const showCreate = ref(false)
const saving = ref(false)
const actionError = ref<string | null>(null)
const form = reactive({ name: '', code: '', email: '', phone: '', address: '' })

onMounted(() => {
  fetchVendors()
})

async function submitVendor() {
  actionError.value = null
  if (!form.name.trim() || !form.code.trim()) {
    actionError.value = 'Name and code are required'
    return
  }
  saving.value = true
  try {
    const res = await createVendor({
      name: form.name,
      code: form.code,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
    })
    if (res.success) {
      form.name = ''
      form.code = ''
      form.email = ''
      form.phone = ''
      form.address = ''
      showCreate.value = false
    } else {
      actionError.value = res.error ?? 'Could not create vendor'
    }
  } finally {
    saving.value = false
  }
}
</script>
