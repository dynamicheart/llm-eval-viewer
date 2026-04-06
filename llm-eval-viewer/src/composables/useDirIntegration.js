/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { useDirBrowser } from '@/composables/useDirBrowser';

/**
 * Composable that wires up directory browsing with a view's table model and file handler.
 *
 * Eliminates the ~100 lines of near-identical boilerplate that was previously
 * copy-pasted between EvalscopeReviewsView and EvalscopePredictionsView.
 *
 * @param {Object} options
 * @param {string} options.type - File type to read from run directories ('reviews' | 'predictions')
 * @param {Function} options.parseFile - View-specific parser function (receives raw text)
 * @param {Object} options.tableModel - useTableModel() instance
 * @param {Object} options.fileHandler - useFileHandler() return value
 * @param {Function} options.t - i18n translate function
 * @param {string} options.onboardedKey - localStorage key for onboarding state
 * @param {string} options.sampleName - Display name for sample data
 * @param {string} options.sampleText - Raw sample data text
 * @param {Function} options.loadSampleText - From fileHandler
 */
export function useDirIntegration(options) {
  const {
    type,
    parseFile,
    tableModel,
    fileHandler,
    t,
    onboardedKey,
    sampleName,
    sampleText,
    loadSampleText,
  } = options;

  const { tableData, reset } = tableModel;
  const { handleFileSelect: rawHandleFileSelect, openRecentFile: rawOpenRecentFile, currentFileName } = fileHandler;

  // Directory browser (singleton)
  const dirBrowser = useDirBrowser();
  const {
    dirTree,
    activeFileKey,
    hasDir,
    showSidebar,
    sidebarWidth,
    selectedRunInfo,
    browseMode,
    dirName,
    recentDirs,
    supportsDirectoryPicker,
    openDirectory,
    setBrowseMode,
    setSelectedRun,
    clearSelectedRun,
    findSelectedNode,
    readRunFile,
    buildFileKey,
    tryRestoreCachedHandle,
    restoreCachedDirectory,
    removeCachedHandle,
  } = dirBrowser;

  const currentNodeKey = computed(() =>
    selectedRunInfo.value ? `run_${selectedRunInfo.value.runDir}` : ''
  );

  // In-memory parsed data cache per file key
  const dataCache = new Map();

  // Sample prompt
  const samplePromptVisible = ref(false);

  // ===== Directory event handlers =====

  async function onOpenDirectory() {
    clearSelectedRun();
    await openDirectory();
    if (browseMode.value === 'directory') {
      tableData.value = [];
      reset();
      currentFileName.value = '';
    }
  }

  async function onRestoreDirectory(dirNameArg) {
    clearSelectedRun();
    const ok = await restoreCachedDirectory(dirNameArg);
    if (ok) {
      tableData.value = [];
      reset();
      currentFileName.value = '';
      const node = findSelectedNode();
      if (node) await onSelectRun(node);
    }
  }

  function onRemoveRecentDir(name) {
    removeCachedHandle(name);
  }

  async function onSelectRun(node) {
    // Validate directory type matches this view
    if (node.directType && node.directType !== type) {
      ElMessage.warning(t(`${type === 'reviews' ? 'reviews' : 'predictions'}.wrongDirType`, { type: node.directType }));
      return;
    }

    const fileKey = buildFileKey(node, type);
    activeFileKey.value = fileKey;
    setSelectedRun(node.runDir, node.datasetName);

    if (dataCache.has(fileKey)) {
      tableData.value = dataCache.get(fileKey);
    } else {
      const text = await readRunFile(node.handle, type, node.isDirect);
      if (!text) {
        ElMessage.warning(t(`${type === 'reviews' ? 'reviews' : 'predictions'}.notFound`));
        return;
      }
      await parseFile(text);
      dataCache.set(fileKey, [...tableData.value]);
    }

    currentFileName.value = `${node.datasetName} / ${node.label}`;
    reset();
  }

  // Switch back to file mode when single file is selected
  async function onHandleFileSelect(file) {
    const ok = await rawHandleFileSelect(file);
    if (!ok) return;
    setBrowseMode('file');
    activeFileKey.value = '';
  }

  function openRecentFile(file) {
    setBrowseMode('file');
    activeFileKey.value = '';
    rawOpenRecentFile(file);
  }

  // Clear view state when browse mode switches to directory
  watch(browseMode, (mode) => {
    if (mode === 'directory') {
      tableData.value = [];
      reset();
      currentFileName.value = '';
    }
  });

  // Sample prompt helpers
  async function loadSample() {
    await loadSampleText(sampleName, sampleText);
  }

  function dismissSample() {
    localStorage.setItem(onboardedKey, '1');
    samplePromptVisible.value = false;
  }

  // On mount: try to restore directory, show sample prompt for first-time users
  onMounted(async () => {
    const restored = await tryRestoreCachedHandle();
    if (restored) {
      const node = findSelectedNode();
      if (node) await onSelectRun(node);
    }

    await nextTick();
    if (tableData.value.length === 0 && !localStorage.getItem(onboardedKey)) {
      samplePromptVisible.value = true;
    }
  });

  return {
    // Directory browser state
    dirTree,
    activeFileKey,
    hasDir,
    showSidebar,
    sidebarWidth,
    currentNodeKey,
    browseMode,
    dirName,
    recentDirs,
    supportsDirectoryPicker,

    // Directory event handlers
    onOpenDirectory,
    onRestoreDirectory,
    onRemoveRecentDir,
    onSelectRun,
    onHandleFileSelect,
    openRecentFile,

    // Sample prompt
    samplePromptVisible,
    loadSample,
    dismissSample,
  };
}
