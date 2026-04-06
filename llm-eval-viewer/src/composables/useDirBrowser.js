/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * useDirBrowser — Directory browser composable (singleton)
 *
 * Module-level shared state, Reviews and Predictions share the same directory tree.
 * Uses File System Access API (showDirectoryPicker) to scan eval_pack directories.
 * Directory handle persisted to IndexedDB, selected run persisted to localStorage.
 * File content is not cached.
 *
 * === Directory selection scenarios ===
 *
 * Scenario A: Multi-level directory (standard evalscope output)
 *   User selects eval_pack/ root directory, structure: dataset/ → run/ → reviews+predictions+reports
 *   Requires run directory to contain reviews/, predictions/, reports/ subdirectories
 *   Example: eval_pack/humaneval/20251115_202954/{reviews,predictions,reports}
 *
 * Scenario B: Directly select run directory
 *   Selected directory itself contains reviews/ + predictions/ subdirectories
 *   Does not require reports/, auto-wrapped as single-node tree
 *   Both tabs work normally (readRunFile enters corresponding subdirectory)
 *   Example: user selects 20251115_202954/
 *
 * Scenario C: Directly select type directory (reviews/ or predictions/)
 *   Selected directory name is reviews or predictions, contains model subdirectories (with .jsonl)
 *   Node marked isDirect=true, directType='reviews'|'predictions'
 *   Only corresponding tab can view data, other tab shows prompt to select parent directory
 *   Example: user selects 20251115_202954/reviews/
 */

import { ref, shallowRef, computed } from 'vue';
import { ElMessage } from 'element-plus';
import i18n from '@/i18n';

const t = (key, named) => i18n.global.t(key, named || {});

// ===== Singleton module-level state =====
const dirTree = ref([]);
const activeFileKey = ref('');
const hasDir = ref(false);
const rootHandle = shallowRef(null);
const browseMode = ref(localStorage.getItem('evalscope_browse_mode') || 'file');
const supportsDirectoryPicker =
  typeof window !== 'undefined' && !!window.showDirectoryPicker;
const dirName = ref('');

// Cached directory name (for "recent records" display, available even in file mode)
const cachedDirName = ref(localStorage.getItem('evalscope_cached_dir_name') || '');

// Recent directories list [{ name, time }]
const RECENT_DIRS_KEY = 'evalscope_recent_dirs';
const MAX_RECENT_DIRS = 5;
const recentDirs = ref(JSON.parse(localStorage.getItem(RECENT_DIRS_KEY) || '[]'));

// Sidebar visibility: derived state, directory mode + has directory tree = show
const showSidebar = computed(() => hasDir.value && browseMode.value === 'directory');

// Sidebar collapsed state (shared with DirBrowserDrawer)
const sidebarCollapsed = localStorage.getItem('dir_sidebar_collapsed') === 'true';

// Sidebar width (shared, updated in real-time during drag; 0 when collapsed)
const sidebarWidth = ref(sidebarCollapsed ? 0 : (Number(localStorage.getItem('dir_sidebar_width')) || 380));

// Persisted selected run node info
const _savedRun = localStorage.getItem('evalscope_selected_run');
const selectedRunInfo = ref(_savedRun ? JSON.parse(_savedRun) : null);

// ===== IDB handle persistence =====
const DIR_DB_NAME = 'evalscope_dir';
const DIR_DB_VERSION = 1;
const DIR_STORE = 'handles';
let _dirDb = null;

function openDirDB() {
  if (_dirDb) return Promise.resolve(_dirDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DIR_DB_NAME, DIR_DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DIR_STORE);
    };
    req.onsuccess = () => {
      _dirDb = req.result;
      resolve(_dirDb);
    };
    req.onerror = () => reject(req.error);
  });
}

async function persistHandle(handle) {
  const name = handle.name || 'unknown';
  try {
    const db = await openDirDB();
    const tx = db.transaction(DIR_STORE, 'readwrite');
    tx.objectStore(DIR_STORE).put(handle, `dir_${name}`);
    await new Promise((r, j) => {
      tx.oncomplete = r;
      tx.onerror = () => j(tx.error);
    });
  } catch {
    // Storage failure does not affect usage
  }
  updateRecentDirs(name);
}

function updateRecentDirs(name) {
  const list = recentDirs.value.filter((d) => d.name !== name);
  list.unshift({ name, time: Date.now() });
  if (list.length > MAX_RECENT_DIRS) list.length = MAX_RECENT_DIRS;
  recentDirs.value = list;
  localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(list));
}

