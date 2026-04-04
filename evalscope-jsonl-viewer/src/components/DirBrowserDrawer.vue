<template>
  <div v-if="visible" class="dir-sidebar" :style="{ width: sidebarWidth + 'px' }">
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
      <el-empty v-else description="暂无目录数据" />
    </div>
    <div class="resize-handle" @mousedown="onResizeStart"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Folder, Document } from '@element-plus/icons-vue';

const STORAGE_KEY = 'dir_sidebar_width';
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

onMounted(() => {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    const w = Number(cached);
    if (w >= MIN_WIDTH && w <= MAX_WIDTH) sidebarWidth.value = w;
  }
});

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
  background: #fff;
  border-right: 1px solid #e4e7ed;
  z-index: 1999;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.06);
}

.dir-sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
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
  color: #409eff;
}
</style>
