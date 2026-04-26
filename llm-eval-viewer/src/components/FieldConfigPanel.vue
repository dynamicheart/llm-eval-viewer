<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <el-drawer
    :model-value="visible"
    :title="$t('custom.fieldConfig')"
    size="520px"
    @close="$emit('close')"
  >
    <template v-if="fieldConfig">
      <!-- Preset management -->
      <div class="preset-section">
        <div class="preset-row">
          <el-select
            :model-value="activePresetId || ''"
            :placeholder="$t('custom.noPreset')"
            size="small"
            class="preset-select"
            clearable
            @change="onPresetChange"
            @clear="$emit('clear-preset')"
          >
            <el-option
              v-for="p in presets"
              :key="p.id"
              :label="p.name"
              :value="p.id"
            />
          </el-select>
          <el-button size="small" type="primary" plain @click="onSavePreset">
            {{ $t('custom.savePreset') }}
          </el-button>
          <el-button
            size="small"
            type="danger"
            plain
            :disabled="!activePresetId"
            @click="$emit('delete-preset', activePresetId)"
          >
            {{ $t('custom.deletePreset') }}
          </el-button>
        </div>
      </div>

      <!-- Schema Preview (collapsible) -->
      <div v-if="schemaSnapshot" class="schema-section">
        <div class="schema-header" @click="schemaExpanded = !schemaExpanded">
          <el-icon class="schema-arrow" :class="{ 'is-expanded': schemaExpanded }">
            <ArrowRight />
          </el-icon>
          <span class="schema-title">{{ $t('custom.schemaPreview') }}</span>
        </div>
        <div v-show="schemaExpanded" class="schema-body">
          <pre class="schema-pre"><code>{{ schemaText }}</code></pre>
        </div>
      </div>

      <!-- Data Plugins -->
      <el-collapse v-model="pluginSections" class="config-section" lazy>
        <el-collapse-item :title="$t('custom.dataPlugins')" name="plugins">
          <div v-if="registeredPlugins.length" class="plugin-list">
            <div v-for="group in pluginsByStage" :key="group.stage" class="plugin-stage-group">
              <div class="stage-header">{{ group.label }}</div>
              <div v-for="plugin in group.plugins" :key="plugin.id" class="plugin-row">
                <el-switch
                  :model-value="plugin.required ? true : isPluginEnabled(plugin.id)"
                  size="small"
                  :disabled="plugin.required"
                  @change="onPluginToggle(plugin.id)"
                />
                <div class="plugin-info">
                  <span class="plugin-name">{{ plugin.nameKey ? $t(plugin.nameKey) : plugin.name }}</span>
                  <el-tag v-if="plugin.required" size="small" type="info" style="margin-left:6px">{{ $t('custom.pluginRequired') }}</el-tag>
                  <span class="plugin-desc">{{ plugin.descriptionKey ? $t(plugin.descriptionKey) : plugin.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- Stats configuration -->
      <el-divider content-position="left">{{ $t('custom.statsConfig') }}</el-divider>

      <div v-if="enumFields.length" class="config-section">
        <div class="schema-header" @click="distExpanded = !distExpanded">
          <el-icon class="schema-arrow" :class="{ 'is-expanded': distExpanded }">
            <ArrowRight />
          </el-icon>
          <span class="schema-title">{{ $t('custom.distributionFields') }}</span>
          <span class="section-hint">{{ localDistFields.length }}/{{ enumFields.length }}</span>
        </div>
        <div v-show="distExpanded" class="stats-collapse-body">
          <el-checkbox-group v-model="localDistFields" @change="onStatsChange">
            <el-checkbox
              v-for="f in enumFields"
              :key="f.key"
              :label="f.key"
              size="small"
            >
              {{ f.label }}
              <el-tooltip v-if="getSmartTagTooltip(f.key)" :content="getSmartTagTooltip(f.key)" placement="top" :show-after="300">
                <span class="smart-tag">{{ getSmartTag(f.key) }}</span>
              </el-tooltip>
              <span v-else-if="getSmartTag(f.key)" class="smart-tag">{{ getSmartTag(f.key) }}</span>
            </el-checkbox>
          </el-checkbox-group>
        </div>
      </div>

      <div v-if="numericFields.length" class="config-section">
        <div class="schema-header" @click="histExpanded = !histExpanded">
          <el-icon class="schema-arrow" :class="{ 'is-expanded': histExpanded }">
            <ArrowRight />
          </el-icon>
          <span class="schema-title">{{ $t('custom.histogramFields') }}</span>
          <span class="section-hint">{{ localHistFields.length }}/{{ numericFields.length }}</span>
        </div>
        <div v-show="histExpanded" class="stats-collapse-body">
          <el-checkbox-group v-model="localHistFields" @change="onStatsChange">
            <el-checkbox
              v-for="f in numericFields"
              :key="f.key"
              :label="f.key"
              size="small"
            >
              {{ f.label }}
              <el-tooltip v-if="getSmartTagTooltip(f.key)" :content="getSmartTagTooltip(f.key)" placement="top" :show-after="300">
                <span class="smart-tag">{{ getSmartTag(f.key) }}</span>
              </el-tooltip>
              <span v-else-if="getSmartTag(f.key)" class="smart-tag">{{ getSmartTag(f.key) }}</span>
            </el-checkbox>
          </el-checkbox-group>
        </div>
      </div>

      <!-- Column configuration -->
      <el-divider content-position="left">
        {{ $t('custom.columnConfig') }}
        <el-tooltip placement="top" :show-after="300">
          <template #content>
            <div style="white-space: pre-line; max-width: 360px">{{ $t('custom.visibilityRulesDesc') }}</div>
          </template>
          <el-icon class="rules-help"><QuestionFilled /></el-icon>
        </el-tooltip>
      </el-divider>

      <!-- Search & quick actions -->
      <div class="field-toolbar">
        <el-input
          v-model="searchQuery"
          size="small"
          :placeholder="$t('custom.searchFields')"
          clearable
          class="field-search"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button size="small" text @click="toggleShowOnlyVisible">
          {{ showOnlyVisible ? $t('custom.showAll') : $t('custom.showOnlyVisible') }}
        </el-button>
      </div>

      <!-- Tree-grouped field list -->
      <div class="field-list">
        <template v-for="group in filteredTree" :key="group.groupKey">
          <div class="group-header" @click="toggleGroupCollapse(group.groupKey)">
            <el-icon class="group-arrow" :class="{ 'is-expanded': !collapsedGroups[group.groupKey] }">
              <ArrowRight />
            </el-icon>
            <el-checkbox
              :model-value="group.visibleCount === group.totalCount"
              :indeterminate="group.visibleCount > 0 && group.visibleCount < group.totalCount"
              size="small"
              @click.stop
              @change="$emit('toggle-group', group.groupKey)"
            />
            <span class="group-label">
              {{ group.groupKey === '__top__' ? $t('custom.topLevelFields') : group.groupLabel }}
              <span class="group-nest-badge">
                {{ group.groupKey === '__top__' ? 'L0' : 'L1' }}
              </span>
            </span>
            <span class="group-count">{{ group.visibleCount }} / {{ group.totalCount }}</span>
          </div>

          <template v-if="!collapsedGroups[group.groupKey]">
            <div
              v-for="field in group.fields"
              :key="field.key"
              class="field-row"
              :class="{
                'field-row-expanded': field.isExpanded,
                'field-row-nested': getFieldNestingLevel(field.key, group.groupKey) > 0,
                'field-row-deep': getFieldNestingLevel(field.key, group.groupKey) > 1,
              }"
            >
              <!-- Visible toggle -->
              <el-checkbox v-model="field.visible" size="small" @change="onFieldChange" />

              <!-- Key path + label -->
              <div class="field-info">
                <span class="field-key" :title="field.key">
                  {{ getFieldDisplayPath(field.key, group.groupKey) }}
                </span>
                <span class="field-nest-badge">
                  L{{ getFieldNestingLevel(field.key, group.groupKey) + 1 }}
                </span>
              </div>

              <!-- Type tag -->
              <el-tag
                :type="typeTagType(field.detectedType)"
                size="small"
                class="field-type-tag"
              >
                {{ field.detectedType === 'conversation' ? 'chat' : field.detectedType === 'toolList' ? 'tool' : field.detectedType === 'nestedObject' ? 'JSON' : field.detectedType === 'decodedJson' ? 'decoded' : field.detectedType }}
              </el-tag>

              <!-- Auto-visibility reason + empty rate annotation -->
              <span v-if="field.visibilityReason" class="field-reason">
                {{ getReasonLabel(field.visibilityReason) }}
                <el-tooltip :content="getReasonDesc(field.visibilityReason)" placement="top" :show-after="300">
                  <el-icon class="reason-help"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
              <!-- Score traceability popover -->
              <el-popover
                v-if="getFieldDebugMeta(field.key)"
                placement="top"
                :width="300"
                trigger="click"
              >
                <template #reference>
                  <el-icon class="score-debug-icon"><InfoFilled /></el-icon>
                </template>
                <div class="score-debug-content">
                  <div class="score-debug-row">
                    <span class="score-debug-label">Score:</span>
                    <span :style="{ color: getFieldDebugMeta(field.key).score > 0 ? 'var(--el-color-success)' : getFieldDebugMeta(field.key).score < -30 ? 'var(--el-color-danger)' : '' }">
                      {{ getFieldDebugMeta(field.key).score > 0 ? '+' : '' }}{{ getFieldDebugMeta(field.key).score }}
                    </span>
                  </div>
                  <div v-if="getFieldDebugMeta(field.key).matchedPattern" class="score-debug-row">
                    <span class="score-debug-label">Pattern:</span>
                    <code class="score-debug-pattern">{{ getFieldDebugMeta(field.key).matchedPattern }}</code>
                  </div>
                  <div class="score-debug-row">
                    <span class="score-debug-label">Breakdown:</span>
                    <span class="score-debug-breakdown">{{ formatBreakdown(getFieldDebugMeta(field.key)) }}</span>
                  </div>
                  <div class="score-debug-link">
                    <el-button text size="small" @click="$emit('open-debug-dialog')">
                      {{ $t('custom.viewFullScoring') }}
                    </el-button>
                  </div>
                </div>
              </el-popover>
              <span v-if="field.emptyRate > 0.5" class="field-empty-rate">
                {{ Math.round(field.emptyRate * 100) }}% {{ $t('custom.empty') }}
              </span>

              <!-- Feature toggles -->
              <div class="field-toggles">
                <el-tooltip :content="$t('custom.searchable')" placement="top">
                  <el-switch
                    v-model="field.searchable"
                    size="small"
                    inline-prompt
                    active-text="S"
                    @change="onFieldChange"
                  />
                </el-tooltip>
                <el-tooltip :content="$t('custom.filterable')" placement="top">
                  <el-switch
                    v-model="field.filterable"
                    size="small"
                    inline-prompt
                    active-text="F"
                    @change="onFieldChange"
                  />
                </el-tooltip>
                <el-tooltip :content="$t('custom.previewable')" placement="top">
                  <el-switch
                    v-model="field.previewable"
                    size="small"
                    inline-prompt
                    active-text="P"
                    @change="onFieldChange"
                  />
                </el-tooltip>
              </div>
            </div>
          </template>
        </template>

        <div v-if="filteredTree.length === 0" class="field-empty">
          {{ $t('custom.noFieldsMatch') }}
        </div>
      </div>
    </template>

    <template #footer>
      <div class="footer-bar">
        <el-button @click="onReset">
          {{ $t('custom.resetDefaults') }}
        </el-button>
        <el-button @click="onRerunPipeline">
          {{ $t('custom.rerunDataPipeline') }}
        </el-button>
        <div style="flex:1"></div>
        <el-button type="primary" @click="onSaveConfig">
          {{ $t('custom.saveConfig') }}
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script>
import { ref, computed, watch, getCurrentInstance } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessageBox, ElMessage } from 'element-plus';
import { ArrowRight, Search, QuestionFilled, InfoFilled } from '@element-plus/icons-vue';

