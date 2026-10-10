<script setup>
import AppIcon from './AppIcon.vue'
defineProps({ icon: { default: 'inbox' }, title: String, description: String })
</script>
<template><div class="empty-state"><span class="empty-symbol"><AppIcon :name="icon" /></span><h3>{{ title }}</h3><p v-if="description">{{ description }}</p><slot /></div></template>
