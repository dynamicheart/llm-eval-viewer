<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.

  Unified wrapper for VueJsonPretty with shared config, dark mode,
  and long-string collapse arrow. Use this everywhere instead of
  using VueJsonPretty directly.
-->

<template>
  <VueJsonPretty
    v-bind="jsonViewerProps"
    :data="data"
    :theme="theme"
  >
    <template #renderNodeValue="{ node, defaultValue }">
      <span v-if="isLongString(node)" class="vjp-str-collapse" :class="{ expanded: expandedStrs[node.id] }">
        <span class="vjp-str-arrow" @click.stop="toggleStrExpand(node.id)">
          <svg :class="{ 'vjp-arrow-open': expandedStrs[node.id] }" viewBox="0 0 1024 1024" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M840.4 300H183.6c-19.7 0-30.7 20.8-18.5 35l328.4 380.8c9.4 10.9 27.5 10.9 37 0L858.9 335c12.2-14.2 1.2-35-18.5-35z"/></svg>
        </span>
        <span class="vjp-str-short">{{ defaultValue.substring(0, MAX_STR_LEN) }}<span class="vjp-str-toggle" @click.stop="toggleStrExpand(node.id)">...</span></span>
        <span class="vjp-str-full" v-text="defaultValue" />
        <span class="vjp-str-toggle-expanded" @click.stop="toggleStrExpand(node.id)">{{ $t('common.collapse') }}</span>
      </span>
      <template v-else>{{ defaultValue }}</template>
    </template>
  </VueJsonPretty>
</template>

<script>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import { useJsonViewer } from '@/composables/useJsonViewer';

export default {
  components: { VueJsonPretty },
  props: {
    data: {
      type: [Object, Array, String, Number, Boolean],
      default: null,
    },
  },
  setup(props) {
    const { t } = useI18n();
    const { isDark, expandedStrs, toggleStrExpand, isLongString, jsonViewerProps, MAX_STR_LEN } = useJsonViewer();
    const theme = computed(() => isDark.value ? 'dark' : 'light');

    return { theme, expandedStrs, toggleStrExpand, isLongString, jsonViewerProps, MAX_STR_LEN, t };
  },
};
</script>

<style>
.json-viewer-dialog {
  font-family: Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
}

/* Long string collapse/expand — arrow + toggle */
.vjp-str-collapse .vjp-str-full,
.vjp-str-collapse .vjp-str-toggle-expanded {
  display: none;
}
.vjp-str-collapse.expanded .vjp-str-short {
  display: none;
}
.vjp-str-collapse.expanded .vjp-str-full,
.vjp-str-collapse.expanded .vjp-str-toggle-expanded {
  display: inline;
}
.vjp-str-arrow {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  margin-right: 2px;
  vertical-align: middle;
  color: var(--el-text-color-regular);
  transition: color 0.3s;
}
.vjp-str-arrow:hover {
  color: #1890ff;
}
.vjp-str-arrow svg {
  transition: transform 0.3s;
  transform: rotate(-90deg);
}
.vjp-str-arrow svg.vjp-arrow-open {
  transform: rotate(0deg);
}
.vjp-str-toggle {
  color: #999;
  cursor: pointer;
  font-style: italic;
}
.vjp-str-toggle:hover {
  color: #409eff;
}
.vjp-str-toggle-expanded {
  color: #999;
  cursor: pointer;
  font-style: italic;
  margin-left: 4px;
}
.vjp-str-toggle-expanded:hover {
  color: #409eff;
}
</style>
