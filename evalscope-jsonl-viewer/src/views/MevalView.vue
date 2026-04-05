<template>
  <div class="container">
    <FileToolbar
      :hint-text="hintText"
      :recent-files="recentFiles"
      :current-file-name="currentFileName"
      :format-size="formatSize"
      :format-time="formatTime"
      accept=".csv"
      button-text="选择 CSV 文件"
      :enable-dir-picker="false"
      @handle-file-select="handleFileSelect"
      @open-recent-file="openRecentFile"
      @clear-recent-files="clearRecentFiles"
      @reset-file="resetFile"
      @remove-recent-file="removeRecentFile"
    />

    <div v-if="modelName" style="margin-bottom: 8px; color: #909399; font-size: 13px">
      检测到模型：<b style="color: #303133">{{ modelName }}</b>
    </div>

    <template v-if="tableData.length">
      <div>
        <el-checkbox v-model="showHistogram">Token 分布统计</el-checkbox>
        <el-checkbox v-model="showDistribution">标注结果分布</el-checkbox>
        <el-checkbox v-model="showFinishReasonDist">Finish Reason 分布</el-checkbox>
        <el-checkbox v-model="showDatasetStats">数据集统计</el-checkbox>
      </div>

    <HistogramCard
      v-if="showHistogram"
      :table-data="tableData"
      title="Token 分布统计"
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
        fieldLabel="标注结果"
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

    <DatasetStatsCard v-if="showDatasetStats" :tableData="tableData" />

    <!-- 表格 -->
    <el-table
      v-if="tableData.length"
      :data="paginatedData"
      style="width: 100%; margin-top: 20px"
      @filter-change="onTableFilterChange"
      @sort-change="onTableSortChange"
      border
    >
      <el-table-column prop="index" label="#" width="70" sortable />
      <el-table-column prop="sampleId" label="样本ID" width="120">
        <template #header>
          <TableHeaderSearch
            label="样本ID"
            v-model="idKeyword"
            placeholder="搜索ID"
            @change="(v) => setKeywordFilter('sampleId', v)"
          />
        </template>
        <template #default="{ row }">
          <span class="copyable" @click="copyText(row.sampleId)">{{ row.sampleId }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="traceId" label="Trace ID" width="200">
        <template #header>
          <TableHeaderSearch
            label="Trace ID"
            v-model="traceIdKeyword"
            placeholder="搜索Trace ID"
            @change="(v) => setKeywordFilter('traceId', v)"
          />
        </template>
        <template #default="{ row }">
          <span class="copyable" @click="copyText(row.traceId)" :title="row.traceId">{{ truncateText(row.traceId, 30) }}</span>
        </template>
      </el-table-column>
      <!-- <el-table-column
        prop="category1"
        label="一级分类"
        column-key="category1"
        :filters="category1Filters"
        width="120"
      />
      <el-table-column
        prop="category2"
        label="二级分类"
        column-key="category2"
        :filters="category2Filters"
        width="120"
      />
      <el-table-column
        prop="category3"
        label="三级分类"
        column-key="category3"
        :filters="category3Filters"
        width="120"
      /> -->
      <el-table-column
        prop="dataset"
        label="数据集"
        column-key="dataset"
        :filters="datasetFilters"
        :filtered-value="activeFilters['dataset'] || []"
        width="140"
      />
      <el-table-column
        prop="result"
        label="标注结果"
        column-key="result"
        :filters="resultFilters"
        :filtered-value="activeFilters['result'] || []"
        width="90"
      >
        <template #default="{ row }">
          <span
            :style="{
              color: row.result === '0' ? '#f56c6c' : '#67c23a',
              fontWeight: 600,
            }"
          >
            {{ row.result }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="promptTokens" label="Prompt" width="90" sortable />
      <el-table-column prop="completionTokens" label="Completion" width="105" sortable />
      <el-table-column prop="totalTokens" label="Total" width="85" sortable />
      <!-- <el-table-column prop="costTime" label="耗时(s)" width="100" sortable>
        <template #default="{ row }">
          {{ row.costTime != null ? (row.costTime / 1000).toFixed(1) : '' }}
        </template>
      </el-table-column> -->
      <el-table-column
        prop="finishReason"
        label="Finish Reason"
        column-key="finishReason"
        :filters="finishReasonFilters"
        :filtered-value="activeFilters['finishReason'] || []"
        width="100"
      >
        <template #default="{ row }">
          <span :style="{ color: (row.finishReason === 'length' || row.finishReason === 'max_tokens') ? '#f56c6c' : undefined, fontWeight: (row.finishReason === 'length' || row.finishReason === 'max_tokens') ? 600 : undefined }">
            {{ row.finishReason }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="问题" width="70">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.question || '')">查看</el-button>
        </template>
      </el-table-column>
      <el-table-column label="参考答案" width="85">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.referenceAnswer || '')">查看</el-button>
        </template>
      </el-table-column>
      <el-table-column label="模型回答" width="85">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.modelAnswer || '')">查看</el-button>
        </template>
      </el-table-column>
      <el-table-column label="提取答案" width="85">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.extractedAnswer || '')">查看</el-button>
        </template>
      </el-table-column>
      <el-table-column label="请求详情" width="85">
        <template #default="{ row }">
          <el-button type="text" @click="showRawJsonDialog(row)">查看</el-button>
        </template>
      </el-table-column>
      <el-table-column label="标注详情" width="85">
        <template #default="{ row }">
          <el-button type="text" @click="showResultDetailDialog(row)">查看</el-button>
        </template>
      </el-table-column>
      <el-table-column label="构造CURL" width="85">
        <template #default="{ row }">
          <el-button type="text" @click="openCurlDialog(row)">生成</el-button>
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
      :title="'详情'"
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
import Papa from 'papaparse';
import { ElMessage } from 'element-plus';

