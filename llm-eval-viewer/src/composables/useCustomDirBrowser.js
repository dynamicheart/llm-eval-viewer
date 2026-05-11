/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * useCustomDirBrowser — Generic directory browser composable (singleton, independent)
 *
 * Module-level shared state, independent from useDirBrowser (evalscope).
 * Uses File System Access API (showDirectoryPicker) to scan any directory
 * for supported file types: json, jsonl, csv, ndjson, tsv.
 * Directory handle persisted to IndexedDB.
 *
 * Scanning is 1-level deep: root directory files + immediate subdirectory files.
 * Hidden files (dot-prefixed) are skipped.
 */

import { ref, shallowRef, computed } from 'vue';
import { ElMessage } from 'element-plus';
import i18n from '@/i18n';
import { isCompressedFile, decompressBuffer } from '@/utils/decompressFile';

const t = (key, named) => i18n.global.t(key, named || {});

// ===== Supported extensions =====
const SUPPORTED_EXTENSIONS = new Set(['.json', '.jsonl', '.csv', '.ndjson', '.tsv', '.gz', '.zst']);
const COMPRESSED_EXTENSIONS = new Set(['.gz', '.zst']);

// ===== Singleton module-level state =====
const dirTree = ref([]);
const hasDir = ref(false);
const rootHandle = shallowRef(null);
const BROWSE_MODE_KEY = 'custom_browse_mode';
const browseMode = ref(localStorage.getItem(BROWSE_MODE_KEY) || 'file');
const supportsDirectoryPicker =
  typeof window !== 'undefined' && !!window.showDirectoryPicker;
const dirName = ref('');

// Cached directory name (available even in file mode)
const CACHED_DIR_NAME_KEY = 'custom_cached_dir_name';
const cachedDirName = ref(localStorage.getItem(CACHED_DIR_NAME_KEY) || '');

// Recent directories list [{ name, time, fileCount }]
const RECENT_DIRS_KEY = 'custom_dir_recent_dirs';
const MAX_RECENT_DIRS = 5;
const recentDirs = ref(JSON.parse(localStorage.getItem(RECENT_DIRS_KEY) || '[]'));

// Selected file node key
const SELECTED_FILE_KEY = 'custom_dir_selected_file';
const selectedFileKey = ref(localStorage.getItem(SELECTED_FILE_KEY) || '');

// Sidebar visibility
const showSidebar = computed(() => hasDir.value && browseMode.value === 'directory');

// Sidebar collapsed state (separate from evalscope)
const SIDEBAR_COLLAPSED_KEY = 'custom_dir_sidebar_collapsed';
const sidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
const SIDEBAR_WIDTH_KEY = 'custom_dir_sidebar_width';
const sidebarWidth = ref(sidebarCollapsed ? 0 : (Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || 380));

// ===== IDB handle persistence (independent DB) =====
const DIR_DB_NAME = 'custom_dir';
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

function countLeafNodes(nodes) {
  let count = 0;
  for (const node of nodes) {
    if (node.isLeaf) count++;
    else if (node.children) count += countLeafNodes(node.children);
  }
  return count;
}

function updateRecentDirs(name, fileCount) {
  const list = recentDirs.value.filter((d) => d.name !== name);
  list.unshift({ name, time: Date.now(), fileCount: fileCount ?? 0 });
  if (list.length > MAX_RECENT_DIRS) list.length = MAX_RECENT_DIRS;
  recentDirs.value = list;
  localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(list));
}

