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
      :hint="$t('dirBrowser.scanDepthHint')"
      @select-run="onSelectDirFile"
      @resize="w => sidebarWidth = w"
    />

    <FileToolbar
      :hint-text="hintText"
      :recent-files="recentFiles"
      :current-file-name="currentFileName"
      :format-size="formatSize"
      :format-time="formatTime"
      :enable-dir-picker="supportsDirectoryPicker"
      :supports-dir-picker="supportsDirectoryPicker"
      :browse-mode="browseMode"
      :data-source="dataSource"
      :show-paste="true"
      :dir-name="dirName"
      :dir-file-count="dirFileCount"
      :recent-dirs="recentDirs"
      accept=".json,.jsonl,.ndjson,.log,.txt,.csv,.tsv,.jsonl.gz,.jsonl.zst,.json.gz,.json.zst,.gz,.zst"
      :button-text="$t('fileToolbar.selectFile')"
      @handle-file-select="onHandleFileSelect"
      @open-recent-file="onOpenRecentFile"
      @clear-recent-files="clearRecentFiles"
      @reset-file="resetFile"
      @remove-recent-file="removeRecentFile"
      @open-directory="onOpenCustomDirectory"
      @restore-directory="onRestoreCustomDirectory"
      @remove-recent-dir="removeCachedDirHandle"
      @paste="pasteDialogVisible = true"
    />

    <div v-if="samplePromptVisible" class="sample-prompt">
      <span>{{ $t('sample.prompt') }}</span>
      <el-button type="primary" size="small" @click="loadSample">{{ $t('sample.loadSample') }}</el-button>
      <el-button size="small" text @click="dismissSample">{{ $t('sample.dismiss') }}</el-button>
    </div>

    <!-- Paste JSON dialog -->
    <el-dialog v-model="pasteDialogVisible" :title="$t('custom.pasteJsonTitle')" width="600px" :close-on-click-modal="false">
      <el-input
        v-model="pasteText"
        type="textarea"
        :autosize="{ minRows: 8, maxRows: 20 }"
        :placeholder="$t('custom.pasteJsonPlaceholder')"
      />
      <template #footer>
        <el-button @click="pasteDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="!pasteText.trim()" @click="onPasteConfirm">{{ $t('common.view') }}</el-button>
      </template>
    </el-dialog>

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
        <el-button v-if="debugMode" size="small" plain @click="pipelineDebugVisible = true">
          {{ $t('custom.debug') }}
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
        <el-table-column prop="__index" label="#" width="70" sortable :formatter="(row) => row.__index != null ? row.__index + 1 : ''" />

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
          <template #header>
            <template v-if="col.searchable">
              <TableHeaderSearch
                :label="col.label"
                v-model="keywordRefs[col.key]"
                :placeholder="$t('custom.searchPrefix') + col.label"
                @change="(v) => setKeywordFilter(col.key, v)"
              />
            </template>
            <template v-else-if="col.key.includes('.')">
              <span class="nested-key-header">
                {{ col.label }}
                <el-tooltip :content="col.key" placement="top" :show-after="300" :enterable="false">
                  <span class="nested-key-icon">?</span>
                </el-tooltip>
              </span>
            </template>
            <span v-else>{{ col.label }}</span>
          </template>

          <template #default="{ row }">
            <template v-if="col.detectedType === 'conversation' || col.detectedType === 'toolList'">
              <el-tooltip
                placement="top"
                :show-after="300"
                popper-class="preview-tooltip"
              >
                <template #content>
                  <div v-if="col.detectedType === 'toolList'">
                    <div v-for="(tool, i) in (getRowValue(row, col.key) || [])" :key="i" style="margin-bottom:4px">
                      <b>{{ tool.function?.name || tool.name || `#${i}` }}</b><span v-if="tool.function?.description" style="color:#999;margin-left:4px">{{ tool.function.description }}</span>
                    </div>
                  </div>
                  <div v-else-if="isMultiConversationArray(getRowValue(row, col.key))">
                    <div v-for="(conv, ci) in (getRowValue(row, col.key) || [])" :key="ci" style="margin-bottom:6px; border-bottom: 1px solid #eee; padding-bottom: 4px;">
                      <div style="font-weight:600; font-size:12px; margin-bottom:2px; color:#666">{{ $t('custom.conversationTab', { idx: ci + 1 }) }} ({{ conv.length }} msgs)</div>
                      <div v-for="(msg, i) in conv.slice(0, 3)" :key="i" style="margin-bottom:1px">
                        <b :style="{color: msg.role === 'user' ? '#409eff' : msg.role === 'assistant' ? '#67c23a' : '#999'}">[{{ msg.role }}]</b> {{ truncateText(String(msg.content ?? ''), 100) }}
                      </div>
                      <div v-if="conv.length > 3" style="color:#999; font-size:11px">...</div>
                    </div>
                  </div>
                  <div v-else>
                    <div v-for="(msg, i) in (getRowValue(row, col.key) || [])" :key="i" style="margin-bottom:2px">
                      <b :style="{color: msg.role === 'user' ? '#409eff' : msg.role === 'assistant' ? '#67c23a' : '#999'}">[{{ msg.role }}]</b> {{ truncateText(String(msg.content ?? ''), 120) }}
                    </div>
                  </div>
                </template>
                <span class="clickable-cell conversation-cell" @click="openConversation(getRowValue(row, col.key), row, col.key, col)">
                  <span class="conversation-tag">{{ col.detectedType === 'toolList' ? 'tool' : 'chat' }}</span>
                  <span v-if="isMultiConversationArray(getRowValue(row, col.key))" class="conversation-count">{{ (getRowValue(row, col.key) || []).length }} convs</span>
                  <span v-else class="conversation-count">{{ countItems(getRowValue(row, col.key), col.detectedType) }}</span>
                  {{ previewCellValue(getRowValue(row, col.key)) }}
                </span>
              </el-tooltip>
            </template>
            <template v-else-if="col.detectedType === 'nestedArray'">
              <span class="clickable-cell conversation-cell" @click="showFieldJson(row, col.key)">
                <span class="conversation-tag" style="background: var(--el-color-info-light-9, rgba(144,147,153,0.1)); color: var(--el-color-info, #909399);">Array</span>
                {{ previewObjectValue(getRowValue(row, col.key)) }}
              </span>
            </template>
            <template v-else-if="col.detectedType === 'nestedObject'">
              <el-tooltip v-if="col.conversationPath" placement="top" :show-after="300">
                <template #content>
                  <div style="max-width:400px;max-height:200px;overflow:auto">
                    <div v-for="(msg, i) in getNestedMessages(row, col.key, col.conversationPath)" :key="i" style="margin-bottom:2px">
                      <b :style="{color: msg.role === 'user' ? '#409eff' : msg.role === 'assistant' ? '#67c23a' : '#999'}">[{{ msg.role }}]</b> {{ truncateText(String(msg.content ?? ''), 120) }}
                    </div>
                  </div>
                </template>
                <span class="clickable-cell conversation-cell" @click="openNestedConversation(row, col.key, col.conversationPath)">
                  <span class="conversation-tag">chat</span>
                  <span class="conversation-count">{{ countNestedMessages(getRowValue(row, col.key), col.conversationPath) }}</span>
                </span>
              </el-tooltip>
              <span v-else class="clickable-cell conversation-cell" @click="showFieldJson(row, col.key)">
                <span class="conversation-tag" style="background: var(--ev-color-success-light-9, rgba(103,194,58,0.1)); color: var(--ev-color-success, #67c23a);">JSON</span>
                {{ previewObjectValue(getRowValue(row, col.key)) }}
              </span>
            </template>
            <template v-else-if="col.previewable">
              <el-tooltip
                v-if="isLongValue(getRowValue(row, col.key))"
                raw-content
                :content="previewHtml(String(getRowValue(row, col.key) ?? ''))"
                placement="top"
                :show-after="300"
                popper-class="preview-tooltip"
              >
                <span class="clickable-cell" @click="showDialog(String(getRowValue(row, col.key) ?? ''))">
                  {{ truncateText(String(getRowValue(row, col.key) ?? ''), 80) }}
                </span>
              </el-tooltip>
              <span v-else class="clickable-cell" @click="showDialog(String(getRowValue(row, col.key) ?? ''))">
                {{ truncateText(String(getRowValue(row, col.key) ?? ''), 80) }}
              </span>
            </template>
            <template v-else-if="col.detectedType === 'boolean'">
              <el-tag type="info" size="small" effect="plain">
                {{ getRowValue(row, col.key) }}
              </el-tag>
            </template>
            <template v-else-if="col.detectedType === 'number'">
              {{ formatNumber(getRowValue(row, col.key)) }}
            </template>
            <template v-else>
              {{ getRowValue(row, col.key) }}
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
      :jsonData="dialogJsonData"
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
      :priority-debug="priorityDebug"
      :debug-mode="debugMode"
      :pattern-match-counts="patternMatchCounts"
      :plugin-config="pluginConfig"
      :registered-plugins="registeredPlugins"
      :pipeline-debug="pipelineDebug"
      @close="showFieldConfig = false"
      @save="onFieldConfigSave"
      @stats-change="onStatsChange"
      @reset="onFieldReset"
      @rerun-pipeline="onRerunPipeline"
      @save-config="onFieldConfigSave"
      @save-preset="onSavePreset"
      @apply-preset="onApplyPreset"
      @delete-preset="onDeletePreset"
      @clear-preset="clearActivePreset"
      @toggle-group="onToggleGroup"
      @plugin-toggle="onPluginToggle"
      @open-debug-dialog="onOpenDebugDialog"
    />

    <ConversationDialog
      :visible="conversationVisible"
      :text="conversationText"
      :messages="conversationMessages"
      :conversations="conversationMulti"
      :tools="conversationTools"
      :title="conversationTitle"
      :show-filter="true"
      :filter-placeholder="conversationFilterPlaceholder"
      :is-tool-list="conversationIsToolList"
      @update:visible="(val) => (conversationVisible = val)"
    />

    <DebugDialog
      v-if="debugMode"
      :visible="pipelineDebugVisible"
      :pipeline-debug="pipelineDebug"
      :pattern-match-counts="patternMatchCounts"
      @update:visible="(val) => (pipelineDebugVisible = val)"
      @reset="onFieldReset"
      @reset-config="onFieldReset"
      @plugin-toggle="onPluginToggle"
    />
  </div>
