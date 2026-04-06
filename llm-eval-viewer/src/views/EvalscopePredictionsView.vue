<!--
  Copyright (c) 2025 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div class="container" :style="{ marginLeft: showSidebar ? sidebarWidth + 'px' : '0', transition: 'margin-left 0.3s' }">
    <DirBrowserDrawer
      :visible="showSidebar"
      :dir-tree="dirTree"
      :current-node-key="currentNodeKey"
      @select-run="onSelectRun"
      @resize="w => sidebarWidth = w"
    />

    <FileToolbar
      :hint-text="hintText"
      :recent-files="recentFiles"
      :current-file-name="currentFileName"
      :format-size="formatSize"
      :format-time="formatTime"
      :supports-dir-picker="supportsDirectoryPicker"
      :browse-mode="browseMode"
      :dir-name="dirName"
      :recent-dirs="recentDirs"
      @handle-file-select="onHandleFileSelect"
      @open-recent-file="openRecentFile"
      @clear-recent-files="clearRecentFiles"
      @reset-file="resetFile"
      @remove-recent-file="removeRecentFile"
      @open-directory="onOpenDirectory"
      @restore-directory="onRestoreDirectory"
      @remove-recent-dir="onRemoveRecentDir"
    />

    <div v-if="samplePromptVisible" class="sample-prompt">
      <span>{{ $t('sample.prompt') }}</span>
      <el-button type="primary" size="small" @click="loadSample">{{ $t('sample.loadSample') }}</el-button>
      <el-button size="small" text @click="dismissSample">{{ $t('sample.dismiss') }}</el-button>
    </div>

    <template v-if="tableData.length">
      <div>
        <el-checkbox v-model="showHistogram"> {{ $t('stats.tokenDistribution') }} </el-checkbox>
        <el-checkbox v-model="showDistribution">
          {{ $t('stats.stopReasonDistribution') }}
        </el-checkbox>
      </div>

    <HistogramCard
      v-if="showHistogram"
      :table-data="tableData"
      :title="$t('stats.tokenDistribution')"
      :fields="[
        {
          key: 'input_tokens',
          label: 'Input Tokens Distribution',
          color: '#409EFF',
        },
        {
          key: 'output_tokens',
          label: 'Output Tokens Distribution',
          color: '#67C23A',
        },
      ]"
    />

    <DistributionCard
      v-if="showDistribution"
      :tableData="tableData"
      fieldName="stop_reason"
      fieldLabel="Stop Reason"
      @filter="quickFilterStopReason"
    />

    <!-- Table -->
    <div
      v-if="hasReasoning"
      style="margin-top: 12px; padding: 8px 12px; border-left: 4px solid var(--ev-color-primary); background: var(--ev-bg-banner-start); border-radius: 4px; font-size: 13px; color: var(--ev-text-primary);"
    >
      {{ $t('predictions.reasoningBanner') }}
    </div>
    <el-table
      v-if="tableData.length"
      :data="paginatedData"
      style="width: 100%; margin-top: 20px"
      :max-height="600"
      @filter-change="onTableFilterChange"
      @sort-change="onTableSortChange"
      border
    >
      <el-table-column prop="index" label="Index" width="100" sortable />
      <el-table-column prop="id" label="ID" width="200">
        <template #header>
          <TableHeaderSearch
            label="ID"
            v-model="idKeyword"
            placeholder="Search ID"
            @change="(v) => setKeywordFilter('id', v)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="content" label="Content" width="500">
        <template #default="{ row }">
          <el-tooltip raw-content :content="previewHtml(row.content?.text)" placement="top" :show-after="300" popper-class="preview-tooltip" :disabled="!row.content?.text || row.content.text.length <= 100">
            <span class="clickable-cell" @click="showDialog(row.content || {})">
              <span v-if="row.content?.reasoning" class="reasoning-tag">[R]</span>
              {{ truncateText(row.content.text, 100) }}
            </span>
          </el-tooltip>
        </template>
      </el-table-column>

      <el-table-column prop="input_tokens" label="Input Tokens" />
      <el-table-column prop="output_tokens" label="Output Tokens" />
      <el-table-column prop="total_tokens" label="Total Tokens" />
      <!-- <el-table-column label="len(content)">
        <template #default="{ row }">
          <el-tooltip
            :disabled="!row.content?.reasoning"
            content="(reasoning_len + text_len)"
            placement="top"
            effect="dark"
          >
            <span> {{ formatContentLength(row.content) }} </span>
          </el-tooltip>
        </template>
      </el-table-column> -->
      <el-table-column
        column-key="stop_reason"
        prop="stop_reason"
        label="Stop Reason"
        :filters="stopReasonFilters"
        :filtered-value="activeFilters['stop_reason'] || []"
      >
        <template #default="{ row }">
          <span :style="{ color: (row.stop_reason === 'length' || row.stop_reason === 'max_tokens') ? 'var(--ev-color-danger)' : undefined, fontWeight: (row.stop_reason === 'length' || row.stop_reason === 'max_tokens') ? 600 : undefined }">
            {{ row.stop_reason }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="JSON">
        <template #default="{ row }">
          <el-button type="text" @click="showRawJsonDialog(row)">{{ $t('common.view') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="totalItems > 0"
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      :page-sizes="[10, 20, 50, 100, 1000]"
      :total="totalVisibleItems"
      layout="total, sizes, prev, pager, next, jumper"
      style="margin-top: 20px; text-align: right"
    />
    </template>

    <DetailDialog
      :dialogVisible.sync="dialogVisible"
      :hasTabs="dialogHasTabs"
      :tabs="dialogTabsData"
      :content="dialogContent"
      :rawText="dialogRawText"
      :title="$t('common.detail')"
      @update:dialogVisible="(val) => (dialogVisible = val)"
    />
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import FileToolbar from '@/components/FileToolbar.vue';
import DetailDialog from '@/components/DetailDialog.vue';
import HistogramCard from '@/components/HistogramCard.vue';
import DistributionCard from '@/components/DistributionCard.vue';
import TableHeaderSearch from '@/components/TableHeaderSearch.vue';
import DirBrowserDrawer from '@/components/DirBrowserDrawer.vue';
import { SAMPLE_PREDICTIONS_TEXT } from '@/data/sampleData';

import {
  saveFile,
  getFile,
  listFiles,
  clearFiles,
  deleteFile,
} from '@/utils/fileDB';
import { useJsonlFileHandler } from '@/composables/useJsonlFileHandler';
import { useTableModel } from '@/composables/useTableModel';
import { useDirBrowser } from '@/composables/useDirBrowser';

export default {
  components: {
    FileToolbar,
    DetailDialog,
    HistogramCard,
    DistributionCard,
    TableHeaderSearch,
    DirBrowserDrawer,
  },

  setup() {
    const { t } = useI18n();
    const showHistogram = ref(true);
    const showDistribution = ref(false);
    const idKeyword = ref('');

    const ONBOARDED_KEY = 'evalscope_predictions_onboarded';
    const samplePromptVisible = ref(false);

    const hasReasoning = computed(() =>
      tableData.value.some(row => row.content?.reasoning)
    );

    onMounted(async () => {
      const histCache = localStorage.getItem('showHistogram');
      const distCache = localStorage.getItem('showDistribution');
      if (histCache !== null) showHistogram.value = histCache === 'true';
      if (distCache !== null) showDistribution.value = distCache === 'true';

      // Try to restore directory and auto-load last selected file
      const restored = await tryRestoreCachedHandle();
      if (restored) {
        const node = findSelectedNode();
        if (node) await onSelectRun(node);
      }

      // First-time user prompt
      await nextTick();
      if (tableData.value.length === 0 && !localStorage.getItem(ONBOARDED_KEY)) {
        samplePromptVisible.value = true;
      }
    });

    watch(showHistogram, (val) => {
      localStorage.setItem('showHistogram', val);
    });
    watch(showDistribution, (val) => {
      localStorage.setItem('showDistribution', val);
    });

    const getSampleId = (json, idx) => {
      const meta = json?.metadata || {};

      if (meta?.question_id) return String(meta.question_id);
      if (meta?.problem_id) return String(meta.problem_id);
      if (meta?.task_id) return String(meta.task_id);

      return `row_${idx + 1}`;
    };

    const formatContentLength = (content) => {
      const textLen = (content?.text || '').length;
      const reasoningLen = (content?.reasoning || '').length;

      if (reasoningLen === 0) {
        return `${textLen}`;
      }

      return `${textLen + reasoningLen} (${reasoningLen} + ${textLen})`;
    };

    const parseContent = (rawContent) => {
      if (!rawContent) {
        return { reasoning: null, text: '' };
      }

      if (typeof rawContent === 'string') {
        return { reasoning: null, text: rawContent };
      }

      if (Array.isArray(rawContent)) {
        const reasoningItem = rawContent.find(
          (item) => item.type === 'reasoning'
        );
        const textItem = rawContent.find((item) => item.type === 'text');

        return {
          reasoning: reasoningItem ? reasoningItem.reasoning || null : null,
          text: textItem ? textItem.text || '' : '',
        };
      }

      return { reasoning: null, text: '' };
    };

    const parseJsonlPredictions = (text) => {
      localStorage.setItem(ONBOARDED_KEY, '1');
      samplePromptVisible.value = false;
      tableData.value = text
        .split('\n')
        .filter(Boolean)
        .map((line, idx) => {
          try {
            const json = JSON.parse(line);

            const content =
              json.model_output?.choices?.[0]?.message?.content || '';

            const usage = json.model_output?.usage || {};
            const inputTokens = usage.input_tokens ?? '';
            const outputTokens = usage.output_tokens ?? '';
            const totalTokens = usage.total_tokens ?? '';
            const stopReason =
              json.model_output?.choices?.[0]?.stop_reason || '';

            return {
              index: json.index ?? idx + 1,
              id: getSampleId(json, idx),
              prompt: json.input || '',
              pred: '',
              gold: '',
              result: '',
              content: parseContent(content),
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: totalTokens,
              stop_reason: stopReason,
              rawJson: JSON.stringify(json, null, 2),
            };
          } catch {
            return {
              index: idx + 1,
              id: 'parse_error',
              prompt: '',
              pred: '',
              gold: '',
              result: '',
              content: '',
              input_tokens: '',
              output_tokens: '',
              total_tokens: '',
              stop_reason: '',
              rawJson: '',
            };
          }
        });
    };

    const tableModel = useTableModel();

    const {
      tableData,
      filteredData,
      paginatedData,
      currentPage,
      pageSize,
      totalItems,
      totalVisibleItems,
      activeFilters,
      createColumnFilter,
      onTableFilterChange,
      setKeywordFilter,
      setColumnFilter,
      onTableSortChange,
      reset,
    } = tableModel;

    const { filters: stopReasonFilters } = createColumnFilter('stop_reason');

    // ===== Shared directory browser =====
    const {
      dirTree,
      activeFileKey,
      hasDir,
      showSidebar,
      sidebarWidth,
      selectedRunInfo,

      browseMode,
      dirName,
      recentDirs,
      supportsDirectoryPicker,
      openDirectory,
      setBrowseMode,
      setSelectedRun,
      clearSelectedRun,
      findSelectedNode,
      readRunFile,
      buildFileKey,
      tryRestoreCachedHandle,
      restoreCachedDirectory,
      removeCachedHandle,
    } = useDirBrowser();

    const currentNodeKey = computed(() =>
      selectedRunInfo.value ? `run_${selectedRunInfo.value.runDir}` : ''
    );

    const dataCache = new Map();

    async function onOpenDirectory() {
      clearSelectedRun();
      await openDirectory();
      if (browseMode.value === 'directory') {
        tableData.value = [];
        reset();
        currentFileName.value = '';
      }
    }

    async function onRestoreDirectory(dirNameArg) {
      clearSelectedRun();
      const ok = await restoreCachedDirectory(dirNameArg);
      if (ok) {
        tableData.value = [];
        reset();
        currentFileName.value = '';
        const node = findSelectedNode();
        if (node) await onSelectRun(node);
      }
    }

    function onRemoveRecentDir(name) {
      removeCachedHandle(name);
    }

    async function onSelectRun(node) {
      // Scenario C: user selected a reviews/ directory, cannot view predictions data
      if (node.directType && node.directType !== 'predictions') {
        ElMessage.warning(t('predictions.wrongDirType', { type: node.directType }));
        return;
      }

      const fileKey = buildFileKey(node, 'predictions');

      activeFileKey.value = fileKey;
      setSelectedRun(node.runDir, node.datasetName);

      if (dataCache.has(fileKey)) {
        tableData.value = dataCache.get(fileKey);
      } else {
        const text = await readRunFile(node.handle, 'predictions', node.isDirect);
        if (!text) {
          ElMessage.warning(t('predictions.notFound'));
          return;
        }
        parseJsonlPredictions(text);
        dataCache.set(fileKey, [...tableData.value]);
      }

      currentFileName.value = `${node.datasetName} / ${node.label}`;
      idKeyword.value = '';
      reset();
    }

    /** Switch back to file mode when single file is selected */
    async function onHandleFileSelect(file) {
      const ok = await handleFileSelect(file);
      if (!ok) return;
      setBrowseMode('file');
      activeFileKey.value = '';
    }

    function openRecentFile(file) {
      setBrowseMode('file');
      activeFileKey.value = '';
      openRecentFileRaw(file);
    }

    function previewHtml(text, maxLen = 400) {
      if (!text) return '';
      const s = String(text).slice(0, maxLen)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      return text.length > maxLen ? s + '…' : s;
    }

    function quickFilterStopReason(value) {
      setColumnFilter('stop_reason', [value]);
    }

    const {
      hintText,
      recentFiles,
      formatSize,
      formatTime,
      clearRecentFiles,
      openRecentFile: openRecentFileRaw,
      handleFileSelect,
      resetFile,
      loadSampleText,
      removeRecentFile,
      currentFileName,
      dialogVisible,
      dialogHasTabs,
      dialogTabsData,
      dialogContent,
      dialogRawText,
      showDialog,
      _,
      showRawJsonDialog,
      truncateText,
    } = useJsonlFileHandler({
      storageNamespace: 'evalscope_predictions',
      storageKey: 'evalscope_predictions_cache',
      listFiles: listFiles,
      getFile: getFile,
      saveFile: saveFile,
      clearFiles: clearFiles,
      deleteFile: deleteFile,
      parseJsonl: parseJsonlPredictions,
      tableModel: tableModel,
      dirModeAware: true,
      hintText: t('predictions.hintText'),
      validateContent: (text) => {
        try {
          const firstLine = text.split('\n').find(Boolean);
          if (!firstLine) return null;
          const json = JSON.parse(firstLine);
          if (!json.model_output) {
            return t('predictions.validateNotPredictions');
          }
        } catch {
          return t('predictions.validateNotJsonl');
        }
        return null;
      },
    });

    async function loadSample() {
      await loadSampleText(t('sample.sampleName.predictions'), SAMPLE_PREDICTIONS_TEXT);
    }

    function dismissSample() {
      localStorage.setItem(ONBOARDED_KEY, '1');
      samplePromptVisible.value = false;
    }

    // Clear current view's single file state when mode switches
    watch(browseMode, (mode) => {
      if (mode === 'directory') {
        tableData.value = [];
        idKeyword.value = '';
        reset();
        currentFileName.value = '';
      }
    });

    return {
      idKeyword,
      showHistogram,
      showDistribution,
      hasReasoning,
      previewHtml,
      samplePromptVisible,
      loadSample,
      dismissSample,
      sidebarWidth,
      formatContentLength,
      // dir browser (shared)
      dirTree,
      activeFileKey,
      hasDir,
      showSidebar,
      currentNodeKey,
      browseMode,
      dirName,
      recentDirs,
      supportsDirectoryPicker,
      onOpenDirectory,
      onRestoreDirectory,
      onRemoveRecentDir,
      onSelectRun,
      onHandleFileSelect,
      // file handler
      hintText,
      formatSize,
      formatTime,
      clearRecentFiles,
      recentFiles,
      removeRecentFile,
      openRecentFile,
      resetFile,
      currentFileName,
      dialogVisible,
      dialogHasTabs,
      dialogTabsData,
      dialogContent,
      dialogRawText,
      showDialog,
      showRawJsonDialog,
      truncateText,
      tableData,
      currentPage,
      pageSize,
      filteredData,
      paginatedData,
      totalItems,
      totalVisibleItems,
      createColumnFilter,
      onTableFilterChange,
      onTableSortChange,
      reset,
      stopReasonFilters,
      activeFilters,
      setKeywordFilter,
      quickFilterStopReason,
    };
  },
};
</script>

<style scoped>
.clickable-cell {
  cursor: pointer;
  transition: color 0.2s;
}
.clickable-cell:hover {
  color: var(--ev-color-primary);
}
.toggle-buttons {
  gap: 12px;
}
.sample-prompt {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  margin-bottom: 8px;
  background: linear-gradient(135deg, var(--ev-bg-banner-start), var(--ev-bg-banner-end));
  border: 1px solid var(--ev-border-banner);
  border-radius: 6px;
  font-size: 13px;
  color: var(--ev-text-primary);
}

.reasoning-tag {
  color: var(--ev-color-primary);
  font-weight: 600;
  font-size: 11px;
  margin-right: 4px;
}
</style>
