<template>
  <div>
    <h1 class="text-lg font-semibold text-slate-900">Assets</h1>
    <p class="text-xs text-slate-500">
      Track physical and digital assets, assignments, and lifecycle.
    </p>

    <UiErrorText :message="error" />

    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <NuxtLink
        v-for="card in cards"
        :key="card.path"
        :to="card.path"
        class="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400"
      >
        <div class="text-sm font-semibold text-slate-900">{{ card.title }}</div>
        <div class="mt-0.5 text-xs text-slate-500">{{ card.subtitle }}</div>
        <div class="mt-2 text-lg font-semibold text-slate-900">
          {{ loading ? '…' : card.count }}
        </div>
      </NuxtLink>
    </div>

    <p v-if="loading" class="mt-4 text-sm text-slate-500">Loading…</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'module-enabled'] })

const { assets, loading, error, fetchAssets } = useAssets()

onMounted(() => {
  fetchAssets()
})

const cards = computed(() => [
  {
    title: 'All Assets',
    subtitle: 'Complete asset inventory',
    path: '/assets/list',
    count: assets.value.length,
  },
  {
    title: 'Available',
    subtitle: 'Assets ready for assignment',
    path: '/assets/list?status=AVAILABLE',
    count: assets.value.filter((a) => a.status === 'AVAILABLE').length,
  },
  {
    title: 'Assigned',
    subtitle: 'Currently assigned assets',
    path: '/assets/list?status=ASSIGNED',
    count: assets.value.filter((a) => a.status === 'ASSIGNED').length,
  },
  {
    title: 'Maintenance',
    subtitle: 'Assets in maintenance',
    path: '/assets/list?status=MAINTENANCE',
    count: assets.value.filter((a) => a.status === 'MAINTENANCE').length,
  },
  {
    title: 'Retired',
    subtitle: 'Retired assets',
    path: '/assets/list?status=RETIRED',
    count: assets.value.filter((a) => a.status === 'RETIRED').length,
  },
])
</script>
