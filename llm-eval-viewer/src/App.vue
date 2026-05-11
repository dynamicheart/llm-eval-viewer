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
      >
        <el-menu-item index="/evalscope/reviews">
          <span class="nav-group-tag">Evalscope</span>Review
        </el-menu-item>
        <el-menu-item index="/evalscope/predictions">Predictions</el-menu-item>
        <el-menu-item index="/custom">
          <span class="nav-group-tag">Toolkit</span>Custom<span class="nav-beta-tag">Beta</span>
        </el-menu-item>
      </el-menu>

      <div class="nav-right">
        <!-- Theme toggle: light → dark → auto -->
        <span class="icon-btn" :title="themeTip" @click="cycleTheme">
          <!-- sun = light -->
          <svg v-if="themeMode === 'light'" class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          <!-- moon = dark -->
          <svg v-else-if="themeMode === 'dark'" class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
          </svg>
          <!-- half-circle = auto -->
          <svg v-else class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/>
          </svg>
        </span>

        <!-- Language switcher -->
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

        <!-- Example files link (hidden on small screens) -->
        <a
          class="example-link"
          href="https://github.com/dynamicheart/llm-eval-viewer/tree/main/docs/examples"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ $t('app.exampleFiles') }}
        </a>

        <!-- GitHub -->
        <a
          class="github-link"
          href="https://github.com/dynamicheart/llm-eval-viewer"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub Repository"
        >
          <svg height="24" width="24" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2 .37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 012-.27c.68.01 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
      </div>
    </div>

    <div class="nav-spacer"></div>

    <header class="page-header" :style="sidebarMarginStyle">
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
                : $route.path === '/custom'
                  ? $t('app.title.custom')
                  : $route.path === '/hyeval'
                    ? $t('app.title.hyeval')
                    : $t('app.title.default')
        }}
      </h1>
    </header>

    <NewsBanner :style="sidebarMarginStyle" />

    <router-view />
    <footer class="page-footer">
      <span>Author: yangjianbang</span>
      <span @click="onFooterBuildClick"> · Build: {{ buildTime }}</span>
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import NewsBanner from '@/components/NewsBanner.vue';
import { useDirBrowser } from '@/composables/useDirBrowser';
import { useCustomDirBrowser } from '@/composables/useCustomDirBrowser';
import { useDebugMode } from '@/composables/useDebugMode';
import { setLocale, getLocale } from '@/i18n';
import { useI18n } from 'vue-i18n';
import { ArrowDown } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