import FileToolbar from '@/components/FileToolbar.vue';
import DetailDialog from '@/components/DetailDialog.vue';
import DistributionCard from '@/components/DistributionCard.vue';
import HistogramCard from '@/components/HistogramCard.vue';
import TableHeaderSearch from '@/components/TableHeaderSearch.vue';
import CurlInvokeDialog from '@/components/CurlInvokeDialog.vue';
import DatasetStatsCard from '@/components/DatasetStatsCard.vue';

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
  },

  setup() {
    const idKeyword = ref('');
    const traceIdKeyword = ref('');
    const modelName = ref('');
    const showHistogram = ref(false);
    const showDistribution = ref(true);
    const showFinishReasonDist = ref(false);
    const showDatasetStats = ref(true);
    const curlDialogVisible = ref(false);
    const currentRow = ref(null);

    const copyText = (text) => {
      if (!text) return;
      navigator.clipboard.writeText(text);
      ElMessage.success('已复制');
    };

    const openCurlDialog = (row) => {
      currentRow.value = row;
      curlDialogVisible.value = true;
    };

    const inferDataset = (category2, question, promptId) => {
      const c2 = (category2 || '').trim();
      // GPQA: 二级分类为理科科目
      if (['Chemistry', 'Physics', 'Biology'].includes(c2)) return 'GPQA';
      // LiveCodeBench: 二级分类为难度等级
      if (['easy', 'medium', 'hard'].includes(c2)) return 'LiveCodeBench';
      // 空类目：按问题文本区分
      if (question.includes('function signature and docstring')) return 'HumanEval';
      if (question.includes('calculation question')) {
        const pid = Number(promptId);
        if (!isNaN(pid)) return pid >= 44243093 ? 'AIME25' : 'AIME24';
        return 'AIME';
      }
      return c2 || '未知';
    };

    const parseCsv = (text) => {
      const { data, meta } = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
      });
      const headers = meta.fields || [];

      // 动态检测模型列：找 "模型回答-XXX" 且不以 "-请求详情" 结尾
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
        // 解析请求详情 JSON
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

        // 解析标注结果详情 JSON
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
      hintText: '请上传评测样本明细 CSV 文件',
      validateContent: (text) => {
        const header = (text.split('\n')[0] || '').trim();
        if (!header.includes('样本ID') && !header.includes('标注结果') && !header.includes('模型回答')) {
          return '该 CSV 不像是 MEval 评测样本文件（未找到 样本ID/标注结果/模型回答 等列），确定要加载吗？';
        }
        return null;
      },
    });

    // 标注结果详情：复用 showRawJsonDialog 机制
    const showResultDetailDialog = (row) => {
      showRawJsonDialog({ rawJson: row.resultDetailJson || '{}' });
    };

    function quickFilterResult(value) {
      setColumnFilter('result', [value]);
    }

    function quickFilterFinishReason(value) {
      setColumnFilter('finishReason', [value]);
    }

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
      copyText,
      openCurlDialog,
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
    };
  },
};
</script>

<style scoped>
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
}
.copyable:hover {
  background-color: #f0f0f0;
  border-radius: 2px;
}
</style>
