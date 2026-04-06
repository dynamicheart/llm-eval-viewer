<!--
  Copyright (c) 2026 dynamicheart
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
      :dir-file-count="dirFileCount"
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
        <el-checkbox v-model="showDistribution">{{ $t('stats.resultDistribution') }}</el-checkbox>
      </div>

    <DistributionCard
      v-if="showDistribution"
      :items="distributions['result'] || []"
      fieldLabel="Result"
      @filter="quickFilterResult"
    />

    <!-- Table -->
    <el-table
      :data="paginatedData"
      style="width: 100%; margin-top: 20px"
      max-height="calc(100vh - 280px)"
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
          <el-tooltip raw-content :content="previewHtml(row.prompt)" placement="top" :show-after="300" popper-class="preview-tooltip" :disabled="!row.prompt || row.prompt.length <= 100">
            <span class="clickable-cell" @click="showDialog(row.prompt || '')">{{ truncateText(row.prompt, 100) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="pred" label="Pred">
        <template #default="{ row }">
          <el-tooltip raw-content :content="previewHtml(row.pred, 200)" placement="top" :show-after="300" popper-class="preview-tooltip" :disabled="!row.pred || row.pred.length <= 10">
            <span class="clickable-cell" @click="showDialog(row.pred || '')">{{ truncateText(row.pred, 10) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="gold" label="Golden">
        <template #default="{ row }">
          <el-tooltip raw-content :content="previewHtml(row.gold, 200)" placement="top" :show-after="300" popper-class="preview-tooltip" :disabled="!row.gold || row.gold.length <= 10">
            <span class="clickable-cell" @click="showDialog(row.gold || '')">{{ truncateText(row.gold, 10) }}</span>
          </el-tooltip>
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
      <el-table-column label="Completion">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.content || '')">{{ $t('common.view') }}</el-button>
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

    <CurlInvokeDialog
      v-model:dialogVisible="curlDialogVisible"
      :raw-json="currentRow"
    />
  </div>
</template>

<script>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

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
import { previewHtml, usePersistedToggle } from '@/utils/viewHelpers';
import { useFileHandler } from '@/composables/useFileHandler';
import { useTableModel } from '@/composables/useTableModel';
import { useDirIntegration } from '@/composables/useDirIntegration';
import { useViewStats } from '@/composables/useViewStats';
import JsonlWorker from '@/workers/jsonlParser.worker.js?worker';

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

    // Persisted visibility toggle
    const showDistribution = usePersistedToggle('reviews_showDistribution', true);

    function openCurlDialog(row) {
      currentRow.value = row;
      curlDialogVisible.value = true;
    }

    // ===== Table model =====
    const tableModel = useTableModel();
    const {
      tableData, filteredData, paginatedData,
      currentPage, pageSize, totalItems, totalVisibleItems,
      activeFilters, createColumnFilter,
      onTableFilterChange, setKeywordFilter, setColumnFilter, onTableSortChange,
      reset,
    } = tableModel;

    const { filters: resultFilters } = createColumnFilter('result');

    // ===== Pre-computed stats (single pass) =====
    const { distributions } = useViewStats(tableData, {
      distributionFields: ['result'],
    });

    // ===== Worker-based parser =====
    const parseReviews = (text, onProgress) => {
      return new Promise((resolve) => {
        const worker = new JsonlWorker();
        worker.onmessage = (e) => {
          if (e.data.type === 'progress') {
            if (onProgress) onProgress(e.data.percent);
          } else if (e.data.type === 'done') {
            worker.terminate();
            resolve({ rows: e.data.rows });
          }
        };
        worker.onerror = (err) => {
          console.error('Reviews worker error:', err);
          worker.terminate();
          resolve({ rows: [] });
        };
        worker.postMessage({
          text,
          type: 'reviews',
          failedParseLabel: t('detailDialog.parseFailed'),
        });
      });
    };

    // ===== File handler =====
    const fileHandler = useFileHandler({
      storageNamespace: 'evalscope_reviews',
      storageKey: 'evalscope_reviews_cache',
      listFiles, getFile, saveFile, clearFiles, deleteFile,
      parseData: parseReviews,
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

    const {
      hintText, recentFiles, formatSize, formatTime,
      clearRecentFiles, resetFile, removeRecentFile,
      currentFileName,
      dialogVisible, dialogHasTabs, dialogTabsData, dialogContent, dialogRawText,
      showDialog, showSolutionDialog, showRawJsonDialog,
      truncateText, formatResultMeta,
    } = fileHandler;

    // ===== Directory integration =====
    const dirIntegration = useDirIntegration({
      type: 'reviews',
      parseFile: parseReviews,
      tableModel,
      fileHandler,
      t,
      onboardedKey: 'evalscope_reviews_onboarded',
      sampleName: t('sample.sampleName.reviews'),
      sampleText: SAMPLE_REVIEWS_TEXT,
      loadSampleText: fileHandler.loadSampleText,
    });

    function quickFilterResult(value) {
      setColumnFilter('result', [value]);
    }

    return {
      curlDialogVisible,
      currentRow,
      idKeyword,
      showDistribution,
      openCurlDialog,
      previewHtml,
      // Dir integration
      ...dirIntegration,
      // File handler
      hintText, formatSize, formatTime,
      clearRecentFiles, recentFiles, resetFile, removeRecentFile,
      currentFileName,
      dialogVisible, dialogHasTabs, dialogTabsData, dialogContent, dialogRawText,
      showDialog, showSolutionDialog, showRawJsonDialog,
      truncateText, formatResultMeta,
      // Table
      tableData, currentPage, pageSize,
      filteredData, paginatedData,
      totalItems, totalVisibleItems,
      onTableFilterChange, onTableSortChange,
      resultFilters, activeFilters,
      setKeywordFilter, setColumnFilter,
      quickFilterResult,
      // Pre-computed stats
      distributions,
    };
  },
};
</script>

<style scoped>
/* Ensure filter popover is not clipped by fixed table header */
:deep(.el-table__header-wrapper) {
  overflow: visible;
}
</style>
