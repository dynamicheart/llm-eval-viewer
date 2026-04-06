/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { ref, watch } from 'vue';

/**
 * Build safe HTML for tooltip preview: escape HTML, truncate, preserve newlines.
 * @param {string} text - Raw text to preview
 * @param {number} maxLen - Maximum characters to show
 * @returns {string} Safe HTML string
 */
export function previewHtml(text, maxLen = 400) {
  if (!text) return '';
  const s = String(text).slice(0, maxLen)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return text.length > maxLen ? s + '…' : s;
}

/**
 * Create a boolean ref persisted to localStorage.
 * Restores saved value on creation; writes back on every change.
 *
 * @param {string} key - localStorage key
 * @param {boolean} defaultValue - Default when no saved value exists
 * @returns {import('vue').Ref<boolean>}
 */
export function usePersistedToggle(key, defaultValue) {
  const saved = localStorage.getItem(key);
  const val = ref(saved !== null ? saved === 'true' : defaultValue);
  watch(val, (v) => localStorage.setItem(key, v));
  return val;
}
