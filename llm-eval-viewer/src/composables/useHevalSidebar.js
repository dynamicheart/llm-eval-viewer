/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * useHevalSidebar — module-level singleton exposing the hyeval page's
 * directory sidebar state, so App.vue can shift the page header and news
 * banner in sync with the sidebar (same pattern as the other views).
 */

import { ref } from 'vue';

const showSidebar = ref(false);
const sidebarWidth = ref(0);

export function useHevalSidebar() {
  return { showSidebar, sidebarWidth };
}
