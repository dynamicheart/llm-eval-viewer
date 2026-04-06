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
import { previewHtml } from '@/utils/viewHelpers';
import { useJsonlFileHandler } from '@/composables/useJsonlFileHandler';
import { useTableModel } from '@/composables/useTableModel';
import { useDirIntegration } from '@/composables/useDirIntegration';

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

    function openCurlDialog(row) {
      currentRow.value = row;
      curlDialogVisible.value = true;
    }

    // ===== Domain logic =====

    const getSolutionFromSample = (json) => {
      const meta = json?.sample_score?.sample_metadata;

      if (typeof meta?.solution === 'string' && meta.solution.trim() !== '') {
        return { type: 'solution', content: meta.solution, render: 'markdown' };
      }

      if (meta && Object.keys(meta).length > 0) {
        return { type: 'metadata', content: JSON.stringify(meta, null, 2), render: 'json' };
      }

      const metadata = json?.sample_score?.score?.metadata;
      if (metadata && Object.keys(metadata).length > 0) {
        return { type: 'metadata', content: JSON.stringify(metadata, null, 2), render: 'json' };
      }

      return { type: 'empty', content: t('detailDialog.noSolutionDetail'), render: 'text' };
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
        if (val !== undefined && val !== null) return val;
      }
      return '';
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

    // ===== Parser =====
    const parseJsonlReviews = (text) => {
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
              index: idx + 1, id: 'parse_error', prompt: '', pred: '', gold: '',
              result: '', content: '',
              solution: { type: 'empty', content: t('detailDialog.parseFailed'), render: 'text' },
              rawJson: '',
            };
          }
        });
    };

    // ===== File handler =====
    const fileHandler = useJsonlFileHandler({
      storageNamespace: 'evalscope_reviews',
      storageKey: 'evalscope_reviews_cache',
      listFiles, getFile, saveFile, clearFiles, deleteFile,
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
      parseFile: parseJsonlReviews,
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
