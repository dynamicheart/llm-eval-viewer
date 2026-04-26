/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

import { computed, reactive } from 'vue';

const MAX_STR_LEN = 200;

/**
 * Shared VueJsonPretty configuration.
 * All VueJsonPretty usages should use jsonViewerProps + isDark from this composable
 * so that rules are defined in one place.
 */
export function useJsonViewer() {
  const isDark = computed(() => document.documentElement.classList.contains('dark'));

  const expandedStrs = reactive({});

  const toggleStrExpand = (nodeId) => {
    expandedStrs[nodeId] = !expandedStrs[nodeId];
  };

  const isLongString = (node) =>
    typeof node.content === 'string' && node.content.length > MAX_STR_LEN;

  const jsonViewerProps = {
    deep: 1,
    collapsedNodeLength: Infinity,
    showLength: true,
    showIcon: true,
    collapsedOnClickBrackets: true,
  };

  return { isDark, expandedStrs, toggleStrExpand, isLongString, jsonViewerProps, MAX_STR_LEN };
}
