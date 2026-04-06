<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div v-if="visible" class="dir-sidebar" :style="{ width: collapsed ? '0px' : sidebarWidth + 'px' }">
    <!-- Collapsed: external toggle tab -->
    <div v-if="collapsed" class="toggle-tab-outside" @click="toggleCollapse">
      <el-icon :size="14"><ArrowRight /></el-icon>
    </div>

    <template v-if="!collapsed">
      <!-- Expanded: internal header bar -->
      <div class="sidebar-header">
        <span class="sidebar-title">{{ $t('dirBrowser.title') }}</span>
        <div class="toggle-btn-inside" @click="toggleCollapse">
          <el-icon :size="14"><ArrowLeft /></el-icon>
        </div>
      </div>
      <div class="dir-sidebar-body">
        <el-tree
          v-if="dirTree.length"
          ref="treeRef"
          :data="dirTree"
          node-key="id"
          :props="treeProps"
          :current-node-key="currentNodeKey"
          highlight-current
          default-expand-all
          @node-click="handleNodeClick"
        >
          <template #default="{ node, data }">
            <span :class="{ 'is-run-node': data.isLeaf }">
              <el-icon v-if="!data.isLeaf" style="margin-right: 4px">
                <Folder />
              </el-icon>
              <el-icon v-else style="margin-right: 4px">
                <Document />
              </el-icon>
              {{ node.label }}
            </span>
          </template>
        </el-tree>
        <el-empty v-else :description="$t('dirBrowser.noData')" />
      </div>
      <div class="resize-handle" @mousedown="onResizeStart"></div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Folder, Document, ArrowLeft, ArrowRight } from '@element-plus/icons-vue';

const STORAGE_KEY = 'dir_sidebar_width';
const COLLAPSED_KEY = 'dir_sidebar_collapsed';
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 200;
const MAX_WIDTH = 800;

defineProps({
  visible: { type: Boolean, default: false },
  dirTree: { type: Array, default: () => [] },
  currentNodeKey: { type: String, default: '' },
});

const emit = defineEmits(['select-run', 'resize']);
const treeRef = ref(null);

const sidebarWidth = ref(DEFAULT_WIDTH);
const collapsed = ref(localStorage.getItem(COLLAPSED_KEY) === 'true');

onMounted(() => {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    const w = Number(cached);
    if (w >= MIN_WIDTH && w <= MAX_WIDTH) sidebarWidth.value = w;
  }
  emit('resize', collapsed.value ? 0 : sidebarWidth.value);
});

function toggleCollapse() {
  collapsed.value = !collapsed.value;
  localStorage.setItem(COLLAPSED_KEY, String(collapsed.value));
  emit('resize', collapsed.value ? 0 : sidebarWidth.value);
}

let startX = 0;
let startWidth = 0;

function onResizeStart(e) {
  e.preventDefault();
  startX = e.clientX;
  startWidth = sidebarWidth.value;
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onResizeMove(e) {
  const delta = e.clientX - startX;
  const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
  sidebarWidth.value = newWidth;
  emit('resize', newWidth);
}

function onResizeEnd() {
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  localStorage.setItem(STORAGE_KEY, String(sidebarWidth.value));
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
});

const treeProps = {
  children: 'children',
  label: 'label',
  isLeaf: 'isLeaf',
};

function handleNodeClick(data) {
  if (!data.isLeaf) return;
  emit('select-run', data);
}
</script>

<style scoped>
.dir-sidebar {
  position: fixed;
  left: 0;
  top: 56px;
  bottom: 0;
  background: var(--ev-bg-card);
  border-right: 1px solid var(--ev-border-color);
  z-index: 1999;
  display: flex;
  flex-direction: column;
  box-shadow: var(--ev-shadow-sidebar);
  transition: width 0.25s ease;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 4px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--ev-border-lighter);
}

.sidebar-title {
  font-size: 12px;
  color: var(--ev-text-secondary);
  user-select: none;
}

.toggle-btn-inside {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  color: var(--ev-text-secondary);
}

.toggle-btn-inside:hover {
  background: var(--ev-bg-toggle-hover);
  color: var(--ev-color-primary);
}

.dir-sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.toggle-tab-outside {
  position: fixed;
  left: 0;
  top: 72px;
  width: 18px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: var(--ev-bg-card);
  border: 1px solid var(--ev-border-light);
  border-left: none;
  border-radius: 0 6px 6px 0;
  color: var(--ev-text-secondary);
  box-shadow: var(--ev-shadow-sidebar);
  z-index: 2000;
}

.toggle-tab-outside:hover {
  background: var(--ev-bg-banner-start);
  color: var(--ev-color-primary);
  border-color: var(--ev-border-banner);
}

.resize-handle {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

.resize-handle:hover {
  background: rgba(64, 158, 255, 0.3);
}

.is-run-node {
  cursor: pointer;
  color: var(--ev-color-primary);
}
</style>
