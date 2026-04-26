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
 *   nameKey?: string,
 *   name?: string,
 *   descriptionKey?: string,
 *   description?: string,
 *   stage: 'parse' | 'transform' | 'analyze' | 'post',  // default 'transform'
 *   required: boolean,        // default false — hidden from UI
 *   execution: 'once' | 'rerunnable',  // default 'rerunnable'
 *   order: number,            // within stage, default 0
 *   process(rows, fieldMeta, context?) => { rows, fieldMeta, pluginDebug? }
 * }
 */

import { createLogger } from '@/utils/pipelineLogger';

const logger = createLogger('Plugin Pipeline');

export const pluginRegistry = [];

export function registerPlugin(plugin) {
  // Prevent duplicate registration (e.g. HMR re-import)
  if (pluginRegistry.some(p => p.id === plugin.id)) return;
  // Apply defaults for new stage-based metadata
  plugin.stage = plugin.stage || 'transform';
  plugin.required = plugin.required || false;
  plugin.execution = plugin.execution || 'rerunnable';
  plugin.order = plugin.order ?? 0;
  pluginRegistry.push(plugin);
}

/**
 * Get plugins filtered by stage, sorted by order.
 */
export function getPluginsByStage(stage) {
  return pluginRegistry
    .filter(p => p.stage === stage)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Get optional (non-required) plugins for UI toggle display.
 */
export function getOptionalPlugins() {
  return pluginRegistry
    .filter(p => !p.required)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Run enabled plugins in order on the given rows and fieldMeta.
 * Each plugin receives the output of the previous one.
 *
 * @param {Array} rows - table data rows
 * @param {Object} fieldMeta - { detectedFields: [...], expandCandidates, schemaSnapshot, ... }
 * @param {string[]} enabledIds - plugin IDs to run, in order
 * @param {Object} [context] - Optional pipeline context (logger, parallel, etc.)
 * @returns {{ rows: Array, fieldMeta: Object, pluginDebug: Array }}
 */
export function runPlugins(rows, fieldMeta, enabledIds, context) {
  logger.header(`RunPlugins: start (${enabledIds.length} plugins, ${rows.length} rows)`);
  const endTimer = logger.time('RunPlugins total');

  let result = { rows, fieldMeta };
  const pluginDebug = [];

  for (const id of enabledIds) {
    const plugin = pluginRegistry.find((p) => p.id === id);
    if (plugin) {
      logger.stage(`plugin: ${plugin.id || id}`);
      const t = logger.time(plugin.id || id);
      const fieldsBefore = (result.fieldMeta.detectedFields || []).map(f => f.key);
      result = plugin.process(result.rows, result.fieldMeta, context);
      const fieldsAfter = (result.fieldMeta.detectedFields || []).map(f => f.key);
      t();

      const elapsed = t(); // approximate from logger timer
      const addedKeys = fieldsAfter.filter(k => !fieldsBefore.includes(k));
      const removedKeys = fieldsBefore.filter(k => !fieldsAfter.includes(k));
      const pluginInfo = {
        id: plugin.id || id,
        name: plugin.nameKey || plugin.name || id,
        stage: plugin.stage || 'transform',
        elapsedMs: 0,
        fieldsBefore: fieldsBefore.length,
        fieldsAfter: fieldsAfter.length,
        addedKeys,
        removedKeys,
        modifiedKeys: [],
        summary: '',
        debug: null,
      };

      // Collect plugin-specific debug info if available
      if (result.pluginDebug) {
        pluginInfo.debug = result.pluginDebug;
        pluginInfo.summary = result.pluginDebug.summary || '';
        delete result.pluginDebug;
      }

      pluginDebug.push(pluginInfo);

      logger.detail(`output: ${result.rows.length} rows, ${(result.fieldMeta.detectedFields || []).length} fields`);
      logger.stageEnd();
    } else {
      logger.detail(`plugin not found: ${id}`);
    }
  }

  endTimer();
  logger.header(`RunPlugins: done`);
  return { rows: result.rows, fieldMeta: result.fieldMeta, pluginDebug };
}

/**
 * Get all registered plugins (for UI display).
 */
export function getRegisteredPlugins() {
  return [...pluginRegistry];
}
