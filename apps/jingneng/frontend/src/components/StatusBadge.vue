<script setup>
import { computed } from 'vue'
const props = defineProps({ value: String })
const tone = computed(() => ['已完成','已采纳'].includes(props.value) ? 'positive' : ['待确认','待审核','已挂起','结果待核对'].includes(props.value) ? 'attention' : ['失败'].includes(props.value) ? 'negative' : ['已归档','已取消','已驳回'].includes(props.value) ? 'neutral' : 'active')
</script>
<template><span :class="['status-badge',tone]"><span class="status-dot" aria-hidden="true"></span>{{ value }}</span></template>
