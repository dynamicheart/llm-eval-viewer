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
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

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
import { previewHtml } from '@/utils/viewHelpers';
import { useJsonlFileHandler } from '@/composables/useJsonlFileHandler';
import { useTableModel } from '@/composables/useTableModel';
import { useDirIntegration } from '@/composables/useDirIntegration';

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

    // Persist checkbox state
    const histCache = localStorage.getItem('showHistogram');
    const distCache = localStorage.getItem('showDistribution');
    if (histCache !== null) showHistogram.value = histCache === 'true';
    if (distCache !== null) showDistribution.value = distCache === 'true';

    watch(showHistogram, (val) => localStorage.setItem('showHistogram', val));
    watch(showDistribution, (val) => localStorage.setItem('showDistribution', val));

    // ===== Domain logic =====

    const getSampleId = (json, idx) => {
      const meta = json?.metadata || {};
      if (meta?.question_id) return String(meta.question_id);
      if (meta?.problem_id) return String(meta.problem_id);
      if (meta?.task_id) return String(meta.task_id);
      return `row_${idx + 1}`;
    };

    const parseContent = (rawContent) => {
      if (!rawContent) return { reasoning: null, text: '' };
      if (typeof rawContent === 'string') return { reasoning: null, text: rawContent };
      if (Array.isArray(rawContent)) {
        const reasoningItem = rawContent.find((item) => item.type === 'reasoning');
        const textItem = rawContent.find((item) => item.type === 'text');
        return {
          reasoning: reasoningItem ? reasoningItem.reasoning || null : null,
          text: textItem ? textItem.text || '' : '',
        };
      }
      return { reasoning: null, text: '' };
    };

    // ===== Table model =====
    const tableModel = useTableModel();
    const {
      tableData, filteredData, paginatedData,
      currentPage, pageSize, totalItems, totalVisibleItems,
      activeFilters, createColumnFilter,
      onTableFilterChange, setKeywordFilter, setColumnFilter, onTableSortChange,
      reset,
    } = tableModel;

    const { filters: stopReasonFilters } = createColumnFilter('stop_reason');

    const hasReasoning = computed(() =>
      tableData.value.some(row => row.content?.reasoning)
    );

    // ===== Parser =====
    const parseJsonlPredictions = (text) => {
      tableData.value = text
        .split('\n')
        .filter(Boolean)
        .map((line, idx) => {
          try {
            const json = JSON.parse(line);
            const content = json.model_output?.choices?.[0]?.message?.content || '';
            const usage = json.model_output?.usage || {};
            return {
              index: json.index ?? idx + 1,
              id: getSampleId(json, idx),
              prompt: json.input || '',
              pred: '', gold: '', result: '',
              content: parseContent(content),
              input_tokens: usage.input_tokens ?? '',
              output_tokens: usage.output_tokens ?? '',
              total_tokens: usage.total_tokens ?? '',
              stop_reason: json.model_output?.choices?.[0]?.stop_reason || '',
              rawJson: JSON.stringify(json, null, 2),
            };
          } catch {
            return {
              index: idx + 1, id: 'parse_error', prompt: '', pred: '', gold: '', result: '',
              content: '', input_tokens: '', output_tokens: '', total_tokens: '', stop_reason: '',
              rawJson: '',
            };
          }
        });
    };

    // ===== File handler =====
    const fileHandler = useJsonlFileHandler({
      storageNamespace: 'evalscope_predictions',
      storageKey: 'evalscope_predictions_cache',
      listFiles, getFile, saveFile, clearFiles, deleteFile,
      parseJsonl: parseJsonlPredictions,
      tableModel,
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

    const {
      hintText, recentFiles, formatSize, formatTime,
      clearRecentFiles, resetFile, removeRecentFile,
      currentFileName,
      dialogVisible, dialogHasTabs, dialogTabsData, dialogContent, dialogRawText,
      showDialog, showRawJsonDialog,
      truncateText,
    } = fileHandler;

    // ===== Directory integration =====
    const dirIntegration = useDirIntegration({
      type: 'predictions',
      parseFile: parseJsonlPredictions,
      tableModel,
      fileHandler,
      t,
      onboardedKey: 'evalscope_predictions_onboarded',
      sampleName: t('sample.sampleName.predictions'),
      sampleText: SAMPLE_PREDICTIONS_TEXT,
      loadSampleText: fileHandler.loadSampleText,
    });

    function quickFilterStopReason(value) {
      setColumnFilter('stop_reason', [value]);
    }

    return {
      idKeyword,
      showHistogram,
      showDistribution,
      hasReasoning,
      previewHtml,
      // Dir integration
      ...dirIntegration,
      // File handler
      hintText, formatSize, formatTime,
      clearRecentFiles, recentFiles, resetFile, removeRecentFile,
      currentFileName,
      dialogVisible, dialogHasTabs, dialogTabsData, dialogContent, dialogRawText,
      showDialog, showRawJsonDialog,
      truncateText,
      // Table
      tableData, currentPage, pageSize,
      filteredData, paginatedData,
      totalItems, totalVisibleItems,
      onTableFilterChange, onTableSortChange,
      stopReasonFilters, activeFilters,
      setKeywordFilter, quickFilterStopReason,
    };
  },
};
</script>

<style scoped>
/* Ensure filter popover is not clipped by fixed table header */
:deep(.el-table__header-wrapper) {
  overflow: visible;
}

.reasoning-tag {
  color: var(--ev-color-primary);
  font-weight: 600;
  font-size: 11px;
  margin-right: 4px;
}
</style>
