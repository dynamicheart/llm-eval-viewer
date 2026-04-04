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

    <DistributionCard
      :tableData="tableData"
      fieldName="result"
      fieldLabel="Result"
      @filter="quickFilterResult"
    />

    <!-- 表格 -->
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
              color: meta.status === 'error' ? '#f56c6c' : undefined,
              fontWeight: meta.status === 'error' ? 600 : undefined,
            }"
          >
            {{ meta.text }}
          </span>
        </template>
      </el-table-column>
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

    <CurlInvokeDialog
      v-model:dialogVisible="curlDialogVisible"
      :raw-json="currentRow"
    />
  </div>
</template>

<script>
import { ref, computed, watch, onMounted } from 'vue';
import { ElMessage } from 'element-plus';

import FileToolbar from '@/components/FileToolbar.vue';
import DetailDialog from '@/components/DetailDialog.vue';
import DistributionCard from '@/components/DistributionCard.vue';
import CurlInvokeDialog from '@/components/CurlInvokeDialog.vue';
import TableHeaderSearch from '@/components/TableHeaderSearch.vue';
import DirBrowserDrawer from '@/components/DirBrowserDrawer.vue';

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
    const curlDialogVisible = ref(false);
    const currentRow = ref(null);

    const idKeyword = ref('');

    const sidebarWidth = ref(
      Number(localStorage.getItem('dir_sidebar_width')) || 380
    );

    function openCurlDialog(row) {
      currentRow.value = row;
      curlDialogVisible.value = true;
    }

    const resultDistribution = computed(() => {
      const total = tableData.value.length;
      if (total === 0) return [];

      const countMap = {};
      tableData.value.forEach((item) => {
        const key = item.result ?? '未知';
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
                content: '解析失败，无法获取 solution',
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

    // ===== 共享目录浏览器 =====
    const {
      dirTree,
      activeFileKey,
      hasDir,
      showSidebar,
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

    /** 每个文件的解析数据缓存（内存中，不持久化） */
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
      const fileKey = buildFileKey(node, 'reviews');

      activeFileKey.value = fileKey;
      setSelectedRun(node.runDir, node.datasetName);

      if (dataCache.has(fileKey)) {
        tableData.value = dataCache.get(fileKey);
      } else {
        const text = await readRunFile(node.handle, 'reviews');
        if (!text) {
          ElMessage.warning('未找到 reviews JSONL 文件');
          return;
        }
        parseJsonlReviews(text);
        dataCache.set(fileKey, [...tableData.value]);
      }

      currentFileName.value = `${node.datasetName} / ${node.label}`;
      idKeyword.value = '';
      reset();
    }

    /** 单文件选择时切换回 file 模式 */
    function onHandleFileSelect(file) {
      setBrowseMode('file');
      activeFileKey.value = '';
      handleFileSelect(file);
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
      hintText: '⚠️ 请上传 reviews 目录下的 JSONL 文件',
    });

    // 模式切换时清空当前视图的单文件状态
    watch(browseMode, (mode) => {
      if (mode === 'directory') {
        tableData.value = [];
        idKeyword.value = '';
        reset();
        currentFileName.value = '';
      }
    });

    // 页面加载时尝试恢复目录，并自动加载上次选中的文件
    onMounted(async () => {
      const restored = await tryRestoreCachedHandle();
      if (restored) {
        const node = findSelectedNode();
        if (node) await onSelectRun(node);
      }
    });

    return {
      curlDialogVisible,
      currentRow,
      idKeyword,
      openCurlDialog,
      sidebarWidth,
      resultDistribution,
      // dir browser (共享)
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
