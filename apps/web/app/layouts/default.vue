<template>
  <div class="min-h-screen bg-slate-50">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <div class="flex items-center gap-6">
          <NuxtLink to="/" class="text-sm font-semibold text-slate-900">REKA</NuxtLink>
          <nav
            v-if="auth.user.value"
            class="flex items-center gap-4 text-xs font-medium text-slate-600"
          >
            <NuxtLink
              v-for="item in navItems"
              :key="item.id"
              :to="item.path"
              class="hover:text-slate-900"
              active-class="text-slate-900 font-semibold"
            >
              {{ item.label }}
            </NuxtLink>
          </nav>
        </div>
        <div v-if="auth.user.value" class="flex items-center gap-3">
          <select
            v-if="orgContext.organizations.value.length > 0"
            v-model="orgContext.activeOrgId.value"
            class="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
          >
            <option v-for="org in orgContext.organizations.value" :key="org.id" :value="org.id">
              {{ org.name }}
            </option>
          </select>
          <span class="text-sm text-slate-600">{{ auth.user.value.displayName }}</span>
          <UiButton @click="auth.logout">Sign out</UiButton>
        </div>
        <NuxtLink v-else to="/login" class="text-sm text-slate-600">Sign in</NuxtLink>
      </div>
    </header>
    <main class="mx-auto max-w-4xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { resolveNavigation } from '../utils/navigation.js'

const auth = useAuth()
const orgContext = useOrganizationContext()
const { modules, fetchModules, enabledModuleIds } = useModules()

onMounted(async () => {
  if (auth.user.value) {
    if (orgContext.organizations.value.length === 0) {
      await orgContext.fetchOrganizations()
    }
    if (modules.value.length === 0) {
      await fetchModules()
    }
  }
})

const navItems = computed(() => resolveNavigation(enabledModuleIds.value))
</script>
