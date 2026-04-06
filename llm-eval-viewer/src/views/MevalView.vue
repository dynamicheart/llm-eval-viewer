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
      :table-data="tableData"
      :title="$t('stats.tokenDistribution')"
      :fields="[
        { key: 'promptTokens', label: 'Prompt Tokens', color: '#409EFF' },
        { key: 'completionTokens', label: 'Completion Tokens', color: '#67C23A' },
      ]"
    />

    <div class="distribution-row">
      <DistributionCard
        v-if="showDistribution"
        :tableData="tableData"
        fieldName="result"
        :fieldLabel="$t('meval.result')"
        @filter="quickFilterResult"
      />

      <DistributionCard
        v-if="showFinishReasonDist"
        :tableData="tableData"
        fieldName="finishReason"
        fieldLabel="Finish Reason"
        @filter="quickFilterFinishReason"
      />
    </div>

    <DatasetStatsCard v-if="showDatasetStats" :tableData="tableData" @filter="onDatasetStatsFilter" />

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
                <el-dropdown-item @click="showRawJsonDialog(row)">{{ $t('meval.requestDetail') }}</el-dropdown-item>
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
import Papa from 'papaparse';
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
import { useJsonlFileHandler } from '@/composables/useJsonlFileHandler';
import { useTableModel } from '@/composables/useTableModel';

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
    const showHistogram = ref(false);
    const showDistribution = ref(true);
    const showFinishReasonDist = ref(false);
    const showDatasetStats = ref(true);
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

    const inferDataset = (category2, question, promptId) => {
      const c2 = (category2 || '').trim();
      // GPQA: category2 is a science subject
      if (['Chemistry', 'Physics', 'Biology'].includes(c2)) return 'GPQA';
      // LiveCodeBench: category2 is difficulty level
      if (['easy', 'medium', 'hard'].includes(c2)) return 'LiveCodeBench';
      // Empty category: distinguish by question text
      if (question.includes('function signature and docstring')) return 'HumanEval';
      if (question.includes('calculation question')) {
        const pid = Number(promptId);
        if (!isNaN(pid)) return pid >= 44243093 ? 'AIME25' : 'AIME24';
        return 'AIME';
      }
      return c2 || t('common.unknown');
    };

    const parseCsv = (text) => {
      localStorage.setItem(ONBOARDED_KEY, '1');
      samplePromptVisible.value = false;
      const { data, meta } = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
      });
      const headers = meta.fields || [];

      // Dynamically detect model column: find "模型回答-XXX" not ending with "-请求详情"
      const modelAnswerCols = headers.filter(
        (h) => h.startsWith('模型回答-') && !h.endsWith('-请求详情')
      );
      const detectedModel = modelAnswerCols.length > 0
        ? modelAnswerCols[0].replace('模型回答-', '')
        : '';
      modelName.value = detectedModel;

      const requestDetailCol = `模型回答-${detectedModel}-请求详情`;
      const resultCol = `标注结果-${detectedModel}`;
      const resultDetailCol = `标注结果详情-${detectedModel}`;

      tableData.value = data.map((row, idx) => {
        // Parse request detail JSON
        let promptTokens = '';
        let completionTokens = '';
        let totalTokens = '';
        let costTime = null;
        let requestDetailJson = '';
        let finishReason = '';

        try {
          const detail = JSON.parse(row[requestDetailCol]);
          const ri = detail[0]?.request_info || {};
          const usage = ri.response?.usage || {};
          promptTokens = usage.prompt_tokens ?? '';
          completionTokens = usage.completion_tokens ?? '';
          totalTokens = usage.total_tokens ?? '';
          costTime = ri.cost_time ?? null;
          finishReason = ri.response?.choices?.[0]?.finish_reason || '';
          requestDetailJson = JSON.stringify(detail, null, 2);
        } catch {
          requestDetailJson = row[requestDetailCol] || '';
        }

        // Parse result detail JSON
        let extractedAnswer = '';
        let resultDetailJson = '';
        try {
          const evalDetail = JSON.parse(row[resultDetailCol]);
          extractedAnswer = evalDetail?.evaluator?.extracted_answer || '';
          resultDetailJson = JSON.stringify(evalDetail, null, 2);
        } catch {
          resultDetailJson = row[resultDetailCol] || '';
        }

        const question = row['问题'] || '';

        return {
          index: idx + 1,
          sampleId: row['样本ID'] || '',
          traceId: row['TraceId'] || '',
          category1: row['一级分类'] || '',
          category2: row['二级分类'] || '',
          category3: row['三级分类'] || '',
          dataset: inferDataset(row['二级分类'], question, row['提示词 ID']),
          question,
          referenceAnswer: row['参考答案'] || '',
          result: row[resultCol] || '',
          modelAnswer: row[`模型回答-${detectedModel}`] || '',
          prompt: row['问题'] || '',
          promptTokens,
          completionTokens,
          totalTokens,
          costTime,
          extractedAnswer,
          rawJson: requestDetailJson,
          resultDetailJson,
          finishReason,
        };
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
    } = useJsonlFileHandler({
      storageNamespace: 'meval_samples',
      storageKey: 'meval_samples_cache',
      listFiles,
      getFile,
      saveFile,
      clearFiles,
      deleteFile,
      parseJsonl: parseCsv,
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

    // Reuse showRawJsonDialog for result detail display
    const showResultDetailDialog = (row) => {
      showRawJsonDialog({ rawJson: row.resultDetailJson || '{}' });
    };

    function previewHtml(text, maxLen = 400) {
      if (!text) return '';
      const s = String(text).slice(0, maxLen)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      return text.length > maxLen ? s + '…' : s;
    }

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
      showRawJsonDialog,
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
    };
  },
};
</script>

<style scoped>
/* Ensure filter popover is not clipped by fixed table header */
:deep(.el-table__header-wrapper) {
  overflow: visible;
}
.distribution-row {
  display: flex;
  gap: 16px;
}
.distribution-row > * {
  flex: 1;
  min-width: 0;
}
.copyable {
  cursor: pointer;
  transition: color 0.2s;
}
.copyable:hover {
  color: var(--ev-color-primary);
}
.clickable-cell {
  cursor: pointer;
  transition: color 0.2s;
}
.clickable-cell:hover {
  color: var(--ev-color-primary);
}
.model-info {
  margin-bottom: 8px;
  color: var(--ev-text-secondary);
  font-size: 13px;
}
.model-name {
  color: var(--ev-text-primary);
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
</style>
