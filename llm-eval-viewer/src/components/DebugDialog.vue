<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    width="95%"
    top="2vh"
  >
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span>{{ $t('custom.debugTitle') }}</span>
        <div style="display:flex;gap:8px">
          <el-button size="small" @click="$emit('reset')">
            <el-icon><Refresh /></el-icon>
            {{ $t('custom.rerunPipeline') }}
          </el-button>
        </div>
      </div>
    </template>

    <el-tabs v-model="activeTab" lazy>
      <!-- Tab 1: Pipeline Debug -->
      <el-tab-pane :label="$t('custom.pipelineDebugButton')" name="pipeline">
        <div style="max-height:75vh;overflow-y:auto">
          <PipelineDebugContent :data="pipelineDebug" @plugin-toggle="$emit('plugin-toggle', $event)" @scroll-to-rule="onScrollToRule" />
        </div>
      </el-tab-pane>

      <!-- Tab 2: Priority Rules -->
      <el-tab-pane :label="$t('custom.debugPriorityRules')" name="rules">
        <div ref="rulesTabRef" style="max-height:75vh;overflow-y:auto">
          <!-- HIGH Priority Patterns -->
          <div class="rules-section">
            <div class="rules-section-header">
              <el-tag type="success" effect="dark" size="small">HIGH</el-tag>
              <span class="rules-section-title">{{ $t('custom.highPriorityPatterns') }}</span>
              <span class="rules-section-count">{{ $t('custom.patternMatchCount', { count: highPatterns.length }) }}</span>
            </div>
            <p class="rules-note">{{ $t('custom.scoringStepPatternDesc') }}</p>
            <el-table :data="highPatterns" border size="small" style="width:100%" :row-class-name="getRowClass">
              <el-table-column type="index" :label="$t('custom.scoringStep')" width="50" />
              <el-table-column :label="$t('custom.patternRegex')" min-width="240">
                <template #default="{ row }">
                  <code class="regex-code">{{ row.source }}</code>
                </template>
              </el-table-column>
              <el-table-column :label="$t('custom.scoringDescription')" min-width="160">
                <template #default="{ row }">{{ row.comment }}</template>
              </el-table-column>
              <el-table-column :label="$t('custom.scoringDelta')" width="100">
                <template #default><span class="delta-bonus">+50/+40</span></template>
              </el-table-column>
              <el-table-column :label="$t('custom.matchCount')" width="90" sortable sort-by="matchCount">
                <template #default="{ row }">
                  <el-popover
                    v-if="row.matchCount > 0"
                    placement="top"
                    :width="280"
                    trigger="click"
                  >
                    <template #reference>
                      <el-tag class="match-count-clickable" :type="'success'" size="small" effect="plain">{{ row.matchCount }}</el-tag>
                    </template>
                    <div class="matched-fields-popover">
                      <div class="matched-fields-title">{{ $t('custom.matchedFieldsTitle') }}</div>
                      <div v-for="field in getMatchedFields(row.source)" :key="field" class="matched-field-item">
                        <code>{{ field }}</code>
                      </div>
                    </div>
                  </el-popover>
                  <el-tag v-else type="info" size="small" effect="plain">{{ row.matchCount }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <!-- LOW Priority Patterns -->
          <div class="rules-section" style="margin-top:16px">
            <div class="rules-section-header">
              <el-tag type="danger" effect="dark" size="small">LOW</el-tag>
              <span class="rules-section-title">{{ $t('custom.lowPriorityPatterns') }}</span>
              <span class="rules-section-count">{{ $t('custom.patternMatchCount', { count: lowPatterns.length }) }}</span>
            </div>
            <el-table :data="lowPatterns" border size="small" style="width:100%" :row-class-name="getRowClass">
              <el-table-column type="index" :label="$t('custom.scoringStep')" width="50" />
              <el-table-column :label="$t('custom.patternRegex')" min-width="240">
                <template #default="{ row }">
                  <code class="regex-code">{{ row.source }}</code>
                </template>
              </el-table-column>
              <el-table-column :label="$t('custom.scoringDescription')" min-width="160">
                <template #default="{ row }">{{ row.comment }}</template>
              </el-table-column>
              <el-table-column :label="$t('custom.scoringDelta')" width="100">
                <template #default><span class="delta-penalty">-40</span></template>
              </el-table-column>
              <el-table-column :label="$t('custom.matchCount')" width="90" sortable sort-by="matchCount">
                <template #default="{ row }">
                  <el-popover
                    v-if="row.matchCount > 0"
                    placement="top"
                    :width="280"
                    trigger="click"
                  >
                    <template #reference>
                      <el-tag class="match-count-clickable" :type="'danger'" size="small" effect="plain">{{ row.matchCount }}</el-tag>
                    </template>
                    <div class="matched-fields-popover">
                      <div class="matched-fields-title">{{ $t('custom.matchedFieldsTitle') }}</div>
                      <div v-for="field in getMatchedFields(row.source)" :key="field" class="matched-field-item">
                        <code>{{ field }}</code>
                      </div>
                    </div>
                  </el-popover>
                  <el-tag v-else type="info" size="small" effect="plain">{{ row.matchCount }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <!-- Scoring Algorithm -->
          <el-divider content-position="left">{{ $t('custom.scoringAlgorithm') }}</el-divider>
          <p class="rules-note">{{ $t('custom.bonus') }}: {{ $t('custom.scoringDelta') }} &gt; 0 (green) &nbsp;|&nbsp; {{ $t('custom.penalty') }}: {{ $t('custom.scoringDelta') }} &lt; 0 (red)</p>
          <el-table :data="scoringSteps" border size="small" style="width:100%">
            <el-table-column prop="step" :label="$t('custom.scoringStep')" width="55" />
            <el-table-column :label="$t('custom.scoringFactor')" min-width="180">
              <template #default="{ row }">
                {{ row.nameKey ? $t('custom.' + row.nameKey) : '' }}
              </template>
            </el-table-column>
            <el-table-column :label="$t('custom.scoringCondition')" min-width="300">
              <template #default="{ row }">
                <code class="condition-code">{{ row.condition }}</code>
              </template>
            </el-table-column>
            <el-table-column :label="$t('custom.scoringDelta')" width="110">
              <template #default="{ row }">
                <span :class="getDeltaClass(row.delta)">{{ row.delta }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="$t('custom.scoringDescription')" min-width="240">
              <template #default="{ row }">
                <span class="step-description">{{ row.nameKey ? $t('custom.' + row.nameKey.replace('Name', 'Desc')) : '' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script>
import { ref, computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { Refresh } from '@element-plus/icons-vue';
import { HIGH_PRIORITY_PATTERNS, LOW_PRIORITY_PATTERNS, SCORING_STEPS } from '@/utils/customParserHelpers';
import PipelineDebugContent from '@/components/PipelineDebugContent.vue';

export default {
  components: { Refresh, PipelineDebugContent },

  props: {
    visible: Boolean,
    pipelineDebug: { type: Object, default: null },
    patternMatchCounts: { type: Object, default: () => null },
  },

  emits: ['update:visible', 'reset', 'plugin-toggle', 'scroll-to-rule'],

  setup(props) {
    const { t } = useI18n();
    const activeTab = ref('pipeline');
    const rulesTabRef = ref(null);

    // ===== Scroll to Rule =====
    function onScrollToRule({ category, patternSource }) {
      activeTab.value = 'rules';
      nextTick(() => {
        const container = rulesTabRef.value;
        if (!container) return;

        // Find the row with matching pattern by class name
        const escapedPattern = CSS.escape(patternSource || '');
        const target = container.querySelector(`.pattern-row-${escapedPattern}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Brief highlight
          target.classList.add('rule-row-highlight');
          setTimeout(() => target.classList.remove('rule-row-highlight'), 2000);
        }
      });
    }

    function getRowClass({ row }) {
      return row.source ? `pattern-row-${CSS.escape(row.source)}` : '';
    }

    // ===== Matched fields per pattern =====
    function getMatchedFields(patternSource) {
      const debugMeta = props.pipelineDebug?.scoring?.debugMeta || [];
      return debugMeta
        .filter(entry => entry.matchedPattern === patternSource)
        .map(entry => entry.key);
    }

    // ===== Priority Rules =====
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
      activeTab,
      rulesTabRef,
      onScrollToRule,
      getRowClass,
      getMatchedFields,
      highPatterns,
      lowPatterns,
      scoringSteps,
      getDeltaClass,
    };
  },
};
</script>

<style scoped>
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

.match-count-clickable {
  cursor: pointer;
}

.match-count-clickable:hover {
  opacity: 0.8;
}

.matched-fields-popover {
  max-height: 200px;
  overflow-y: auto;
}

.matched-fields-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-primary);
  margin-bottom: 6px;
}

.matched-field-item {
  font-size: 11px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  padding: 2px 0;
  color: var(--el-color-primary);
}

/* Highlight animation for scroll-to target */
:deep(.rule-row-highlight) {
  background-color: var(--el-color-primary-light-9) !important;
  transition: background-color 0.5s ease;
}
</style>
