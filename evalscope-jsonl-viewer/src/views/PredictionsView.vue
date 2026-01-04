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
      @remove-recent-file="removeRecentFile"
    />

    <div>
      <el-checkbox v-model="showHistogram"> Token 分布统计 </el-checkbox>
      <el-checkbox v-model="showDistribution">
        Stop Reason 分布统计
      </el-checkbox>
    </div>

    <HistogramCard
      v-if="showHistogram"
      :table-data="tableData"
      title="Token 分布统计"
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
    />

    <!-- 表格 -->
    <el-table
      v-if="tableData.length"
      :data="paginatedData"
      style="width: 100%; margin-top: 20px"
      @filter-change="onTableFilterChange"
      border
    >
      <el-table-column prop="index" label="#" width="100" sortable />
      <el-table-column prop="id" label="ID" width="200" />
      <el-table-column prop="content" label="Content" width="500">
        <template #default="{ row }">
          <span>{{ truncateText(row.content.text, 100) }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="input_tokens" label="Input Tokens" />
      <el-table-column prop="output_tokens" label="Output Tokens" />
      <el-table-column prop="total_tokens" label="Total Tokens" />
      <el-table-column label="len(content)">
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
      </el-table-column>
      <el-table-column
        column-key="stop_reason"
        prop="stop_reason"
        label="Stop Reason"
        :filters="stopReasonFilters"
      />
      <el-table-column label="Completion">
        <template #default="{ row }">
          <el-button type="text" @click="showDialog(row.content || {})"
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
      :title="'详情'"
      @update:dialogVisible="(val) => (dialogVisible = val)"
    />
  </div>
</template>

<script>
import { ref, watch, onMounted } from 'vue';
import FileToolbar from '@/components/FileToolbar.vue';
import DetailDialog from '@/components/DetailDialog.vue';
import HistogramCard from '@/components/HistogramCard.vue';
import DistributionCard from '@/components/DistributionCard.vue';

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
    HistogramCard,
    DistributionCard,
  },

  setup() {
    const showHistogram = ref(true);
    const showDistribution = ref(false);

    onMounted(() => {
      const histCache = localStorage.getItem('showHistogram');
      const distCache = localStorage.getItem('showDistribution');
      if (histCache !== null) showHistogram.value = histCache === 'true';
      if (distCache !== null) showDistribution.value = distCache === 'true';
    });

    // 监听变化并写入缓存
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
        // 找第一个 reasoning 类型
        const reasoningItem = rawContent.find(
          (item) => item.type === 'reasoning'
        );
        // 找第一个 text 类型
        const textItem = rawContent.find((item) => item.type === 'text');

        return {
          reasoning: reasoningItem ? reasoningItem.reasoning || null : null,
          text: textItem ? textItem.text || '' : '',
        };
      }

      // 其它情况，没找到，兜底
      return { reasoning: null, text: '' };
    };

    const parseJsonlPredictions = (text) => {
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
              pred: '', // 原数据里没有，这里先空着
              gold: '', // 同上
              result: '', // 同上
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
      currentPage,
      pageSize,
      filteredData,
      paginatedData,
      totalItems,
      totalVisibleItems,
      createColumnFilter,
      onTableFilterChange,
      reset,
    } = tableModel;

    const { filters: stopReasonFilters } = createColumnFilter('stop_reason');

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
      hintText: '⚠️ 请上传 predictions 目录下的 JSONL 文件',
    });

    return {
      showHistogram,
      showDistribution,
      formatContentLength,
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
      reset,
      stopReasonFilters,
    };
  },
};
</script>

<style scoped>
.toggle-buttons {
  gap: 12px;
}
</style>
