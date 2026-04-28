<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div v-if="!data" class="pipeline-debug-empty">{{ $t('custom.pipelineDebugNoData') }}</div>
  <template v-else>
    <!-- 1. Pipeline Overview -->
    <div class="pipeline-debug-section">
      <h3>{{ $t('custom.pipelineDebugOverview') }}</h3>
      <div class="pipeline-timeline">
        <div v-for="stage in timelineStages" :key="stage.key"
          class="timeline-item"
          :class="{ 'timeline-ok': stage.ok, 'timeline-warn': stage.warn, 'timeline-skip': stage.skip }">
          <div class="timeline-icon">
            <el-icon v-if="stage.ok"><CircleCheckFilled /></el-icon>
            <el-icon v-else-if="stage.warn"><WarningFilled /></el-icon>
            <el-icon v-else><RemoveFilled /></el-icon>
          </div>
          <div class="timeline-content">
            <span class="timeline-label">{{ stage.label }}</span>
            <span v-if="stage.detail" class="timeline-detail">{{ stage.detail }}</span>
          </div>
        </div>
      </div>
    </div>

    <el-collapse v-model="activeSections" class="pipeline-debug-collapse">
      <!-- 2. Cache -->
      <el-collapse-item name="cache">
        <template #title>
          <span class="collapse-title">
            <el-icon><Coin /></el-icon> {{ $t('custom.pipelineDebugCache') }}
            <el-tag size="small" :type="data.cache?.status === 'hit' ? 'success' : 'info'">{{ data.cache?.status }}</el-tag>
          </span>
        </template>
        <div class="debug-table-wrap">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item :label="$t('custom.pipelineDebugCacheStatus')">
              <el-tag :type="data.cache?.status === 'hit' ? 'success' : 'warning'" size="small">{{ data.cache?.status }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="$t('custom.pipelineDebugFileId')">
              <code class="debug-code">{{ data.cache?.fileId }}</code>
            </el-descriptions-item>
            <el-descriptions-item label="Parser Version">{{ data.cache?.parserVersion }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </el-collapse-item>

      <!-- 3. Pipeline Stages -->
      <el-collapse-item name="pipeline">
        <template #title>
          <span class="collapse-title">
            <el-icon><Cpu /></el-icon> {{ $t('custom.pipelineDebugPlugins') }}
            <el-tag size="small" type="info">{{ data.pipeline?.detectedFormat }}</el-tag>
            <el-tag size="small">{{ data.pipeline?.rowCount }} rows</el-tag>
          </span>
        </template>
        <div class="debug-table-wrap" style="margin-top:12px">
          <h4>{{ $t('custom.pipelineDebugPlugins') }}</h4>
          <div v-for="stageGroup in pipelineStageGroups" :key="stageGroup.key" class="stage-group">
            <div class="stage-group-header">
              <span class="stage-group-label">{{ stageGroup.label }}</span>
              <span class="stage-group-time">{{ stageGroup.totalMs }}ms</span>
            </div>
            <el-card v-for="s in stageGroup.plugins" :key="s.id" class="plugin-card" shadow="never" :class="{ 'plugin-skipped': s.skipped, 'plugin-no-effect': s.noEffect }">
              <div class="plugin-card-row">
                <!-- TODO: plugin toggle 仍有 bug — 切换后调试面板的 skipped 状态偶尔不同步，
                     可能是 applyPlugins() 中 populatePipelineDebug 与 Vue 响应式更新的时序问题。
                     待排查：runPipeline 返回的 debug.stages 与 pipelineDebug store 的 diff。 -->
                <el-switch
                  :model-value="!s.skipped"
                  size="small"
                  :disabled="s.required"
                  @change="(val) => $emit('plugin-toggle', { id: s.id, enabled: val })"
                />
                <span class="plugin-name" :class="{ 'plugin-name-skipped': s.skipped }">{{ getPluginName(s.id) }}</span>
                <span v-if="getPluginDesc(s.id)" class="plugin-desc">{{ getPluginDesc(s.id) }}</span>
              </div>
              <div class="plugin-card-meta">
                <div style="display:flex;gap:4px;">
                  <el-tag size="small" :type="s.skipped ? 'info' : (s.noEffect ? 'warning' : (s.required ? undefined : 'success'))">
                    {{ s.skipped ? $t('custom.pipelineDebugPluginSkipped') : s.noEffect ? $t('custom.pipelineDebugPluginNoEffect') : $t('custom.pipelineDebugPluginRan') }}
                  </el-tag>
                  <el-tag size="small" v-if="s.fieldsBefore != null">{{ s.fieldsBefore }} &rarr; {{ s.fieldsAfter }}</el-tag>
                  <el-tag size="small" type="success" v-if="s.elapsedMs">{{ s.elapsedMs }}ms</el-tag>
                </div>
              </div>
              <div v-if="s.summary" class="plugin-summary">{{ s.summary }}</div>
              <div class="plugin-changes">
                <span v-if="s.addedKeys?.length" class="plugin-added">+ {{ s.addedKeys.join(', ') }}</span>
                <span v-if="s.removedKeys?.length" class="plugin-removed">- {{ s.removedKeys.join(', ') }}</span>
              </div>
              <template v-if="s.debug">
              <div class="plugin-debug-json-toggle" @click="togglePluginDebug(s.id)">
                <span>Debug JSON</span>
                <span class="toggle-arrow">{{ pluginDebugExpanded[s.id] ? '▾' : '▸' }}</span>
              </div>
              <pre v-show="pluginDebugExpanded[s.id]" class="plugin-debug-detail" v-html="formatObj(s.debug)"></pre>
              </template>
            </el-card>
            <div v-if="!stageGroup.plugins.length" class="debug-empty">{{ $t('custom.pipelineDebugNoPlugins') }}</div>
          </div>
        </div>
      </el-collapse-item>

      <!-- 4. Type Rules -->
      <el-collapse-item name="typeRules">
        <template #title>
          <span class="collapse-title">
            <el-icon><Grid /></el-icon> {{ $t('custom.pipelineDebugTypeRules') }}
            <el-tag size="small">{{ typeRuleList.length }} rules</el-tag>
          </span>
        </template>
        <div class="type-rules-list">
          <div
            v-for="(rule, idx) in typeRuleList"
            :key="rule.id"
            :id="'rule-' + rule.id"
            class="type-rule-item"
            :class="{ 'type-rule-highlighted': highlightedRule === rule.id }"
          >
            <div class="type-rule-header">
              <span class="type-rule-order">#{{ idx + 1 }}</span>
              <el-tag size="small" type="info">{{ rule.order }}</el-tag>
              <span class="type-rule-name">{{ getTypeRuleName(rule.id) }}</span>
              <span class="type-rule-desc">{{ getTypeRuleDesc(rule.id) }}</span>
              <el-tag size="small" :type="ruleHitCounts[rule.id] > 0 ? 'success' : 'info'">
                {{ ruleHitCounts[rule.id] || 0 }} hits
              </el-tag>
            </div>
          </div>
        </div>
      </el-collapse-item>

      <!-- 5. Type Detection -->
      <el-collapse-item name="types">
        <template #title>
          <span class="collapse-title">
            <el-icon><DocumentCopy /></el-icon> {{ $t('custom.pipelineDebugTypeDetection') }}
            <el-tag size="small">{{ scoringFields.length }} fields</el-tag>
          </span>
        </template>
        <el-table :data="typeTreeData" border size="small" max-height="40vh" style="width:100%" :row-key="row => row.fullPath || row.key" :default-expanded-keys="treeRootKeys" :tree-props="{ children: 'children' }">
          <el-table-column prop="key" label="Field" show-overflow-tooltip>
            <template #default="{ row }">{{ row.isGroupHeader ? row.key + ' (展开字段)' : row.key }}</template>
          </el-table-column>
          <el-table-column label="Visible" width="70">
            <template #default="{ row }">
              <template v-if="row.visible != null">
                <el-icon :color="row.visible ? '#67c23a' : '#f56c6c'"><CircleCheckFilled v-if="row.visible" /><CircleCloseFilled v-else /></el-icon>
              </template>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="detectedType" label="Type" width="120">
            <template #default="{ row }"><el-tag v-if="row.detectedType" size="small" :type="typeTagType(row.detectedType)">{{ row.detectedType }}</el-tag><span v-else>-</span></template>
          </el-table-column>
          <el-table-column prop="typeRule" :label="$t('custom.pipelineDebugTypeRule')" width="130">
            <template #default="{ row }">
              <span v-if="row.typeRule" class="debug-link" @click="scrollToRule(row.typeRule)">{{ getTypeRuleName(row.typeRule) }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="emptyRate" label="Empty %" width="80" sortable sort-by="emptyRate">
            <template #default="{ row }">{{ row.emptyRate != null ? pct(row.emptyRate) : '-' }}</template>
          </el-table-column>
          <el-table-column prop="uniqueCount" label="Unique" width="80" sortable sort-by="uniqueCount">
            <template #default="{ row }">{{ row.uniqueCount != null ? row.uniqueCount : '-' }}</template>
          </el-table-column>
          <el-table-column prop="avgValueLength" label="Avg Len" width="80" sortable sort-by="avgValueLength">
            <template #default="{ row }">{{ row.avgValueLength != null ? row.avgValueLength : '-' }}</template>
          </el-table-column>
          <el-table-column prop="visibilityReason" label="Reason" width="130" />
        </el-table>
      </el-collapse-item>

      <!-- 5. Scoring -->
      <el-collapse-item name="scoring">
        <template #title>
          <span class="collapse-title">
            <el-icon><DataAnalysis /></el-icon> {{ $t('custom.pipelineDebugScoring') }}
            <el-tag size="small">{{ data.scoring?.debugMeta?.length || 0 }} entries</el-tag>
          </span>
        </template>
        <el-table :data="scoringTreeData" border size="small" max-height="40vh" style="width:100%" :row-key="row => row.fullPath || row.key" :default-expanded-keys="treeRootKeys" :tree-props="{ children: 'children' }" :default-sort="{ prop: 'score', order: 'descending' }">
          <el-table-column prop="key" label="Field" show-overflow-tooltip>
            <template #default="{ row }">{{ row.isGroupHeader ? row.key + ' (展开字段)' : row.key }}</template>
          </el-table-column>
          <el-table-column label="Visible" width="70">
            <template #default="{ row }">
              <template v-if="row.visible != null">
                <el-icon :color="row.visible ? '#67c23a' : '#f56c6c'"><CircleCheckFilled v-if="row.visible" /><CircleCloseFilled v-else /></el-icon>
              </template>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="score" :label="$t('custom.pipelineDebugScorePriority')" width="90" sortable sort-by="score">
            <template #default="{ row }">
              <span v-if="row.score != null" :style="{ color: row.score > 0 ? 'var(--el-color-success)' : row.score <= -30 ? 'var(--el-color-danger)' : '' }">{{ row.score > 0 ? '+' : '' }}{{ row.score }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="detectedType" label="Type" width="100">
            <template #default="{ row }"><el-tag v-if="row.detectedType" size="small" :type="typeTagType(row.detectedType)">{{ row.detectedType }}</el-tag><span v-else>-</span></template>
          </el-table-column>
          <el-table-column prop="typeRule" :label="$t('custom.pipelineDebugTypeRule')" width="130">
            <template #default="{ row }">
              <span v-if="row.typeRule" class="debug-link" @click="scrollToRule(row.typeRule)">{{ getTypeRuleName(row.typeRule) }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="visibilityReason" :label="$t('custom.pipelineDebugScoreReason')" width="140">
            <template #default="{ row }">
              <span
                v-if="row.patternCategory === 'high' || row.patternCategory === 'low'"
                class="debug-link"
                @click="onScrollToRule(row)"
              >{{ row.visibilityReason }}</span>
              <span v-else>{{ row.visibilityReason }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="patternCategory" label="Pattern" width="90">
            <template #default="{ row }">
              <span
                v-if="row.patternCategory === 'high' || row.patternCategory === 'low'"
                class="debug-link"
                @click="onScrollToRule(row)"
              >{{ row.patternCategory || '-' }}</span>
              <span v-else>{{ row.patternCategory || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Pat" width="60"><template #default="{ row }">{{ row.patternPenalty != null ? (row.patternPenalty > 0 ? '+' : '') + row.patternPenalty : '-' }}</template></el-table-column>
          <el-table-column label="Empty" width="55"><template #default="{ row }">{{ row.emptyPenalty ? '-' + row.emptyPenalty : '-' }}</template></el-table-column>
          <el-table-column label="Const" width="55"><template #default="{ row }">{{ row.constantPenalty ? '-' + row.constantPenalty : '-' }}</template></el-table-column>
          <el-table-column label="Uniq" width="50"><template #default="{ row }">{{ row.uniqueBonus > 0 ? '+' : '' }}{{ row.uniqueBonus || '-' }}</template></el-table-column>
          <el-table-column label="Cont" width="50"><template #default="{ row }">{{ row.contentBonus > 0 ? '+' : '' }}{{ row.contentBonus || '-' }}</template></el-table-column>
          <el-table-column label="Type" width="50"><template #default="{ row }">{{ row.typeBonus != null ? (row.typeBonus > 0 ? '+' : '') + row.typeBonus : '-' }}</template></el-table-column>
        </el-table>
      </el-collapse-item>

      <!-- 6. Tag Assignment -->
      <el-collapse-item name="tags">
        <template #title>
          <span class="collapse-title">
            <el-icon><PriceTag /></el-icon> {{ $t('custom.pipelineDebugTags') }}
            <el-tag size="small">{{ tagTreeData.length }} fields</el-tag>
          </span>
        </template>
        <el-table :data="tagTreeData" border size="small" max-height="40vh" style="width:100%" :row-key="row => row.fullPath || row.key" :default-expanded-keys="treeRootKeys" :tree-props="{ children: 'children' }">
          <el-table-column prop="key" label="Field" show-overflow-tooltip min-width="180">
            <template #default="{ row }">{{ row.isGroupHeader ? row.key + ' (expanded)' : row.key }}</template>
          </el-table-column>
          <el-table-column label="Preview" width="160">
            <template #default="{ row }">
              <div v-if="row.previewable != null" class="tag-cell">
                <el-icon :size="14" :color="row.previewable ? '#67c23a' : '#c0c4cc'"><CircleCheckFilled v-if="row.previewable" /><CircleCloseFilled v-else /></el-icon>
                <span class="tag-reason">{{ translateTagReason(row.previewableReason) }}</span>
              </div>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="Search" width="160">
            <template #default="{ row }">
              <div v-if="row.searchable != null" class="tag-cell">
                <el-icon :size="14" :color="row.searchable ? '#67c23a' : '#c0c4cc'"><CircleCheckFilled v-if="row.searchable" /><CircleCloseFilled v-else /></el-icon>
                <span class="tag-reason">{{ translateTagReason(row.searchableReason) }}</span>
              </div>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="Filter" width="160">
            <template #default="{ row }">
              <div v-if="row.filterable != null" class="tag-cell">
                <el-icon :size="14" :color="row.filterable ? '#67c23a' : '#c0c4cc'"><CircleCheckFilled v-if="row.filterable" /><CircleCloseFilled v-else /></el-icon>
                <span class="tag-reason">{{ translateTagReason(row.filterableReason) }}</span>
              </div>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="Sort" width="160">
            <template #default="{ row }">
              <div v-if="row.sortable != null" class="tag-cell">
                <el-icon :size="14" :color="row.sortable ? '#67c23a' : '#c0c4cc'"><CircleCheckFilled v-if="row.sortable" /><CircleCloseFilled v-else /></el-icon>
                <span class="tag-reason">{{ translateTagReason(row.sortableReason) }}</span>
              </div>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column :label="$t('custom.pipelineDebugTagSource')" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.tagSource" size="small" :type="row.tagSource === 'scoring' ? '' : 'warning'">
                {{ row.tagSource === 'scoring' ? $t('custom.pipelineDebugTagSourceScoring') : $t('custom.pipelineDebugTagSourceReconstruct') }}
              </el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
      </el-collapse-item>

      <el-collapse-item name="samples">
        <template #title>
          <span class="collapse-title"><el-icon><View /></el-icon> {{ $t('custom.pipelineDebugSamples') }}</span>
        </template>
        <el-tabs v-model="sampleTab" lazy>
          <el-tab-pane :label="$t('custom.pipelineDebugSampleOriginal')" name="original">
            <JsonViewer v-if="sampleTab === 'original' && samplesOriginal" :data="samplesOriginal" class="json-inspector" />
            <div v-else-if="sampleTab === 'original'" class="debug-empty">{{ $t('custom.pipelineDebugNoSample') }}</div>
          </el-tab-pane>
          <el-tab-pane :label="$t('custom.pipelineDebugSampleAfterPlugins')" name="afterPlugins">
            <JsonViewer v-if="sampleTab === 'afterPlugins' && samplesAfterPlugins" :data="samplesAfterPlugins" class="json-inspector" />
            <div v-else-if="sampleTab === 'afterPlugins'" class="debug-empty">{{ $t('custom.pipelineDebugNoSample') }}</div>
          </el-tab-pane>
        </el-tabs>
      </el-collapse-item>
    </el-collapse>
  </template>
</template>

<script>
import { ref, computed, getCurrentInstance } from 'vue';
import { useI18n } from 'vue-i18n';
import JsonViewer from '@/components/JsonViewer.vue';
import { getRegisteredPlugins } from '@/plugins/pluginRegistry';
import { getTypeRules } from '@/utils/typeRuleRegistry';
import {
  CircleCheckFilled, CircleCloseFilled, WarningFilled, RemoveFilled,
  Coin, Cpu, DocumentCopy, DataAnalysis, View, Grid, PriceTag,
} from '@element-plus/icons-vue';

export default {
  name: 'PipelineDebugContent',
  components: {
    JsonViewer,
    CircleCheckFilled, CircleCloseFilled, WarningFilled, RemoveFilled,
    Coin, Cpu, DocumentCopy, DataAnalysis, View, Grid, PriceTag,
  },
  props: {
    data: Object,
  },
  emits: ['copy-markdown', 'plugin-toggle', 'scroll-to-rule'],
  setup(props) {
    const { t } = useI18n();
    const instance = getCurrentInstance();
    const allPlugins = computed(() => getRegisteredPlugins());
    const activeSections = ref(['cache', 'pipeline', 'typeRules', 'types', 'scoring', 'tags', 'samples']);
    const sampleTab = ref('original');
    const pluginDebugExpanded = ref({});

    function getPluginName(id) {
      const p = allPlugins.value.find(p => p.id === id);
      return p ? (p.nameKey ? t(p.nameKey) : p.name) : id;
    }
    function getPluginDesc(id) {
      const p = allPlugins.value.find(p => p.id === id);
      return p ? (p.descriptionKey ? t(p.descriptionKey) : p.description || '') : '';
    }

    function getTypeRuleName(ruleId) {
      if (!ruleId) return '-';
      const rule = getTypeRules().find(r => r.id === ruleId);
      return rule ? (rule.nameKey ? t('custom.' + rule.nameKey) : rule.name || ruleId) : ruleId;
    }

    function getTypeRuleDesc(ruleId) {
      if (!ruleId) return '';
      const rule = getTypeRules().find(r => r.id === ruleId);
      return rule ? (rule.descriptionKey ? t('custom.' + rule.descriptionKey) : rule.description || '') : '';
    }

    const typeRuleList = computed(() => getTypeRules());

    // Count how many fields matched each rule
    const ruleHitCounts = computed(() => {
      const counts = {};
      for (const field of scoringFields.value) {
        if (field.typeRule) {
          counts[field.typeRule] = (counts[field.typeRule] || 0) + 1;
        }
      }
      return counts;
    });

    const highlightedRule = ref(null);

    function scrollToRule(ruleId) {
      if (!ruleId) return;
      highlightedRule.value = ruleId;
      const el = document.getElementById('rule-' + ruleId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { highlightedRule.value = null; }, 1500);
      }
    }

    function togglePluginDebug(id) {
      pluginDebugExpanded.value[id] = !pluginDebugExpanded.value[id];
    }

    const timelineStages = computed(() => {
      const d = props.data;
      if (!d) return [];
      const visibleCount = (d.scoring?.debugMeta?.filter(f => f.visible).length || 0);
      return [
        { key: 'cache', label: t('custom.pipelineDebugCache'), ok: d.cache?.status === 'hit', warn: d.cache?.status === 'miss', detail: d.cache?.status },
        { key: 'parse', label: t('custom.pipelineDebugStageParse'), ok: !!d.pipeline?.detectedFormat, detail: d.pipeline?.detectedFormat || '-' },
        { key: 'transform', label: t('custom.pipelineDebugStageTransform'), ok: true, detail: (d.pipeline?.rowCount || 0) + ' rows' },
        { key: 'post', label: t('custom.pipelineDebugStagePost'), ok: (d.scoring?.debugMeta?.length || 0) > 0, detail: visibleCount + ' visible / ' + (d.scoring?.debugMeta?.length || 0) + ' fields' },
      ];
    });

    const scoringFields = computed(() => props.data?.scoring?.debugMeta || []);

    /**
     * Merge real tree data with flat debugMeta scores.
     * Walk the tree from detectTypes and attach scoring data (visible, score, etc.)
     * from debugMeta (which is keyed by fullPath).
     */
    function buildEnrichedTree(meta, sortBy) {
      // If real tree data is available, use it
      const rawTree = props.data?.scoring?.fieldTree;
      if (rawTree && rawTree.length > 0) {
        const metaMap = new Map();
        for (const field of meta) {
          metaMap.set(field.key, field);
        }

        function enrichNode(node) {
          const debugEntry = metaMap.get(node.fullPath || node.key);
          let enrichedChildren;
          if (node.children) {
            enrichedChildren = node.children.map(enrichNode).filter(Boolean);
          }
          if (debugEntry) {
            return { ...node, ...debugEntry, key: node.key, children: enrichedChildren || node.children };
          }
          // No scoring data — keep as structural node (always preserve tree structure)
          return { ...node, score: '-', visible: false, visibilityReason: 'default', children: enrichedChildren || node.children };
        }

        return rawTree.map(enrichNode).filter(Boolean);
      }

      // Fallback: build synthetic multi-level tree from flat debugMeta
      const allNodes = new Map(); // fullPath → node

      for (const field of meta) {
        allNodes.set(field.key, { ...field, _isLeaf: true });
      }

      // Build tree structure from dot paths
      const rootNodes = [];
      for (const [path, field] of allNodes) {
        const segments = path.split('.');
        // Create intermediate parent nodes if missing
        let currentPath = '';
        for (let i = 0; i < segments.length - 1; i++) {
          const parentPath = currentPath ? currentPath + '.' + segments[i] : segments[i];
          currentPath = parentPath;
          if (!allNodes.has(parentPath)) {
            allNodes.set(parentPath, {
              key: segments[i],
              fullPath: parentPath,
              _isLeaf: false,
              isGroupHeader: true,
              detectedType: 'nestedObject',
              children: [],
            });
          }
        }
      }

      // Build parent-child relationships
      for (const [path, node] of allNodes) {
        if (node._isLeaf) {
          const dotIdx = path.lastIndexOf('.');
          if (dotIdx < 0) {
            rootNodes.push(node);
          } else {
            const parentPath = path.substring(0, dotIdx);
            const parent = allNodes.get(parentPath);
            if (parent) {
              if (!parent.children) parent.children = [];
              parent.children.push(node);
            } else {
              rootNodes.push(node);
            }
          }
        }
      }

      // Collect remaining parents as roots
      for (const [path, node] of allNodes) {
        if (!node._isLeaf && !node.children?.length) continue;
        const dotIdx = path.lastIndexOf('.');
        if (dotIdx < 0 && !rootNodes.includes(node)) {
          node.children = (node.children || []).sort(sortBy);
          rootNodes.push(node);
        } else if (dotIdx >= 0) {
          const parentPath = path.substring(0, dotIdx);
          const parent = allNodes.get(parentPath);
          if (parent && !parent.children?.includes(node)) {
            if (!parent.children) parent.children = [];
            parent.children.push(node);
          }
        }
      }

      // Sort recursively
      function sortTree(nodes) {
        if (!nodes) return;
        nodes.sort(sortBy);
        for (const n of nodes) {
          if (n.children) sortTree(n.children);
        }
      }
      sortTree(rootNodes);

      return rootNodes;
    }

    const typeTreeData = computed(() => buildEnrichedTree(scoringFields.value, (a, b) => a.key.localeCompare(b.key)));

    const scoringTreeData = computed(() => buildEnrichedTree(scoringFields.value, (a, b) => (b.score || 0) - (a.score || 0)));

    const treeRootKeys = computed(() => {
      // Collect ALL non-leaf nodes so all tree levels are expanded by default
      const keys = [];
      function collectKeys(nodes) {
        for (const node of nodes) {
          const id = node.fullPath || node.key;
          if (node.children && node.children.length > 0) {
            keys.push(id);
            collectKeys(node.children);
          }
        }
      }
      collectKeys(scoringTreeData.value);
      return keys;
    });

    const STAGE_ORDER = ['parse', 'transform', 'analyze', 'post'];
    const STAGE_LABELS = computed(() => ({
      parse: t('custom.pipelineDebugStageParse'),
      transform: t('custom.pipelineDebugStageTransform'),
      analyze: t('custom.pipelineDebugStageAnalyze'),
      post: t('custom.pipelineDebugStagePost'),
    }));

    const pipelineStageGroups = computed(() => {
      const stages = props.data?.pipeline?.stages || [];
      const groups = {};
      for (const key of STAGE_ORDER) {
        groups[key] = [];
      }
      for (const s of stages) {
        const bucket = groups[s.stage] || groups['post'];
        if (bucket) bucket.push(s);
      }
      return STAGE_ORDER
        .filter(key => groups[key].length > 0)
        .map(key => {
          const plugins = groups[key].map(s => ({
            ...s,
            noEffect: !s.skipped && s.elapsedMs === 0 && !s.summary,
          }));
          return {
            key,
            label: STAGE_LABELS.value[key] || key,
            totalMs: plugins.reduce((sum, s) => sum + (s.elapsedMs || 0), 0),
            plugins,
          };
        });
    });

    function stripInternalKeys(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      const clone = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith('_raw_') || k.startsWith('_decoded_') || k.startsWith('_reconstructed_') || k === '_rawJsonText' || k === '__index') continue;
        clone[k] = v;
      }
      return clone;
    }

    const samplesOriginal = computed(() => { const s = props.data?.samples?.original; return s ? stripInternalKeys(s) : null; });
    const samplesAfterPlugins = computed(() => { const s = props.data?.samples?.afterPlugins; return s ? stripInternalKeys(s) : null; });

    function pct(val) { return val != null ? Math.round(val * 100) + '%' : '-'; }
    function typeTagType(type) {
      const map = { conversation: 'success', toolList: 'warning', enum: 'info', number: '', boolean: 'info', nestedObject: 'warning', nestedArray: '', decodedJson: 'success' };
      return map[type] || 'info';
    }

    function formatObj(obj) {
      const json = JSON.stringify(obj, null, 2);
      return json
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"([^"]+)"(?=\s*:)/g, '<span class="pj-key">"$1"</span>')
        .replace(/:\s*"([^"]*)"/g, ': <span class="pj-str">"$1"</span>')
        .replace(/:\s*(\d+\.?\d*)/g, ': <span class="pj-num">$1</span>')
        .replace(/:\s*(true|false)/g, ': <span class="pj-bool">$1</span>')
        .replace(/:\s*(null)/g, ': <span class="pj-null">$1</span>');
    }

    function onScrollToRule(row) {
      if (!row.patternCategory || row.patternCategory === 'none' || row.patternCategory === 'conversation') return;
      instance.emit('scroll-to-rule', {
        category: row.patternCategory,
        patternSource: row.matchedPattern || null,
      });
    }

    // Build tag override map from reconstructDotNotation plugin debug
    const tagOverrideMap = computed(() => {
      const stages = props.data?.pipeline?.stages || [];
      const map = new Map(); // key → { tag → { from, to, reason } }
      for (const s of stages) {
        if (!s.debug?.tagOverrides) continue;
        for (const o of s.debug.tagOverrides) {
          if (!map.has(o.key)) map.set(o.key, {});
          map.get(o.key)[o.tag] = o;
        }
      }
      return map;
    });

    const tagTreeData = computed(() => {
      const meta = scoringFields.value;
      if (!meta.length) return [];
      const overrides = tagOverrideMap.value;

      const enriched = buildEnrichedTree(meta, (a, b) => a.key.localeCompare(b.key));

      // Merge override info into tree nodes
      function mergeOverrides(nodes) {
        for (const node of nodes) {
          const key = node.fullPath || node.key;
          const fieldOverrides = overrides.get(key);
          if (fieldOverrides) {
            node.tagSource = 'reconstruct';
          }
          if (node.children) mergeOverrides(node.children);
        }
      }
      mergeOverrides(enriched);
      return enriched;
    });

    const TAG_REASON_KEY_MAP = {
      'type=enum': 'pipelineDebugTagReasonTypeEnum',
      'type=string': 'pipelineDebugTagReasonTypeString',
      'type=conversation': 'pipelineDebugTagReasonTypeConversation',
      'type=toolList': 'pipelineDebugTagReasonTypeToolList',
      'type=number': 'pipelineDebugTagReasonTypeNumber',
      'type\u2260enum': 'pipelineDebugTagReasonTypeNotEnum',
      'type\u2260enum\u0026\u0026type\u2260string': 'pipelineDebugTagReasonTypeNotEnumString',
      'type\u2260number': 'pipelineDebugTagReasonTypeNotNumber',
      'non-expanded (disabled)': 'pipelineDebugTagReasonNonExpanded',
      'non-expanded (always)': 'pipelineDebugTagReasonNonExpandedAlways',
      'hasConversationPath': 'pipelineDebugTagReasonHasConversationPath',
      'isLongString': 'pipelineDebugTagReasonIsLongString',
      'none': 'pipelineDebugTagReasonNone',
      'reconstructed_root': 'pipelineDebugTagReasonReconstructRoot',
      'reconstruct:conversation': 'pipelineDebugTagReasonReconstructConversation',
      'reconstruct:toolList': 'pipelineDebugTagReasonReconstructToolList',
    };

    function translateTagReason(reason) {
      if (!reason) return '-';
      const key = TAG_REASON_KEY_MAP[reason];
      return key ? t('custom.' + key) : reason;
    }

    return { activeSections, sampleTab, pluginDebugExpanded, togglePluginDebug, timelineStages, pipelineStageGroups, scoringFields, typeTreeData, scoringTreeData, treeRootKeys, tagTreeData, samplesOriginal, samplesAfterPlugins, pct, typeTagType, formatObj, getPluginName, getPluginDesc, getTypeRuleName, getTypeRuleDesc, typeRuleList, ruleHitCounts, highlightedRule, scrollToRule, onScrollToRule, translateTagReason };
  },
};
</script>

<style scoped>
.pipeline-debug-empty {
  text-align: center;
  padding: 40px;
  color: var(--el-text-color-secondary);
}

.pipeline-debug-section {
  margin-bottom: 16px;
}

.pipeline-debug-section h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.pipeline-timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.timeline-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  border: 1px solid var(--el-border-color-lighter);
}

.timeline-ok { background: var(--el-color-success-light-9); border-color: var(--el-color-success-light-5); }
.timeline-ok .timeline-icon { color: var(--el-color-success); }
.timeline-warn { background: var(--el-color-warning-light-9); border-color: var(--el-color-warning-light-5); }
.timeline-warn .timeline-icon { color: var(--el-color-warning); }
.timeline-skip { background: var(--el-fill-color-light); }
.timeline-skip .timeline-icon { color: var(--el-text-color-placeholder); }
.timeline-label { font-weight: 500; }
.timeline-detail { color: var(--el-text-color-secondary); font-size: 12px; margin-left: 4px; }

.pipeline-debug-collapse { margin-top: 8px; }
.collapse-title { display: flex; align-items: center; gap: 6px; font-weight: 500; }
.debug-table-wrap { margin-bottom: 8px; }
.debug-table-wrap h4 { margin: 0 0 8px 0; font-size: 13px; color: var(--el-text-color-regular); }
.debug-code { font-size: 12px; background: var(--el-fill-color); padding: 2px 6px; border-radius: 3px; word-break: break-all; }
.debug-empty { color: var(--el-text-color-placeholder); font-size: 13px; padding: 8px 0; }

/* Type Rules list */
.type-rules-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.type-rule-item {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.3s ease;
}

.type-rule-item.type-rule-highlighted {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}

.type-rule-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-rule-order {
  font-size: 12px;
  font-weight: 700;
  color: var(--el-text-color-secondary);
  min-width: 22px;
}

.type-rule-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.type-rule-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.debug-warn { color: var(--el-color-warning); font-size: 12px; }

.stage-group { margin-bottom: 16px; }
.stage-group-header {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0 8px; border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 8px;
}
.stage-group-label {
  font-weight: 600; font-size: 13px; text-transform: uppercase;
  color: var(--el-text-color-primary);
}
.stage-group-time { font-size: 12px; color: var(--el-text-color-secondary); }

.plugin-card { margin-bottom: 8px; }
.plugin-card-plugin-skipped { opacity: 0.5; }
.plugin-card-plugin-no-effect { opacity: 0.7; }
.plugin-card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.plugin-card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
}
.plugin-name { font-weight: 600; font-size: 14px; }
.plugin-name-skipped { text-decoration: line-through; }
.plugin-desc { font-size: 12px; color: var(--el-text-color-secondary); }
.plugin-summary { font-size: 13px; color: var(--el-text-color-secondary); margin-top: 4px; }
.plugin-changes { margin-top: 6px; font-size: 12px; }
.plugin-added { color: var(--el-color-success); margin-right: 12px; }
.plugin-removed { color: var(--el-color-danger); }
.plugin-debug-detail {
  margin: 0;
  padding: 8px;
  background: var(--el-fill-color);
  border-radius: 4px;
  font-size: 12px;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.plugin-debug-json-toggle {
  margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary);
  cursor: pointer; user-select: none; display: flex; justify-content: space-between; align-items: center;
  padding: 4px 8px; border-radius: 4px; background: var(--el-fill-color-lighter);
}
.plugin-debug-json-toggle:hover { background: var(--el-fill-color); }
.toggle-arrow { font-size: 10px; }

.json-inspector { max-height: 50vh; overflow: auto; padding: 8px; background: var(--ev-fill-color-lighter); border-radius: 4px; }

.debug-link {
  color: var(--el-color-primary);
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

.debug-link:hover {
  color: var(--el-color-primary-light-3);
  text-decoration-style: solid;
}

.tag-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-reason {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>