export default {
  components: { ArrowRight, Search, QuestionFilled, InfoFilled },

  props: {
    visible: Boolean,
    fieldConfig: Object,
    fieldTree: { type: Array, default: () => [] },
    enumFields: { type: Array, default: () => [] },
    numericFields: { type: Array, default: () => [] },
    statsConfig: Object,
    presets: { type: Array, default: () => [] },
    activePresetId: { type: String, default: null },
    schemaSnapshot: { type: Object, default: null },
    pluginConfig: { type: Object, default: () => ({ enabledPlugins: [] }) },
    registeredPlugins: { type: Array, default: () => [] },
    priorityDebug: { type: Array, default: () => [] },
    patternMatchCounts: { type: Object, default: () => ({}) },
  },

  emits: [
    'close', 'save', 'stats-change', 'reset', 'rerun-pipeline', 'save-config',
    'save-preset', 'apply-preset', 'delete-preset', 'clear-preset',
    'toggle-group', 'plugin-toggle', 'open-debug-dialog',
  ],

  setup(props) {
    const { t } = useI18n();
    const instance = getCurrentInstance();
    const localDistFields = ref([]);
    const localHistFields = ref([]);
    const searchQuery = ref('');
    const showOnlyVisible = ref(false);
    const collapsedGroups = ref({});
    const schemaExpanded = ref(false);
    const distExpanded = ref(false);
    const histExpanded = ref(false);

    watch(
      () => props.statsConfig,
      (config) => {
        if (config) {
          localDistFields.value = [...(config.distributionFields || [])];
          localHistFields.value = [...(config.histogramFields || [])];
        }
      },
      { immediate: true, deep: true },
    );

    // Auto-collapse groups with 0 visible fields
    watch(
      () => props.fieldTree,
      (tree) => {
        if (!tree) return;
        const newCollapsed = {};
        for (const group of tree) {
          // Keep existing collapse state if set, otherwise auto-collapse empty groups
          if (group.groupKey in collapsedGroups.value) {
            newCollapsed[group.groupKey] = collapsedGroups.value[group.groupKey];
          } else {
            newCollapsed[group.groupKey] = group.visibleCount === 0;
          }
        }
        collapsedGroups.value = newCollapsed;
      },
      { immediate: true },
    );

    const filteredTree = computed(() => {
      const query = searchQuery.value.toLowerCase().trim();
      return props.fieldTree
        .map((group) => {
          let fields = group.fields;
          if (showOnlyVisible.value) {
            fields = fields.filter((f) => f.visible);
          }
          if (query) {
            fields = fields.filter(
              (f) => f.key.toLowerCase().includes(query) || f.label.toLowerCase().includes(query),
            );
          }
          return {
            ...group,
            fields,
            visibleCount: fields.filter((f) => f.visible).length,
            totalCount: fields.length,
          };
        })
        .filter((g) => g.fields.length > 0);
    });

    const schemaText = computed(() => {
      if (!props.schemaSnapshot) return '';
      return formatSchemaNode(props.schemaSnapshot, 0);
    });

    function formatSchemaNode(node, indent) {
      if (!node || typeof node !== 'object') return '';
      const pad = '  '.repeat(indent);
      const lines = [];
      for (const [key, info] of Object.entries(node)) {
        if (info.type === 'object' && info.children) {
          lines.push(`${pad}${key}: {`);
          lines.push(formatSchemaNode(info.children, indent + 1));
          lines.push(`${pad}}`);
        } else if (info.type === 'json_string' && info.inner) {
          lines.push(`${pad}${key}: "{...}" → expanded`);
        } else if (info.type === 'array') {
          if (info.itemType === 'conversation') {
            lines.push(`${pad}${key}: [{role, content, ...}] × ${info.length} (conversation)`);
          } else if (info.itemType === 'object') {
            lines.push(`${pad}${key}: [object] × ${info.length}`);
          } else {
            lines.push(`${pad}${key}: [${info.itemType}] × ${info.length}`);
          }
        } else if (info.type === 'string') {
          const sample = info.sample ? ` = "${info.sample}"` : '';
          lines.push(`${pad}${key}: string${sample}`);
        } else if (info.type === 'number') {
          lines.push(`${pad}${key}: number = ${info.sample}`);
        } else if (info.type === 'boolean') {
          lines.push(`${pad}${key}: boolean = ${info.sample}`);
        } else {
          lines.push(`${pad}${key}: ${info.type}`);
        }
      }
      return lines.join('\n');
    }

    function getDisplayKey(key, groupKey) {
      if (groupKey === '__top__') return key;
      // Remove the group prefix for cleaner display
      const prefix = groupKey + '.';
      return key.startsWith(prefix) ? key.substring(prefix.length) : key;
    }

    /**
     * Get nesting depth relative to group (0 = direct child, 1 = grandchild, etc.)
     */
    function getFieldNestingLevel(key, groupKey) {
      if (groupKey === '__top__') return 0;
      const prefix = groupKey + '.';
      if (!key.startsWith(prefix)) return 0;
      const remaining = key.substring(prefix.length);
      return Math.max(0, remaining.split('.').length - 2);
    }

    /**
     * Display key path with hierarchy separators for nested fields.
     * e.g. 'ResponseData.usage.input_tokens' → 'usage › input_tokens'
     *       'RequestData.model' → 'model'
     */
    function getFieldDisplayPath(key, groupKey) {
      const displayKey = getDisplayKey(key, groupKey);
      if (!displayKey.includes('.')) return displayKey;
      // Replace dots with › to show hierarchy
      return displayKey.replace(/\./g, ' \u203A ');
    }

    function toggleGroupCollapse(groupKey) {
      collapsedGroups.value[groupKey] = !collapsedGroups.value[groupKey];
    }

    function toggleShowOnlyVisible() {
      showOnlyVisible.value = !showOnlyVisible.value;
    }

    function onStatsChange() {
      instance.emit('stats-change', {
        distributionFields: localDistFields.value,
        histogramFields: localHistFields.value,
      });
    }

    const pluginSections = ref([]); // collapsed by default

    const pluginsByStage = computed(() => {
      const stages = ['parse', 'transform', 'analyze', 'post'];
      return stages
        .map(stage => ({
          stage,
          label: t(`custom.pipelineStage${stage.charAt(0).toUpperCase() + stage.slice(1)}`),
          plugins: props.registeredPlugins.filter(p => p.stage === stage),
        }))
        .filter(g => g.plugins.length > 0);
    });

    function isPluginEnabled(pluginId) {
      return (props.pluginConfig?.enabledPlugins || []).includes(pluginId);
    }

    function onPluginToggle(pluginId) {
      const enabled = !isPluginEnabled(pluginId);
      instance.emit('plugin-toggle', { id: pluginId, enabled });
    }

    function onFieldChange() {
      // Field mutations are directly on the reactive object
    }

    function onReset() {
      instance.emit('reset');
    }

    function onRerunPipeline() {
      instance.emit('rerun-pipeline');
    }

    function onSaveConfig() {
      instance.emit('save-config');
      ElMessage.success(t('custom.saveConfigSuccess'));
    }

    async function onSavePreset() {
      try {
        const { value } = await ElMessageBox.prompt('', '', {
          confirmButtonText: 'OK',
          cancelButtonText: '',
          inputPlaceholder: '',
        });
        if (value && value.trim()) {
          instance.emit('save-preset', value.trim());
        }
      } catch {
        // User cancelled
      }
    }

    function onPresetChange(presetId) {
      if (presetId) {
        instance.emit('apply-preset', presetId);
      } else {
        instance.emit('clear-preset');
      }
    }

    function typeTagType(type) {
      switch (type) {
        case 'number': return 'primary';
        case 'boolean': return 'warning';
        case 'enum': return 'success';
        case 'conversation': return 'danger';
        case 'toolList': return 'primary';
        case 'nestedObject': return 'success';
        case 'decodedJson': return 'success';
        default: return 'info';
      }
    }

    function getSmartTag(fieldKey) {
      const reason = props.statsConfig?.selectionReasons?.[fieldKey];
      if (!reason) return '';
      return t(`custom.smartTag.${reason}`);
    }

    function getSmartTagTooltip(fieldKey) {
      const meta = props.priorityDebug?.find(d => d.key === fieldKey);
      if (meta?.matchedPattern) {
        return t('custom.smartTagDesc.matchedPattern', { pattern: meta.matchedPattern });
      }
      const reason = props.statsConfig?.selectionReasons?.[fieldKey];
      if (reason) {
        return t(`custom.smartTag.${reason}`);
      }
      return '';
    }

    function getFieldDebugMeta(fieldKey) {
      return props.priorityDebug?.find(d => d.key === fieldKey) || null;
    }

    function getReasonLabel(reason) {
      return t(`custom.visibilityReason.${reason}`, reason);
    }

    function getReasonTooltip(field) {
      const parts = [getReasonLabel(field.visibilityReason)];
      if (field.emptyRate > 0) {
        parts.push(`${Math.round(field.emptyRate * 100)}% ${t('custom.empty')}`);
      }
      return parts.join(' · ');
    }

    function getReasonDesc(reason) {
      return t(`custom.visibilityReasonDesc.${reason}`, '');
    }

    // ===== Debug panel =====
    const debugDialogVisible = ref(false);

    function formatBreakdown(row) {
      // Display in "higher = better" terms: negate internal penalties
      const parts = [];
      const cat = row.patternCategory;
      if (cat === 'conversation') {
        parts.push('conversation +100');
      } else if (cat === 'high') {
        parts.push(`high ${row.patternPenalty > 0 ? '+' : ''}${-row.patternPenalty}`);
      } else if (cat === 'low') {
        parts.push(`low ${-row.patternPenalty}`);
      } else if (cat === 'depth') {
        parts.push(`depth ${-row.patternPenalty}`);
      }
      if (row.emptyPenalty) {
        const pct = Math.round(row.emptyRate * 100);
        parts.push(`empty(${pct}%) ${-row.emptyPenalty}`);
      }
      if (row.constantPenalty) {
        parts.push(`constant ${-row.constantPenalty}`);
      }
      if (row.uniqueBonus) {
        parts.push(`unique(${row.uniqueCount}) +${row.uniqueBonus}`);
      }
      if (row.contentBonus) {
        parts.push(`avgLen(${row.avgValueLength}) +${row.contentBonus}`);
      }
      if (row.typeBonus) {
        parts.push(`type(${row.detectedType}) ${row.typeBonus > 0 ? '+' : ''}${row.typeBonus}`);
      }
      if (!parts.length) parts.push('none +0');
      return parts.join(' + ');
    }

    const debugTableData = computed(() => {
      if (!props.priorityDebug?.length || !props.fieldConfig) return [];
      return props.priorityDebug.map(d => {
        const current = props.fieldConfig.fields.find(f => f.key === d.key);
        return { ...d, currentVisible: current ? current.visible : d.visible, priority: -d.score };
      });
    });

    const statsDebugEntries = computed(() => {
      const sc = props.statsConfig;
      if (!sc) return [];
      const entries = [];
      for (const key of (sc.distributionFields || [])) {
        entries.push({ key, type: 'distribution', reason: sc.selectionReasons?.[key] || '' });
      }
      for (const key of (sc.histogramFields || [])) {
        entries.push({ key, type: 'histogram', reason: sc.selectionReasons?.[key] || '' });
      }
      return entries;
    });

    async function copyDebugAsMarkdown() {
      const text = markdownExportTab.value === 'rules'
        ? copyRulesAsMarkdown()
        : copyScoringAsMarkdown();
      try {
        await navigator.clipboard.writeText(text);
        ElMessage.success(t('common.copiedToClipboard'));
      } catch {
        ElMessage.error(t('common.copyFailed'));
      }
    }

    const markdownPreviewText = computed(() => {
      return markdownExportTab.value === 'rules'
        ? copyRulesAsMarkdown()
        : copyScoringAsMarkdown();
    });

    function copyScoringAsMarkdown() {
      const tableHeader = '| Field | Priority | Breakdown | Visible | Reason |';
      const tableSep = '|---|---|---|---|---|';

      const groups = new Map();
      const TOP_KEY = '__top__';
      for (const d of debugTableData.value) {
        const dotIdx = d.key.indexOf('.');
        const gk = dotIdx > 0 ? d.key.substring(0, dotIdx) : TOP_KEY;
        if (!groups.has(gk)) groups.set(gk, []);
        groups.get(gk).push(d);
      }

      const lines = ['## Field Priority Debug', ''];
      const theaders = [tableHeader, tableSep];

      if (groups.has(TOP_KEY)) {
        const items = groups.get(TOP_KEY).slice().sort((a, b) => b.priority - a.priority);
        lines.push('### Top-level Fields', '', ...theaders);
        for (const d of items) lines.push(formatRow(d));
        lines.push('');
      }
      for (const [gk, items] of groups) {
        if (gk === TOP_KEY) continue;
        const sorted = items.slice().sort((a, b) => b.priority - a.priority);
        lines.push(`### ${gk}`, '', ...theaders);
        for (const d of sorted) lines.push(formatRow(d));
        lines.push('');
      }

      if (statsDebugEntries.value.length) {
        lines.push('## Stats Smart Selection', '',
          '| Field | Type | Reason |', '|---|---|---|');
        for (const e of statsDebugEntries.value) {
          lines.push(`| ${e.key} | ${e.type} | ${e.reason} |`);
        }
      }

      function formatRow(d) {
        const prio = d.priority > 0 ? `+${d.priority}` : `${d.priority}`;
        return `| ${d.key} | ${prio} | ${formatBreakdown(d)} | ${d.currentVisible ? 'Yes' : 'No'} | ${d.visibilityReason} |`;
      }

      return lines.join('\n');
    }

    function copyRulesAsMarkdown() {
      const lines = ['## Priority Rules', ''];

      // HIGH patterns
      lines.push('### HIGH Priority Patterns', '',
        '| # | Pattern | Description | Delta | Matches |', '|---|---|---|---|---|');
      highPatterns.value.forEach((p, i) => {
        lines.push(`| ${i + 1} | \`${p.source}\` | ${p.comment} | +50/+40 | ${p.matchCount} |`);
      });

      lines.push('');

      // LOW patterns
      lines.push('### LOW Priority Patterns', '',
        '| # | Pattern | Description | Delta | Matches |', '|---|---|---|---|---|');
      lowPatterns.value.forEach((p, i) => {
        lines.push(`| ${i + 1} | \`${p.source}\` | ${p.comment} | -40 | ${p.matchCount} |`);
      });

      lines.push('');

      // Scoring algorithm
      lines.push('### Scoring Algorithm', '',
        '| Step | Factor | Condition | Delta | Description |', '|---|---|---|---|---|');
      for (const s of SCORING_STEPS) {
        const name = t('custom.' + s.nameKey);
        const desc = t('custom.' + s.nameKey.replace('Name', 'Desc'));
        lines.push(`| ${s.step} | ${name} | \`${s.condition}\` | ${s.delta} | ${desc} |`);
      }

      return lines.join('\n');
    }

    // ===== Priority Rules tab =====
    const debugActiveTab = ref('pipeline');
    const markdownExportTab = ref('scoring');

    const HIGH_PATTERN_COMMENTS = {
      '^model(_name)?$': 'Model, model_name',
      'token': 'OutputTokens, total_tokens, prompt_tokens',
      '^cost$': 'Cost',
      '^(latency|duration)': 'latency, latency_ms, duration',
      'finish\\w*[\\s_]*reason$': 'finish_reason, FinishedReason',
      '^stop_?reason$': 'StopReason, stop_reason',
      '^error[_]?(message|code|msg)?$': 'ErrorMessage, ErrorCode',
      '^(answer|reasoning)_?content$': 'AnswerContent, ReasoningContent',
      'result': 'result',
      '^model_?output$': 'model_output',
      '结果': '标注结果, 评分结果',
      '^(回答|答案|模型回答)': '模型回答, 回答内容',
    };

    const LOW_PATTERN_COMMENTS = {
      '^@': '@timestamp, @host, @offset',
      '^_raw': 'Internal expansion artifacts',
      '^index$': 'Row index',
      '^trace': 'trace_id, traceId',
      '^span': 'span_id, spanId',
      '^service$': 'service',
      '^func$': 'func',
      '_addr$': 'local_addr, remote_addr',
      'url$': 'ModelUrl, RequestUrl',
      'header$': 'RequestHeader, ResponseHeader',
      '^strategy': 'StrategyType',
      '^(request|schedule)(start|end)time$': 'RequestStartTime, ScheduleEndTime',
      '用时$': '评测用时',
      '时间$': '更新时间, 创建时间',
      '_?id$': 'request_id, 样本ID, TraceId',
      '^(样本|任务)\\s*ID$': '样本ID, 任务 ID',
      '序号$': 'Prompt序列号',
      '^(评测|标注|评审|打分)(人|员|者)?$': '评测人, 标注员, 评审者',
      '状态$': '样本状态, 审核状态',
      '^(一|二|三|四|五)级?分类': '一级分类, 二级分类',
      '^是否': '是否overlap, 是否正确',
    };

    function buildPatternTable(patterns, comments) {
      const counts = props.patternMatchCounts || {};
      return patterns.map(re => ({
        source: re.source,
        comment: comments[re.source] || '',
        matchCount: counts[re.source] || 0,
      }));
    }

    const highPatterns = computed(() => buildPatternTable(HIGH_PRIORITY_PATTERNS, HIGH_PATTERN_COMMENTS));
    const lowPatterns = computed(() => buildPatternTable(LOW_PRIORITY_PATTERNS, LOW_PATTERN_COMMENTS));
    const scoringSteps = computed(() => SCORING_STEPS);

    function getDeltaClass(delta) {
      if (delta === 'variable') return 'delta-variable';
      if (delta.startsWith('+')) return 'delta-bonus';
      if (delta.startsWith('-')) return 'delta-penalty';
      return 'delta-neutral';
    }

    return {
      localDistFields,
      localHistFields,
      searchQuery,
      showOnlyVisible,
      collapsedGroups,
      schemaExpanded,
      distExpanded,
      histExpanded,
      filteredTree,
      schemaText,
      getDisplayKey,
      getFieldNestingLevel,
      getFieldDisplayPath,
      toggleGroupCollapse,
      toggleShowOnlyVisible,
      onStatsChange,
      pluginSections,
      pluginsByStage,
      isPluginEnabled,
      onPluginToggle,
      onFieldChange,
      onReset,
      onRerunPipeline,
      onSaveConfig,
      onSavePreset,
      onPresetChange,
      typeTagType,
      getSmartTag,
      getSmartTagTooltip,
      getFieldDebugMeta,
      getReasonLabel,
      getReasonTooltip,
      getReasonDesc,
      debugDialogVisible,
      debugTableData,
      statsDebugEntries,
      formatBreakdown,
      copyDebugAsMarkdown,
      debugActiveTab,
      markdownExportTab,
      markdownPreviewText,
      highPatterns,
      lowPatterns,
      scoringSteps,
      getDeltaClass,
    };
  },
};
</script>

