<template>
  <input
    :id="computedId"
    v-model="model"
    :type="type"
    :placeholder="placeholder"
    class="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
  />
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ id?: string; type?: string; placeholder?: string }>(), {
  type: 'text',
  placeholder: '',
})
const model = defineModel<string>()

const computedId = computed(() => props.id || `input-${Math.random().toString(36).slice(2, 9)}`)
</script>