async function loadCachedHandle(name) {
  try {
    const db = await openDirDB();
    const tx = db.transaction(DIR_STORE, 'readonly');
    const store = tx.objectStore(DIR_STORE);

    // Prefer new format lookup
    if (name) {
      const req = store.get(`dir_${name}`);
      const result = await new Promise((r) => {
        req.onsuccess = () => r(req.result || null);
        req.onerror = () => r(null);
      });
      if (result) return result;
    }

    // Fallback: try legacy 'root' key (backward compatibility)
    const tx2 = db.transaction(DIR_STORE, 'readonly');
    const legacyReq = tx2.objectStore(DIR_STORE).get('root');
    const legacy = await new Promise((r) => {
      legacyReq.onsuccess = () => r(legacyReq.result || null);
      legacyReq.onerror = () => r(null);
    });

    if (legacy) {
      // Migration: save to new key, delete old key
      const migrateName = legacy.name || name || 'unknown';
      try {
        const tx3 = db.transaction(DIR_STORE, 'readwrite');
        const s = tx3.objectStore(DIR_STORE);
        s.put(legacy, `dir_${migrateName}`);
        s.delete('root');
        await new Promise((r) => { tx3.oncomplete = r; });
      } catch { /* ignore */ }
      updateRecentDirs(migrateName);
      return legacy;
    }

    return null;
  } catch {
    return null;
  }
}

async function removeCachedHandle(name) {
  try {
    const db = await openDirDB();
    const tx = db.transaction(DIR_STORE, 'readwrite');
    tx.objectStore(DIR_STORE).delete(`dir_${name}`);
    await new Promise((r, j) => {
      tx.oncomplete = r;
      tx.onerror = () => j(tx.error);
    });
  } catch {
    // ignore
  }
  const list = recentDirs.value.filter((d) => d.name !== name);
  recentDirs.value = list;
  localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(list));
}

// ===== Directory scanning (recursive, auto-detect last two levels: dataset → run) =====

/**
 * Get child directory names of a directory handle
 */
async function getChildDirNames(handle) {
  const names = new Set();
  for await (const [name, h] of handle.entries()) {
    if (h.kind === 'directory') names.add(name);
  }
  return names;
}

/**
 * Check if a directory is a complete run directory (contains reviews/, predictions/, reports/)
 */
async function isRunDir(handle) {
  const names = await getChildDirNames(handle);
  return names.has('reviews') && names.has('predictions') && names.has('reports');
}

/**
 * Check if directory contains model subdirectories (with .jsonl files),
 * used to determine if user directly selected a reviews/ or predictions/ directory
 */
async function hasJsonlInModelSubdirs(handle) {
  for await (const [, h] of handle.entries()) {
    if (h.kind !== 'directory') continue;
    for await (const [fname, fh] of h.entries()) {
      if (fh.kind === 'file' && fname.endsWith('.jsonl')) return true;
    }
  }
  return false;
}

/**
 * Recursively scan directory tree.
 * - If current directory's children contain run directories, treat current as dataset layer
 * - Otherwise recurse down, current directory as intermediate node
 */
async function scanNode(handle, name, idPrefix) {
  const entries = [];
  for await (const [childName, childHandle] of handle.entries()) {
    if (childHandle.kind === 'directory') {
      entries.push({ name: childName, handle: childHandle });
    }
  }

  if (entries.length === 0) return null;

  const runEntries = [];
  const otherEntries = [];
  for (const entry of entries) {
    if (await isRunDir(entry.handle)) {
      runEntries.push(entry);
    } else {
      otherEntries.push(entry);
    }
  }

  if (runEntries.length > 0) {
    const runs = runEntries.map((r) => ({
      id: `run_${r.name}`,
      label: formatRunTimestamp(r.name),
      runDir: r.name,
      handle: r.handle,
      datasetName: name,
      isLeaf: true,
    }));
    runs.sort((a, b) => b.runDir.localeCompare(a.runDir));

    return {
      id: `${idPrefix}_ds_${name}`,
      label: name,
      children: runs,
    };
  }

  // Intermediate node, recurse
  const children = [];
  for (const entry of otherEntries) {
    const child = await scanNode(entry.handle, entry.name, `${idPrefix}_${entry.name}`);
    if (child) children.push(child);
  }

  if (children.length === 0) return null;

  return {
    id: `${idPrefix}_${name}`,
    label: name,
    children,
  };
}

async function scanRoot(rootH) {
  const rootName = rootH.name || 'root';
  const childNames = await getChildDirNames(rootH);

  // Scenario B: root directory itself is a run dir (contains reviews/ + predictions/)
  if (childNames.has('reviews') && childNames.has('predictions')) {
    return [{
      id: 'dir_ds_direct',
      label: rootName,
      children: [{
        id: `run_${rootName}`,
        label: formatRunTimestamp(rootName),
        runDir: rootName,
        handle: rootH,
        datasetName: rootName,
        isLeaf: true,
      }],
    }];
  }

  // Scenario C: root directory itself is a reviews/ or predictions/ directory
  const lowerName = rootName.toLowerCase();
  if ((lowerName === 'reviews' || lowerName === 'predictions') && await hasJsonlInModelSubdirs(rootH)) {
    return [{
      id: 'dir_ds_direct',
      label: rootName,
      children: [{
        id: `run_${rootName}`,
        label: rootName,
        runDir: rootName,
        handle: rootH,
        datasetName: rootName,
        isLeaf: true,
        isDirect: true,
        directType: lowerName,
      }],
    }];
  }

  // Scenario A: standard multi-level directory scan
  const tree = [];
  for await (const [name, handle] of rootH.entries()) {
    if (handle.kind !== 'directory') continue;
    const node = await scanNode(handle, name, 'dir');
    if (node) tree.push(node);
  }
  return tree;
}