<style scoped>
.preset-section {
  margin-bottom: 12px;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-select {
  flex: 1;
}

/* Schema preview */
.schema-section {
  margin-bottom: 8px;
  border: 1px solid var(--ev-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
}

.schema-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  background: var(--ev-fill-color-lighter);
  user-select: none;
}

.schema-header:hover {
  background: var(--ev-fill-color);
}

.schema-arrow {
  transition: transform 0.2s;
  font-size: 12px;
  color: var(--ev-text-secondary);
}

.schema-arrow.is-expanded {
  transform: rotate(90deg);
}

.schema-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--ev-text-primary);
}

.schema-body {
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
}

.stats-collapse-body {
  padding: 4px 12px 8px;
}

.section-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--ev-text-placeholder);
}

.schema-pre {
  margin: 0;
  padding: 10px 12px;
  font-size: 11px;
  line-height: 1.5;
  background: var(--ev-bg-card, #fafafa);
  color: var(--ev-text-secondary);
  white-space: pre;
  overflow-x: auto;
}

/* Config sections */
.config-section {
  margin-bottom: 12px;
}

.config-section-title {
  font-size: 13px;
  color: var(--ev-text-secondary);
  margin-bottom: 6px;
}

/* Plugin rows */
.plugin-stage-group + .plugin-stage-group {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--ev-border-color-light);
}

