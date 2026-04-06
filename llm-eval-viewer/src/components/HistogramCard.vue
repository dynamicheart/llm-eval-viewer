<!--
  Copyright (c) 2025 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div v-if="tableData.length" class="result-distribution-card">
    <div class="title">{{ $t('histogram.title') }}</div>

    <div class="charts-row">
      <div v-for="field in fields" :key="field.key" class="chart-col">
        <div class="chart-card">
          <div class="chart-title">
            {{ field.label }}
          </div>

          <div class="chart-wrapper">
            <canvas :ref="(el) => setCanvas(el, field.key)" />
          </div>
        </div>
      </div>
    </div>

    <div class="stats-footer">
      <span>{{ $t('stats.samples', { count: tableData.length }) }}</span>
      <span v-for="field in fields" :key="field.key" class="stat-item">
        Avg {{ field.label.replace(' Distribution', '') }}: {{ avgOf(field.key) }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, watch } from 'vue';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const props = defineProps({
  tableData: { type: Array, required: true },
  fields: { type: Array, required: true }, // [{ key, label, color }]
});

const canvasMap = new Map();
const chartMap = new Map();

function setCanvas(el, key) {
  if (el) canvasMap.set(key, el);
}

function avgOf(key) {
  const values = props.tableData
    .map((r) => r[key])
    .filter((v) => typeof v === 'number' && v >= 0);
  if (!values.length) return '-';
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
}

/* ========= Core: equal-width, rounded bucketing ========= */

function niceStep(step) {
  if (step <= 0 || !Number.isFinite(step)) {
    return 1;
  }

  const pow = Math.pow(10, Math.floor(Math.log10(step)));
  const frac = step / pow;
  if (frac <= 1) return pow;
  if (frac <= 2) return 2 * pow;
  if (frac <= 5) return 5 * pow;
  return 10 * pow;
}

function buildBuckets(values, targetBins = 6) {
  const max = Math.max(...values, 0);

  // Special case: all zeros
  if (max === 0) {
    return [[0, 1]];
  }

  const rawStep = max / targetBins;
  const step = niceStep(rawStep);

  const bucketCount = Math.max(1, Math.ceil(max / step));
  const buckets = [];

  for (let i = 0; i < bucketCount; i++) {
    buckets.push([i * step, (i + 1) * step]);
  }
  return buckets;
}

function histogram(values, buckets) {
  const counts = Array(buckets.length).fill(0);
  const step = buckets[0][1] - buckets[0][0] || 1;

  values.forEach((v) => {
    const idx = Math.min(Math.floor(v / step), counts.length - 1);
    counts[idx]++;
  });

  return counts;
}

function renderOne(field) {
  const values = props.tableData
    .map((r) => r[field.key])
    .filter((v) => typeof v === 'number' && v >= 0);

  if (!values.length) return;

  const buckets = buildBuckets(values);
  const labels = buckets.map(([a, b]) => `${a}-${b}`);

  const data = histogram(values, buckets);

  const old = chartMap.get(field.key);
  if (old) old.destroy();

  const style = getComputedStyle(document.documentElement);
  const tooltipBg = style.getPropertyValue('--ev-bg-tooltip').trim() || '#303133';
  const tickColor = style.getPropertyValue('--ev-text-regular').trim() || '#606266';
  const gridColor = style.getPropertyValue('--ev-chart-grid').trim() || 'rgba(0,0,0,0.05)';
  const tickSecondary = style.getPropertyValue('--ev-text-secondary').trim() || '#909399';

  const chart = new Chart(canvasMap.get(field.key), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: field.label,
          data,
          backgroundColor: field.color,

          barPercentage: 0.65,
          categoryPercentage: 0.85,
          borderRadius: 4,
          maxBarThickness: 36,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 12 },
          padding: 8,

          callbacks: {
            // title uses bucket range (e.g. 50-100)
            title(items) {
              return items[0].label;
            },

            // Show count only
            label(context) {
              return `Count: ${context.parsed.y}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: tickColor,
            font: {
              size: 12,
            },
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: gridColor,
          },
          ticks: {
            color: tickSecondary,
            font: {
              size: 12,
            },
          },
        },
      },
    },
  });

  chartMap.set(field.key, chart);
}

async function renderAll() {
  await nextTick();
  props.fields.forEach(renderOne);
}

onMounted(renderAll);
watch(() => props.tableData, renderAll, { deep: true });
</script>

<style scoped>
.result-distribution-card {
  background-color: var(--ev-bg-card);
  border-radius: 8px;
  box-shadow: var(--ev-shadow-card);
  padding: 16px 24px;
  margin-bottom: 20px;
  user-select: none;
}

.result-distribution-card .title {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 12px;
  color: var(--ev-text-primary);
}

/* ===== charts layout ===== */

.charts-row {
  display: flex;
  gap: 24px;
}

.chart-col {
  flex: 1;
  min-width: 0;
}

/* ===== chart card ===== */

.chart-card {
  background-color: var(--ev-chart-bg);
  border-radius: 8px;
  padding: 12px 14px 10px;
  box-shadow: var(--ev-shadow-card);
  transition: all 0.2s ease-in-out;
}

.chart-card:hover {
  box-shadow: var(--ev-shadow-card-hover);
  transform: translateY(-2px);
}

/* ===== title ===== */

.chart-title {
  text-align: center;
  font-weight: 600;
  font-size: 14px;
  color: var(--ev-text-regular);
  margin-bottom: 8px;
}

/* ===== chart ===== */

.chart-wrapper {
  height: 220px;
  padding: 4px;
}

/* ===== footer ===== */

.stats-footer {
  margin-top: 16px;
  font-weight: 500;
  color: var(--ev-text-secondary);
  font-size: 13px;
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
</style>
