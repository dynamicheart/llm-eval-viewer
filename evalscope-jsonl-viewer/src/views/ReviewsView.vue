<!--
  Copyright (c) 2025 dynamicheart
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
      @handle-file-select="handleFileSelect"
      @open-recent-file="openRecentFile"
      @clear-recent-files="clearRecentFiles"
      @reset-file="resetFile"
    />

    <ResultDistribution :tableData="tableData" />

    <!-- 表格 -->
    <el-table
      v-if="tableData.length"
      :data="paginatedData"
      style="width: 100%; margin-top: 20px"
      border
    >
      <el-table-column prop="index" label="#" width="80" sortable />
      <el-table-column prop="id" label="ID" width="200" />
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
        :filters="resultFilters"
        :filter-method="filterByResult"
        filter-placement="bottom-start"
      />
      <el-table-column label="Prompt">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.prompt || '')"
            >查看</el-button
          >
        </template>
      </el-table-column>
      <el-table-column label="Completion">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.content || '')"
            >查看</el-button
          >
        </template>
      </el-table-column>
      <el-table-column label="Extracted Pred">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.pred || '')"
            >查看</el-button
          >
        </template>
      </el-table-column>
      <el-table-column label="Solution">
        <template #default="{ row }">
          <el-button type="text" @click="showSolutionDialog(row)"
            >查看</el-button
          >
        </template>
      </el-table-column>
      <el-table-column label="JSON">
        <template #default="{ row }">
          <el-button type="text" @click="showRawJsonDialog(row)"
            >查看</el-button
          >
        </template>
      </el-table-column>
      <el-table-column label="构造CURL">
        <template #default="{ row }">
          <el-button type="text" @click="openCurlDialog(row)"> 生成 </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="totalItems > 0"
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      :page-sizes="[10, 20, 50, 100]"
      :total="totalItems"
      layout="total, sizes, prev, pager, next, jumper"
      style="margin-top: 20px; text-align: right"
    />

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
import { ref, computed } from 'vue';

import FileToolbar from '@/components/FileToolbar.vue';
import DetailDialog from '@/components/DetailDialog.vue';
import ResultDistribution from '@/components/ResultDistribution.vue';
import CurlInvokeDialog from '@/components/CurlInvokeDialog.vue';

import {
  saveFile,
  getFile,
  listFiles,
  clearFiles,
  deleteFile,
} from '@/utils/fileDB';
import { useJsonlFileHandler } from '@/composables/useJsonlFileHandler';

export default {
  components: {
    FileToolbar,
    DetailDialog,
    ResultDistribution,
    CurlInvokeDialog,
  },
  setup() {
    const curlDialogVisible = ref(false);
    const currentRow = ref(null);

    function openCurlDialog(row) {
      currentRow.value = row;
      curlDialogVisible.value = true;
    }

    const resultDistribution = computed(() => {
      const total = tableData.value.length;
      if (total === 0) return [];

      // 统计数量
      const countMap = {};
      tableData.value.forEach((item) => {
        const key = item.result ?? '未知';
        countMap[key] = (countMap[key] || 0) + 1;
      });

      // 转成数组并计算占比
      return Object.entries(countMap).map(([result, count]) => ({
        result,
        count,
        percentage: ((count / total) * 100).toFixed(1),
      }));
    });

    const getSolutionFromSample = (json) => {
      const meta = json?.sample_score?.sample_metadata;

      // 1. 真 solution：markdown
      if (typeof meta?.solution === 'string' && meta.solution.trim() !== '') {
        return {
          type: 'solution',
          content: meta.solution,
          render: 'markdown',
        };
      }

      // 2. fallback：sample_metadata JSON
      if (meta && Object.keys(meta).length > 0) {
        return {
          type: 'metadata',
          content: JSON.stringify(meta, null, 2),
          render: 'json',
        };
      }

      // 3. score
      const metadata = json?.sample_score?.score?.metadata;
      if (metadata && Object.keys(metadata).length > 0) {
        return {
          type: 'metadata',
          content: JSON.stringify(metadata, null, 2),
          render: 'json',
        };
      }

      // 4. 兜底
      return {
        type: 'empty',
        content: '未提供 solution（sample_metadata 中也未找到可展示内容）',
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
              rawJson: JSON.stringify(json, null, 2), // 格式化的字符串
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
                content: '解析失败，无法获取 solution',
                render: 'text',
              },
              rawJson: '',
            };
          }
        });
    };

    const resultFilters = computed(() =>
      [...new Set(tableData.value.map((d) => d.result))].map((v) => ({
        text: String(v),
        value: v,
      }))
    );

    const filterByResult = (value, row) => row.result === value;

    const {
      hintText,
      recentFiles,
      formatSize,
      formatTime,
      clearRecentFiles,
      openRecentFile,
      handleFileSelect,
      resetFile,
      currentFileName,
      tableData,
      dialogVisible,
      dialogHasTabs,
      dialogTabsData,
      dialogContent,
      dialogRawText,
      showDialog,
      showSolutionDialog,
      showRawJsonDialog,
      currentPage,
      pageSize,
      totalItems,
      paginatedData,
      truncateText,
    } = useJsonlFileHandler({
      storageNamespace: 'evalscope_reviews',
      storageKey: 'evalscope_reviews_cache',
      listFiles: listFiles,
      getFile: getFile,
      saveFile: saveFile,
      clearFiles: clearFiles,
      deleteFile: deleteFile,
      parseJsonl: parseJsonlReviews,
      hintText: '⚠️ 请上传 reviews 目录下的 JSONL 文件',
    });

    return {
      curlDialogVisible,
      currentRow,
      openCurlDialog,
      resultDistribution,
      hintText,
      formatSize,
      formatTime,
      clearRecentFiles,
      recentFiles,
      openRecentFile,
      handleFileSelect,
      resetFile,
      currentFileName,
      tableData,
      dialogVisible,
      dialogHasTabs,
      dialogTabsData,
      dialogContent,
      dialogRawText,
      showDialog,
      showSolutionDialog,
      showRawJsonDialog,
      resultFilters,
      filterByResult,
      truncateText,
      currentPage,
      pageSize,
      totalItems,
      paginatedData,
    };
  },
};
</script>