export default {
  name: 'App',
  components: { NewsBanner, ArrowDown },
  setup() {
    const { showSidebar, sidebarWidth } = useDirBrowser();
    const customDir = useCustomDirBrowser();
    const { debugMode } = useDebugMode();
    const { t } = useI18n();

    // Theme: 'light' | 'dark' | 'auto'
    const savedMode = localStorage.getItem('ev_theme') || 'auto';
    const themeMode = ref(['light', 'dark', 'auto'].includes(savedMode) ? savedMode : 'auto');

    const systemQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function applyTheme() {
      const shouldBeDark =
        themeMode.value === 'dark' ||
        (themeMode.value === 'auto' && systemQuery.matches);
      document.documentElement.classList.toggle('dark', shouldBeDark);
    }

    function onSystemChange() {
      if (themeMode.value === 'auto') applyTheme();
    }

    function cycleTheme() {
      const order = ['light', 'dark', 'auto'];
      const idx = order.indexOf(themeMode.value);
      themeMode.value = order[(idx + 1) % order.length];
      localStorage.setItem('ev_theme', themeMode.value);
      applyTheme();
    }

    const themeTip = computed(() => {
      return t(`app.theme.${themeMode.value}`);
    });

    onMounted(() => {
      applyTheme();
      systemQuery.addEventListener('change', onSystemChange);
    });

    onUnmounted(() => {
      systemQuery.removeEventListener('change', onSystemChange);
    });

    // Debug mode: click footer build timestamp 6 times to toggle
    const footerClickCount = ref(0);
    let footerClickTimer = null;

    function onFooterBuildClick() {
      footerClickCount.value++;
      clearTimeout(footerClickTimer);
      footerClickTimer = setTimeout(() => { footerClickCount.value = 0; }, 500);
      if (footerClickCount.value >= 6) {
        debugMode.value = !debugMode.value;
        footerClickCount.value = 0;
        ElMessage({
          message: debugMode.value ? 'Debug mode ON' : 'Debug mode OFF',
          type: 'info',
          duration: 2000,
        });
      }
    }

    return { showSidebar, sidebarWidth, customDir, currentLocale: getLocale(), themeMode, cycleTheme, themeTip, onFooterBuildClick };
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
    sidebarMarginStyle() {
      const path = this.$route.path;
      const isEvalscope = path === '/evalscope/reviews' || path === '/evalscope/predictions';
      const isCustom = path === '/custom';
      const active = (isEvalscope && this.showSidebar) || (isCustom && this.customDir.showSidebar.value);
      if (!active) return {};
      const width = isCustom ? this.customDir.sidebarWidth.value : this.sidebarWidth;
      return { marginLeft: width + 'px', transition: 'margin-left 0.3s' };
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
  background-color: var(--ev-bg-nav);
  padding: 0 16px;
  box-shadow: var(--ev-shadow-nav);
  border-bottom: 1px solid var(--ev-border-color);
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
  min-width: 0;
  box-shadow: none;
  border-bottom: none;
  background-color: transparent !important;
  --el-menu-bg-color: transparent;
  --el-menu-border-color: transparent;
}

.nav-menu :deep(.el-menu-item) {
  background-color: transparent !important;
}

.nav-menu :deep(.el-menu-item:focus),
.nav-menu :deep(.el-menu-item:active) {
  background-color: transparent !important;
}

.nav-group-tag {
  font-size: 10px;
  color: var(--ev-text-secondary);
  padding: 1px 5px;
  margin-right: 6px;
  font-weight: 400;
  vertical-align: middle;
}

.nav-beta-tag {
  font-size: 9px;
  color: #fff;
  background: linear-gradient(135deg, #f56c6c, #e6a23c);
  padding: 1px 5px;
  border-radius: 8px;
  margin-left: 6px;
  font-weight: 600;
  vertical-align: middle;
  line-height: 1.4;
  letter-spacing: 0.5px;
}

.github-link {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  color: var(--ev-color-primary);
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
  color: var(--ev-text-title);
  user-select: none;
  margin: 0;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.example-link {
  font-size: 14px;
  color: var(--ev-color-primary);
  text-decoration: none;
  font-weight: 500;
}

.example-link:hover {
  text-decoration: underline;
}

.locale-switch {
  cursor: pointer;
  font-size: 13px;
  color: var(--ev-text-regular);
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
  color: var(--ev-color-primary);
}

.icon-btn {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--ev-text-regular);
  transition: all 0.2s;
  user-select: none;
}

.icon-btn:hover {
  background: var(--ev-bg-hover);
  color: var(--ev-color-primary);
}

.theme-icon {
  width: 18px;
  height: 18px;
}

.page-footer {
  margin-top: auto;
  padding: 12px 0;
  text-align: center;
  font-size: 12px;
  color: var(--ev-text-secondary);
  user-select: none;
}

.commit-link {
  color: var(--ev-color-primary);
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

/* === Mobile responsiveness === */
@media (max-width: 768px) {
  .nav-right {
    gap: 8px;
  }

  .example-link {
    display: none;
  }

  .nav-group-tag {
    display: none;
  }

  .page-title {
    font-size: 1.2rem;
  }

  .page-header {
    margin: 12px 0;
  }

  .nav-menu {
    font-size: 14px;
  }

  .nav-menu :deep(.el-menu-item) {
    padding: 0 10px;
  }
}

@media (max-width: 480px) {
  .nav-wrapper {
    padding: 0 4px;
    overflow-x: auto;
  }

  .nav-right {
    gap: 6px;
  }

  .locale-switch span:not(.locale-icon) {
    display: none;
  }

  .nav-menu {
    font-size: 13px;
  }

  .nav-menu :deep(.el-menu-item) {
    padding: 0 6px;
  }
}
</style>
