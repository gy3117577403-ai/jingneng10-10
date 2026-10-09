<script setup>
import UiButton from './UiButton.vue'
import AppIcon from './AppIcon.vue'
import { fileSize } from '../utils'
defineProps({ w:Object })
</script>
<template>
  <dialog :ref="el => w.dialog = el" class="modal" :class="{ wide:['create','edit'].includes(w.modal) }" @cancel.prevent="w.closeModal()" @click="event => event.target === w.dialog && w.closeModal()">
    <form v-if="w.modal" @submit.prevent="w.submit">
      <header class="modal-header"><h2>{{ w.modalTitle }}</h2><UiButton variant="ghost" icon="close" aria-label="关闭窗口" :disabled="w.busy" @click="w.closeModal()" /></header>
      <div class="modal-body">
        <div v-if="w.formError" class="message error" role="alert"><AppIcon name="warning" /><p>{{ w.formError }}</p></div>
        <div v-if="w.conflict" class="conflict-panel"><strong>最新记录已读取，你的输入仍保留。</strong><p>请核对以下差异。继续保存将使用当前输入覆盖对应内容。</p><div v-for="row in w.conflictRows" :key="row.field" class="change-row"><strong>{{ row.label }}</strong><div><small>你的输入</small><p>{{ row.before }}</p></div><div><small>当前记录</small><p>{{ row.after }}</p></div></div><UiButton :loading="w.busy" @click="w.retryConflict">已核对，按当前输入重试</UiButton></div>
        <template v-if="['create','edit'].includes(w.modal)">
          <div class="form-grid"><label class="span-2">询价名称 <span class="required">*</span><input v-model="w.form.data.title" required maxlength="140" placeholder="项目或需求名称"></label><label>客户名称 <span class="required">*</span><input v-model="w.form.data.customer_name" required maxlength="140" placeholder="客户或公司名称"></label><label>业务类型<select v-model="w.form.data.business_type"><option>成套</option><option>钣金</option></select></label><label>期望交期<input type="date" v-model="w.form.data.expected_date"></label><label>负责部门<select v-model="w.form.data.department"><option v-for="dep in w.boot.departments" :key="dep.name" :value="dep.name">{{ dep.department_name }}</option></select></label><label class="span-2">技术协作者<select v-model="w.form.data.collaborator"><option value="">暂不指定</option><option v-for="person in w.people.filter(p=>p.name!==w.user)" :key="person.name" :value="person.name">{{ person.full_name }}</option></select></label></div>
          <section class="form-section"><div class="section-heading"><h3>产品明细</h3><UiButton variant="ghost" icon="plus" @click="w.form.data.items.push({product_name:'',quantity:1,unit:'台',specification:''})" :disabled="w.form.data.items.length>=100">添加产品</UiButton></div><div v-for="(item,index) in w.form.data.items" :key="item.line_id||index" class="item-editor"><label>产品名称 <span class="required">*</span><input v-model="item.product_name" :aria-label="'产品名称 '+(index+1)" required maxlength="140"></label><label>数量<input type="number" min="0.001" max="100000000" step="0.001" v-model.number="item.quantity" :aria-label="'数量 '+(index+1)" required></label><label>单位<input v-model="item.unit" :aria-label="'单位 '+(index+1)" required maxlength="20"></label><UiButton variant="ghost" icon="close" :disabled="w.form.data.items.length===1" :aria-label="'移除产品行 '+(index+1)" @click="w.form.data.items.splice(index,1)" /><label class="specification">规格说明<input v-model="item.specification" :aria-label="'规格说明 '+(index+1)" maxlength="2000" placeholder="尺寸、材质或其他规格"></label></div></section>
          <label class="form-section">需求说明<textarea v-model="w.form.data.notes" rows="3" maxlength="6000" placeholder="补充要求或待确认事项"></textarea></label>
        </template>
        <template v-else-if="w.modal==='upload'">
          <label>资料名称<input v-model="w.form.title" required maxlength="140" :readonly="!!w.form.document" placeholder="选择文件后自动填写"></label>
          <div class="file-drop" @dragover.prevent @drop.prevent="w.chooseFile($event.dataTransfer.files[0])"><AppIcon :name="w.file?'file':'upload'" /><strong>{{ w.file?w.file.name:'选择或拖入文件' }}</strong><span>{{ w.file?fileSize(w.file.size):'单个文件不超过 10 MB' }}</span><input type="file" aria-label="选择原件" @change="w.chooseFile" accept=".pdf,.txt,.csv,.xlsx,.docx,.png,.jpg,.jpeg,.dxf"><p>PDF、Office、图片、TXT、CSV、DXF</p></div>
          <label>版本说明<textarea v-model="w.form.change_note" rows="3" maxlength="1000" placeholder="本次补充或修改了什么"></textarea></label>
          <div v-if="w.busy" class="upload-progress" role="status"><progress max="100" :value="w.uploadProgress"></progress><span>{{ w.uploadProgress<100?'正在上传 '+w.uploadProgress+'%':'上传完成，正在保存版本…' }}</span></div>
        </template>
        <template v-else-if="w.modal==='task'"><label>任务标题 <span class="required">*</span><input v-model="w.form.title" required maxlength="140" placeholder="需要对方处理什么"></label><label>处理人<select v-model="w.form.assigned_to"><option :value="w.selected.responsible">{{ w.userName(w.selected.responsible) }}</option><option v-if="w.selected.collaborator" :value="w.selected.collaborator">{{ w.userName(w.selected.collaborator) }}</option></select></label><label>任务说明<textarea v-model="w.form.description" rows="5" maxlength="4000" placeholder="问题背景与需要的回复"></textarea></label></template>
        <template v-else-if="['reply','return','hold'].includes(w.modal)"><p class="form-context">{{ w.form.task_title }}</p><label>{{ w.modal==='reply'?'处理回复':'原因说明' }} <span class="required">*</span><textarea v-model="w.form.reply" rows="6" required maxlength="4000"></textarea></label></template>
        <template v-else-if="w.modal==='archive'"><p class="form-context">{{ w.selected.title }}</p><p>{{ w.isOpen?'归档后保留资料和历史，停止编辑与协作；可随时恢复。未完成的任务或 AI 运行需先处理。':'恢复后可继续编辑、上传资料和处理任务。' }}</p></template>
      </div>
      <footer v-if="w.discardPrompt" class="modal-footer discard-confirm" role="alert"><span>放弃尚未保存的修改？</span><UiButton @click="w.discardPrompt=false">继续编辑</UiButton><UiButton variant="danger" @click="w.closeModal(true)">放弃修改</UiButton></footer>
      <footer v-else class="modal-footer"><span class="muted">{{ w.busy?'正在保存…':w.formDirty?'尚未保存':'' }}</span><UiButton :disabled="w.busy" @click="w.closeModal()">取消</UiButton><UiButton type="submit" variant="primary" :loading="w.busy" :disabled="!!w.conflict">{{ w.modal==='create'?'创建询价':w.modal==='upload'?'保存资料':w.modal==='task'?'分派任务':w.modal==='reply'?'提交回复':w.modal==='archive'?(w.isOpen?'确认归档':'恢复协作'):'保存' }}</UiButton></footer>
    </form>
  </dialog>
</template>
