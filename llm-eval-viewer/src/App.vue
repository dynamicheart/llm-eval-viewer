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
        <el-menu-item index="/evalscope/reviews">
          <span class="nav-group-tag">Evalscope</span>Review
        </el-menu-item>
        <el-menu-item index="/evalscope/predictions">Predictions</el-menu-item>
        <el-menu-item index="/meval">
          <span class="nav-group-tag">MEval</span>MEval
        </el-menu-item>
      </el-menu>

      <div class="nav-right">
        <el-dropdown size="small" @command="switchLocale">
          <span class="locale-switch">
            <svg class="locale-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            {{ currentLocale === 'zh-CN' ? '中文' : 'EN' }}
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="zh-CN">中文</el-dropdown-item>
              <el-dropdown-item command="en">English</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <a
          class="example-link"
          href="https://github.com/dynamicheart/llm-eval-viewer/tree/main/docs/examples"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ $t('app.exampleFiles') }}
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

    <header class="page-header" :style="shouldOffsetForSidebar ? { marginLeft: sidebarWidth + 'px', transition: 'margin-left 0.3s' } : {}">
      <img
        v-if="$route.path === '/evalscope/reviews' || $route.path === '/evalscope/predictions'"
        src="/evalscope_icon.png"
        alt="Evalscope Icon"
        class="page-title-icon"
      />
      <h1 class="page-title">
        {{
          $route.path === '/meval'
            ? $t('app.title.meval')
            : $route.path === '/evalscope/reviews'
              ? $t('app.title.reviews')
              : $route.path === '/evalscope/predictions'
                ? $t('app.title.predictions')
                : $t('app.title.default')
        }}
      </h1>
    </header>

    <NewsBanner :style="shouldOffsetForSidebar ? { marginLeft: sidebarWidth + 'px', transition: 'margin-left 0.3s' } : {}" />

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
import NewsBanner from '@/components/NewsBanner.vue';
import { useDirBrowser } from '@/composables/useDirBrowser';
import { setLocale, getLocale } from '@/i18n';
import { ArrowDown } from '@element-plus/icons-vue';

export default {
  name: 'App',
  components: { NewsBanner, ArrowDown },
  setup() {
    const { showSidebar, sidebarWidth } = useDirBrowser();
    return { showSidebar, sidebarWidth, currentLocale: getLocale() };
  },
  watch: {
    '$i18n.locale': {
      handler() {
        document.title = this.$t('app.pageTitle');
      },
      immediate: true,
    },
  },
  methods: {
    handleSelect(index) {
      this.$router.push(index);
    },
    switchLocale(locale) {
      setLocale(locale);
      this.currentLocale = locale;
    },
  },
  computed: {
    shouldOffsetForSidebar() {
      const path = this.$route.path;
      return this.showSidebar && (path === '/evalscope/reviews' || path === '/evalscope/predictions');
    },
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

.nav-menu :deep(.el-menu-item:focus),
.nav-menu :deep(.el-menu-item:active) {
  background-color: transparent !important;
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

.locale-switch {
  cursor: pointer;
  font-size: 13px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
  outline: none;
}

.locale-switch:focus,
.locale-switch:hover {
  outline: none;
}

.locale-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.locale-switch:hover {
  color: #409eff;
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
