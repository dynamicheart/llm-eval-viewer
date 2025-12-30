<template>
  <div style="margin-bottom: 8px; color: #e6a23c; font-weight: 600">
    {{ hintText }}
  </div>

  <div class="file-toolbar">
    <div class="file-toolbar">
      <el-upload
        :before-upload="handleFileSelect"
        :show-file-list="false"
        accept=".jsonl"
      >
        <el-button type="primary">选择 JSONL 文件</el-button>
      </el-upload>

      <el-dropdown v-if="recentFiles.length" popper-class="recent-dropdown">
        <el-button size="small" plain>
          最近文件 <el-icon><ArrowDown /></el-icon>
        </el-button>

        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="f in recentFiles"
              :key="f.id"
              @click="openRecentFile(f)"
            >
              <div class="recent-item">
                <div class="name">📄 {{ f.name }}</div>
                <el-tooltip
                  :content="new Date(f.lastOpen).toLocaleString()"
                  placement="right"
                  effect="dark"
                >
                  <div class="meta">
                    {{ formatSize(f.size) }} · {{ formatTime(f.lastOpen) }}
                  </div>
                </el-tooltip>
              </div>
            </el-dropdown-item>

            <el-dropdown-item divided @click="$emit('clear-recent-files')">
              🗑 清空
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <span style="color: #909399; font-size: 12px">
        缓存总量：{{ formatSize(totalCacheSize) }}
      </span>

      <span v-if="currentFileName" style="color: #606266">
        当前文件：<b>{{ currentFileName }}</b>
      </span>
      <el-button
        v-if="currentFileName"
        type="danger"
        plain
        size="small"
        @click="$emit('reset-file')"
      >
        重置
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, computed } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';

const props = defineProps({
  hintText: { type: String, required: true },
  recentFiles: { type: Array, default: () => [] },
  currentFileName: { type: String, default: '' },
  formatSize: { type: Function, required: true },
  formatTime: { type: Function, required: true },
});

const emits = defineEmits([
  'handle-file-select',
  'open-recent-file',
  'clear-recent-files',
  'reset-file',
]);

function handleFileSelect(file) {
  emits('handle-file-select', file);
  return false;
}

function openRecentFile(file) {
  emits('open-recent-file', file);
}

const totalCacheSize = computed(() => {
  if (!props.recentFiles || !props.recentFiles.length) return 0;
  return props.recentFiles.reduce((sum, file) => sum + (file.size || 0), 0);
});
</script>

<style scoped>
.file-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.hint-text {
  margin-bottom: 8px;
  color: #e6a23c;
  font-weight: 600;
}

.current-file-text {
  color: #606266;
}

.recent-dropdown {
  max-height: 300px;
  overflow-y: auto;
}

.recent-item {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.recent-item .name {
  font-size: 13px;
}

.recent-item .meta {
  font-size: 11px;
  color: #909399;
}
</style>
