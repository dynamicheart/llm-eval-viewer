/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus';
import { normalizeLatex, renderMathMarkdown } from '@/utils/renderMathMarkdown';
import { saveParsedData, getParsedData } from '@/utils/fileDB';
import i18n from '@/i18n';
import { isDebugLogging } from '@/composables/useDebugMode';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import plaintext from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('plaintext', plaintext);

const t = (key, named) => i18n.global.t(key, named || {});

/**
 * Generic file handler composable for loading, caching, and displaying data files.
 *
 * Works with any file format (CSV, JSONL, etc.) — the caller provides a parseData
 * function that transforms raw text into a result object.
 *
 * Parser contract:
 *   parseData(text, onProgress) → Promise<{ rows: Array, ...extra }>
 *     - text: raw file content
 *     - onProgress(percent): optional callback to report 0-100 progress
 *     - returns: object with `rows` array and any extra fields (e.g. modelName)
 *       OR just an array of rows for simple parsers
 *
 * @param {Object} options
 * @param {string} options.storageNamespace - IndexedDB namespace for file metadata
 * @param {string} options.storageKey - localStorage key for last-opened file ID
 * @param {Function} options.listFiles - fileDB listFiles function
 * @param {Function} options.getFile - fileDB getFile function
 * @param {Function} options.saveFile - fileDB saveFile function
 * @param {Function} options.clearFiles - fileDB clearFiles function
 * @param {Function} options.deleteFile - fileDB deleteFile function
 * @param {Function} options.parseData - Parser function. See contract above.
 * @param {Object} options.tableModel - useTableModel() instance
 * @param {string} [options.parserVersion='1'] - Version tag for parsed data cache invalidation
 * @param {Function} [options.onParseResult] - Called with parse result after parse OR cache restore
 * @param {string} [options.hintText] - Placeholder hint text
 * @param {boolean} [options.dirModeAware] - Whether to skip auto-restore in directory mode
 * @param {string} [options.browseModeKey] - localStorage key for browse mode (default: 'evalscope_browse_mode')
 * @param {Function|null} [options.validateContent] - Optional content validation function
 */
