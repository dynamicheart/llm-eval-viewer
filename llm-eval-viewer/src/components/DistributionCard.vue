<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div v-if="sortedItems.length" class="distribution-card">
    <div class="title">{{ fieldLabel }} {{ $t('stats.distributionSuffix') }}</div>
    <div class="distribution-list">
      <div
        v-for="item in sortedItems"
        :key="item.label"
        class="distribution-item"
        @click="emit('filter', item.key)"
      >
        <span
          class="color-dot"
          :style="{ backgroundColor: getColor(item.key) }"
        ></span>
        <span>
          <span class="text">{{ item.label }}</span
          >:
          <span class="count-text"
            >{{ item.count }} ({{ item.percentage }}%)</span
          >
        </span>
      </div>
    </div>
    <div class="total-count">{{ $t('stats.total', { count: totalCount }) }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  /**
   * Pre-computed distribution items from useViewStats.
   * Array of { key, label, count, percentage }
   */
  items: {
    type: Array,
    required: true,
  },

  fieldLabel: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['filter']);

// Positive values (green, sorted first) and negative values (red, sorted last)
const POSITIVE_KEYS = new Set([1, '1', true, 'true', 100, '100']);
const NEGATIVE_KEYS = new Set([0, '0', false, 'false']);
const POSITIVE_LABELS = ['stop'];
const NEGATIVE_LABELS = ['length', 'max_tokens'];

function normalizeLabel(key) {
  return String(key).toLowerCase().trim();
}

function isPositive(key) {
  if (POSITIVE_KEYS.has(key)) return true;
  return POSITIVE_LABELS.includes(normalizeLabel(key));
}

function isNegative(key) {
  if (NEGATIVE_KEYS.has(key)) return true;
  return NEGATIVE_LABELS.includes(normalizeLabel(key));
}

function getColor(key) {
  if (isPositive(key)) return '#67C23A';
  if (isNegative(key)) return '#F56C6C';
  const label = String(key);
  if (!_colorMap[label]) {
    const idx = Object.keys(_colorMap).length % defaultColorPool.length;
    _colorMap[label] = defaultColorPool[idx];
  }
  return _colorMap[label];
}

const _colorMap = {};
const defaultColorPool = [
  '#409EFF', '#E6A23C', '#909399', '#5A5A5A', '#00C0FF', '#FF9F7F',
];

function sortWeight(key) {
  if (isPositive(key)) return 0;
  if (isNegative(key)) return 2;
  return 1;
}

const sortedItems = computed(() => {
  const items = [...(props.items || [])];
  items.sort((a, b) => sortWeight(a.key) - sortWeight(b.key));
  return items;
});

const totalCount = computed(() =>
  (props.items || []).reduce((sum, item) => sum + item.count, 0)
);
</script>

<style scoped>
.distribution-card {
  background-color: var(--ev-bg-card);
  border-radius: 8px;
  box-shadow: var(--ev-shadow-card);
  padding: 16px 24px;
  margin-bottom: 20px;
  user-select: none;
}

.distribution-card .title {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 12px;
  color: var(--ev-text-primary);
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
  color: var(--ev-text-regular);
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
  color: var(--ev-text-secondary);
  font-size: 13px;
}

.text {
  font-weight: 700;
  font-size: 16px;
  color: var(--ev-text-primary);
  margin-right: 8px;
}

.count-text {
  font-weight: 400;
  font-size: 14px;
  color: var(--ev-text-secondary);
}

.distribution-item:hover {
  background-color: var(--ev-bg-hover);
  border-radius: 6px;
  cursor: pointer;
  transform: scale(1.05);
  transition: all 0.2s ease-in-out;
}
</style>
