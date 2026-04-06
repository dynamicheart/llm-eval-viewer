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

    <DistributionCard
      :tableData="tableData"
      fieldName="result"
      fieldLabel="Result"
      @filter="quickFilterResult"
    />

    <!-- Table -->
    <el-table
      v-if="tableData.length"
      :data="paginatedData"
      style="width: 100%; margin-top: 20px"
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
      <el-table-column prop="prompt" label="Prompt" width="500">
        <template #default="{ row }">
          <span>{{ truncateText(row.prompt, 100) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="pred" label="Pred">
        <template #default="{ row }">
          <span>{{ truncateText(row.pred, 10) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="gold" label="Golden">
        <template #default="{ row }">
          <span>{{ truncateText(row.gold, 10) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        prop="result"
        label="Result"
        column-key="result"
        :filters="resultFilters"
        :filtered-value="activeFilters['result'] || []"
      >
        <template #default="{ row }">
          <span
            v-if="meta = formatResultMeta(row.result)"
            :style="{
              color: meta.status === 'error' ? 'var(--ev-color-danger)' : undefined,
              fontWeight: meta.status === 'error' ? 600 : undefined,
            }"
          >
            {{ meta.text }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="Prompt">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.prompt || '')">{{ $t('common.view') }}</el-button>
        </template>
      </el-table-column>
      <el-table-column label="Completion">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.content || '')">{{ $t('common.view') }}</el-button>
        </template>
      </el-table-column>
      <el-table-column label="Extracted Pred">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.pred || '')">{{ $t('common.view') }}</el-button>
        </template>
      </el-table-column>
      <el-table-column label="Solution">
        <template #default="{ row }">
          <el-button type="text" @click="showSolutionDialog(row)">{{ $t('common.view') }}</el-button>
        </template>
      </el-table-column>
      <el-table-column label="JSON">
        <template #default="{ row }">
          <el-button type="text" @click="showRawJsonDialog(row)">{{ $t('common.view') }}</el-button>
        </template>
      </el-table-column>
      <el-table-column :label="$t('reviews.buildCurl')">
        <template #default="{ row }">
          <el-button type="text" @click="openCurlDialog(row)"> {{ $t('common.generate') }} </el-button>
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

    <DetailDialog
      :dialogVisible.sync="dialogVisible"
      :hasTabs="dialogHasTabs"
      :tabs="dialogTabsData"
      :content="dialogContent"
      :rawText="dialogRawText"
      :title="$t('common.detail')"
      @update:dialogVisible="(val) => (dialogVisible = val)"
    />

    <CurlInvokeDialog
      v-model:dialogVisible="curlDialogVisible"
      :raw-json="currentRow"
    />
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';

import FileToolbar from '@/components/FileToolbar.vue';
import DetailDialog from '@/components/DetailDialog.vue';
import DistributionCard from '@/components/DistributionCard.vue';
import CurlInvokeDialog from '@/components/CurlInvokeDialog.vue';
import TableHeaderSearch from '@/components/TableHeaderSearch.vue';
import DirBrowserDrawer from '@/components/DirBrowserDrawer.vue';
import { SAMPLE_REVIEWS_TEXT } from '@/data/sampleData';

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
    DistributionCard,
    CurlInvokeDialog,
    TableHeaderSearch,
    DirBrowserDrawer,
  },
  setup() {
    const { t } = useI18n();
    const curlDialogVisible = ref(false);
    const currentRow = ref(null);

    const idKeyword = ref('');

    const ONBOARDED_KEY = 'evalscope_reviews_onboarded';
    const samplePromptVisible = ref(false);

    function openCurlDialog(row) {
      currentRow.value = row;
      curlDialogVisible.value = true;
    }

    const resultDistribution = computed(() => {
      const total = tableData.value.length;
      if (total === 0) return [];

      const countMap = {};
      tableData.value.forEach((item) => {
        const key = item.result ?? t('common.unknown');
        countMap[key] = (countMap[key] || 0) + 1;
      });

      return Object.entries(countMap).map(([result, count]) => ({
        result,
        count,
        percentage: ((count / total) * 100).toFixed(1),
      }));
    });

    const getSolutionFromSample = (json) => {
      const meta = json?.sample_score?.sample_metadata;

      if (typeof meta?.solution === 'string' && meta.solution.trim() !== '') {
        return {
          type: 'solution',
          content: meta.solution,
          render: 'markdown',
        };
      }

      if (meta && Object.keys(meta).length > 0) {
        return {
          type: 'metadata',
          content: JSON.stringify(meta, null, 2),
          render: 'json',
        };
      }

      const metadata = json?.sample_score?.score?.metadata;
      if (metadata && Object.keys(metadata).length > 0) {
        return {
          type: 'metadata',
          content: JSON.stringify(metadata, null, 2),
          render: 'json',
        };
      }

      return {
        type: 'empty',
        content: t('detailDialog.noSolutionDetail'),
        render: 'text',
      };
    };

    const getSampleId = (json, idx) => {
      const sample_score = json?.sample_score || {};
      const meta = sample_score?.sample_metadata;

      if (meta?.question_id) return String(meta.question_id);
      if (meta?.problem_id) return String(meta.problem_id);
      if (meta?.task_id) return String(meta.task_id);
      if (sample_score?.sample_id) return String(sample_score.sample_id);

      return `row_${idx + 1}`;
    };

    function getPriorityValue(obj, fields = ['acc', 'pass']) {
      for (const field of fields) {
        const val = obj?.[field];
        if (val !== undefined && val !== null) {
          return val;
        }
      }
      return '';
    }

    const parseJsonlReviews = (text) => {
      localStorage.setItem(ONBOARDED_KEY, '1');
      samplePromptVisible.value = false;
      tableData.value = text
        .split('\n')
        .filter(Boolean)
        .map((line, idx) => {
          try {
            const json = JSON.parse(line);
            const score = json.sample_score?.score || {};

            return {
              index: json.index ?? idx + 1,
              id: getSampleId(json, idx),
              prompt: json.input || '',
              pred: score.extracted_prediction ?? '',
              gold: json.target ?? '',
              result: getPriorityValue(score.value, ['acc', 'pass']),
              content: score.prediction ?? '',
              solution: getSolutionFromSample(json),
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
              solution: {
                type: 'empty',
                content: t('detailDialog.parseFailed'),
                render: 'text',
              },
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

    const { filters: resultFilters } = createColumnFilter('result');

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

    /** In-memory parsed data cache per file (not persisted) */
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
      // Scenario C: user selected a predictions/ directory, cannot view reviews data
      if (node.directType && node.directType !== 'reviews') {
        ElMessage.warning(t('reviews.wrongDirType', { type: node.directType }));
        return;
      }

      const fileKey = buildFileKey(node, 'reviews');

      activeFileKey.value = fileKey;
      setSelectedRun(node.runDir, node.datasetName);

      if (dataCache.has(fileKey)) {
        tableData.value = dataCache.get(fileKey);
      } else {
        const text = await readRunFile(node.handle, 'reviews', node.isDirect);
        if (!text) {
          ElMessage.warning(t('reviews.notFound'));
          return;
        }
        parseJsonlReviews(text);
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

    function quickFilterResult(value) {
      setColumnFilter('result', [value]);
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
      showSolutionDialog,
      showRawJsonDialog,
      truncateText,
      formatResultMeta,
    } = useJsonlFileHandler({
      storageNamespace: 'evalscope_reviews',
      storageKey: 'evalscope_reviews_cache',
      listFiles: listFiles,
      getFile: getFile,
      saveFile: saveFile,
      clearFiles: clearFiles,
      deleteFile: deleteFile,
      parseJsonl: parseJsonlReviews,
      tableModel,
      dirModeAware: true,
      hintText: t('reviews.hintText'),
      validateContent: (text) => {
        try {
          const firstLine = text.split('\n').find(Boolean);
          if (!firstLine) return null;
          const json = JSON.parse(firstLine);
          if (!json.sample_score && !json.input) {
            return t('reviews.validateNotReviews');
          }
        } catch {
          return t('reviews.validateNotJsonl');
        }
        return null;
      },
    });

    async function loadSample() {
      await loadSampleText(t('sample.sampleName.reviews'), SAMPLE_REVIEWS_TEXT);
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

    // On page load, try to restore directory and auto-load last selected file
    onMounted(async () => {
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

    return {
      curlDialogVisible,
      currentRow,
      idKeyword,
      openCurlDialog,
      samplePromptVisible,
      loadSample,
      dismissSample,
      sidebarWidth,
      resultDistribution,
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
      openRecentFile,
      resetFile,
      removeRecentFile,
      currentFileName,
      dialogVisible,
      dialogHasTabs,
      dialogTabsData,
      dialogContent,
      dialogRawText,
      showDialog,
      showSolutionDialog,
      showRawJsonDialog,
      truncateText,
      formatResultMeta,
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
      resultFilters,
      activeFilters,
      setKeywordFilter,
      setColumnFilter,
      quickFilterResult,
    };
  },
};
</script>

<style scoped>
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
</style>
