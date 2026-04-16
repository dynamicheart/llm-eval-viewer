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
      :enable-dir-picker="false"
      accept=".json,.jsonl,.ndjson,.log,.txt,.csv,.tsv"
      :button-text="$t('fileToolbar.selectFile')"
      @handle-file-select="onHandleFileSelect"
      @open-recent-file="onOpenRecentFile"
      @clear-recent-files="clearRecentFiles"
      @reset-file="resetFile"
      @remove-recent-file="removeRecentFile"
    />

    <div v-if="samplePromptVisible" class="sample-prompt">
      <span>{{ $t('sample.prompt') }}</span>
      <el-button type="primary" size="small" @click="loadSample">{{ $t('sample.loadSample') }}</el-button>
      <el-button size="small" text @click="dismissSample">{{ $t('sample.dismiss') }}</el-button>
    </div>

    <template v-if="tableData.length">
      <!-- Stats controls -->
      <div class="stats-controls">
        <el-checkbox v-model="showDistribution">
          {{ $t('custom.fieldDistribution') }}
        </el-checkbox>
        <el-checkbox v-model="showHistogram">
          {{ $t('custom.numericDistribution') }}
        </el-checkbox>
        <el-button size="small" @click="showFieldConfig = true">
          {{ $t('custom.fieldConfig') }}
        </el-button>
      </div>

      <!-- Expand info banner -->
      <div v-if="expandInfo.length" class="expand-banner">
        {{ $t('custom.autoExpanded') }} {{ expandInfo.join(', ') }}
      </div>

      <!-- Distribution cards -->
      <template v-if="showDistribution">
        <DistributionCard
          v-for="fieldKey in activeDistFields"
          :key="'dist-' + fieldKey"
          :items="distributions[fieldKey] || []"
          :fieldLabel="getFieldLabel(fieldKey)"
          @filter="(val) => quickFilter(fieldKey, val)"
        />
      </template>

      <!-- Histogram cards -->
      <HistogramCard
        v-if="showHistogram && activeHistFields.length"
        :histogram-data="histogramData"
        :total-samples="globalStats.totalSamples"
        :title="$t('custom.numericDistribution')"
        :fields="activeHistFields"
      />

      <!-- Table -->
      <el-table
        v-if="tableData.length"
        :data="paginatedData"
        style="width: 100%; margin-top: 20px"
        max-height="calc(100vh - 280px)"
        @filter-change="onTableFilterChange"
        @sort-change="onTableSortChange"
        border
      >
        <el-table-column prop="index" label="#" width="70" sortable />

        <el-table-column
          v-for="col in activeColumns"
          :key="col.key"
          :prop="col.key"
          :column-key="col.key"
          :label="col.label"
          :sortable="col.sortable ? 'custom' : false"
          :min-width="getColumnMinWidth(col)"
          :filters="col.filterable ? getColumnFilters(col.key) : undefined"
          :filtered-value="activeFilters[col.key] || []"
          show-overflow-tooltip
        >
          <template v-if="col.searchable" #header>
            <TableHeaderSearch
              :label="col.label"
              v-model="keywordRefs[col.key]"
              :placeholder="$t('custom.searchPrefix') + col.label"
              @change="(v) => setKeywordFilter(col.key, v)"
            />
          </template>

          <template #default="{ row }">
            <template v-if="col.detectedType === 'conversation'">
              <span class="clickable-cell conversation-cell" @click="openConversation(row[col.key], row, col.key)">
                <span class="conversation-tag">chat</span>
                {{ truncateText(String(row[col.key] ?? ''), 80) }}
              </span>
            </template>
            <template v-else-if="col.previewable">
              <el-tooltip
                v-if="isLongValue(row[col.key])"
                raw-content
                :content="previewHtml(String(row[col.key] ?? ''))"
                placement="top"
                :show-after="300"
                popper-class="preview-tooltip"
              >
                <span class="clickable-cell" @click="showDialog(String(row[col.key] ?? ''))">
                  {{ truncateText(String(row[col.key] ?? ''), 80) }}
                </span>
              </el-tooltip>
              <span v-else class="clickable-cell" @click="showDialog(String(row[col.key] ?? ''))">
                {{ truncateText(String(row[col.key] ?? ''), 80) }}
              </span>
            </template>
            <template v-else-if="col.detectedType === 'boolean'">
              <el-tag type="info" size="small" effect="plain">
                {{ row[col.key] }}
              </el-tag>
            </template>
            <template v-else-if="col.detectedType === 'number'">
              {{ formatNumber(row[col.key]) }}
            </template>
            <template v-else>
              {{ row[col.key] }}
            </template>
          </template>
        </el-table-column>

        <el-table-column label="JSON" width="80" fixed="right">
          <template #default="{ row }">
            <el-button type="text" size="small" @click="showRawJsonDialog(row)">
              {{ $t('common.view') }}
            </el-button>
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

    <FieldConfigPanel
      :visible="showFieldConfig"
      :field-config="fieldConfig"
      :field-tree="fieldTree"
      :enum-fields="enumFields"
      :numeric-fields="numericFields"
      :stats-config="fieldConfig?.statsConfig"
      :presets="presets"
      :active-preset-id="activePresetId"
      :schema-snapshot="schemaSnapshot"
      @close="showFieldConfig = false"
      @save="onFieldConfigSave"
      @stats-change="onStatsChange"
      @reset="onFieldReset"
      @save-preset="onSavePreset"
      @apply-preset="onApplyPreset"
      @delete-preset="onDeletePreset"
      @clear-preset="clearActivePreset"
      @toggle-group="onToggleGroup"
    />

    <ConversationDialog
      :visible="conversationVisible"
      :text="conversationText"
      :messages="conversationMessages"
      :title="$t('custom.conversationTitle')"
      @update:visible="(val) => (conversationVisible = val)"
    />
  </div>
