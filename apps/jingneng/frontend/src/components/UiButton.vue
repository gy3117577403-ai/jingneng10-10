<script setup>
import AppIcon from './AppIcon.vue'
defineProps({ variant: { default: 'secondary' }, icon: String, loading: Boolean, disabled: Boolean,
  type: { default: 'button' }, label: String })
</script>
<template>
  <button :type="type" :class="['button', variant, { 'icon-button': !$slots.default && !label }]" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <span v-if="loading" class="spinner" aria-hidden="true"></span><AppIcon v-else-if="icon" :name="icon" />
    <slot>{{ label }}</slot>
  </button>
</template>
