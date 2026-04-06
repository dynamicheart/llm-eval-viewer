<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div v-if="browseMode === 'file'" style="margin-bottom: 0px; color: #e6a23c; font-weight: 600">
    {{ hintText }}
  </div>

  <div class="file-toolbar">
    <div class="file-toolbar">
      <!-- Single file selection -->
      <el-upload
        :before-upload="handleFileSelect"
        :show-file-list="false"
        :accept="accept"
      >
        <el-button
          :type="showDirPicker && browseMode === 'file' ? 'primary' : ''"
        >
          {{ buttonText || $t('fileToolbar.selectJsonlFile') }}
        </el-button>
      </el-upload>

      <!-- Directory selection (when supported and enabled) -->
      <el-button
        v-if="showDirPicker"
        :type="browseMode === 'directory' ? 'primary' : ''"
        @click="emits('open-directory')"
      >
        {{ $t('fileToolbar.selectDirectory') }}
      </el-button>

      <!-- Tooltip when directory picker is not supported (only when dir feature enabled) -->
      <el-tooltip
        v-if="enableDirPicker && !supportsDirPicker"
        :content="$t('fileToolbar.dirBrowseNeedChrome')"
        placement="top"
        effect="dark"
      >
        <span style="color: #c0c4cc; font-size: 12px; cursor: default">
          {{ $t('fileToolbar.dirBrowseChrome') }}
        </span>
      </el-tooltip>

      <!-- Recent records (files + directories combined) -->
      <el-dropdown popper-class="recent-dropdown">
        <el-button size="small" plain>
          {{ $t('fileToolbar.recentRecords') }} <el-icon><ArrowDown /></el-icon>
        </el-button>

        <template #dropdown>
          <el-dropdown-menu>
            <!-- Cached directory list -->
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
                    <div class="meta">{{ $t('fileToolbar.directory') }} · {{ formatTime(d.time) }}</div>
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
              <span style="font-size: 12px; color: #909399">{{ $t('fileToolbar.singleFile') }}</span>
            </el-dropdown-item>

            <!-- Recent file list -->
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

            <!-- Empty state -->
            <el-dropdown-item v-if="!recentFiles.length && !recentDirs.length" disabled>
              <span style="font-size: 12px; color: #909399">{{ $t('fileToolbar.noRecords') }}</span>
            </el-dropdown-item>

            <el-dropdown-item v-if="recentFiles.length" divided @click="$emit('clear-recent-files')">
              {{ $t('fileToolbar.clearFileRecords') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- Cache info (file mode only) -->
      <span
        v-if="browseMode === 'file'"
        style="color: #909399; font-size: 12px"
      >
        {{ $t('fileToolbar.cacheTotal', { size: formatSize(totalCacheSize) }) }}
      </span>

      <!-- Current info: directory mode shows dir name, file mode shows file name -->
      <span v-if="browseMode === 'directory' && dirName" style="color: #606266">
        {{ $t('fileToolbar.currentDir') }}<b>{{ dirName }}</b>
        <template v-if="currentFileName">
          / {{ currentFileName }}
        </template>
      </span>
      <span v-else-if="currentFileName" style="color: #606266">
        {{ $t('fileToolbar.currentFile') }}<b>{{ currentFileName }}</b>
      </span>

      <el-button
        v-if="currentFileName"
        type="danger"
        plain
        size="small"
        @click="$emit('reset-file')"
      >
        {{ $t('common.reset') }}
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowDown, Close, FolderOpened } from '@element-plus/icons-vue';

const { t } = useI18n();

const props = defineProps({
  hintText: { type: String, required: true },
  recentFiles: { type: Array, default: () => [] },
  currentFileName: { type: String, default: '' },
  formatSize: { type: Function, required: true },
  formatTime: { type: Function, required: true },
  accept: { type: String, default: '.jsonl' },
  buttonText: { type: String, default: '' },
  // Directory browsing related
  enableDirPicker: { type: Boolean, default: true },
  supportsDirPicker: { type: Boolean, default: false },
  browseMode: { type: String, default: 'file' },
  dirName: { type: String, default: '' },
  recentDirs: { type: Array, default: () => [] },
});

// Whether to actually show directory button: feature enabled AND browser supports it
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