</template>

<script>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

import FileToolbar from '@/components/FileToolbar.vue';
import DetailDialog from '@/components/DetailDialog.vue';
import HistogramCard from '@/components/HistogramCard.vue';
import DistributionCard from '@/components/DistributionCard.vue';
import TableHeaderSearch from '@/components/TableHeaderSearch.vue';
import FieldConfigPanel from '@/components/FieldConfigPanel.vue';
import ConversationDialog from '@/components/ConversationDialog.vue';

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
import { useFieldConfig } from '@/composables/useFieldConfig';
import { useDynamicViewStats } from '@/composables/useDynamicViewStats';
import { SAMPLE_CUSTOM_TEXT } from '@/data/sampleData';
import CustomWorker from '@/workers/customParser.worker.js?worker';

export default {
  components: {
    FileToolbar,
    DetailDialog,
    HistogramCard,
    DistributionCard,
    TableHeaderSearch,
    FieldConfigPanel,
    ConversationDialog,
  },

  setup() {
    const { t } = useI18n();
    const showDistribution = usePersistedToggle('custom_showDistribution', true);
    const showHistogram = usePersistedToggle('custom_showHistogram', true);
    const showFieldConfig = ref(false);
    const conversationVisible = ref(false);
    const conversationText = ref('');
    const conversationMessages = ref(null);
    const samplePromptVisible = ref(false);

    const ONBOARDED_KEY = 'custom_viewer_onboarded';

    // ===== Table model =====
    const tableModel = useTableModel();
    const {
      tableData, filteredData, paginatedData,
      currentPage, pageSize, totalItems, totalVisibleItems,
      activeFilters, createColumnFilter,
      onTableFilterChange, setKeywordFilter, setColumnFilter, onTableSortChange,
      reset,
    } = tableModel;

    // ===== Field configuration =====
    const fieldConfigState = useFieldConfig();
    const {
      fieldConfig,
      lastFileId,
      activeColumns,
      enumFields,
      numericFields,
      fieldTree,
      initFromMeta,
      saveConfig: saveFieldConfig,
      toggleGroupVisibility,
      setStatsConfig,
      resetToDefaults,
      presets,
      activePresetId,
      savePreset,
      applyPreset,
      clearActivePreset,
      deletePreset,
      clearAllConfigs,
    } = fieldConfigState;

    // ===== Schema snapshot =====
    const schemaSnapshot = ref(null);

    // ===== Expanded field info =====
    const expandInfo = ref([]);

    // ===== Dynamic keyword refs =====
    const keywordRefs = reactive({});

    watch(activeColumns, (cols) => {
      const activeKeys = new Set(cols.filter((c) => c.searchable).map((c) => c.key));
      for (const key of Object.keys(keywordRefs)) {
        if (!activeKeys.has(key)) delete keywordRefs[key];
      }
      for (const key of activeKeys) {
        if (!(key in keywordRefs)) keywordRefs[key] = '';
      }
    }, { immediate: true });

    // ===== Column filter cache =====
    const columnFilterMap = new Map();

    function getColumnFilters(key) {
      if (!columnFilterMap.has(key)) {
        columnFilterMap.set(key, createColumnFilter(key));
      }
      return columnFilterMap.get(key).filters.value;
    }

    // Clear filter cache when table data changes (new file)
    watch(tableData, () => {
      columnFilterMap.clear();
    });

    // ===== Dynamic stats =====
    const activeDistFields = computed(() => {
      return fieldConfig.value?.statsConfig?.distributionFields || [];
    });

    const activeHistFields = computed(() => {
      return (fieldConfig.value?.statsConfig?.histogramFields || [])
        .map((key) => {
          const f = fieldConfig.value?.fields?.find((f) => f.key === key);
          return f ? { key: f.key, label: f.label, color: '#409EFF' } : null;
        })
        .filter(Boolean);
    });

    const { distributions, histogramData, globalStats } = useDynamicViewStats(tableData, {
      getDistributionFields: () => activeDistFields.value,
      getHistogramFields: () => activeHistFields.value,
    });

    // ===== Helper functions =====
    function getFieldLabel(key) {
      const f = fieldConfig.value?.fields?.find((f) => f.key === key);
      return f?.label || key;
    }

    function isLongValue(value) {
      return typeof value === 'string' && value.length > 100;
    }

    function formatNumber(value) {
      if (typeof value !== 'number') return value;
      return value.toLocaleString();
    }

    /**
     * Parse conversation text "[role] content" into object for DetailDialog,
     * which renders reasoning+text with Text/Markdown sub-views.
     */
    function formatConversationHtml(text) {
      if (!text || typeof text !== 'string') return text;
      const lines = text.split('\n');
      const parts = [];
      for (const line of lines) {
        const match = line.match(/^\[(system|user|assistant|human|ai|bot)\]\s*(.*)/i);
        if (match) {
          const role = match[1].toLowerCase();
          const content = match[2];
          if (role === 'system' || role === 'human') {
            parts.push({ reasoning: content, text: '' });
          } else {
            parts.push({ reasoning: '', text: content });
          }
        } else if (line.trim()) {
          // Continuation line — append to last part
          const last = parts[parts.length - 1];
          if (last) {
            if (last.text) last.text += '\n' + line;
            else last.reasoning += '\n' + line;
          }
        }
      }
      // Merge consecutive same-type parts
      const merged = [];
      for (const part of parts) {
        const prev = merged[merged.length - 1];
        if (prev && !prev.text === !part.text) {
          if (part.text) prev.text += '\n\n' + part.text;
          else prev.reasoning += '\n\n' + part.reasoning;
        } else {
          merged.push({ ...part });
        }
      }
      return merged.length === 1 && !merged[0].reasoning
        ? merged[0].text
        : merged;
    }

    /**
     * Navigate an object by dot-separated path.
     */
    function getNestedValue(obj, path) {
      const keys = path.split('.');
      let current = obj;
      for (const key of keys) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[key];
      }
      return current;
    }

    /**
     * Open conversation dialog. Tries to extract structured messages from
     * the row's _raw_* field so ConversationDialog can render them directly
     * (avoiding the serialize→parse roundtrip).
     */
    function openConversation(cellValue, row, colKey) {
      conversationMessages.value = null;
      conversationText.value = cellValue || '';

      if (row && colKey) {
        const dotIdx = colKey.indexOf('.');
        if (dotIdx > 0) {
          // Nested field like "RequestData.messages" → look up _raw_RequestData
          const rootKey = colKey.substring(0, dotIdx);
          const subPath = colKey.substring(dotIdx + 1);
          const rawKey = `_raw_${rootKey}`;
          const rawJson = row[rawKey];
          if (rawJson && typeof rawJson === 'string') {
            try {
              const parsed = JSON.parse(rawJson);
              const messages = getNestedValue(parsed, subPath);
              if (Array.isArray(messages) && messages.length > 0 && messages[0]?.role) {
                conversationMessages.value = messages;
              }
            } catch { /* fallback to text */ }
          }
        } else {
          // Top-level field — check if the cell value is a JSON messages array
          const raw = row[colKey];
          if (typeof raw === 'string') {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.role) {
                conversationMessages.value = parsed;
              }
            } catch { /* fallback to text */ }
          }
        }
      }

      conversationVisible.value = true;
    }

    function getColumnMinWidth(col) {
      if (col.detectedType === 'number') return 100;
      if (col.detectedType === 'boolean') return 80;
      if (col.detectedType === 'enum') return 120;
      if (col.previewable) return 200;
      return 150;
    }

    function quickFilter(fieldKey, value) {
      setColumnFilter(fieldKey, [value]);
    }

    // ===== Worker-based parser =====
    // Use a wrapper so the parser can be reconfigured per-file
    // (useFileHandler destructures parseData from options, so we need indirection)
    let currentParseFn = (text, onProgress) => Promise.resolve({ rows: [], fieldMeta: { detectedFields: [], expandCandidates: [] } });

    const parseCustom = (text, onProgress) => currentParseFn(text, onProgress);

    function createWorkerParse() {
      return (text, onProgress) => {
        return new Promise((resolve) => {
          const worker = new CustomWorker();
          worker.onmessage = (e) => {
            if (e.data.type === 'progress') {
              if (onProgress) onProgress(e.data.percent);
            } else if (e.data.type === 'done') {
              worker.terminate();
              resolve({
                rows: e.data.rows,
                fieldMeta: e.data.fieldMeta,
              });
            }
          };
          worker.onerror = (err) => {
            console.error('Custom parser error:', err);
            worker.terminate();
            resolve({ rows: [], fieldMeta: { detectedFields: [], expandCandidates: [] } });
          };
          worker.postMessage({
            text,
            expandNestedJsonStrings: true,
          });
        });
      };
    }

    // ===== File handler =====
    let currentFileId = null;

    const fileHandler = useFileHandler({
      storageNamespace: 'custom_viewer',
      storageKey: 'custom_viewer_cache',
      listFiles, getFile, saveFile, clearFiles, deleteFile,
      parseData: parseCustom,
      tableModel,
      parserVersion: '3',
      onParseResult: (result) => {
        if (result.fieldMeta) {
          // Use currentFileId if set (user action), otherwise fallback to localStorage
          const fileId = currentFileId || localStorage.getItem('custom_viewer_cache');
          if (fileId) {
            currentFileId = fileId;
            expandInfo.value = result.fieldMeta.expandCandidates || [];
            schemaSnapshot.value = result.fieldMeta.schemaSnapshot || null;
            initFromMeta(fileId, result.fieldMeta);
          }
        }
      },
      hintText: t('custom.hintText'),
    });

    const {
      hintText, recentFiles, formatSize, formatTime,
      clearRecentFiles: _clearRecentFiles, resetFile, removeRecentFile,
      currentFileName,
      dialogVisible, dialogHasTabs, dialogTabsData, dialogContent, dialogRawText,
      showDialog, showRawJsonDialog,
      truncateText,
    } = fileHandler;

    async function clearRecentFiles() {
      await _clearRecentFiles();
      clearAllConfigs();
      resetFile();
      reset();
      currentFileId = null;
      columnFilterMap.clear();
      expandInfo.value = [];
      schemaSnapshot.value = null;
    }

    // Wrap file select to set up the parser
    async function onHandleFileSelect(file) {
      currentFileId = `${file.name}-${file.size}-${file.lastModified}`;
      columnFilterMap.clear();
      currentParseFn = createWorkerParse();
      await fileHandler.handleFileSelect(file);
    }

    async function onOpenRecentFile(item) {
      currentFileId = item.id;
      columnFilterMap.clear();
      currentParseFn = createWorkerParse();
      await fileHandler.openRecentFile(item);
    }

    function onFieldConfigSave() {
      saveFieldConfig();
      showFieldConfig.value = false;
    }

    function onStatsChange(config) {
      setStatsConfig(config.distributionFields, config.histogramFields);
    }

    function onFieldReset() {
      resetToDefaults();
    }

    function onToggleGroup(groupKey) {
      toggleGroupVisibility(groupKey);
    }

    function onSavePreset(name) {
      savePreset(name);
    }

    function onApplyPreset(presetId) {
      applyPreset(presetId);
    }

    function onDeletePreset(presetId) {
      deletePreset(presetId);
    }

    async function loadSample() {
      const sampleName = t('sample.sampleName.custom');
      // Must match the ID format used by loadSampleText: `${name}-${text.length}-0`
      currentFileId = `${sampleName}-${SAMPLE_CUSTOM_TEXT.length}-0`;
      columnFilterMap.clear();
      currentParseFn = createWorkerParse();
      await fileHandler.loadSampleText(sampleName, SAMPLE_CUSTOM_TEXT);
      localStorage.setItem(ONBOARDED_KEY, '1');
      samplePromptVisible.value = false;
    }

    function dismissSample() {
      localStorage.setItem(ONBOARDED_KEY, '1');
      samplePromptVisible.value = false;
    }

    onMounted(() => {
      // Show sample prompt only for first-time users:
      // no onboarded flag AND no previously opened file in cache
      const hasCache = !!localStorage.getItem('custom_viewer_cache');
      if (!hasCache && !localStorage.getItem(ONBOARDED_KEY)) {
        samplePromptVisible.value = true;
      }
    });

    return {
      // Stats toggles
      showDistribution,
      showHistogram,
      showFieldConfig,
      conversationVisible,
      conversationText,
      conversationMessages,
      expandInfo,
      // Sample prompt
      samplePromptVisible,
      loadSample,
      dismissSample,
      // Field config
      fieldConfig,
      activeColumns,
      enumFields,
      numericFields,
      fieldTree,
      schemaSnapshot,
      getFieldLabel,
      // Presets
      presets,
      activePresetId,
      clearActivePreset,
      // Dynamic stats
      activeDistFields,
      activeHistFields,
      distributions,
      histogramData,
      globalStats,
      // Table
      tableData, currentPage, pageSize,
      filteredData, paginatedData,
      totalItems, totalVisibleItems,
      onTableFilterChange, onTableSortChange,
      activeFilters,
      keywordRefs,
      getColumnFilters,
      setKeywordFilter,
      quickFilter,
      // Helpers
      previewHtml,
      truncateText,
      isLongValue,
      formatNumber,
      openConversation,
      getColumnMinWidth,
      // File handler
      hintText, formatSize, formatTime,
      clearRecentFiles, recentFiles, resetFile, removeRecentFile,
      currentFileName,
      dialogVisible, dialogHasTabs, dialogTabsData, dialogContent, dialogRawText,
      showDialog, showRawJsonDialog,
      // Actions
      onHandleFileSelect,
      onOpenRecentFile,
      onFieldConfigSave,
      onStatsChange,
      onFieldReset,
      onToggleGroup,
      onSavePreset,
      onApplyPreset,
      onDeletePreset,
    };
  },
};
</script>

<style scoped>
.stats-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.expand-banner {
  margin-top: 8px;
  padding: 8px 12px;
  border-left: 4px solid var(--ev-color-primary);
  background: var(--ev-bg-banner-start);
  border-radius: 4px;
  font-size: 13px;
  color: var(--ev-text-primary);
}

/* Ensure filter popover is not clipped by fixed table header */
:deep(.el-table__header-wrapper) {
  overflow: visible;
}

.conversation-tag {
  display: inline-block;
  font-size: 10px;
  color: var(--ev-color-primary);
  background: var(--ev-color-primary-light-9, rgba(64, 158, 255, 0.1));
  padding: 0 4px;
  border-radius: 3px;
  margin-right: 4px;
  font-weight: 600;
  vertical-align: middle;
}
</style>
