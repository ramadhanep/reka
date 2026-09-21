<template>
  <div class="py-12 text-center">
    <h1 class="text-lg font-semibold text-slate-900">Module Disabled</h1>
    <p class="mt-2 text-sm text-slate-600">
      This module is currently disabled. An administrator can enable it via Settings → Modules.
    </p>
    <div class="mt-4">
      <NuxtLink to="/settings/modules" class="inline-flex items-center text-sm text-slate-700 underline hover:text-slate-900">
        Go to Module Settings
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
</script>
