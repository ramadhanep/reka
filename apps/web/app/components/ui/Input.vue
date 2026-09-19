<template>
  <input
    :id="id"
    v-model="model"
    :type="type"
    :placeholder="placeholder"
    class="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
  />
</template>

<script setup lang="ts">
withDefaults(defineProps<{ id?: string; type?: string; placeholder?: string }>(), {
  type: 'text',
  placeholder: '',
})
const model = defineModel<string>()
</script>
