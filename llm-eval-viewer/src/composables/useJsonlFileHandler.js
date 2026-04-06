/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

import { ref, computed, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { normalizeLatex, renderMathMarkdown } from '@/utils/renderMathMarkdown';
import i18n from '@/i18n';
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

export function useJsonlFileHandler(options) {
  const {
    storageNamespace,
    storageKey,
    listFiles,
    getFile,
    saveFile,
    clearFiles,
    deleteFile,
    parseJsonl,
    tableModel,
    hintText = '',
    dirModeAware = false,
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
    recentFiles.value = await listFiles(storageNamespace);

    // In directory mode, only load recent file list, do not auto-restore single file data
    if (dirModeAware) {
      const browseMode = localStorage.getItem('evalscope_browse_mode');
      if (browseMode === 'directory') return;
    }

    const lastId = localStorage.getItem(storageKey);
    if (!lastId) return;

    const file = await getFile(lastId);
    if (!file) {
      localStorage.removeItem(storageKey);
      return;
    }

    currentFileName.value = file.name;
    parseJsonl(file.content);
  };

  onMounted(() => {
    loadFromCache();
  });

  const openRecentFile = async (item) => {
    const file = await getFile(item.id);
    if (!file) {
      ElMessage.error(t('fileHandler.fileNotFound'));
      return;
    }

    currentFileName.value = file.name;
    parseJsonl(file.content);

    item.lastOpen = Date.now();
    localStorage.setItem(storageKey, item.id);
  };

  const loadJSONLFile = async (file) => {
    const text = await file.text();

    if (validateContent) {
      const warning = validateContent(text);
      if (warning) {
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
      }
    }

    await saveRecentFile(file, text);

    localStorage.setItem(
      storageKey,
      `${file.name}-${file.size}-${file.lastModified}`
    );

    currentFileName.value = file.name;
    parseJsonl(text);
    return true;
  };

  const handleFileSelect = async (file) => {
    currentFileName.value = file.name;
    const ok = await loadJSONLFile(file);
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
    parseJsonl(text);
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

    // Both reasoning + text → two-level structure
    if (reasoning && text) {
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

      const reasoningMdContent = await renderMathMarkdown(
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

      const reasoningTxtContent = `<pre><code class="hljs plaintext">${reasoningTxtHighlighted}</code></pre>`;

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
    const code = row.rawJson || '{}';
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
  };
}
