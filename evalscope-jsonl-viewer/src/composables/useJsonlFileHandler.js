/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

// composables/useJsonlFileHandler.js
import { ref, computed, watch, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { normalizeLatex, renderMathMarkdown } from '@/utils/renderMathMarkdown';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import plaintext from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('plaintext', plaintext);

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
    if (diff < minute) return '刚刚';
    if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
    if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
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

    // 取当前 namespace 下所有文件（已按 lastOpen desc）
    const files = await listFiles(storageNamespace, MAX_FILES + 1);

    // 超过上限，删除最旧的
    if (files.length > MAX_FILES) {
      const toDelete = files.slice(MAX_FILES);
      for (const f of toDelete) {
        await deleteFile(f.id);
      }
    }

    // UI 直接用最近的
    recentFiles.value = files.slice(0, MAX_FILES);
  };

  const clearRecentFiles = async () => {
    recentFiles.value = [];
    localStorage.removeItem(storageKey);
    await clearFiles(storageNamespace);
    ElMessage.success('已清空最近文件');
  };

  const loadFromCache = async () => {
    recentFiles.value = await listFiles(storageNamespace);

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
      ElMessage.error('文件不存在或已被清理');
      return;
    }

    currentFileName.value = file.name;
    parseJsonl(file.content);

    // 更新时间
    item.lastOpen = Date.now();
    localStorage.setItem(storageKey, item.id);
  };

  const loadJSONLFile = async (file) => {
    const text = await file.text();

    await saveRecentFile(file, text); // ⭐ 改这里

    localStorage.setItem(
      storageKey,
      `${file.name}-${file.size}-${file.lastModified}`
    );

    currentFileName.value = file.name;
    parseJsonl(text);
  };

  const handleFileSelect = async (file) => {
    currentFileName.value = file.name;
    loadJSONLFile(file);
    return false;
  };

  /**
   * 重置文件相关状态
   *
   * 清空表格数据、当前文件名，并从本地存储中移除最后打开文件的记录
   */
  const resetFile = () => {
    tableData.value = [];
    currentFileName.value = '';
    localStorage.removeItem(storageKey);
  };

  const removeRecentFile = (file) => {
    recentFiles.value = recentFiles.value.filter((f) => f.id !== file.id);
    deleteFile(file.id);
  };

  const showStrDialog = async (data) => {
    // 非对象，显示两个tab：markdown 和 txt
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

    const reasoning = data.reasoning || null;
    const text = data.text || null;

    if (reasoning && text) {
      // 两个tab都存在，显示tabs
      dialogHasTabs.value = true;
      dialogTabsData.value = [
        {
          name: 'reasoning',
          label: 'Reasoning',
          content: await renderMathMarkdown(normalizeLatex(reasoning)),
          rawText: reasoning,
        },
        {
          name: 'text',
          label: 'Text',
          content: await renderMathMarkdown(normalizeLatex(text)),
          rawText: text,
        },
      ];
      dialogContent.value = '';
      dialogRawText.value = '';
      dialogVisible.value = true;
    } else {
      // 只有一个或都为空，单内容展示，优先展示text，再展示reasoning
      const singleContent = text || reasoning || '';
      showStrDialog(singleContent);
      return;
    }
  };

  const showSolutionDialog = async (row) => {
    const s = row.solution;

    if (!s) {
      dialogRawText.value = '未提供 solution';
      dialogContent.value = '<p>未提供 solution</p>';
    } else {
      dialogRawText.value = s.content || '';

      if (s.render === 'markdown') {
        const text = normalizeLatex(s.content);
        dialogContent.value = await renderMathMarkdown(text);
      } else if (s.render === 'json') {
        const highlighted = hljs.highlight(s.content, {
          language: 'json',
        }).value;
        dialogContent.value = `<pre><code class="hljs json">${highlighted}</code></pre>`;
      } else {
        dialogContent.value = `<pre>${s.content}</pre>`;
      }
    }

    dialogHasTabs.value = false;
    dialogTabsData.value = [];
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

  return {
    hintText,
    recentFiles,
    formatSize,
    formatTime,
    clearRecentFiles,
    openRecentFile,
    handleFileSelect,
    resetFile,
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
  };
}
