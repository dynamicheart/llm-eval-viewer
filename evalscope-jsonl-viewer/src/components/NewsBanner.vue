<template>
  <div v-if="visible" class="news-banner">
    <div class="news-item">
      <span class="news-tag">NEW</span>
      <span class="news-text">
        <template v-for="(section, si) in CURRENT_NEWS" :key="si">
          <span class="news-date">{{ section.date }}</span>
          <span v-for="(line, li) in section.items" :key="li">
            {{ line }}<br />
          </span>
          <br v-if="si < CURRENT_NEWS.length - 1" />
        </template>
      </span>
      <el-icon class="news-close" @click="dismiss"><Close /></el-icon>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Close } from '@element-plus/icons-vue';

const STORAGE_KEY = 'news_dismissed_version';

/**
 * 公告版本号（自增）和对应内容。
 * 新版本发布时：VERSION +1，更新 CURRENT_NEWS 内容即可。
 * 用户关闭后记住版本号，只有更高版本才会再次显示。
 */
const VERSION = 4;
const CURRENT_NEWS = [
  {
    date: '2026-04-05',
    items: [
      '1. Predictions 支持 Reasoning 内容展示，标记为 [R]，点击「查看」可分别查看 Text 和 Reasoning',
      '2. 点击分布图可快速筛选对应数据',
    ],
  },
  {
    date: '2026-04-04',
    items: [
      '1. 新增目录浏览功能：支持选择目录，自动扫描目录结构，快速切换不同实验和数据集',
    ],
  },
];

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
