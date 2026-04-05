<template>
  <div v-if="browseMode === 'file'" style="margin-bottom: 0px; color: #e6a23c; font-weight: 600">
    {{ hintText }}
  </div>

  <div class="file-toolbar">
    <div class="file-toolbar">
      <!-- 单文件选择 -->
      <el-upload
        :before-upload="handleFileSelect"
        :show-file-list="false"
        :accept="accept"
      >
        <el-button
          :type="showDirPicker && browseMode === 'file' ? 'primary' : ''"
        >
          {{ buttonText }}
        </el-button>
      </el-upload>

      <!-- 目录选择（仅支持且启用时） -->
      <el-button
        v-if="showDirPicker"
        :type="browseMode === 'directory' ? 'primary' : ''"
        @click="emits('open-directory')"
      >
        选择目录
      </el-button>

      <!-- 不支持目录选择时的提示（仅启用目录功能时） -->
      <el-tooltip
        v-if="enableDirPicker && !supportsDirPicker"
        content="目录浏览功能需要使用 Chrome 或 Edge 浏览器"
        placement="top"
        effect="dark"
      >
        <span style="color: #c0c4cc; font-size: 12px; cursor: default">
          目录浏览（需 Chrome）
        </span>
      </el-tooltip>

      <!-- 最近记录（文件 + 目录合并） -->
      <el-dropdown popper-class="recent-dropdown">
        <el-button size="small" plain>
          最近记录 <el-icon><ArrowDown /></el-icon>
        </el-button>

        <template #dropdown>
          <el-dropdown-menu>
            <!-- 缓存的目录列表 -->
            <template v-if="recentDirs.length">
              <el-dropdown-item
                v-for="d in recentDirs"
                :key="d.name"
                @click="emits('restore-directory', d.name)"
              >
                <div class="recent-item-row">
                  <div class="recent-item">
                    <div class="name">
                      <el-icon style="margin-right: 4px; vertical-align: middle"><FolderOpened /></el-icon>
                      {{ d.name }}
                    </div>
                    <div class="meta">目录 · {{ formatTime(d.time) }}</div>
                  </div>
                  <el-icon
                    class="delete-icon"
                    @click.stop="emits('remove-recent-dir', d.name)"
                  >
                    <Close />
                  </el-icon>
                </div>
              </el-dropdown-item>
            </template>

            <el-dropdown-item v-if="recentDirs.length && recentFiles.length" divided disabled>
              <span style="font-size: 12px; color: #909399">单文件</span>
            </el-dropdown-item>

            <!-- 最近文件列表 -->
            <el-dropdown-item
              v-for="f in recentFiles"
              :key="f.id"
              @click="openRecentFile(f)"
            >
              <div class="recent-item-row">
                <div class="recent-item">
                  <div class="name">{{ f.name }}</div>
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
                <el-icon
                  class="delete-icon"
                  @click.stop="emits('remove-recent-file', f)"
                >
                  <Close />
                </el-icon>
              </div>
            </el-dropdown-item>

            <!-- 空状态 -->
            <el-dropdown-item v-if="!recentFiles.length && !recentDirs.length" disabled>
              <span style="font-size: 12px; color: #909399">暂无记录</span>
            </el-dropdown-item>

            <el-dropdown-item v-if="recentFiles.length" divided @click="$emit('clear-recent-files')">
              清空文件记录
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- 缓存信息（仅文件模式） -->
      <span
        v-if="browseMode === 'file'"
        style="color: #909399; font-size: 12px"
      >
        缓存总量：{{ formatSize(totalCacheSize) }}
      </span>

      <!-- 当前信息：目录模式显示目录名，文件模式显示文件名，不同时显示 -->
      <span v-if="browseMode === 'directory' && dirName" style="color: #606266">
        目录：<b>{{ dirName }}</b>
        <template v-if="currentFileName">
          / {{ currentFileName }}
        </template>
      </span>
      <span v-else-if="currentFileName" style="color: #606266">
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
import { ArrowDown, Close, FolderOpened } from '@element-plus/icons-vue';

const props = defineProps({
  hintText: { type: String, required: true },
  recentFiles: { type: Array, default: () => [] },
  currentFileName: { type: String, default: '' },
  formatSize: { type: Function, required: true },
  formatTime: { type: Function, required: true },
  accept: { type: String, default: '.jsonl' },
  buttonText: { type: String, default: '选择 JSONL 单文件' },
  // 目录浏览相关
  enableDirPicker: { type: Boolean, default: true },
  supportsDirPicker: { type: Boolean, default: false },
  browseMode: { type: String, default: 'file' },
  dirName: { type: String, default: '' },
  recentDirs: { type: Array, default: () => [] },
});

// 是否实际显示目录按钮：功能启用 且 浏览器支持
const showDirPicker = computed(
  () => props.enableDirPicker && props.supportsDirPicker
);

const emits = defineEmits([
  'handle-file-select',
  'open-recent-file',
  'clear-recent-files',
  'reset-file',
  'remove-recent-file',
  'open-directory',
  'restore-directory',
  'remove-recent-dir',
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

.recent-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.delete-icon {
  font-size: 14px;
  color: #c0c4cc;
  cursor: pointer;
}

.delete-icon:hover {
  color: #f56c6c;
}
</style>