function formatRunTimestamp(ts) {
  const m = ts.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (!m) return ts;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
}

// ===== Read file =====
async function readRunFile(runHandle, type, isDirect = false) {
  try {
    const typeDir = isDirect ? runHandle : await runHandle.getDirectoryHandle(type);

    for await (const [, modelH] of typeDir.entries()) {
      if (modelH.kind !== 'directory') continue;

      for await (const [fileName, fileH] of modelH.entries()) {
        if (fileH.kind === 'file' && fileName.endsWith('.jsonl')) {
          const file = await fileH.getFile();
          return await file.text();
        }
      }
    }
  } catch {
    // Directory does not exist
  }
  return null;
}

function buildFileKey(node, type) {
  return `${type}://${node.runDir}/${node.datasetName}`;
}

// ===== Core operations =====
async function rescanTree() {
  if (!rootHandle.value) return;
  const tree = await scanRoot(rootHandle.value);
  dirTree.value = tree;
  hasDir.value = true;
  const name = rootHandle.value.name || '';
  dirName.value = name;
  cachedDirName.value = name;
  localStorage.setItem('evalscope_cached_dir_name', name);
}

// ===== Selected run node management =====
function setSelectedRun(runDir, datasetName) {
  selectedRunInfo.value = { runDir, datasetName };
  localStorage.setItem(
    'evalscope_selected_run',
    JSON.stringify({ runDir, datasetName })
  );
}

function clearSelectedRun() {
  selectedRunInfo.value = null;
  localStorage.removeItem('evalscope_selected_run');
  activeFileKey.value = '';
}

/**
 * Recursively find matching run node in current directory tree
 */
function findSelectedNode() {
  if (!selectedRunInfo.value) return null;
  const { runDir, datasetName } = selectedRunInfo.value;

  function search(nodes) {
    for (const node of nodes) {
      if (node.isLeaf && node.runDir === runDir && node.datasetName === datasetName) {
        return node;
      }
      if (node.children) {
        const found = search(node.children);
        if (found) return found;
      }
    }
    return null;
  }

  return search(dirTree.value);
}

// ===== Export composable =====
export function useDirBrowser() {
  function setBrowseMode(mode) {
    browseMode.value = mode;
    localStorage.setItem('evalscope_browse_mode', mode);
  }

  /**
   * Open directory picker, always shows picker for user to select directory
   */
  async function openDirectory() {
    if (!supportsDirectoryPicker) {
      ElMessage.error(t('dirBrowser.browserNotSupported'));
      return;
    }

    let handle;
    try {
      handle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw e;
    }

    rootHandle.value = handle;
    await persistHandle(handle);
    await rescanTree();
    setBrowseMode('directory');
  }

  /**
   * On page load, try to restore cached directory handle (no permission prompt)
   * Skip if already restored
   */
  async function tryRestoreCachedHandle() {
    if (hasDir.value) return true;
    if (!supportsDirectoryPicker) return false;
    if (browseMode.value !== 'directory') return false;

    const name = cachedDirName.value;
    if (!name) return false;

    try {
      const handle = await loadCachedHandle(name);
      if (!handle) return false;

      let perm = await handle.queryPermission({ mode: 'read' });
      if (perm !== 'granted') {
        perm = await handle.requestPermission({ mode: 'read' });
      }

      if (perm === 'granted') {
        rootHandle.value = handle;
        await rescanTree();
        return true;
      }

      // User denied permission, fall back to file mode
      browseMode.value = 'file';
      localStorage.setItem('evalscope_browse_mode', 'file');
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Restore cached directory (load handle from IndexedDB, requires user authorization)
   * @param {string} [targetName] Directory name to restore
   */
  async function restoreCachedDirectory(targetName) {
    if (!supportsDirectoryPicker) return false;

    const name = targetName || cachedDirName.value;
    if (!name) {
      ElMessage.warning(t('dirBrowser.noCachedDir'));
      return false;
    }

    try {
      const handle = await loadCachedHandle(name);
      if (!handle) {
        ElMessage.warning(t('dirBrowser.noCachedDir'));
        return false;
      }

      const perm = await handle.requestPermission({ mode: 'read' });
      if (perm !== 'granted') {
        ElMessage.warning(t('dirBrowser.permissionDenied'));
        return false;
      }

      rootHandle.value = handle;
      await rescanTree();
      setBrowseMode('directory');
      return true;
    } catch {
      ElMessage.error(t('dirBrowser.restoreFailed'));
      return false;
    }
  }

  return {
    // State (shared)
    dirTree,
    activeFileKey,
    hasDir,
    showSidebar,
    sidebarWidth,
    browseMode,
    dirName,
    cachedDirName,
    recentDirs,
    selectedRunInfo,
    supportsDirectoryPicker,

    // Actions
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
  };
}