.stage-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--ev-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-bottom: 4px;
  margin-bottom: 2px;
}

.plugin-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 0;
}

.plugin-row + .plugin-row {
  border-top: 1px solid var(--ev-border-color-lighter);
}

.plugin-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plugin-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--ev-text-primary);
}

.plugin-desc {
  font-size: 11px;
  color: var(--ev-text-secondary);
  line-height: 1.4;
}

.smart-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 500;
  color: var(--ev-color-primary);
  background: var(--ev-color-primary-light-9, rgba(64, 158, 255, 0.1));
  padding: 0 5px;
  border-radius: 3px;
  line-height: 1.5;
  margin-left: 4px;
  vertical-align: middle;
}

/* Field toolbar */
.field-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.field-search {
  flex: 1;
}

/* Field list */
.field-list {
  max-height: calc(100vh - 480px);
  overflow-y: auto;
  padding-bottom: 8px;
}

.field-empty {
  text-align: center;
  padding: 24px;
  color: var(--ev-text-secondary);
  font-size: 13px;
}

/* Group header */
.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  cursor: pointer;
  user-select: none;
  background: var(--ev-fill-color-lighter);
  border-radius: 4px;
  margin-bottom: 2px;
  margin-top: 4px;
}

.group-header:hover {
  background: var(--ev-fill-color);
}

