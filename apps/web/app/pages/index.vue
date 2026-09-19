<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-50">
    <div class="text-center">
      <h1 class="text-3xl font-semibold tracking-tight text-slate-900">{{ appName }}</h1>
      <p class="mt-2 text-sm text-slate-500">self-hosted business operating platform</p>
    </div>
  </main>
</template>

<script setup lang="ts">
import { appName } from '../utils/app-info'
</script>
