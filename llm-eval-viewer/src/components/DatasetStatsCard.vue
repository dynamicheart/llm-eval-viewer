<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div v-if="stats.length" class="stats-card">
    <div class="title">{{ $t('datasetStats.title') }}</div>
    <el-table :data="stats" border size="small" style="width: 100%" @row-click="onRowClick" row-class-name="clickable-row">
      <el-table-column prop="dataset" :label="$t('datasetStats.dataset')" width="140" />
      <el-table-column prop="total" :label="$t('datasetStats.questions')" width="80" align="center" sortable />
      <el-table-column prop="correct" :label="$t('datasetStats.correct')" width="70" align="center">
        <template #default="{ row }">
          <span class="filter-link" @click.stop="emit('filter', { dataset: row.dataset, result: 'correct' })">{{ row.correct }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="wrong" :label="$t('datasetStats.wrong')" width="70" align="center">
        <template #default="{ row }">
          <span class="text-danger filter-link" @click.stop="emit('filter', { dataset: row.dataset, result: 'wrong' })">{{ row.wrong }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('datasetStats.accuracy')" width="100" align="center" sortable :sort-method="(a, b) => a.accuracy - b.accuracy">
        <template #default="{ row }">
          <span style="font-size: 12px">{{ row.accuracy }}%</span>
        </template>
      </el-table-column>
      <el-table-column prop="avgPromptTokens" label="Avg Prompt Token" width="130" align="center" sortable>
        <template #default="{ row }">
          <span class="text-muted">{{ row.avgPromptTokens }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="avgCompletionTokens" label="Avg Comp Token" width="130" align="center" sortable>
        <template #default="{ row }">
          <span class="text-muted">{{ row.avgCompletionTokens }}</span>
        </template>
      </el-table-column>
      <el-table-column label="Finish Reason" width="100" align="center">
        <template #default="{ row }">
          <span v-if="row.nonStopCount > 0" class="text-danger">
            length: {{ row.nonStopCount }}
          </span>
          <span v-else class="text-muted">all stop</span>
        </template>
      </el-table-column>
    </el-table>

    <div class="summary-footer">
      <span>{{ $t('stats.samples', { count: globalStats.totalSamples }) }}</span>
      <span>Avg Prompt Tokens: <b>{{ globalStats.avgPrompt }}</b></span>
      <span>Avg Completion Tokens: <b>{{ globalStats.avgComp }}</b></span>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  /**
   * Pre-computed dataset stats rows from useViewStats.
   * Array of { dataset, total, correct, wrong, accuracy, avgPromptTokens, avgCompletionTokens, nonStopCount }
   */
  stats: {
    type: Array,
    required: true,
  },

  /**
   * Pre-computed global stats from useViewStats.
   * { totalSamples, avgPrompt, avgComp }
   */
  globalStats: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['filter']);

function onRowClick(row) {
  emit('filter', { dataset: row.dataset });
}
</script>

<style scoped>
.stats-card {
  background-color: var(--ev-bg-card);
  border-radius: 8px;
  box-shadow: var(--ev-shadow-card);
  padding: 16px 24px;
  margin-bottom: 20px;
  user-select: none;
}

.stats-card .title {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 12px;
  color: var(--ev-text-primary);
}

.summary-footer {
  margin-top: 12px;
  font-size: 13px;
  color: var(--ev-text-secondary);
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.summary-footer b {
  color: var(--ev-text-primary);
  font-weight: 600;
}

.text-success {
  color: var(--ev-color-success);
  font-weight: 600;
}

.text-danger {
  color: var(--ev-color-danger);
  font-weight: 600;
}

.text-muted {
  color: var(--ev-text-secondary);
}

.filter-link {
  cursor: pointer;
  transition: opacity 0.2s;
}
.filter-link:hover {
  opacity: 0.7;
  text-decoration: underline;
}

:deep(.clickable-row) {
  cursor: pointer;
}
:deep(.clickable-row:hover td) {
  background-color: var(--ev-bg-hover) !important;
}
</style>
