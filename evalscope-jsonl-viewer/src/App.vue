<!--
  Copyright (c) 2025 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div class="app-root">
    <div class="nav-wrapper">
      <el-menu
        mode="horizontal"
        :default-active="$route.path"
        class="nav-menu"
        @select="handleSelect"
        background-color="#f5f7fa"
        text-color="#606266"
        active-text-color="#409eff"
      >
        <el-menu-item index="/reviews">
          <span class="nav-group-tag">Evalscope</span>Review
        </el-menu-item>
        <el-menu-item index="/predictions">Predictions</el-menu-item>
        <el-menu-item index="/meval">
          <span class="nav-group-tag">MEval</span>MEval
        </el-menu-item>
      </el-menu>

      <div class="nav-right">
        <a
          class="example-link"
          href="https://github.com/dynamicheart/llm-eval-viewer/tree/main/docs/examples"
          target="_blank"
          rel="noopener noreferrer"
        >
          示例文件
        </a>

        <a
          class="github-link"
          href="https://github.com/dynamicheart/llm-eval-viewer"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub Repository"
        >
          <svg
            height="24"
            width="24"
            viewBox="0 0 16 16"
            fill="#409eff"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill-rule="evenodd"
              d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2 .37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 012-.27c.68.01 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
        </a>
      </div>
    </div>

    <div class="nav-spacer"></div>

    <header class="page-header">
      <img
        src="/evalscope_icon.png"
        alt="Evalscope Icon"
        class="page-title-icon"
      />
      <h1 class="page-title">
        {{
          $route.path === '/meval'
            ? 'MEval - 样本查看器'
            : $route.path === '/reviews'
              ? 'Evalscope Review JSONL 查看器'
              : $route.path === '/predictions'
                ? 'Evalscope Predictions JSONL 查看器'
                : 'Evalscope JSONL 查看器'
        }}
      </h1>
    </header>

    <router-view />
    <footer class="page-footer">
      <span>Author: yangjianbang</span>
      <span> · Build: {{ buildTime }}</span>
      <span v-if="commitHash">
        · Commit:
        <a
          :href="`https://github.com/dynamicheart/llm-eval-viewer/commit/${commitHash}`"
          target="_blank"
          rel="noopener noreferrer"
          class="commit-link"
        >{{ commitHash }}</a>
      </span>
    </footer>
  </div>
</template>

<script>
export default {
  name: 'App',
  methods: {
    handleSelect(index) {
      this.$router.push(index);
    },
  },
  computed: {
    buildTime() {
      return typeof __BUILD_TIME__ !== 'undefined'
        ? new Date(__BUILD_TIME__).toLocaleString()
        : 'unknown';
    },
    commitHash() {
      return typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : '';
    },
  },
};
</script>

<style scoped>
.nav-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #f5f7fa;
  padding: 0 16px;
  box-shadow: 0 2px 4px rgb(0 0 0 / 0.1);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  z-index: 2001;
}

.nav-spacer {
  height: 56px;
  flex-shrink: 0;
}

.nav-menu {
  font-weight: 600;
  font-size: 16px;
  flex: 1 1 auto;
  box-shadow: none;
  background-color: transparent;
}

.nav-group-tag {
  font-size: 10px;
  color: #909399;
  padding: 1px 5px;
  margin-right: 6px;
  font-weight: 400;
  vertical-align: middle;
}

.github-link {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  color: #409eff;
  text-decoration: none;
  transition: opacity 0.2s;
}

.github-link:hover {
  opacity: 0.8;
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

.nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.example-link {
  font-size: 14px;
  color: #409eff;
  text-decoration: none;
  font-weight: 500;
}

.example-link:hover {
  text-decoration: underline;
}

.page-footer {
  margin-top: auto;
  padding: 12px 0;
  text-align: center;
  font-size: 12px;
  color: #909399;
  user-select: none;
}

.commit-link {
  color: #409eff;
  text-decoration: none;
  font-family: monospace;
}

.commit-link:hover {
  text-decoration: underline;
}

.app-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
</style>
