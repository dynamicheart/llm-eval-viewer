/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

/**
 * Global debug mode singleton.
 * Activated by clicking the footer build timestamp 6 times.
 * Persisted to localStorage so it survives page reload and works in production.
 */
import { ref, watch } from 'vue';

const STORAGE_KEY = 'ev_debug_mode';
const saved = localStorage.getItem(STORAGE_KEY);
const debugMode = ref(saved === 'true');

watch(debugMode, (v) => localStorage.setItem(STORAGE_KEY, v));

export function useDebugMode() {
  return { debugMode };
}

/** Whether debug-level logging/UI should be active (DEV mode or user-activated debug mode). */
export function isDebugLogging() {
  return import.meta.env.DEV || debugMode.value;
}
