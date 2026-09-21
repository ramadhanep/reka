<template>
  <div>
    <NuxtLink to="/" class="text-xs text-slate-500">← Organizations</NuxtLink>

    <p v-if="pending" class="mt-4 text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="mt-4 text-sm text-red-600">
      {{
        error.statusMessage === '404' ? 'Organization not found.' : 'Failed to load organization.'
      }}
    </p>
    <div v-else-if="org">
      <div class="mt-2 flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">{{ org.name }}</h1>
          <p class="text-xs text-slate-500">
            slug: {{ org.slug }} · role: {{ org.membership.role.key }}
          </p>
        </div>
        <form v-if="canManageOrg" class="flex gap-2" @submit.prevent="saveOrg">
          <UiInput v-model="editName" placeholder="Name" />
          <UiButton type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</UiButton>
        </form>
      </div>
      <UiErrorText :message="orgError" />

      <h2 class="mt-6 text-sm font-semibold text-slate-900">Members</h2>
      <p v-if="membersPending" class="text-sm text-slate-500">Loading members…</p>
      <ul v-else-if="members?.members?.length" class="mt-2 space-y-1">
        <li
          v-for="member in members.members"
          :key="member.id"
          class="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2"
        >
          <div>
            <div class="text-sm text-slate-900">{{ member.email }}</div>
            <div class="text-xs text-slate-500">{{ member.roleKey }} · {{ member.status }}</div>
          </div>
          <select
            v-if="canManageMembers"
            :value="member.roleId"
            class="rounded-md border border-slate-300 px-2 py-1 text-xs"
            @change="changeRole(member, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="role in roles?.roles ?? []" :key="role.id" :value="role.id">
              {{ role.name }}
            </option>
          </select>
        </li>
      </ul>
      <p v-else class="text-sm text-slate-500">No members.</p>

      <form
        v-if="canManageMembers"
        class="mt-3 flex flex-col gap-2 sm:flex-row"
        @submit.prevent="addMember"
      >
        <UiInput v-model="newMemberEmail" type="email" placeholder="member@example.com" />
        <select
          v-model="newMemberRoleId"
          class="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option v-for="role in roles?.roles ?? []" :key="role.id" :value="role.id">
            {{ role.name }}
          </option>
        </select>
        <UiButton type="submit" :disabled="addingMember">
          {{ addingMember ? 'Adding…' : 'Add member' }}
        </UiButton>
      </form>
      <UiErrorText :message="memberError" />
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const id = computed(() => route.params.id as string)
const api = useApi()
const auth = useAuth()

const {
  data: org,
  pending,
  error,
  refresh,
} = await useAsyncData(
  () => `org-${id.value}`,
  () => api<any>(`/api/v1/organizations/${id.value}`),
  { watch: [id] },
)

const canManageOrg = computed(() =>
  org.value?.organization?.membership?.permissions?.includes('organization.update'),
)
const canManageMembers = computed(() =>
  org.value?.organization?.membership?.permissions?.includes('organization.members.manage'),
)

const editName = ref('')
const saving = ref(false)
const orgError = ref<string | null>(null)
watchEffect(() => {
  editName.value = org.value?.organization?.name ?? ''
})
async function saveOrg() {
  orgError.value = null
  saving.value = true
  try {
    await api(`/api/v1/organizations/${id.value}`, {
      method: 'PATCH',
      body: { name: editName.value },
    })
    await refresh()
  } catch (e: any) {
    orgError.value = e?.data?.message ?? 'Could not save organization'
  } finally {
    saving.value = false
  }
}

const { data: members, refresh: refreshMembers } = await useAsyncData(
  () => `org-${id.value}-members`,
  () => api<{ members: any[] }>(`/api/v1/organizations/${id.value}/members`),
  { watch: [id] },
)
const membersPending = ref(false)

const { data: roles } = await useAsyncData(
  () => `org-${id.value}-roles`,
  () => api<{ roles: any[] }>(`/api/v1/organizations/${id.value}/roles`),
  { watch: [id] },
)

const newMemberEmail = ref('')
const newMemberRoleId = ref('')
const addingMember = ref(false)
const memberError = ref<string | null>(null)
watchEffect(() => {
  if (!newMemberRoleId.value && roles.value?.roles?.length) {
    newMemberRoleId.value = roles.value.roles[0].id
  }
})
async function addMember() {
  memberError.value = null
  addingMember.value = true
  try {
    await api(`/api/v1/organizations/${id.value}/members`, {
      method: 'POST',
      body: { email: newMemberEmail.value, roleId: newMemberRoleId.value },
    })
    newMemberEmail.value = ''
    await refreshMembers()
  } catch (e: any) {
    memberError.value = e?.data?.message ?? 'Could not add member'
  } finally {
    addingMember.value = false
  }
}
async function changeRole(member: any, roleId: string) {
  memberError.value = null
  try {
    await api(`/api/v1/organizations/${id.value}/members/${member.id}`, {
      method: 'PATCH',
      body: { roleId },
    })
    await refreshMembers()
  } catch (e: any) {
    memberError.value = e?.data?.message ?? 'Could not change role'
  }
}

// ensure session resolved for layout
if (process.client && auth.status.value === 'loading') {
  await auth.refresh()
}
</script>
