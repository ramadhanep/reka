<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <UiCard>
      <h1 class="text-lg font-semibold text-slate-900">Sign in to REKA</h1>
      <form class="mt-4 space-y-3" @submit.prevent="onSubmit">
        <div>
          <label class="text-xs font-medium text-slate-600">Email</label>
          <UiInput v-model="email" type="email" placeholder="you@example.com" />
        </div>
        <div>
          <label class="text-xs font-medium text-slate-600">Password</label>
          <UiInput v-model="password" type="password" placeholder="••••••••" />
        </div>
        <UiErrorText :message="auth.error.value" />
        <UiButton type="submit" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </UiButton>
      </form>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'default' })
const auth = useAuth()
const email = ref('')
const password = ref('')
const loading = ref(false)

async function onSubmit() {
  loading.value = true
  const ok = await auth.login(email.value, password.value)
  loading.value = false
  if (ok) {
    await navigateTo('/')
  }
}
</script>
