<script setup>
import { ref,computed,watch } from 'vue'
import UiButton from './UiButton.vue'
import AppIcon from './AppIcon.vue'
import EmptyState from './EmptyState.vue'
import DownloadButton from './DownloadButton.vue'
import { api } from '../api'
import { stamp,fileSize } from '../utils'
const props=defineProps({inquiry:Object,userName:Function})
defineEmits(['upload'])
const chosen=ref(''),version=ref(''),preview=ref(null),error=ref(''),loading=ref(false), mobilePreview=ref(false)
let token=0,latest=''
const doc=computed(()=>props.inquiry.documents.find(d=>d.name===chosen.value))
const current=computed(()=>doc.value?.versions.find(v=>v.name===version.value))
async function chooseVersion(name){version.value=name;preview.value=null;error.value='';const ticket=++token;const file=current.value;if(!file||! /\.(txt|csv)$/i.test(file.filename)){loading.value=false;return}loading.value=true;try{const data=await api('preview',{name});if(ticket===token)preview.value=data}catch(e){if(ticket===token)error.value=e.message}finally{if(ticket===token)loading.value=false}}
function choose(document){chosen.value=document.name;mobilePreview.value=true;latest=document.versions.find(v=>v.version_number===document.current_version)?.name;chooseVersion(latest)}
watch(()=>props.inquiry.documents,docs=>{const previous=docs.find(d=>d.name===chosen.value);if(previous){const newest=previous.versions.find(v=>v.version_number===previous.current_version)?.name;if(newest!==latest||!previous.versions.some(v=>v.name===version.value))choose(previous)}else if(docs[0]){choose(docs[0]);mobilePreview.value=false}},{immediate:true})
</script>
<template>
  <section class="documents-panel">
    <div class="section-heading"><h2>资料 <span class="count">{{ inquiry.documents.length }}</span></h2><UiButton v-if="inquiry.status==='协作中'" variant="primary" icon="upload" @click="$emit('upload')">上传资料</UiButton></div>
    <EmptyState v-if="!inquiry.documents.length" icon="folder" title="还没有资料" description="添加客户需求、图纸或清单，开始协作。"><UiButton v-if="inquiry.status==='协作中'" icon="upload" @click="$emit('upload')">选择文件</UiButton></EmptyState>
    <div v-else class="document-workspace" :class="{'show-preview':mobilePreview}">
      <div class="document-list" aria-label="资料列表"><button v-for="item in inquiry.documents" :key="item.name" :class="['document-item',{selected:chosen===item.name}]" @click="choose(item)"><span class="file-tile"><AppIcon name="file" /></span><span class="grow"><strong>{{ item.title }}</strong><small>V{{ item.current_version }} · {{ item.versions.length }} 个版本</small></span><AppIcon name="right" /></button></div>
      <div v-if="current" class="document-preview">
        <header class="preview-toolbar"><UiButton class="mobile-only" icon="back" variant="ghost" aria-label="返回资料列表" @click="mobilePreview=false" /><div class="grow"><strong>{{ current.filename }}</strong><small>{{ fileSize(current.file_size) }} · {{ userName(current.uploaded_by) }} · {{ stamp(current.creation) }}</small></div><select :value="version" aria-label="资料版本" @change="chooseVersion($event.target.value)"><option v-for="v in doc.versions" :key="v.name" :value="v.name">V{{ v.version_number }}{{ v.version_number===doc.current_version?' · 当前':'' }}</option></select></header>
        <div class="preview-actions"><p v-if="current.change_note">{{ current.change_note }}</p><div class="grow" v-else></div><DownloadButton kind="revision" :name="current.name" /><UiButton v-if="inquiry.status==='协作中'" icon="upload" @click="$emit('upload',doc)">新版本</UiButton></div>
        <p v-if="error" class="message error" role="alert">{{ error }}</p><div v-if="loading" class="loading-inline" role="status"><span class="spinner"></span>正在读取原件…</div>
        <div v-else-if="preview?.supported" class="text-document"><div v-for="(line,index) in preview.text.split(/\r?\n/)" :key="index" class="source-line"><span>{{ index+1 }}</span><pre>{{ line||' ' }}</pre></div><p v-if="preview.truncated" class="preview-note">仅显示前 200 KB，完整内容请下载查看。</p></div>
        <EmptyState v-else-if="!error" icon="file" title="下载原件查看" description="此格式暂不支持在线预览。" />
      </div>
    </div>
  </section>
</template>