</template>

<script>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';

import FileToolbar from '@/components/FileToolbar.vue';
import DetailDialog from '@/components/DetailDialog.vue';
import HistogramCard from '@/components/HistogramCard.vue';
import DistributionCard from '@/components/DistributionCard.vue';
import TableHeaderSearch from '@/components/TableHeaderSearch.vue';
import FieldConfigPanel from '@/components/FieldConfigPanel.vue';
import DebugDialog from '@/components/DebugDialog.vue';
import ConversationDialog from '@/components/ConversationDialog.vue';
import DirBrowserDrawer from '@/components/DirBrowserDrawer.vue';

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
import { useFieldConfig, runWithoutAutoSave } from '@/composables/useFieldConfig';
import { useCustomDirBrowser } from '@/composables/useCustomDirBrowser';
import { useDebugMode, isDebugLogging } from '@/composables/useDebugMode';
import { useDynamicViewStats } from '@/composables/useDynamicViewStats';
import { SAMPLE_CUSTOM_TEXT } from '@/data/sampleData';
import { runPlugins, getRegisteredPlugins, getOptionalPlugins } from '@/plugins/pluginRegistry';
import { assignFieldVisibility, isMultiConversationArray } from '@/utils/customParserHelpers';
import { createLogger } from '@/utils/pipelineLogger';
import { runPipeline } from '@/utils/pipelineRunner';
import { pipelineDebug, populatePipelineDebug, resetPipelineDebug } from '@/utils/pipelineDebugStore';
import { formatNumber } from '@/utils/formatNumber';
import '@/plugins/reconstructDotNotation';
import '@/plugins/decodeNestedJson';
import '@/plugins/dedupNestedFields';
import '@/plugins/formatParse';
import '@/plugins/detectTypes';
import '@/plugins/scoring';
import '@/plugins/trajectoryParse';
import '@/plugins/hyevalParse';
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
    DirBrowserDrawer,
    DebugDialog,
  },

  setup() {
    const { t } = useI18n();
    const showDistribution = usePersistedToggle('custom_showDistribution', false);
    const showHistogram = usePersistedToggle('custom_showHistogram', false);
    const showFieldConfig = ref(false);
    const conversationVisible = ref(false);
    const conversationText = ref('');
    const conversationMessages = ref(null);
    const conversationMulti = ref(null);
    const conversationTools = ref(null);
    const conversationTitle = ref('');
    const conversationFilterPlaceholder = ref('');
    const conversationIsToolList = ref(false);
    const samplePromptVisible = ref(false);
    const pipelineDebugVisible = ref(false);
    const pasteDialogVisible = ref(false);
    const pasteText = ref('');
    const dataSource = ref(localStorage.getItem('custom_viewer_cache')?.startsWith('pasted-') ? 'paste' : '');

    function onOpenDebugDialog() {
      pipelineDebugVisible.value = true;
    }

    const ONBOARDED_KEY = 'custom_viewer_onboarded';

    // ===== Table model =====
    function getNestedValue(obj, path) {
      const parts = path.split('.');
      let current = obj;
      for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[part];
      }
      return current;
    }

    /**
     * Find the correct root key for a dot-notation colKey.
     * Handles dots inside field names (e.g. "V3.2" in key names).
     */
    function findRootKey(row, colKey) {
      // Check _reconstructed_ keys first
      for (const key of Object.keys(row)) {
        if (key.startsWith('_reconstructed_')) {
          const root = key.substring('_reconstructed_'.length);
          if (colKey === root || colKey.startsWith(root + '.')) return root;
        }
      }
      // Fallback: match top-level keys that are prefixes
      for (const key of Object.keys(row)) {
        if (key.startsWith('_')) continue;
        if (colKey === key || colKey.startsWith(key + '.')) return key;
      }
      return colKey.split('.')[0];
    }

    function resolveRowValue(row, colKey) {
      if (!colKey.includes('.')) return row[colKey];
      const rootKey = findRootKey(row, colKey);
      // If rootKey === colKey, dots are part of the key name, not nesting
      if (rootKey === colKey) return row[colKey];
      const reconObj = row[`_reconstructed_${rootKey}`];
      if (reconObj) {
        const val = getNestedValue(reconObj, colKey.substring(rootKey.length + 1));
        if (val !== undefined) return val;
      }
      // Use rootKey to get nested value from the original row object
      const rootVal = row[rootKey];
      if (rootVal != null && typeof rootVal === 'object') {
        const val = getNestedValue(rootVal, colKey.substring(rootKey.length + 1));
        if (val !== undefined) return val;
      }
      return row[`_decoded_${colKey}`];
    }

    const tableModel = useTableModel({ getValue: resolveRowValue });
    const {
      tableData, filteredData, paginatedData,
      currentPage, pageSize, totalItems, totalVisibleItems,
      activeFilters, createColumnFilter,
      onTableFilterChange, setKeywordFilter, setColumnFilter, onTableSortChange,
      reset,
    } = tableModel;

    // ===== Field configuration =====
    const fieldConfigState = useFieldConfig();
    const { debugMode } = useDebugMode();

    const {
      fieldConfig,
      lastFileId,
      activeColumns,
      enumFields,
      numericFields,
      fieldTree,
      initFromMeta,
      updateFromPluginMeta,
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
      priorityDebug,
      patternMatchCounts,
    } = fieldConfigState;

    // ===== Schema snapshot =====
    const schemaSnapshot = ref(null);

    // ===== Expanded field info =====
    const expandInfo = ref([]);

    // ===== Raw data cache for plugin re-processing =====
    const _rawRows = ref([]);
    const _rawFieldMeta = ref(null);

    // ===== Plugin processing =====
    const {
      pluginConfig,
      togglePlugin,
    } = fieldConfigState;

    const registeredPlugins = getRegisteredPlugins();
    const viewLogger = createLogger('CustomViewer');

    function applyPlugins() {
      if (!_rawRows.value.length || !_rawFieldMeta.value) return;
      viewLogger.header('Re-apply Plugins (toggle)');
      const t = viewLogger.time('applyPlugins');
      const { rows, fieldMeta, debug: pipelineDebugData } = runPipeline(null, {
        cachedRecords: _rawRows.value,
        detectedFormat: _rawFieldMeta.value._detectedFormat,
        expandNestedJsonStrings: true,
        enabledPluginIds: pluginConfig.value.enabledPlugins,
      });
      tableData.value = rows;
      updateFromPluginMeta(lastFileId.value, fieldMeta);

      // Update pipeline debug store so the debug panel reflects new plugin states
      populatePipelineDebug({
        cache: { status: 'hit', fileId: lastFileId.value, parserVersion: '3' },
        pipeline: {
          timings: {},
          detectedFormat: _rawFieldMeta.value._detectedFormat || 'unknown',
          rowCount: rows.length,
          stages: pipelineDebugData || [],
        },
        scoring: {
          debugMeta: fieldMeta.priorityDebug || [],
          patternMatchCounts: fieldMeta.patternMatchCounts || {},
          fieldTree: fieldMeta.detectedFieldsTree || [],
        },
        samples: {
          original: _rawRows.value[0] || null,
          afterPlugins: rows[0] || null,
        },
      });

      viewLogger.detail(`result: ${rows.length} rows, ${(fieldMeta.detectedFields || []).length} fields`);
      t();
    }

    function onPluginToggle({ id, enabled }) {
      const idx = pluginConfig.value.enabledPlugins.indexOf(id);
      if (enabled && idx < 0) {
        pluginConfig.value.enabledPlugins.push(id);
      } else if (!enabled && idx >= 0) {
        pluginConfig.value.enabledPlugins.splice(idx, 1);
      }
      applyPlugins();
    }

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
      getValue: resolveRowValue,
    });

    // ===== Helper functions =====
    function getFieldLabel(key) {
      const f = fieldConfig.value?.fields?.find((f) => f.key === key);
      return f?.label || key;
    }

    function isLongValue(value) {
      return typeof value === 'string' && value.length > 100;
    }

    /**
     * Clean a row object for JSON display (remove internal fields).
     */
    function cleanRowForJson(row) {
      const clean = { ...row };
      for (const key of Object.keys(clean)) {
        if (key.startsWith('_raw_') || key.startsWith('_reconstructed_') || key.startsWith('_plugin_') || key.startsWith('_decoded_') || key === '_rawJsonText' || key === '__index') {
          delete clean[key];
        }
      }
      return clean;
    }

    /**
     * Show JSON dialog for a single reconstructed field (e.g. RequestData).
     */
    function showFieldJson(row, colKey) {
      // Use resolveRowValue to handle dot-notation nested paths
      const directValue = resolveRowValue(row, colKey);
      if (directValue != null && typeof directValue === 'object') {
        dialogHasTabs.value = false;
        dialogJsonData.value = directValue;
        dialogRawText.value = JSON.stringify(directValue, null, 2);
        dialogVisible.value = true;
        return;
      }

      // Fallback: try _reconstructed_ / _decoded_ keys
      const dotIdx = colKey.indexOf('.');
      const rootKey = dotIdx > 0 ? colKey.substring(0, dotIdx) : colKey;
      const subPath = dotIdx > 0 ? colKey.substring(dotIdx + 1) : null;

      let jsonObj = row[`_reconstructed_${rootKey}`] || row[`_decoded_${colKey}`];
      if (jsonObj) {
        const source = row[`_reconstructed_${rootKey}`] ? `_reconstructed_${rootKey}` : `_decoded_${colKey}`;
        viewLogger.trace(`showFieldJson '${colKey}' → ${source}`);
      }
      if (subPath && jsonObj) {
        jsonObj = getNestedValue(jsonObj, subPath);
      }

      if (jsonObj && typeof jsonObj === 'object') {
        const code = JSON.stringify(jsonObj, null, 2);
        dialogHasTabs.value = false;
        dialogJsonData.value = jsonObj;
        dialogRawText.value = code;
        dialogVisible.value = true;
      } else {
        showDialog(String(row[colKey] ?? ''));
      }
    }

    /**
     * Show JSON dialog with two tabs: original data and plugin-optimized data.
     */
    function showRawJsonDialog(row) {
      const hasPluginsEnabled = pluginConfig.value.enabledPlugins.length > 0;

      if (hasPluginsEnabled && _rawRows.value.length > 0) {
        // Find original row by its pipeline index
        const originalIndex = row.__index ?? 0;
        const originalRow = _rawRows.value[originalIndex];

        // Build enhanced row: replace reconstructed roots, remove flat sub-fields
        const enhancedRow = cleanRowForJson(row);

        // Find reconstructed roots from original row (before cleanRowForJson removed them)
        const reconstructedRoots = [];
        for (const key of Object.keys(row)) {
          if (key.startsWith('_reconstructed_')) {
            const rootKey = key.substring('_reconstructed_'.length);
            reconstructedRoots.push(rootKey);
            enhancedRow[rootKey] = row[key]; // Replace string with reconstructed object
          }
        }

        // Remove flat dot-notation sub-fields that were merged into reconstructed objects
        for (const rootKey of reconstructedRoots) {
          for (const key of Object.keys(enhancedRow)) {
            if (key !== rootKey && key.startsWith(rootKey + '.')) {
              delete enhancedRow[key];
            }
          }
        }

        // Replace decoded string values with actual objects (non-reconstructed fields only)
        const decodedKeys = [];
        for (const key of Object.keys(enhancedRow)) {
          const decodedObj = row[`_decoded_${key}`];
          if (decodedObj !== undefined) {
            enhancedRow[key] = decodedObj;
            decodedKeys.push(key);
          }
        }
        if (decodedKeys.length > 0) {
          viewLogger.trace(`showRawJsonDialog: applied _decoded_ for [${decodedKeys.join(', ')}]`);
        }

        // Two tabs: Enhanced + Original
        const rawCode = JSON.stringify(cleanRowForJson(originalRow || row), null, 2);
        const optCode = JSON.stringify(enhancedRow, null, 2);

        dialogHasTabs.value = true;
        dialogTabsData.value = [
          { name: 'enhanced', label: t('custom.enhancedData'), jsonData: enhancedRow, rawText: optCode },
          { name: 'raw', label: t('custom.rawData'), jsonData: JSON.parse(rawCode), rawText: rawCode },
        ];
        dialogJsonData.value = null;
        dialogRawText.value = '';
        dialogVisible.value = true;
      } else {
        // No plugins: use original single-tab dialog
        _showRawJsonDialog(row);
      }
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
    const getRowValue = resolveRowValue;

    /**
     * Open conversation dialog. Tries to extract structured messages from
     * the row's _raw_* field so ConversationDialog can render them directly
     * (avoiding the serialize→parse roundtrip).
     */
    function openConversation(cellValue, row, colKey, col) {
      conversationMessages.value = null;
      conversationMulti.value = null;
      // cellValue may be a string (text/JSON) or an array (reconstructed data)
      const textValue = typeof cellValue === 'string' ? cellValue : (Array.isArray(cellValue) ? JSON.stringify(cellValue) : '');
      conversationText.value = textValue;
      conversationTools.value = null;
      const isToolList = col?.detectedType === 'toolList';
      conversationTitle.value = isToolList ? t('custom.toolsTitle') : t('custom.conversationTitle');
      conversationFilterPlaceholder.value = isToolList ? t('custom.filterTools') : t('custom.filterConversation');
      conversationIsToolList.value = isToolList;

      if (row && colKey) {
        const dotIdx = colKey.indexOf('.');
        if (dotIdx > 0) {
          // Nested field like "RequestData.messages" → look up _raw_RequestData
          const rootKey = colKey.substring(0, dotIdx);
          const subPath = colKey.substring(dotIdx + 1);
          const rawKey = `_raw_${rootKey}`;
          const reconKey = `_reconstructed_${rootKey}`;

          // Try _reconstructed_ first (from plugins), then _raw_
          const rawJson = row[reconKey] ? JSON.stringify(row[reconKey]) : row[rawKey];
          if (rawJson && typeof rawJson === 'string') {
            try {
              const parsed = JSON.parse(rawJson);
              const nested = getNestedValue(parsed, subPath);
              if (Array.isArray(nested) && nested.length > 0) {
                if (isToolList) {
                  conversationTools.value = nested;
                } else if (isMultiConversationArray(nested)) {
                  conversationMulti.value = nested;
                } else if (nested[0]?.role) {
                  conversationMessages.value = nested;
                }
              }
            } catch { /* fallback to text */ }
          }

          // For toolList fields, also look for tools in _reconstructed_
          if (isToolList) {
            const reconObj = row[reconKey];
            if (reconObj) {
              const tools = getNestedValue(reconObj, subPath);
              if (Array.isArray(tools) && tools.length > 0) {
                conversationTools.value = tools;
              }
            }
          }
        } else {
          // Top-level field — check if the cell value is a JSON messages/tools array
          const raw = row[colKey];
          if (typeof raw === 'string') {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                if (isToolList) {
                  conversationTools.value = parsed;
                } else if (isMultiConversationArray(parsed)) {
                  conversationMulti.value = parsed;
                } else if (parsed[0]?.role) {
                  conversationMessages.value = parsed;
                }
              }
            } catch { /* fallback to text */ }
          } else if (Array.isArray(raw)) {
            // Native array value
            if (isToolList) {
              conversationTools.value = raw;
            } else if (isMultiConversationArray(raw)) {
              conversationMulti.value = raw;
            } else if (raw.length > 0 && raw[0]?.role) {
              conversationMessages.value = raw;
            }
          }
        }
      }

      conversationVisible.value = true;
    }

    /**
     * Open conversation dialog for a nested object field (e.g. RequestData → messages).
     * Uses _raw_* to get the original JSON and extract the conversation array.
     */
    function openNestedConversation(row, colKey, conversationPath) {
      conversationMessages.value = null;
      conversationMulti.value = null;
      conversationText.value = '';
      conversationTools.value = null;
      conversationTitle.value = t('custom.conversationTitle');
      conversationFilterPlaceholder.value = t('custom.filterConversation');
      conversationIsToolList.value = false;

      // Try _raw_ field to get original JSON, then extract the conversation array
      const rawValue = row[`_raw_${colKey}`];
      if (rawValue && typeof rawValue === 'string') {
        try {
          const parsed = JSON.parse(rawValue);
          const messages = getNestedValue(parsed, conversationPath);
          if (Array.isArray(messages) && messages.length > 0) {
            if (isMultiConversationArray(messages)) {
              conversationMulti.value = messages;
            } else if (messages[0]?.role) {
              conversationMessages.value = messages;
            }
          }
        } catch { /* fallback */ }
      }

      // Fallback: try the decoded object directly
      if (!conversationMessages.value) {
        const obj = row[colKey];
        if (obj && typeof obj === 'object') {
          // The formatted text is at obj[conversationPath], but we need the original array
          // Check if _raw_ already handled above
        }
      }

      conversationVisible.value = true;
    }

    function getNestedMessages(row, colKey, conversationPath) {
      const rawValue = row[`_raw_${colKey}`];
      if (rawValue && typeof rawValue === 'string') {
        try {
          const parsed = JSON.parse(rawValue);
          const messages = getNestedValue(parsed, conversationPath);
          if (Array.isArray(messages)) return messages;
        } catch { /* fallback */ }
      }
      return [];
    }

    function countNestedMessages(value, conversationPath) {
      if (!value || typeof value !== 'object') return 0;
      // The conversation is formatted as text inside the object
      const text = value[conversationPath];
      if (typeof text === 'string') {
        const matches = text.match(/^\[(system|user|assistant|human|ai|bot|tool_call:\S*|tool:\S*)\]/gim);
        return matches ? matches.length : 0;
      }
      return 0;
    }

    function previewObjectValue(value) {
      if (!value || typeof value !== 'object') return '';
      if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const first = value[0];
        if (first && typeof first === 'object' && !Array.isArray(first) && first.role && first.content) {
          return `${value.length} msgs`;
        }
        if (first && typeof first === 'object' && !Array.isArray(first) && first.function?.name) {
          return `${value.length} tools`;
        }
        return `[${value.length}]`;
      }
      const keys = Object.keys(value);
      if (keys.length === 0) return '{}';
      // Show first few keys with type hints
      const preview = keys.slice(0, 3).map(k => {
        const v = value[k];
        const type = Array.isArray(v) ? `[](${v.length})` : typeof v === 'object' && v !== null ? '{}' : typeof v;
        return `${k}:${type}`;
      }).join(', ');
      return keys.length <= 3 ? `{${preview}}` : `{${preview}, ...}`;
    }

    function previewCellValue(value) {
      if (value == null) return '';
      if (Array.isArray(value)) {
        // Show first item summary instead of [object Object]
        if (value.length === 0) return '[]';
        const first = value[0];
        // Multi-conversation: [[{role,...},...], ...]
        if (Array.isArray(first)) {
          return `${value.length} convs`;
        }
        if (typeof first === 'object' && first !== null) {
          const name = first.name || first.function?.name || first.role || '';
          return name ? `${name}${value.length > 1 ? ' ...' : ''}` : `(${value.length} items)`;
        }
        return truncateText(String(first ?? ''), 60) + (value.length > 1 ? ' ...' : '');
      }
      if (typeof value === 'object') return truncateText(JSON.stringify(value), 80);
      return truncateText(String(value), 80);
    }

    function countItems(value, detectedType) {
      if (detectedType === 'toolList') {
        // Try JSON array (reconstructed data or JSON string)
        if (Array.isArray(value)) return value.length;
        if (typeof value === 'string') {
          try { const arr = JSON.parse(value); if (Array.isArray(arr)) return arr.length; } catch {}
        }
        return 0;
      }
      // Multi-conversation array: [[{role,...},...], ...]
      if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0]) && value[0].length > 0 && value[0][0]?.role) {
        return value.length;
      }
      // Single conversation array: [{role,...}, ...]
      if (Array.isArray(value) && value.length > 0 && value[0]?.role) {
        return value.length;
      }
      // conversation text: match [role] text format
      const matches = String(value ?? '').match(/^\[(system|user|assistant|human|ai|bot|tool_call:\S*|tool:\S*)\]/gim);
      return matches ? matches.length : 0;
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

    function createWorkerParse(fileName) {
      return (text, onProgress) => {
        return new Promise((resolve) => {
          const tCreate = performance.now();
          const worker = new CustomWorker();
          const tCreated = performance.now();
          const tPost = performance.now();
          worker.postMessage({
            text,
            expandNestedJsonStrings: true,
            fileName: fileName || null,
          });
          const tPosted = performance.now();

          worker.onmessage = (e) => {
            if (e.data.type === 'progress') {
              if (onProgress) onProgress(e.data.percent);
            } else if (e.data.type === 'done') {
              const tReceive = performance.now();
              worker.terminate();

              if (e.data.timings && isDebugLogging()) {
                const t = e.data.timings;
                console.log(
                  '%c[Parser Pipeline]%c ' +
                    `worker=${t.total?.toFixed(1)}ms | ` +
                    `create=${(tCreated - tCreate).toFixed(1)}ms | ` +
                    `postMsg=${(tPosted - tCreated).toFixed(1)}ms | ` +
                    `transfer=${(tReceive - tPosted - t.total).toFixed(1)}ms`,
                  'color:#0af;font-weight:bold',
                  'color:inherit',
                );
              }

              resolve({
                rows: e.data.rows,
                fieldMeta: e.data.fieldMeta,
                detectedFormat: e.data.detectedFormat,
                expansionDebug: e.data.formatDebug,
                workerTimings: e.data.timings,
              });
            }
          };
          worker.onerror = (err) => {
            console.error('Custom parser error:', err);
            worker.terminate();
            resolve({ rows: [], fieldMeta: { detectedFields: [], expandCandidates: [] } });
          };
        });
      };
    }

    // ===== Directory browser (independent from evalscope) =====
    const customDir = useCustomDirBrowser();
    const {
      dirTree, showSidebar, sidebarWidth,
      browseMode, dirName, recentDirs, supportsDirectoryPicker,
      selectedFileKey, currentNodeKey, dirFileCount,
      removeCachedHandle: removeCachedDirHandle,
      setSelectedFile, clearSelectedFile, findSelectedNode,
    } = customDir;
    let currentFileId = null;

    const fileHandler = useFileHandler({
      storageNamespace: 'custom_viewer',
      storageKey: 'custom_viewer_cache',
      listFiles, getFile, saveFile, clearFiles, deleteFile,
      parseData: parseCustom,
      tableModel,
      parserVersion: '3',
      dirModeAware: true,
      browseModeKey: 'custom_browse_mode',
      onParseResult: (result) => {
        if (result.fieldMeta) {
          viewLogger.header('Parse Result Pipeline');

          // Cache rows for plugin re-processing (post-transform, pre-analyze)
          _rawRows.value = result.rows.map((r) => ({ ...r }));
          // Preserve decoded keys info from worker's type detection
          const decodedKeys = new Set();
          for (const f of (result.fieldMeta.detectedFields || [])) {
            if (f.isExpanded) decodedKeys.add(f.key);
          }
          _rawFieldMeta.value = {
            ...result.fieldMeta,
            _decodedKeys: decodedKeys,
            _detectedFormat: result.detectedFormat,
          };

          // Snapshot row 0 before any processing (for pipeline debug)
          const sampleOriginal = result.rows.length > 0 ? { ...result.rows[0] } : null;

          // Use currentFileId if set (user action), otherwise fallback to localStorage
          const fileId = currentFileId || localStorage.getItem('custom_viewer_cache');
          if (fileId) {
            currentFileId = fileId;
            expandInfo.value = result.fieldMeta.expandCandidates || [];
            schemaSnapshot.value = result.fieldMeta.schemaSnapshot || null;

            viewLogger.detail(`parsed: ${result.rows.length} rows, ${(result.fieldMeta.detectedFields || []).length} fields`);

            // Run optional plugins + re-score using runPipeline with cached records.
            // This allows decode/reconstruct/extractStats to run on already-expanded data,
            // then re-detect types and re-score for correct plugin-enhanced priorities.
            runWithoutAutoSave(() => {
              viewLogger.stage('runPipeline (plugins + re-score)');
              const { rows, fieldMeta: enhancedMeta, debug: pipelineDebugData } = runPipeline(null, {
                cachedRecords: _rawRows.value,
                detectedFormat: result.detectedFormat,
                expandNestedJsonStrings: true,
                enabledPluginIds: pluginConfig.value.enabledPlugins,
              });
              tableData.value = rows;
              viewLogger.stageEnd();

              // Snapshot row 0 after plugins (for pipeline debug)
              const sampleAfterPlugins = rows.length > 0 ? { ...rows[0] } : null;

              viewLogger.detail(`pipeline complete: ${rows.length} rows, ${(enhancedMeta.detectedFields || []).length} fields`);

              // Init from enhanced meta (stores priorityDebug + patternMatchCounts internally)
              viewLogger.stage('initFromMeta');
              initFromMeta(fileId, enhancedMeta);
              viewLogger.stageEnd();

              // Patch field config with plugin modifications
              viewLogger.stage('updateFromPluginMeta');
              updateFromPluginMeta(fileId, enhancedMeta);
              viewLogger.stageEnd();

              // Populate pipeline debug store
              if (isDebugLogging()) {
                populatePipelineDebug({
                  cache: { status: 'miss', fileId, parserVersion: '3' },
                  pipeline: {
                    timings: result.timings || {},
                    detectedFormat: result.detectedFormat || 'unknown',
                    rowCount: result.rows.length,
                    formatDebug: result.formatDebug || { conversationArrays: [], toolArrays: [], homogeneousArrays: [] },
                    stages: pipelineDebugData || [],
                  },
                  scoring: {
                    debugMeta: enhancedMeta.priorityDebug || [],
                    patternMatchCounts: enhancedMeta.patternMatchCounts || {},
                    fieldTree: enhancedMeta.detectedFieldsTree || [],
                  },
                  samples: {
                    original: sampleOriginal,
                    afterPlugins: sampleAfterPlugins,
                  },
                });
              }
            });
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
      showDialog, showRawJsonDialog: _showRawJsonDialog,
      truncateText,
    } = fileHandler;

    const dialogJsonData = ref(null);

    async function clearRecentFiles() {
      await _clearRecentFiles();
      clearAllConfigs();
      resetFile();
      reset();
      currentFileId = null;
      columnFilterMap.clear();
      expandInfo.value = [];
      schemaSnapshot.value = null;
      resetPipelineDebug();
    }

    // Wrap file select to set up the parser
    async function onHandleFileSelect(file) {
      currentFileId = `${file.name}-${file.size}-${file.lastModified}`;
      columnFilterMap.clear();
      currentParseFn = createWorkerParse(file.name);
      customDir.setBrowseMode('file');
      dataSource.value = '';
      await fileHandler.handleFileSelect(file);
    }

    async function onOpenRecentFile(item) {
      currentFileId = item.id;
      columnFilterMap.clear();
      currentParseFn = createWorkerParse(item.name);
      await fileHandler.openRecentFile(item);
      customDir.setBrowseMode('file');
      dataSource.value = '';
    }

    // ===== Directory browsing handlers =====
    async function onOpenCustomDirectory() {
      const ok = await customDir.openDirectory();
      if (ok) {
        clearSelectedFile();
        tableData.value = [];
        reset();
        expandInfo.value = [];
        schemaSnapshot.value = null;
      }
    }

    async function onRestoreCustomDirectory(name) {
      const ok = await customDir.restoreCachedDirectory(name);
      if (ok) {
        clearSelectedFile();
        tableData.value = [];
        reset();
        expandInfo.value = [];
        schemaSnapshot.value = null;
      }
    }

    async function onSelectDirFile(node) {
      columnFilterMap.clear();
      currentParseFn = createWorkerParse(node.relativePath);
      const text = await customDir.readFileNode(node);
      const fileId = `dir_${node.relativePath}`;
      currentFileId = fileId;
      setSelectedFile(node.id);
      await fileHandler.loadSampleText(node.relativePath, text);
    }

    function onFieldConfigSave() {
      saveFieldConfig();
    }

    function onStatsChange(config) {
      setStatsConfig(config.distributionFields, config.histogramFields);
    }

    function onRerunPipeline() {
      if (!_rawRows.value.length || !_rawFieldMeta.value) return;
      runWithoutAutoSave(() => {
        const { rows, fieldMeta } = runPipeline(null, {
          cachedRecords: _rawRows.value,
          detectedFormat: _rawFieldMeta.value._detectedFormat,
          expandNestedJsonStrings: true,
          enabledPluginIds: pluginConfig.value.enabledPlugins,
        });
        tableData.value = rows;
        // Apply plugin modifications WITHOUT resetting field config
        updateFromPluginMeta(lastFileId.value, fieldMeta);
      });
      ElMessage.success(t('custom.recalculateSuccess'));
    }

    function onFieldReset() {
      // Run plugin pipeline via runPipeline to get enhanced data
      let enhancedFieldMeta = _rawFieldMeta.value;
      runWithoutAutoSave(() => {
        const { rows, fieldMeta } = runPipeline(null, {
          cachedRecords: _rawRows.value,
          detectedFormat: _rawFieldMeta.value._detectedFormat,
          expandNestedJsonStrings: true,
          enabledPluginIds: pluginConfig.value.enabledPlugins,
        });
        tableData.value = rows;
        enhancedFieldMeta = fieldMeta;
      });
      // Reset with enhanced meta for correct scoring (conversation/toolList get -100)
      resetToDefaults(true, enhancedFieldMeta);
      // Apply plugin modifications AFTER reset (remove array leaves, hide sub-fields)
      updateFromPluginMeta(lastFileId.value, enhancedFieldMeta);
      ElMessage.success(t('common.resetSuccess'));
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
      currentParseFn = createWorkerParse(sampleName);
      await fileHandler.loadSampleText(sampleName, SAMPLE_CUSTOM_TEXT);
      localStorage.setItem(ONBOARDED_KEY, '1');
      samplePromptVisible.value = false;
    }

    function dismissSample() {
      localStorage.setItem(ONBOARDED_KEY, '1');
      samplePromptVisible.value = false;
    }

    function tryUnwrapDoubleEncoded(text) {
      const trimmed = text.trim();
      if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return null;
      try {
        const inner = JSON.parse(trimmed);
        if (typeof inner === 'string') {
          const innerTrimmed = inner.trim();
          if ((innerTrimmed.startsWith('{') || innerTrimmed.startsWith('[')) &&
              (innerTrimmed.endsWith('}') || innerTrimmed.endsWith(']'))) {
            try {
              JSON.parse(innerTrimmed);
              return innerTrimmed;
            } catch { return null; }
          }
        }
        return null;
      } catch { return null; }
    }

    function validatePastedText(text) {
      const trimmed = text.trim();
      if (!trimmed) return false;
      // JSON array or object
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) || trimmed.startsWith('[')) {
        try {
          if (trimmed.startsWith('[')) {
            JSON.parse(trimmed);
            return true;
          }
          JSON.parse(trimmed);
          return true;
        } catch { /* not valid single JSON, try JSONL below */ }
      }
      // JSONL: every non-empty line must be valid JSON
      const lines = trimmed.split('\n').filter(l => l.trim());
      if (lines.length === 0) return false;
      return lines.every(l => {
        try { JSON.parse(l); return true; } catch { return false; }
      });
    }

    async function handlePastedText(text) {
      let processedText = text;
      const unwrapped = tryUnwrapDoubleEncoded(text.trim());
      if (unwrapped) {
        processedText = unwrapped;
        ElMessage.info(t('custom.pasteJsonUnwrapped'));
      }
      if (!validatePastedText(processedText)) {
        ElMessage.warning(t('custom.pasteJsonInvalid'));
        return;
      }
      const now = new Date();
      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const name = `pasted-${ts}`;
      currentFileId = `${name}-${processedText.length}-0`;
      columnFilterMap.clear();
      currentParseFn = createWorkerParse(name);
      dataSource.value = 'paste';
      customDir.setBrowseMode('file');
      clearSelectedFile();
      tableData.value = [];
      reset();
      expandInfo.value = [];
      schemaSnapshot.value = null;
      samplePromptVisible.value = false;
      dataSource.value = 'paste';
      await fileHandler.loadSampleText(name, processedText);
    }

    function onPasteConfirm() {
      const text = pasteText.value.trim();
      if (!text) return;
      pasteDialogVisible.value = false;
      handlePastedText(text);
      pasteText.value = '';
    }

    onMounted(async () => {
      // Show sample prompt only for first-time users:
      // no onboarded flag AND no previously opened file in cache
      const hasCache = !!localStorage.getItem('custom_viewer_cache');
      if (!hasCache && !localStorage.getItem(ONBOARDED_KEY)) {
        samplePromptVisible.value = true;
      }
      // Try to restore cached directory and re-select last file
      const restored = await customDir.tryRestoreCachedHandle();
      if (restored) {
        const node = findSelectedNode();
        if (node) await onSelectDirFile(node);
      }
    });

    onBeforeUnmount(() => {
    });

    return {
      // Stats toggles
      showDistribution,
      showHistogram,
      showFieldConfig,
      conversationVisible,
      conversationText,
      conversationMessages,
      conversationMulti,
      conversationTools,
      conversationTitle,
      conversationFilterPlaceholder,
      conversationIsToolList,
      expandInfo,
      // Sample prompt
      samplePromptVisible,
      pasteDialogVisible,
      pasteText,
      onPasteConfirm,
      dataSource,
      loadSample,
      dismissSample,
      // Field config
      fieldConfig,
      activeColumns,
      enumFields,
      numericFields,
      fieldTree,
      schemaSnapshot,
      priorityDebug,
      patternMatchCounts,
      getFieldLabel,
      // Debug
      debugMode,
      pipelineDebugVisible,
      onOpenDebugDialog,
      pipelineDebug,
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
      openNestedConversation,
      isMultiConversationArray,
      getNestedMessages,
      countNestedMessages,
      previewObjectValue,
      previewCellValue,
      countItems,
      getRowValue,
      getColumnMinWidth,
      // File handler
      hintText, formatSize, formatTime,
      clearRecentFiles, recentFiles, resetFile, removeRecentFile,
      currentFileName,
      dialogVisible, dialogHasTabs, dialogTabsData, dialogContent, dialogRawText,
      dialogJsonData,
      showDialog, showRawJsonDialog, showFieldJson,
      // Directory browser
      showSidebar, sidebarWidth, dirTree, currentNodeKey,
      supportsDirectoryPicker, browseMode, dirName, dirFileCount, recentDirs,
      onOpenCustomDirectory,
      onRestoreCustomDirectory,
      onSelectDirFile,
      removeCachedDirHandle,
      // Actions
      onHandleFileSelect,
      onOpenRecentFile,
      onFieldConfigSave,
      onStatsChange,
      onFieldReset,
      onRerunPipeline,
      onToggleGroup,
      onSavePreset,
      onApplyPreset,
      onDeletePreset,
      // Plugins
      pluginConfig,
      registeredPlugins,
      onPluginToggle,
    };
  },
};
</script>

<style scoped>
.nested-key-header {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.nested-key-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 11px;
  line-height: 1;
  border-radius: 50%;
  background: var(--el-fill-color, #ebeef5);
  color: var(--el-text-color-secondary, #909399);
  cursor: pointer;
  user-select: none;
}

.nested-key-icon:hover {
  color: var(--el-color-primary, #409eff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}

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
/* Only allow vertical overflow visible, keep horizontal scrolling intact */
:deep(.el-table__header-wrapper) {
  overflow-x: scroll;
  overflow-y: visible;
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

.conversation-count {
  font-size: 10px;
  color: var(--ev-text-secondary);
  opacity: 0.6;
  margin-right: 4px;
  vertical-align: middle;
}

/* Collapsible JSON renderer — replaced by vue-json-pretty */
</style>
