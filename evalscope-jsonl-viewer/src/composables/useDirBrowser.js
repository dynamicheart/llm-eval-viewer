/**
 * useDirBrowser — 目录浏览器 composable（singleton）
 *
 * 模块级共享状态，Reviews 和 Predictions 共用同一套目录树。
 * 使用 File System Access API (showDirectoryPicker) 扫描 eval_pack 目录。
 * 目录 handle 持久化到 IndexedDB，选中的 run 持久化到 localStorage。
 * 文件内容不缓存。
 */

import { ref, shallowRef, computed } from 'vue';
import { ElMessage } from 'element-plus';

// ===== Singleton 模块级状态 =====
const dirTree = ref([]);
const activeFileKey = ref('');
const hasDir = ref(false);
const rootHandle = shallowRef(null);
const browseMode = ref(localStorage.getItem('evalscope_browse_mode') || 'file');
const supportsDirectoryPicker =
  typeof window !== 'undefined' && !!window.showDirectoryPicker;
const dirName = ref('');

// 缓存的目录名（用于"最近记录"显示，即使当前在 file 模式也可用）
const cachedDirName = ref(localStorage.getItem('evalscope_cached_dir_name') || '');

// 最近目录列表 [{ name, time }]
const RECENT_DIRS_KEY = 'evalscope_recent_dirs';
const MAX_RECENT_DIRS = 5;
const recentDirs = ref(JSON.parse(localStorage.getItem(RECENT_DIRS_KEY) || '[]'));

// 侧边栏可见性：派生状态，目录模式 + 有目录树 = 显示
const showSidebar = computed(() => hasDir.value && browseMode.value === 'directory');

// 侧边栏宽度（共享，拖拽时实时更新）
const sidebarWidth = ref(Number(localStorage.getItem('dir_sidebar_width')) || 380);

// 持久化选中的 run 节点信息
const _savedRun = localStorage.getItem('evalscope_selected_run');
const selectedRunInfo = ref(_savedRun ? JSON.parse(_savedRun) : null);

// ===== IDB handle 持久化 =====
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
    // 存储失败不影响使用
  }
  // 更新最近目录列表
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

    // 优先按新格式查找
    if (name) {
      const req = store.get(`dir_${name}`);
      const result = await new Promise((r) => {
        req.onsuccess = () => r(req.result || null);
        req.onerror = () => r(null);
      });
      if (result) return result;
    }

    // fallback: 尝试旧格式 'root' key（向后兼容）
    const tx2 = db.transaction(DIR_STORE, 'readonly');
    const legacyReq = tx2.objectStore(DIR_STORE).get('root');
    const legacy = await new Promise((r) => {
      legacyReq.onsuccess = () => r(legacyReq.result || null);
      legacyReq.onerror = () => r(null);
    });

    if (legacy) {
      // 迁移：存到新 key，删除旧 key
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

// ===== 目录扫描（递归，自动探测最后两层：dataset → run） =====

/**
 * 判断一个目录是否为完整的 run 目录（同时包含 reviews/、predictions/、reports/ 子目录）
 */
async function isRunDir(handle) {
  let hasReviews = false;
  let hasPredictions = false;
  let hasReports = false;
  for await (const [name, h] of handle.entries()) {
    if (h.kind === 'directory') {
      if (name === 'reviews') hasReviews = true;
      else if (name === 'predictions') hasPredictions = true;
      else if (name === 'reports') hasReports = true;
    }
    if (hasReviews && hasPredictions && hasReports) return true;
  }
  return false;
}

/**
 * 递归扫描目录树。
 * - 如果当前目录的子目录中有 run 目录，则当前目录视为 dataset 层，收集 run 节点
 * - 否则递归向下，当前目录作为中间节点
 */
async function scanNode(handle, name, idPrefix) {
  const entries = [];
  for await (const [childName, childHandle] of handle.entries()) {
    if (childHandle.kind === 'directory') {
      entries.push({ name: childName, handle: childHandle });
    }
  }

  if (entries.length === 0) return null;

  // 检测哪些子目录是 run 目录
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
    // 当前目录是 dataset 层，子 run 目录作为叶节点
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

  // 中间节点，递归扫描
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

// ===== 读取文件 =====
async function readRunFile(runHandle, type) {
  try {
    const typeDir = await runHandle.getDirectoryHandle(type);

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
    // 目录不存在
  }
  return null;
}

function buildFileKey(node, type) {
  return `${type}://${node.runDir}/${node.datasetName}`;
}

// ===== 核心操作 =====
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

// ===== 选中 run 节点管理 =====
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
 * 在当前目录树中递归查找匹配的 run 节点
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

// ===== 导出 composable =====
export function useDirBrowser() {
  function setBrowseMode(mode) {
    browseMode.value = mode;
    localStorage.setItem('evalscope_browse_mode', mode);
  }

  /**
   * 打开目录选择器，始终弹出 picker 让用户选择目录
   */
  async function openDirectory() {
    if (!supportsDirectoryPicker) {
      ElMessage.error(
        '当前浏览器不支持 File System Access API，请使用 Chrome/Edge'
      );
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
   * 页面加载时尝试恢复缓存的目录 handle（不弹权限框）
   * 如果已经恢复过则跳过
   */
  async function tryRestoreCachedHandle() {
    // 已经有目录树了，跳过
    if (hasDir.value) return true;
    if (!supportsDirectoryPicker) return false;
    if (browseMode.value !== 'directory') return false;

    const name = cachedDirName.value;
    if (!name) return false;

    try {
      const handle = await loadCachedHandle(name);
      if (!handle) return false;

      // 先被动查询，如果已授权直接用
      let perm = await handle.queryPermission({ mode: 'read' });
      if (perm !== 'granted') {
        // 主动请求权限（会弹出浏览器授权提示）
        perm = await handle.requestPermission({ mode: 'read' });
      }

      if (perm === 'granted') {
        rootHandle.value = handle;
        await rescanTree();
        return true;
      }

      // 用户拒绝了权限，退回文件模式
      browseMode.value = 'file';
      localStorage.setItem('evalscope_browse_mode', 'file');
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 恢复缓存的目录（从 IndexedDB 加载 handle，需要用户授权）
   * @param {string} [targetName] 要恢复的目录名，不传则恢复当前 cachedDirName
   */
  async function restoreCachedDirectory(targetName) {
    if (!supportsDirectoryPicker) return false;

    const name = targetName || cachedDirName.value;
    if (!name) {
      ElMessage.warning('未找到缓存的目录');
      return false;
    }

    try {
      const handle = await loadCachedHandle(name);
      if (!handle) {
        ElMessage.warning('未找到缓存的目录');
        return false;
      }

      // requestPermission 会弹出授权提示
      const perm = await handle.requestPermission({ mode: 'read' });
      if (perm !== 'granted') {
        ElMessage.warning('目录访问权限被拒绝');
        return false;
      }

      rootHandle.value = handle;
      await rescanTree();
      setBrowseMode('directory');
      return true;
    } catch {
      ElMessage.error('恢复目录失败');
      return false;
    }
  }

  return {
    // 状态（共享）
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

    // 操作
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
