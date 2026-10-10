<script setup>
import { ref } from 'vue'
import UiButton from './UiButton.vue'
import { downloadFile } from '../api'
const props = defineProps({ kind:String, name:String, label:{default:'下载原件'}, variant:{default:'secondary'} })
const busy=ref(false), error=ref('')
async function download(){if(busy.value)return;busy.value=true;error.value='';try{await downloadFile(props.kind,props.name)}catch(e){error.value=e.message}finally{busy.value=false}}
</script>
<template><span class="download-control"><UiButton icon="download" :variant="variant" :loading="busy" @click="download">{{ label }}</UiButton><span v-if="error" class="inline-error" role="alert">{{ error }}</span></span></template>