export function useFileHandler(options) {
  const {
    storageNamespace,
    storageKey,
    listFiles,
    getFile,
    saveFile,
    clearFiles,
    deleteFile,
    parseData,
    tableModel,
    parserVersion = '1',
    onParseResult = null,
    hintText = '',
    dirModeAware = false,
    browseModeKey = 'evalscope_browse_mode',
    validateContent = null,
  } = options;

  const { tableData } = tableModel;

  const currentFileName = ref('');

  const dialogVisible = ref(false);
  const dialogHasTabs = ref(false);
  const dialogTabsData = ref([]);
  const dialogContent = ref('');
  const dialogRawText = ref('');

  const MAX_FILES = 5;
  const recentFiles = ref([]);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatTime = (ts) => {
    const diff = Date.now() - ts;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return t('fileHandler.justNow');
    if (diff < hour) return t('fileHandler.minutesAgo', { n: Math.floor(diff / minute) });
    if (diff < day) return t('fileHandler.hoursAgo', { n: Math.floor(diff / hour) });
    if (diff < 7 * day) return t('fileHandler.daysAgo', { n: Math.floor(diff / day) });
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /**
   * Core parse-or-restore method. Shows loading overlay, checks parsed cache,
   * falls back to Worker parse, then caches the result.
   *
   * @param {string} text - Raw file content
   * @param {string} fileId - Unique file identifier for cache lookup
   */
  async function runParseWithCache(text, fileId, externalLoading) {
    const ownLoading = !externalLoading;
    const loading = externalLoading || ElLoading.service({
      fullscreen: true,
      lock: true,
      text: t('common.loading'),
      background: 'rgba(0, 0, 0, 0.4)',
    });

    try {
      // 1. Check parsed cache (non-fatal if DB is broken)
      let cached = null;
      try {
        cached = await getParsedData(fileId, parserVersion);
      } catch (err) {
        console.warn('[useFileHandler] getParsedData failed, will re-parse:', err);
      }
      if (cached) {
        const rows = cached.rows || cached;
        tableData.value = rows.map((r) => Object.freeze(r));
        if (onParseResult) onParseResult(cached);
        return;
      }

      // 2. Parse via Worker with progress feedback
      await new Promise((r) => setTimeout(r, 50)); // let loading overlay render
      const t0 = performance.now();
      const result = await parseData(text, (percent) => {
        loading.setText(`${t('common.loading')} ${percent}%`);
      });
      const tParsed = performance.now();

      // Normalize result: parser may return { rows, ...extra } or just an array
      const isPlainArray = Array.isArray(result);
      const rows = isPlainArray ? result : result.rows;
      tableData.value = rows.map((r) => Object.freeze(r));
      const tFreeze = performance.now();

      if (onParseResult) onParseResult(isPlainArray ? { rows } : result);
      const tPostProcess = performance.now();

      if (isDebugLogging()) {
        console.log(
        '%c[Main Thread Timings]%c ' +
          `worker=${(tParsed - t0).toFixed(1)}ms | ` +
          `freeze=${(tFreeze - tParsed).toFixed(1)}ms | ` +
          `postProcess=${(tPostProcess - tFreeze).toFixed(1)}ms`,
        'color:#a0f;font-weight:bold',
        'color:inherit',
      );
      }

      // 3. Cache parsed result (async, don't block UI)
      // Skip caching empty results (parse errors / unsupported formats)
      if (rows.length > 0) {
        saveParsedData(fileId, parserVersion, isPlainArray ? { rows } : result).catch(() => {});
      }
    } finally {
      // Wait for reactive watchers (e.g. useDynamicViewStats) to flush
      await nextTick();
      if (ownLoading) loading.close();
    }
  }

  const saveRecentFile = async (file, content) => {
    const id = `${file.name}-${file.size}-${file.lastModified}`;
    const now = Date.now();

    await saveFile(storageNamespace, {
      id,
      namespace: storageNamespace,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      lastOpen: now,
      content,
    });

    const files = await listFiles(storageNamespace, MAX_FILES + 1);

    if (files.length > MAX_FILES) {
      const toDelete = files.slice(MAX_FILES);
      for (const f of toDelete) {
        await deleteFile(f.id);
      }
    }

    recentFiles.value = files.slice(0, MAX_FILES);
  };

  const clearRecentFiles = async () => {
    recentFiles.value = [];
    localStorage.removeItem(storageKey);
    await clearFiles(storageNamespace);
    ElMessage.success(t('fileHandler.recentFilesCleared'));
  };

  const loadFromCache = async () => {
    try {
      recentFiles.value = await listFiles(storageNamespace);
    } catch (err) {
      console.warn('[useFileHandler] listFiles failed:', err);
      recentFiles.value = [];
      return;
    }

    // In directory mode, only load recent file list, do not auto-restore single file data
    if (dirModeAware) {
      const browseMode = localStorage.getItem(browseModeKey);
      if (browseMode === 'directory') return;
    }

    const lastId = localStorage.getItem(storageKey);
    if (!lastId) return;

    const loading = ElLoading.service({
      fullscreen: true,
      lock: true,
      text: t('common.loading'),
      background: 'rgba(0, 0, 0, 0.4)',
    });
    try {
      const file = await getFile(lastId);
      if (!file) {
        localStorage.removeItem(storageKey);
        return;
      }

      currentFileName.value = file.name;
      await runParseWithCache(file.content, lastId, loading);
    } finally {
      loading.close();
    }
  };

  onMounted(() => {
    loadFromCache();
  });

  const openRecentFile = async (item) => {
    const loading = ElLoading.service({
      fullscreen: true,
      lock: true,
      text: t('common.loading'),
      background: 'rgba(0, 0, 0, 0.4)',
    });
    try {
      const file = await getFile(item.id);
      if (!file) {
        ElMessage.error(t('fileHandler.fileNotFound'));
        return;
      }

      currentFileName.value = file.name;
      await runParseWithCache(file.content, item.id, loading);

      item.lastOpen = Date.now();
      localStorage.setItem(storageKey, item.id);
    } finally {
      loading.close();
    }
  };

  const loadDataFile = async (file) => {
    let loading = ElLoading.service({
      fullscreen: true,
      lock: true,
      text: t('common.loading'),
      background: 'rgba(0, 0, 0, 0.4)',
    });
    try {
      const text = await file.text();

      if (validateContent) {
        const warning = validateContent(text);
        if (warning) {
          loading.close();
          try {
            await ElMessageBox.confirm(
              warning,
              t('fileHandler.fileFormatConfirm'),
              {
                confirmButtonText: t('common.continueLoad'),
                cancelButtonText: t('common.cancel'),
                type: 'warning',
              }
            );
          } catch {
            currentFileName.value = '';
            return false;
          }
          // Reopen loading for the parse phase
          loading = ElLoading.service({
            fullscreen: true,
            lock: true,
            text: t('common.loading'),
            background: 'rgba(0, 0, 0, 0.4)',
          });
        }
      }

      const fileId = `${file.name}-${file.size}-${file.lastModified}`;
      // Save to IndexedDB without blocking parsing — large file writes can take seconds
      saveRecentFile(file, text).catch((err) =>
        console.warn('[useFileHandler] saveRecentFile failed, continuing:', err)
      );
      localStorage.setItem(storageKey, fileId);

      currentFileName.value = file.name;
      await runParseWithCache(text, fileId, loading);
      return true;
    } finally {
      loading.close();
    }
  };

  const handleFileSelect = async (file) => {
    currentFileName.value = file.name;
    const ok = await loadDataFile(file);
    return ok;
  };

  /**
   * Reset file-related state.
   * Clears table data, current file name, and removes last opened file record from localStorage.
   */
  const resetFile = () => {
    tableData.value = [];
    currentFileName.value = '';
    localStorage.removeItem(storageKey);
  };

  /**
   * Load sample data text and cache to IndexedDB.
   * @param {string} name  Display file name
   * @param {string} text  Raw JSONL/CSV text
   */
  const loadSampleText = async (name, text) => {
    const fakeFile = { name, size: text.length, lastModified: 0 };
    await saveRecentFile(fakeFile, text);
    const id = `${name}-${text.length}-0`;
    localStorage.setItem(storageKey, id);
    currentFileName.value = name;
    await runParseWithCache(text, id);
  };

  const removeRecentFile = (file) => {
    recentFiles.value = recentFiles.value.filter((f) => f.id !== file.id);
    deleteFile(file.id);
  };

  const showStrDialog = async (data) => {
    const text = String(data || '');

    const mdContent = await renderMathMarkdown(normalizeLatex(text));

    let txtHighlighted;
    try {
      txtHighlighted = hljs.highlight(text, { language: 'plaintext' }).value;
    } catch {
      txtHighlighted = hljs.highlightAuto(text).value;
    }

    const txtContent = `<pre><code class="hljs plaintext">${txtHighlighted}</code></pre>`;

    dialogHasTabs.value = true;
    dialogTabsData.value = [
      {
        name: 'txt',
        label: 'Text',
        content: txtContent,
        rawText: text,
      },
      {
        name: 'markdown',
        label: 'Markdown',
        content: mdContent,
        rawText: text,
      },
    ];

    dialogContent.value = '';
    dialogRawText.value = '';
    dialogVisible.value = true;
    return;
  };

  const showDialog = async (data) => {
    if (!data || typeof data !== 'object') {
      showStrDialog(data);
      return;
    }

    const reasoning = data.reasoning || '';
    const text = data.text || '';
    const isReasoning = !!data.isReasoning;

    // Both reasoning + text → two-level structure
    // Also handle: reasoning mode active but reasoning content is empty
    if ((reasoning && text) || (isReasoning && text)) {
      const textMdContent = await renderMathMarkdown(normalizeLatex(text));

      let textTxtHighlighted;
      try {
        textTxtHighlighted = hljs.highlight(text, {
          language: 'plaintext',
        }).value;
      } catch {
        textTxtHighlighted = hljs.highlightAuto(text).value;
      }

      const textTxtContent = `<pre><code class="hljs plaintext">${textTxtHighlighted}</code></pre>`;

      let reasoningMdContent;
      let reasoningTxtContent;

      if (reasoning) {
        reasoningMdContent = await renderMathMarkdown(
          normalizeLatex(reasoning)
        );

        let reasoningTxtHighlighted;
        try {
          reasoningTxtHighlighted = hljs.highlight(reasoning, {
            language: 'plaintext',
          }).value;
        } catch {
          reasoningTxtHighlighted = hljs.highlightAuto(reasoning).value;
        }

        reasoningTxtContent = `<pre><code class="hljs plaintext">${reasoningTxtHighlighted}</code></pre>`;
      } else {
        const emptyHint = `<p style="color: var(--ev-text-secondary); font-style: italic;">${t('predictions.reasoningEmpty')}</p>`;
        reasoningMdContent = emptyHint;
        reasoningTxtContent = emptyHint;
      }

      dialogHasTabs.value = true;

      dialogTabsData.value = [
        {
          name: 'text',
          label: 'Text',
          type: 'content',
          views: [
            {
              name: 'txt',
              label: 'Text',
              content: textTxtContent,
              rawText: text,
            },
            {
              name: 'markdown',
              label: 'Markdown',
              content: textMdContent,
              rawText: text,
            },
          ],
        },
        {
          name: 'reasoning',
          label: 'Reasoning',
          type: 'reasoning',
          views: [
            {
              name: 'txt',
              label: 'Text',
              content: reasoningTxtContent,
              rawText: reasoning,
            },
            {
              name: 'markdown',
              label: 'Markdown',
              content: reasoningMdContent,
              rawText: reasoning,
            },
          ],
        },
      ];

      dialogVisible.value = true;
      return;
    }
    // Only text → degrade to showStrDialog
    if (text) {
      await showStrDialog(text);
      return;
    }

    // Only reasoning
    if (reasoning) {
      dialogHasTabs.value = false;
      dialogTabsData.value = [];
      dialogContent.value = await renderMathMarkdown(normalizeLatex(reasoning));
      dialogRawText.value = reasoning;
      dialogVisible.value = true;
    }
  };

  const showSolutionDialog = async (row) => {
    const s = row?.solution;

    if (!s || !s.content) {
      dialogHasTabs.value = false;
      dialogTabsData.value = [];
      dialogRawText.value = t('fileHandler.noSolution');
      dialogContent.value = `<p>${t('fileHandler.noSolution')}</p>`;
      dialogVisible.value = true;
      return;
    }

    const content = String(s.content);

    if (s.render === 'markdown') {
      await showStrDialog(content);
      return;
    }

    if (s.render === 'json') {
      let highlighted;
      try {
        highlighted = hljs.highlight(content, { language: 'json' }).value;
      } catch {
        highlighted = hljs.highlightAuto(content).value;
      }

      dialogHasTabs.value = false;
      dialogTabsData.value = [];
      dialogRawText.value = content;
      dialogContent.value = `<pre><code class="hljs json">${highlighted}</code></pre>`;
      dialogVisible.value = true;
      return;
    }

    dialogHasTabs.value = false;
    dialogTabsData.value = [];
    dialogRawText.value = content;
    dialogContent.value = `<pre>${content}</pre>`;
    dialogVisible.value = true;
  };

  const showRawJsonDialog = (row) => {
    // Support multiple formats for backward compatibility:
    // 1. row.rawJson — pre-stringified JSON string (legacy)
    // 2. row._rawJsonObj — parsed object, stringify on demand (previous optimization)
    // 3. row._rawJsonText — raw JSON text from worker, pretty-print on demand (previous)
    // 4. Fallback — stringify the row object directly (current default for custom viewer)
    let code = row.rawJson;
    if (!code && row._rawJsonObj) {
      code = JSON.stringify(row._rawJsonObj, null, 2);
    }
    if (!code && row._rawJsonText) {
      try {
        code = JSON.stringify(JSON.parse(row._rawJsonText), null, 2);
      } catch {
        code = row._rawJsonText;
      }
    }
    if (!code) {
      // Custom viewer: stringify row, excluding internal fields
      const clean = { ...row };
      for (const key of Object.keys(clean)) {
        if (key.startsWith('_raw_') || key === '_rawJsonText' || key === 'index') delete clean[key];
      }
      code = JSON.stringify(clean, null, 2);
    }
    code = code || '{}';
    dialogRawText.value = code;

    let highlighted;
    try {
      highlighted = hljs.highlight(code, { language: 'json' }).value;
    } catch {
      highlighted = hljs.highlightAuto(code).value;
    }

    dialogContent.value = `<pre><code class="hljs json">${highlighted}</code></pre>`;
    dialogHasTabs.value = false;
    dialogTabsData.value = [];
    dialogVisible.value = true;
  };

  const truncateText = (text, length) =>
    text.length > length ? `${text.slice(0, length)}...` : text;

  const formatResultMeta = (value) => {
    if (value === 0 || value === false) {
      return { text: String(value), status: 'error' };
    }

    return {
      text: String(value),
      status: 'default',
    };
  };

  return {
    hintText,
    recentFiles,
    formatSize,
    formatTime,
    clearRecentFiles,
    openRecentFile,
    handleFileSelect,
    resetFile,
    loadSampleText,
    removeRecentFile,
    currentFileName,
    dialogVisible,
    dialogHasTabs,
    dialogTabsData,
    dialogContent,
    dialogRawText,
    showDialog,
    showSolutionDialog,
    showRawJsonDialog,
    truncateText,
    formatResultMeta,
    runParseWithCache,
  };
}
