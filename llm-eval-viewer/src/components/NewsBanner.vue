<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div v-if="visible" class="news-banner">
    <div class="news-item">
      <span class="news-tag">NEW</span>
      <span class="news-text">
        <div v-for="(section, si) in newsItems" :key="si" :class="{ 'news-section-gap': si > 0 }">
          <div class="news-date">{{ section.date }}</div>
          <div v-for="(line, li) in section.items" :key="li">{{ line }}</div>
        </div>
      </span>
      <el-icon class="news-close" @click="dismiss"><Close /></el-icon>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Close } from '@element-plus/icons-vue';

const { tm } = useI18n();

const STORAGE_KEY = 'news_dismissed_version';

/**
 * Banner version (auto-increment) and corresponding content.
 * When releasing a new version: increment VERSION, update news locale messages.
 * After user dismisses, the version is stored; only a higher version will show again.
 */
const VERSION = 4;

const newsItems = computed(() => tm('news.items'));

const dismissedVersion = Number(localStorage.getItem(STORAGE_KEY) || '0');
const visible = ref(VERSION > dismissedVersion);

function dismiss() {
  visible.value = false;
  localStorage.setItem(STORAGE_KEY, String(VERSION));
}
</script>

<style scoped>
.news-banner {
  padding: 0 20px;
  margin-bottom: 8px;
}

.news-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #ecf5ff, #f0f9eb);
  border: 1px solid #b3d8ff;
  border-radius: 6px;
  font-size: 13px;
  color: #303133;
  line-height: 1.6;
}

.news-tag {
  background: #409eff;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
  letter-spacing: 0.5px;
  margin-top: 2px;
}

.news-text {
  flex: 1;
}

.news-date {
  font-weight: 600;
  color: #606266;
  font-size: 12px;
}

.news-section-gap {
  margin-top: 6px;
}

.news-close {
  cursor: pointer;
  color: #909399;
  flex-shrink: 0;
  font-size: 14px;
  margin-top: 2px;
}

.news-close:hover {
  color: #f56c6c;
}
</style>
