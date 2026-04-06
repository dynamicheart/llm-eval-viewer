<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div class="container">
    <FileToolbar
      :hint-text="hintText"
      :recent-files="recentFiles"
      :current-file-name="currentFileName"
      :format-size="formatSize"
      :format-time="formatTime"
      accept=".csv"
      :button-text="$t('fileToolbar.selectCsvFile')"
      :enable-dir-picker="false"
      @handle-file-select="handleFileSelect"
      @open-recent-file="openRecentFile"
      @clear-recent-files="clearRecentFiles"
      @reset-file="resetFile"
      @remove-recent-file="removeRecentFile"
    />

    <div v-if="samplePromptVisible" class="sample-prompt">
      <span>{{ $t('sample.prompt') }}</span>
      <el-button type="primary" size="small" @click="loadSample">{{ $t('sample.loadSample') }}</el-button>
      <el-button size="small" text @click="dismissSample">{{ $t('sample.dismiss') }}</el-button>
    </div>

    <div v-if="modelName" class="model-info">
      {{ $t('meval.detectedModel') }}<b class="model-name">{{ modelName }}</b>
    </div>

    <template v-if="tableData.length">
      <div>
        <el-checkbox v-model="showHistogram">{{ $t('stats.tokenDistribution') }}</el-checkbox>
        <el-checkbox v-model="showDistribution">{{ $t('stats.resultDistribution') }}</el-checkbox>
        <el-checkbox v-model="showFinishReasonDist">{{ $t('stats.finishReasonDistribution') }}</el-checkbox>
        <el-checkbox v-model="showDatasetStats">{{ $t('stats.datasetStats') }}</el-checkbox>
      </div>

    <HistogramCard
      v-if="showHistogram"
      :histogram-data="histogramData"
      :total-samples="globalStats.totalSamples"
      :title="$t('stats.tokenDistribution')"
      :fields="[
        { key: 'promptTokens', label: 'Prompt Tokens', color: '#409EFF' },
        { key: 'completionTokens', label: 'Completion Tokens', color: '#67C23A' },
      ]"
    />

    <div class="distribution-row">
      <DistributionCard
        v-if="showDistribution"
        :items="distributions['result'] || []"
        :fieldLabel="$t('meval.result')"
        @filter="quickFilterResult"
      />

      <DistributionCard
        v-if="showFinishReasonDist"
        :items="distributions['finishReason'] || []"
        fieldLabel="Finish Reason"
        @filter="quickFilterFinishReason"
      />
    </div>

    <DatasetStatsCard v-if="showDatasetStats" :stats="datasetStatsRows" :globalStats="globalStats" @filter="onDatasetStatsFilter" />

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
      <el-table-column prop="index" label="#" width="70" sortable />
      <el-table-column prop="sampleId" :label="$t('meval.sampleId')" width="120">
        <template #header>
          <TableHeaderSearch
            :label="$t('meval.sampleId')"
            v-model="idKeyword"
            :placeholder="$t('meval.searchId')"
            @change="(v) => setKeywordFilter('sampleId', v)"
          />
        </template>
        <template #default="{ row }">
          <span class="copyable" @click="copyText(row.sampleId)">{{ row.sampleId }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="traceId" label="Trace ID" width="160">
        <template #header>
          <TableHeaderSearch
            label="Trace ID"
            v-model="traceIdKeyword"
            :placeholder="$t('meval.searchTraceId')"
            @change="(v) => setKeywordFilter('traceId', v)"
          />
        </template>
        <template #default="{ row }">
          <el-tooltip :content="row.traceId" placement="top" :show-after="300" popper-class="preview-tooltip" :disabled="!row.traceId || row.traceId.length <= 20">
            <span class="copyable" @click="copyText(row.traceId)">{{ truncateText(row.traceId, 20) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column :label="$t('meval.question')" min-width="200">
        <template #default="{ row }">
          <el-tooltip raw-content :content="previewHtml(row.question)" placement="top" :show-after="300" popper-class="preview-tooltip" :disabled="!row.question || row.question.length <= 60">
            <span class="clickable-cell" @click="showDialog(row.question || '')">{{ truncateText(row.question, 60) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column :label="$t('meval.extractedAnswer')" width="100">
        <template #default="{ row }">
          <el-tooltip raw-content :content="previewHtml(row.extractedAnswer, 200)" placement="top" :show-after="300" popper-class="preview-tooltip" :disabled="!row.extractedAnswer || row.extractedAnswer.length <= 12">
            <span class="clickable-cell" @click="showDialog(row.extractedAnswer || '')">{{ truncateText(row.extractedAnswer, 12) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column
        prop="dataset"
        :label="$t('meval.dataset')"
        column-key="dataset"
        :filters="datasetFilters"
        :filtered-value="activeFilters['dataset'] || []"
        width="140"
      />
      <el-table-column
        prop="result"
        :label="$t('meval.result')"
        column-key="result"
        :filters="resultFilters"
        :filtered-value="activeFilters['result'] || []"
        width="90"
      >
        <template #default="{ row }">
          <span
            :style="{
              color: row.result === '0' ? 'var(--ev-color-danger)' : undefined,
              fontWeight: row.result === '0' ? 600 : undefined,
            }"
          >
            {{ row.result }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="promptTokens" label="Prompt Token" width="110" sortable />
      <el-table-column prop="completionTokens" label="Comp Token" width="105" sortable />
      <el-table-column prop="totalTokens" label="Total Token" width="100" sortable />
      <el-table-column
        prop="finishReason"
        label="Finish Reason"
        column-key="finishReason"
        :filters="finishReasonFilters"
        :filtered-value="activeFilters['finishReason'] || []"
        width="130"
      >
        <template #default="{ row }">
          <span :style="{ color: (row.finishReason === 'length' || row.finishReason === 'max_tokens') ? 'var(--ev-color-danger)' : undefined, fontWeight: (row.finishReason === 'length' || row.finishReason === 'max_tokens') ? 600 : undefined }">
            {{ row.finishReason }}
          </span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('meval.answers')" width="90">
        <template #default="{ row }">
          <el-dropdown trigger="click" size="small">
            <el-button type="text">{{ $t('common.view') }}<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="showDialog(row.referenceAnswer || '')">{{ $t('meval.referenceAnswer') }}</el-dropdown-item>
                <el-dropdown-item @click="showDialog(row.modelAnswer || '')">{{ $t('meval.modelAnswer') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
      <el-table-column :label="$t('common.detail')" width="90">
        <template #default="{ row }">
          <el-dropdown trigger="click" size="small">
            <el-button type="text">{{ $t('common.view') }}<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="showRequestDetailDialog(row)">{{ $t('meval.requestDetail') }}</el-dropdown-item>
                <el-dropdown-item @click="showResultDetailDialog(row)">{{ $t('meval.resultDetail') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
      <el-table-column :label="$t('meval.buildCurl')" width="85">
        <template #default="{ row }">
          <el-button type="text" @click="openCurlDialog(row)">{{ $t('common.generate') }}</el-button>
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
import { ref, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { ArrowDown } from '@element-plus/icons-vue';

import FileToolbar from '@/components/FileToolbar.vue';
import DetailDialog from '@/components/DetailDialog.vue';
import DistributionCard from '@/components/DistributionCard.vue';
import HistogramCard from '@/components/HistogramCard.vue';
import TableHeaderSearch from '@/components/TableHeaderSearch.vue';
import CurlInvokeDialog from '@/components/CurlInvokeDialog.vue';
import DatasetStatsCard from '@/components/DatasetStatsCard.vue';
import { SAMPLE_MEVAL_TEXT } from '@/data/sampleData';

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
import { useViewStats } from '@/composables/useViewStats';
import MevalWorker from '@/workers/mevalParser.worker.js?worker';

export default {
  components: {
    FileToolbar,
    DetailDialog,
    DistributionCard,
    HistogramCard,
    TableHeaderSearch,
    CurlInvokeDialog,
    DatasetStatsCard,
    ArrowDown,
  },

  setup() {
    const { t } = useI18n();
    const idKeyword = ref('');
    const traceIdKeyword = ref('');
    const modelName = ref('');

    // Persisted visibility toggles
    const showHistogram = usePersistedToggle('meval_showHistogram', false);
    const showDistribution = usePersistedToggle('meval_showDistribution', true);
    const showFinishReasonDist = usePersistedToggle('meval_showFinishReasonDist', false);
    const showDatasetStats = usePersistedToggle('meval_showDatasetStats', true);

    const curlDialogVisible = ref(false);
    const currentRow = ref(null);

    const ONBOARDED_KEY = 'meval_onboarded';
    const samplePromptVisible = ref(false);

    const copyText = (text) => {
      if (!text) return;
      navigator.clipboard.writeText(text);
      ElMessage.success(t('common.copied'));
    };

    const openCurlDialog = (row) => {
      currentRow.value = row;
      curlDialogVisible.value = true;
    };

    const parseCsv = (text) => {
      return new Promise((resolve) => {
        localStorage.setItem(ONBOARDED_KEY, '1');
        samplePromptVisible.value = false;

        const worker = new MevalWorker();
        worker.onmessage = (e) => {
          const { rows, modelName: name } = e.data;
          modelName.value = name;
          tableData.value = rows.map((r) => Object.freeze(r));
          worker.terminate();
          resolve();
        };
        worker.onerror = (err) => {
          console.error('MEval worker error:', err);
          worker.terminate();
          resolve();
        };
        worker.postMessage({ text, unknownLabel: t('common.unknown') });
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

    const { filters: category1Filters } = createColumnFilter('category1');
    const { filters: category2Filters } = createColumnFilter('category2');
    const { filters: category3Filters } = createColumnFilter('category3');
    const { filters: datasetFilters } = createColumnFilter('dataset');
    const { filters: finishReasonFilters } = createColumnFilter('finishReason');
    const { filters: resultFilters } = createColumnFilter('result');

    // ===== Pre-computed stats (single pass) =====
    const { distributions, histogramData, datasetStatsRows, globalStats } = useViewStats(tableData, {
      distributionFields: ['result', 'finishReason'],
      histogramFields: [
        { key: 'promptTokens', label: 'Prompt Tokens', color: '#409EFF' },
        { key: 'completionTokens', label: 'Completion Tokens', color: '#67C23A' },
      ],
      datasetStats: {
        datasetField: 'dataset',
        resultField: 'result',
        resultFalseValue: '0',
        finishReasonField: 'finishReason',
        promptTokenField: 'promptTokens',
        completionTokenField: 'completionTokens',
        unknownLabel: t('common.unknown'),
      },
    });

    const {
      hintText,
      recentFiles,
      formatSize,
      formatTime,
      clearRecentFiles,
      openRecentFile,
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
      showRawJsonDialog,
      truncateText,
    } = useFileHandler({
      storageNamespace: 'meval_samples',
      storageKey: 'meval_samples_cache',
      listFiles,
      getFile,
      saveFile,
      clearFiles,
      deleteFile,
      parseData: parseCsv,
      tableModel,
      hintText: t('meval.hintText'),
      validateContent: (text) => {
        const header = (text.split('\n')[0] || '').trim();
        if (!header.includes('样本ID') && !header.includes('标注结果') && !header.includes('模型回答')) {
          return t('meval.validateWarning');
        }
        return null;
      },
    });

    // Lazy JSON stringify helpers — pretty-print raw text on demand
    function getRowRawJson(row) {
      const text = row._requestDetailText;
      if (!text) return '{}';
      try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
    }

    function getRowResultDetailJson(row) {
      const text = row._resultDetailText;
      if (!text) return '{}';
      try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
    }

    // Show request detail
    const showRequestDetailDialog = (row) => {
      showRawJsonDialog({ rawJson: getRowRawJson(row) });
    };

    // Show result detail
    const showResultDetailDialog = (row) => {
      showRawJsonDialog({ rawJson: getRowResultDetailJson(row) });
    };

    function quickFilterResult(value) {
      setColumnFilter('result', [value]);
    }

    function quickFilterFinishReason(value) {
      setColumnFilter('finishReason', [value]);
    }

    function onDatasetStatsFilter({ dataset, result }) {
      // Always filter by dataset
      setColumnFilter('dataset', [dataset]);
      if (result === 'correct') {
        // Filter all non-zero result values for this dataset
        const correctValues = [...new Set(
          tableData.value
            .filter(r => r.dataset === dataset && r.result && r.result !== '0')
            .map(r => r.result)
        )];
        setColumnFilter('result', correctValues.length ? correctValues : ['__none__']);
      } else if (result === 'wrong') {
        setColumnFilter('result', ['0']);
      } else {
        // Row click - only filter dataset, clear result filter
        setColumnFilter('result', []);
      }
    }

    async function loadSample() {
      await loadSampleText(t('sample.sampleName.meval'), SAMPLE_MEVAL_TEXT);
    }

    function dismissSample() {
      localStorage.setItem(ONBOARDED_KEY, '1');
      samplePromptVisible.value = false;
    }

    onMounted(async () => {
      await nextTick();
      if (tableData.value.length === 0 && !localStorage.getItem(ONBOARDED_KEY)) {
        samplePromptVisible.value = true;
      }
    });

    return {
      idKeyword,
      traceIdKeyword,
      modelName,
      showHistogram,
      showDistribution,
      showFinishReasonDist,
      showDatasetStats,
      curlDialogVisible,
      currentRow,
      samplePromptVisible,
      loadSample,
      dismissSample,
      copyText,
      openCurlDialog,
      previewHtml,
      hintText,
      formatSize,
      formatTime,
      clearRecentFiles,
      recentFiles,
      removeRecentFile,
      openRecentFile,
      handleFileSelect,
      resetFile,
      currentFileName,
      dialogVisible,
      dialogHasTabs,
      dialogTabsData,
      dialogContent,
      dialogRawText,
      showDialog,
      showRequestDetailDialog,
      showResultDetailDialog,
      truncateText,
      tableData,
      currentPage,
      pageSize,
      filteredData,
      paginatedData,
      totalItems,
      totalVisibleItems,
      onTableFilterChange,
      onTableSortChange,
      category1Filters,
      category2Filters,
      category3Filters,
      datasetFilters,
      finishReasonFilters,
      resultFilters,
      activeFilters,
      setKeywordFilter,
      setColumnFilter,
      quickFilterResult,
      quickFilterFinishReason,
      onDatasetStatsFilter,
      // Pre-computed stats
      distributions,
      histogramData,
      datasetStatsRows,
      globalStats,
    };
  },
};
</script>

<style scoped>
/* Ensure filter popover is not clipped by fixed table header */
:deep(.el-table__header-wrapper) {
  overflow: visible;
}
.model-info {
  margin-bottom: 8px;
  color: var(--ev-text-secondary);
  font-size: 13px;
}
.model-name {
  color: var(--ev-text-primary);
}
</style>