.group-arrow {
  transition: transform 0.2s;
  font-size: 12px;
  color: var(--ev-text-secondary);
  flex-shrink: 0;
}

.group-arrow.is-expanded {
  transform: rotate(90deg);
}

.group-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ev-text-primary);
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.group-count {
  font-size: 11px;
  color: var(--ev-text-secondary);
  flex-shrink: 0;
  margin-left: auto;
}

/* Field row */
.field-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 28px;
  border-bottom: 1px solid var(--ev-border-color-lighter);
}

.field-row-expanded {
  background: var(--ev-fill-color-lighter);
}

.field-row-nested {
  padding-left: 42px;
}

.field-row-deep {
  padding-left: 56px;
}

.field-nest-badge {
  font-size: 10px;
  font-family: monospace;
  color: var(--ev-text-secondary);
  background: var(--ev-fill-color);
  padding: 0 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.group-nest-badge {
  font-size: 10px;
  font-family: monospace;
  color: var(--ev-text-secondary);
  background: var(--ev-fill-color);
  padding: 0 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.field-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.field-key {
  font-size: 12px;
  color: var(--ev-text-primary);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.field-type-tag {
  flex-shrink: 0;
}

.field-reason {
  font-size: 10px;
  color: var(--ev-text-secondary);
  opacity: 0.7;
  white-space: nowrap;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.reason-help {
  font-size: 12px;
  cursor: default;
  opacity: 0.5;
}

.reason-help:hover {
  opacity: 1;
}

.rules-help {
  font-size: 14px;
  cursor: default;
  margin-left: 4px;
  opacity: 0.5;
  vertical-align: middle;
}

.rules-help:hover {
  opacity: 1;
}

.field-empty-rate {
  font-size: 10px;
  color: var(--el-color-warning);
  white-space: nowrap;
  flex-shrink: 0;
}

.field-toggles {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

.breakdown-text {
  font-size: 12px;
  font-family: monospace;
  color: var(--ev-text-secondary);
  white-space: nowrap;
}

.footer-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Priority Rules tab */
.rules-section {
  margin-bottom: 4px;
}

.rules-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.rules-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ev-text-primary);
}

.rules-section-count {
  font-size: 12px;
  color: var(--ev-text-secondary);
}

.rules-note {
  font-size: 12px;
  color: var(--ev-text-secondary);
  margin: 0 0 6px 0;
  line-height: 1.5;
}

.regex-code,
.condition-code {
  font-size: 12px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background: var(--ev-fill-color);
  padding: 2px 6px;
  border-radius: 3px;
  word-break: break-all;
}

.regex-code {
  color: var(--el-color-primary);
}

.condition-code {
  color: var(--ev-text-primary);
}

.delta-bonus {
  color: var(--el-color-success);
  font-weight: 600;
}

.delta-penalty {
  color: var(--el-color-danger);
  font-weight: 600;
}

.delta-variable {
  color: var(--el-color-warning);
  font-weight: 500;
}

.delta-neutral {
  color: var(--ev-text-secondary);
}

.step-description {
  font-size: 12px;
  color: var(--ev-text-secondary);
  line-height: 1.5;
}

.markdown-preview pre {
  margin: 0;
  padding: 12px;
  background: var(--ev-fill-color-lighter);
  border: 1px solid var(--ev-border-color-lighter);
  border-radius: 6px;
  font-size: 12px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  line-height: 1.6;
  max-height: 65vh;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Score debug popover */
.score-debug-icon {
  font-size: 13px;
  color: var(--el-color-primary);
  cursor: pointer;
  opacity: 0.5;
  flex-shrink: 0;
  margin-left: 2px;
}

.score-debug-icon:hover {
  opacity: 1;
}

.score-debug-content {
  font-size: 12px;
}

.score-debug-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
}

.score-debug-label {
  color: var(--ev-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.score-debug-pattern {
  font-size: 11px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background: var(--ev-fill-color);
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--el-color-primary);
  word-break: break-all;
}

.score-debug-breakdown {
  font-size: 11px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  color: var(--ev-text-secondary);
  word-break: break-all;
}

.score-debug-link {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--ev-border-color-lighter);
}
</style>
