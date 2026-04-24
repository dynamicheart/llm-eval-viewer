/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Plugin registry for Custom Viewer post-processing pipeline.
 *
 * Plugin interface:
 * {
 *   id: string,
 *   name: string,
 *   description: string,
 *   process(rows, fieldMeta) => { rows, fieldMeta }
 * }
 */

import { createLogger } from '@/utils/pipelineLogger';

const logger = createLogger('Plugin Pipeline');

export const pluginRegistry = [];

export function registerPlugin(plugin) {
  pluginRegistry.push(plugin);
}

/**
 * Run enabled plugins in order on the given rows and fieldMeta.
 * Each plugin receives the output of the previous one.
 *
 * @param {Array} rows - table data rows
 * @param {Object} fieldMeta - { detectedFields: [...], expandCandidates, schemaSnapshot, ... }
 * @param {string[]} enabledIds - plugin IDs to run, in order
 * @returns {{ rows: Array, fieldMeta: Object }}
 */
export function runPlugins(rows, fieldMeta, enabledIds) {
  logger.header(`RunPlugins: start (${enabledIds.length} plugins, ${rows.length} rows)`);
  const endTimer = logger.time('RunPlugins total');

  let result = { rows, fieldMeta };
  for (const id of enabledIds) {
    const plugin = pluginRegistry.find((p) => p.id === id);
    if (plugin) {
      logger.stage(`plugin: ${plugin.id || id}`);
      const t = logger.time(plugin.id || id);
      result = plugin.process(result.rows, result.fieldMeta);
      t();
      logger.detail(`output: ${result.rows.length} rows, ${(result.fieldMeta.detectedFields || []).length} fields`);
      logger.stageEnd();
    } else {
      logger.detail(`plugin not found: ${id}`);
    }
  }

  endTimer();
  logger.header(`RunPlugins: done`);
  return result;
}

/**
 * Get all registered plugins (for UI display).
 */
export function getRegisteredPlugins() {
  return [...pluginRegistry];
}
