<!--
  Copyright (c) 2025 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div>
    <el-menu
      mode="horizontal"
      :default-active="$route.path"
      class="nav-menu"
      @select="handleSelect"
      background-color="#f5f7fa"
      text-color="#606266"
      active-text-color="#409eff"
    >
      <el-menu-item index="/reviews" class="has-icon">
        <el-icon style="margin-right: 6px; color: #409eff; font-size: 18px">
          <Document />
        </el-icon>
        Reviews
      </el-menu-item>
      <el-menu-item index="/predictions" class="has-icon">
        <el-icon style="margin-right: 6px; color: #409eff; font-size: 18px">
          <DataAnalysis />
        </el-icon>
        Predictions
      </el-menu-item>
    </el-menu>

    <header class="page-header">
      <img
        src="/evalscope_icon.png"
        alt="Evalscope Icon"
        class="page-title-icon"
      />
      <h1 class="page-title">
        {{
          $route.path === '/reviews'
            ? 'Reviews JSONL 查看器'
            : $route.path === '/predictions'
              ? 'Predictions JSONL 查看器'
              : 'Evalscope JSONL 查看器'
        }}
      </h1>
    </header>

    <router-view />
  </div>
</template>

<script>
import { Document, DataAnalysis } from '@element-plus/icons-vue';

export default {
  name: 'App',
  components: {
    Document,
    DataAnalysis,
  },
  methods: {
    handleSelect(index) {
      this.$router.push(index);
    },
  },
};
</script>

<style scoped>
.nav-menu {
  font-weight: 600;
  font-size: 16px;
  box-shadow: 0 2px 4px rgb(0 0 0 / 0.1);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 20px 0;
}

.page-title-icon {
  width: 36px;
  height: 36px;
  user-select: none;
}

.page-title {
  font-weight: 700;
  font-size: 2rem;
  color: #171819;
  user-select: none;
  margin: 0;
}
</style>
