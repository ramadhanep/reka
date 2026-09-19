<template>
  <div class="min-h-screen bg-slate-50">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <NuxtLink to="/" class="text-sm font-semibold text-slate-900">REKA</NuxtLink>
        <div v-if="auth.user.value" class="flex items-center gap-3">
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
const auth = useAuth()
</script>
