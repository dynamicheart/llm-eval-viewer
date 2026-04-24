/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Structured pipeline logger for the plugin processing pipeline.
 *
 * Log levels:
 *   L1 header()  – Pipeline stage title (bold + colored)
 *   L2 stage()   – Plugin/function begin/end (console.group/groupEnd)
 *   L3 detail()  – Specific decisions and operations
 *   L4 trace()   – Per-field / per-row detail (only with verbose=true)
 *
 * Only outputs in DEV mode or when user-activated debug mode is on.
 */

import { isDebugLogging } from '@/composables/useDebugMode';

const COLORS = {
  header: 'color:#0af;font-weight:bold',
  stage: 'color:#a0f;font-weight:bold',
  detail: 'color:inherit',
  trace: 'color:#888',
};

class PipelineLogger {
  constructor(options = {}) {
    this.prefix = options.prefix || '';
    this.verbose = options.verbose || false;
  }

  header(msg) {
    if (!isDebugLogging()) return;
    console.log(`%c${this.prefix} ${msg}`, COLORS.header);
    console.log(`%c${'─'.repeat(60)}`, 'color:#444');
  }

  stage(msg) {
    if (!isDebugLogging()) return;
    console.group(`%c${this.prefix} ${msg}`, COLORS.stage);
  }

  stageEnd() {
    if (!isDebugLogging()) return;
    console.groupEnd();
  }

  detail(msg) {
    if (!isDebugLogging()) return;
    console.log(`  ${msg}`);
  }

  trace(msg) {
    if (!isDebugLogging() || !this.verbose) return;
    console.log(`    ${msg}`);
  }

  table(tabularData) {
    if (!isDebugLogging()) return;
    console.table(tabularData);
  }

  time(label) {
    if (!isDebugLogging()) return () => {};
    console.time(`${this.prefix} ${label}`);
    return () => console.timeEnd(`${this.prefix} ${label}`);
  }
}

/**
 * Create a named pipeline logger.
 *
 * @param {string} prefix - Logger name, will be wrapped in brackets, e.g. "Plugin Pipeline"
 * @param {boolean} [verbose=false] - Enable L4 trace-level output
 * @returns {PipelineLogger}
 */
export function createLogger(prefix, verbose) {
  return new PipelineLogger({ prefix: `[${prefix}]`, verbose });
}
