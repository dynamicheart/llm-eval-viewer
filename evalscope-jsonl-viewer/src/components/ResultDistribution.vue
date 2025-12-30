<!--
  Copyright (c) 2025 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div v-if="tableData.length" class="result-distribution-card">
    <div class="title">Result 分布统计</div>
    <div class="distribution-list">
      <div
        v-for="item in resultDistribution"
        :key="item.result"
        class="distribution-item"
      >
        <span
          class="color-dot"
          :style="{ backgroundColor: getColor(item.result) }"
        ></span>
        <span>
          <span class="result-text">{{ item.result }}</span
          >:
          <span class="count-text"
            >{{ item.count }} ({{ item.percentage }}%)</span
          >
        </span>
      </div>
    </div>
    <div class="total-count">总计：{{ tableData.length }} 条数据</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  tableData: {
    type: Array,
    required: true,
  },
});

// 颜色池
const colorPool = [
  '#409EFF',
  '#67C23A',
  '#E6A23C',
  '#F56C6C',
  '#909399',
  '#5A5A5A',
  '#00C0FF',
  '#FF9F7F',
];

const colorMap = ref({});

function getColor(result) {
  if (!colorMap.value[result]) {
    const keys = Object.keys(colorMap.value);
    const nextIndex = keys.length % colorPool.length;
    colorMap.value[result] = colorPool[nextIndex];
  }
  return colorMap.value[result];
}

const resultDistribution = computed(() => {
  const total = props.tableData.length;
  if (total === 0) return [];

  const countMap = {};
  props.tableData.forEach((item) => {
    const key = item.result ?? '未知';
    countMap[key] = (countMap[key] || 0) + 1;
  });

  return Object.entries(countMap).map(([result, count]) => ({
    result,
    count,
    percentage: ((count / total) * 100).toFixed(1),
  }));
});
</script>

<style scoped>
.result-distribution-card {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.1);
  padding: 16px 24px;
  margin-bottom: 20px;
  user-select: none;
}

.result-distribution-card .title {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 12px;
  color: #303133;
}

.distribution-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
}

.distribution-item {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #606266;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 8px;
  flex-shrink: 0;
}

.total-count {
  margin-top: 16px;
  font-weight: 500;
  color: #909399;
  font-size: 13px;
}

.result-text {
  font-weight: 700;
  font-size: 16px;
  color: #303133;
  margin-right: 8px;
}

.count-text {
  font-weight: 400;
  font-size: 14px;
  color: #909399;
}

.distribution-item:hover {
  background-color: #f0f6ff;
  border-radius: 6px;
  cursor: pointer;
  transform: scale(1.05);
  transition: all 0.2s ease-in-out;
}
</style>
