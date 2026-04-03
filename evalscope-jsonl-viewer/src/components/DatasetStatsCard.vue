<template>
  <div v-if="stats.length" class="stats-card">
    <div class="title">数据集统计</div>
    <el-table :data="stats" border size="small" style="width: 100%">
      <el-table-column prop="dataset" label="数据集" width="140" />
      <el-table-column prop="total" label="题目数" width="80" align="center" sortable />
      <el-table-column prop="correct" label="正确" width="70" align="center">
        <template #default="{ row }">
          <span style="color: #67c23a; font-weight: 600">{{ row.correct }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="wrong" label="错误" width="70" align="center">
        <template #default="{ row }">
          <span style="color: #f56c6c; font-weight: 600">{{ row.wrong }}</span>
        </template>
      </el-table-column>
      <el-table-column label="正确率" width="100" align="center" sortable :sort-method="(a, b) => a.accuracy - b.accuracy">
        <template #default="{ row }">
          <span style="font-size: 12px">{{ row.accuracy }}%</span>
        </template>
      </el-table-column>
      <el-table-column label="Finish Reason" width="100" align="center">
        <template #default="{ row }">
          <span v-if="row.nonStopCount > 0" style="color: #f56c6c; font-weight: 600">
            length: {{ row.nonStopCount }}
          </span>
          <span v-else style="color: #909399">all stop</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { computed } from 'vue';

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
    const ds = item.dataset || '未知';
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
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.1);
  padding: 16px 24px;
  margin-bottom: 20px;
  user-select: none;
}

.stats-card .title {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 12px;
  color: #303133;
}
</style>
