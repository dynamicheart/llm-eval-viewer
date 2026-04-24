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
  let result = { rows, fieldMeta };
  for (const id of enabledIds) {
    const plugin = pluginRegistry.find((p) => p.id === id);
    if (plugin) {
      result = plugin.process(result.rows, result.fieldMeta);
    }
  }
  return result;
}

/**
 * Get all registered plugins (for UI display).
 */
export function getRegisteredPlugins() {
  return [...pluginRegistry];
}