async function loadCachedHandle(name) {
  try {
    const db = await openDirDB();
    const tx = db.transaction(DIR_STORE, 'readonly');
    const req = tx.objectStore(DIR_STORE).get(`dir_${name}`);
    const result = await new Promise((r) => {
      req.onsuccess = () => r(req.result || null);
      req.onerror = () => r(null);
    });
    return result;
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

// ===== Directory scanning =====

/**
 * Check if a filename matches supported extensions.
 * Skips hidden files (starting with `.`).
 */
function isSupportedFile(name) {
  if (name.startsWith('.')) return false;
  const lower = name.toLowerCase();
  // Check compound compressed extensions (e.g. .jsonl.gz, .jsonl.zst)
  for (const compExt of COMPRESSED_EXTENSIONS) {
    if (lower.endsWith(compExt)) {
      // Strip compressed suffix, check inner extension
      const inner = lower.slice(0, -compExt.length);
      const dotIdx = inner.lastIndexOf('.');
      if (dotIdx >= 0 && SUPPORTED_EXTENSIONS.has(inner.substring(dotIdx))) return true;
      return false;
    }
  }
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx < 0) return false;
  return SUPPORTED_EXTENSIONS.has(lower.substring(dotIdx));
}

/**
 * Scan a directory handle (1 level deep).
 * Returns tree nodes: files as leaves, subdirectories with matching files as intermediates.
 */
async function scanDirectory(handle) {
  const nodes = [];
  // Collect all entries first
  const entries = [];
  for await (const [name, h] of handle.entries()) {
    entries.push({ name, handle: h });
  }

  // Process subdirectories
  for (const entry of entries) {
    if (entry.handle.kind === 'directory') {
      if (entry.name.startsWith('.')) continue;
      const childNodes = [];
      for await (const [childName, childHandle] of entry.handle.entries()) {
        if (childHandle.kind === 'file' && isSupportedFile(childName)) {
          const relativePath = `${entry.name}/${childName}`;
          childNodes.push({
            id: `cfile_${relativePath}`,
            label: childName,
            handle: childHandle,
            relativePath,
            isLeaf: true,
          });
        }
      }
      if (childNodes.length > 0) {
        // Sort files within subdirectory
        childNodes.sort((a, b) => a.label.localeCompare(b.label));
        nodes.push({
          id: `cdir_${entry.name}`,
          label: entry.name,
          children: childNodes,
        });
      }
    }
  }

  // Process root-level files
  for (const entry of entries) {
    if (entry.handle.kind === 'file' && isSupportedFile(entry.name)) {
      nodes.push({
        id: `cfile_${entry.name}`,
        label: entry.name,
        handle: entry.handle,
        relativePath: entry.name,
        isLeaf: true,
      });
    }
  }

  // Sort: directories first, then files, each alphabetically
  nodes.sort((a, b) => {
    const aDir = !a.isLeaf ? 0 : 1;
    const bDir = !b.isLeaf ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.label.localeCompare(b.label);
  });

  return nodes;
}

async function rescanTree() {
  if (!rootHandle.value) return;
  const tree = await scanDirectory(rootHandle.value);
  dirTree.value = tree;
  hasDir.value = tree.length > 0;
  const name = rootHandle.value.name || '';
  dirName.value = name;
  cachedDirName.value = name;
  localStorage.setItem(CACHED_DIR_NAME_KEY, name);

  // Update file count in recent dirs
  const fileCount = countLeafNodes(tree);
  const entry = recentDirs.value.find((d) => d.name === name);
  if (entry) {
    entry.fileCount = fileCount;
    localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(recentDirs.value));
  }

  if (tree.length === 0) {
    ElMessage.warning(t('dirBrowser.noMatchingFiles'));
  }
}

// ===== Export composable =====
export function useCustomDirBrowser() {
  function setBrowseMode(mode) {
    browseMode.value = mode;
    localStorage.setItem(BROWSE_MODE_KEY, mode);
  }

  /**
   * Open directory picker
   */
  async function openDirectory() {
    if (!supportsDirectoryPicker) {
      ElMessage.error(t('dirBrowser.browserNotSupported'));
      return false;
    }

    let handle;
    try {
      handle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (e) {
      if (e.name === 'AbortError') return false;
      throw e;
    }

    rootHandle.value = handle;
    selectedFileKey.value = '';
    await persistHandle(handle);
    await rescanTree();
    setBrowseMode('directory');
    return true;
  }

  /**
   * On page load, try to restore cached directory handle (no permission prompt)
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
      localStorage.setItem(BROWSE_MODE_KEY, 'file');
      return false;
    } catch {
      return false;
    }
  }

  /**
   * User-initiated restore from recent dirs list (always prompts for permission)
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
        await removeCachedHandle(name);
        ElMessage.warning(t('dirBrowser.noCachedDir'));
        return false;
      }

      const perm = await handle.requestPermission({ mode: 'read' });
      if (perm !== 'granted') {
        ElMessage.warning(t('dirBrowser.permissionDenied'));
        return false;
      }

      rootHandle.value = handle;
      selectedFileKey.value = '';
      await rescanTree();
      setBrowseMode('directory');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read text content from a file node
   */
  async function readFileNode(node) {
    const file = await node.handle.getFile();
    const ext = isCompressedFile(file.name);
    if (!ext) return file.text();
    const buffer = await file.arrayBuffer();
    return decompressBuffer(buffer, ext);
  }

  /**
   * Persist the selected file key and find the matching node in the tree.
   */
  function setSelectedFile(nodeId) {
    selectedFileKey.value = nodeId;
    localStorage.setItem(SELECTED_FILE_KEY, nodeId);
  }

  function clearSelectedFile() {
    selectedFileKey.value = '';
    localStorage.removeItem(SELECTED_FILE_KEY);
  }

  /**
   * Recursively find the selected file node in current directory tree.
   */
  function findSelectedNode() {
    if (!selectedFileKey.value) return null;

    function search(nodes) {
      for (const node of nodes) {
        if (node.id === selectedFileKey.value) return node;
        if (node.children) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return null;
    }

    return search(dirTree.value);
  }

  const dirFileCount = computed(() => countLeafNodes(dirTree.value));

  const currentNodeKey = computed(() => selectedFileKey.value);

  return {
    // State
    dirTree,
    hasDir,
    showSidebar,
    sidebarWidth,
    browseMode,
    dirName,
    recentDirs,
    supportsDirectoryPicker,
    selectedFileKey,
    currentNodeKey,
    dirFileCount,

    // Actions
    openDirectory,
    setBrowseMode,
    readFileNode,
    setSelectedFile,
    clearSelectedFile,
    findSelectedNode,
    tryRestoreCachedHandle,
    restoreCachedDirectory,
    removeCachedHandle,
  };
}
