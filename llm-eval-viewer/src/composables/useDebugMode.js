/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

/**
 * Global debug mode singleton.
 * Activated by clicking the footer build timestamp 6 times.
 * Persisted to localStorage so it survives page reload and works in production.
 */
import { ref, watch } from 'vue';

const STORAGE_KEY = 'ev_debug_mode';

// Guard for environments without localStorage (Web Workers, SSR)
function safeGetItem(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetItem(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

const saved = safeGetItem(STORAGE_KEY);
const debugMode = ref(saved === 'true');

watch(debugMode, (v) => safeSetItem(STORAGE_KEY, v));

export function useDebugMode() {
  return { debugMode };
}

/** Whether debug-level logging/UI should be active (controlled by user-activated debug mode only). */
export function isDebugLogging() {
  return debugMode.value;
}
