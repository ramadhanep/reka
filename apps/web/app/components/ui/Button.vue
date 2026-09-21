<template>
  <button :type="type" :disabled="disabled" :class="variantClasses">
    <slot />
  </button>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    type?: 'button' | 'submit'
    disabled?: boolean
    variant?: 'primary' | 'secondary' | 'danger'
  }>(),
  {
    type: 'button',
    disabled: false,
    variant: 'primary',
  },
)

const variantClasses = computed(() => {
  const base =
    'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2'

  switch (props.variant) {
    case 'danger':
      return `${base} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`
    case 'secondary':
      return `${base} bg-slate-200 text-slate-900 hover:bg-slate-300 focus:ring-slate-400`
    default:
      return `${base} bg-slate-900 text-white hover:bg-slate-700 focus:ring-slate-500`
  }
})
</script>
