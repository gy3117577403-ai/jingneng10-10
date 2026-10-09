<script setup>
import { Icon } from 'frappe-ui'
defineProps({ name: String })
const icons = {
  inbox: 'lucide-inbox', list: 'lucide-panels-top-left', search: 'lucide-search',
  plus: 'lucide-plus', close: 'lucide-x', arrow: 'lucide-arrow-right', back: 'lucide-arrow-left',
  down: 'lucide-chevron-down', right: 'lucide-chevron-right', check: 'lucide-check',
  file: 'lucide-file-text', folder: 'lucide-folder-open', upload: 'lucide-upload', download: 'lucide-download',
  clock: 'lucide-clock-3', history: 'lucide-history', sparkles: 'lucide-sparkles',
  refresh: 'lucide-refresh-cw', edit: 'lucide-pencil', more: 'lucide-ellipsis',
  settings: 'lucide-settings-2', logout: 'lucide-log-out', user: 'lucide-user-round',
  users: 'lucide-users-round', calendar: 'lucide-calendar-days', archive: 'lucide-archive',
  warning: 'lucide-triangle-alert', info: 'lucide-info', columns: 'lucide-columns-3',
  compact: 'lucide-rows-3', comfortable: 'lucide-rows-2', panel: 'lucide-panel-left-close',
  menu: 'lucide-menu', package: 'lucide-package', link: 'lucide-arrow-up-right',
  circleCheck: 'lucide-circle-check', shield: 'lucide-shield-check', filter: 'lucide-list-filter',
}
</script>
<template><Icon :name="icons[name] || icons.file" class="app-icon" /></template>
