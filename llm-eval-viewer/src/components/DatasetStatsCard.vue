<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div v-if="stats.length" class="stats-card">
    <div class="title">{{ $t('datasetStats.title') }}</div>
    <el-table :data="stats" border size="small" style="width: 100%">
      <el-table-column prop="dataset" :label="$t('datasetStats.dataset')" width="140" />
      <el-table-column prop="total" :label="$t('datasetStats.questions')" width="80" align="center" sortable />
      <el-table-column prop="correct" :label="$t('datasetStats.correct')" width="70" align="center">
        <template #default="{ row }">
          <span class="text-success">{{ row.correct }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="wrong" :label="$t('datasetStats.wrong')" width="70" align="center">
        <template #default="{ row }">
          <span class="text-danger">{{ row.wrong }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('datasetStats.accuracy')" width="100" align="center" sortable :sort-method="(a, b) => a.accuracy - b.accuracy">
        <template #default="{ row }">
          <span style="font-size: 12px">{{ row.accuracy }}%</span>
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
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  tableData: {
    type: Array,
    required: true,
  },
});

const stats = computed(() => {
  if (!props.tableData.length) return [];

  const map = {};
  props.tableData.forEach((item) => {
    const ds = item.dataset || t('common.unknown');
    if (!map[ds]) map[ds] = { dataset: ds, total: 0, correct: 0, nonStopCount: 0 };
    map[ds].total += 1;
    if (item.result && item.result !== '0') map[ds].correct += 1;
    if (item.finishReason && item.finishReason !== 'stop') map[ds].nonStopCount += 1;
  });

  return Object.values(map).map((item) => ({
    ...item,
    wrong: item.total - item.correct,
    accuracy: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0,
    score: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0,
  })).sort((a, b) => b.total - a.total);
});
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
</style>
