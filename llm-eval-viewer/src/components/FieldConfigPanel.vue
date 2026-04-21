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

      <!-- Stats configuration -->
      <el-divider content-position="left">{{ $t('custom.statsConfig') }}</el-divider>

      <div v-if="enumFields.length" class="config-section">
        <div class="config-section-title">{{ $t('custom.distributionFields') }}</div>
        <el-checkbox-group v-model="localDistFields" @change="onStatsChange">
          <el-checkbox
            v-for="f in enumFields"
            :key="f.key"
            :label="f.key"
            size="small"
          >
            {{ f.label }}
            <span v-if="getSmartTag(f.key)" class="smart-tag">{{ getSmartTag(f.key) }}</span>
          </el-checkbox>
        </el-checkbox-group>
      </div>

      <div v-if="numericFields.length" class="config-section">
        <div class="config-section-title">{{ $t('custom.histogramFields') }}</div>
        <el-checkbox-group v-model="localHistFields" @change="onStatsChange">
          <el-checkbox
            v-for="f in numericFields"
            :key="f.key"
            :label="f.key"
            size="small"
          >
            {{ f.label }}
            <span v-if="getSmartTag(f.key)" class="smart-tag">{{ getSmartTag(f.key) }}</span>
          </el-checkbox>
        </el-checkbox-group>
      </div>

      <!-- Column configuration -->
      <el-divider content-position="left">{{ $t('custom.columnConfig') }}</el-divider>

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
                'field-row-nested': field.key.split('.').length > 2,
              }"
            >
              <!-- Visible toggle -->
              <el-checkbox v-model="field.visible" size="small" @change="onFieldChange" />

              <!-- Key path + label -->
              <div class="field-info">
                <span class="field-key" :title="field.key">
                  {{ getDisplayKey(field.key, group.groupKey) }}
                </span>
              </div>

              <!-- Type tag -->
              <el-tag
                :type="typeTagType(field.detectedType)"
                size="small"
                class="field-type-tag"
              >
                {{ field.detectedType === 'conversation' ? 'chat' : field.detectedType === 'toolList' ? 'tool' : field.detectedType }}
              </el-tag>

              <!-- Auto-visibility reason + empty rate annotation -->
              <span v-if="field.visibilityReason" class="field-reason" :title="getReasonTooltip(field)">
                {{ getReasonLabel(field.visibilityReason) }}
              </span>
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
      <el-button @click="onReset">
        {{ $t('custom.resetDefaults') }}
      </el-button>
      <el-button type="primary" @click="$emit('save')">
        {{ $t('common.copy') }} {{ $t('custom.fieldConfig') }}
      </el-button>
    </template>
  </el-drawer>
</template>

<script>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import { ArrowRight, Search } from '@element-plus/icons-vue';

export default {
  components: { ArrowRight, Search },

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
  },

  emits: [
    'close', 'save', 'stats-change', 'reset',
    'save-preset', 'apply-preset', 'delete-preset', 'clear-preset',
    'toggle-group',
  ],

  setup(props, { emit }) {
    const { t } = useI18n();
    const localDistFields = ref([]);
    const localHistFields = ref([]);
    const searchQuery = ref('');
    const showOnlyVisible = ref(false);
    const collapsedGroups = ref({});
    const schemaExpanded = ref(false);

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

    function toggleGroupCollapse(groupKey) {
      collapsedGroups.value[groupKey] = !collapsedGroups.value[groupKey];
    }

    function toggleShowOnlyVisible() {
      showOnlyVisible.value = !showOnlyVisible.value;
    }

    function onStatsChange() {
      emit('stats-change', {
        distributionFields: localDistFields.value,
        histogramFields: localHistFields.value,
      });
    }

    function onFieldChange() {
      // Field mutations are directly on the reactive object
    }

    function onReset() {
      emit('reset');
    }

    async function onSavePreset() {
      try {
        const { value } = await ElMessageBox.prompt('', '', {
          confirmButtonText: 'OK',
          cancelButtonText: '',
          inputPlaceholder: '',
        });
        if (value && value.trim()) {
          emit('save-preset', value.trim());
        }
      } catch {
        // User cancelled
      }
    }

    function onPresetChange(presetId) {
      if (presetId) {
        emit('apply-preset', presetId);
      } else {
        emit('clear-preset');
      }
    }

    function typeTagType(type) {
      switch (type) {
        case 'number': return 'primary';
        case 'boolean': return 'warning';
        case 'enum': return 'success';
        case 'conversation': return 'danger';
        case 'toolList': return 'primary';
        default: return 'info';
      }
    }

    function getSmartTag(fieldKey) {
      const reason = props.statsConfig?.selectionReasons?.[fieldKey];
      if (!reason) return '';
      return t(`custom.smartTag.${reason}`);
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

    return {
      localDistFields,
      localHistFields,
      searchQuery,
      showOnlyVisible,
      collapsedGroups,
      schemaExpanded,
      filteredTree,
      schemaText,
      getDisplayKey,
      toggleGroupCollapse,
      toggleShowOnlyVisible,
      onStatsChange,
      onFieldChange,
      onReset,
      onSavePreset,
      onPresetChange,
      typeTagType,
      getSmartTag,
      getReasonLabel,
      getReasonTooltip,
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.field-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
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
</style>
