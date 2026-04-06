/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

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
