/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Pipeline runner for the Custom Viewer.
 *
 * Executes plugins in stage order:
 *   Stage 1: parse (required, once, cacheable)
 *   Stage 2: transform (optional + required, rerunnable)
 *   Stage 3: analyze (optional + required, rerunnable)
 *   Stage 4: post (required, always)
 *
 * Usage:
 *   // Full parse (worker or main thread)
 *   runPipeline(text, { progressCallback, expandNestedJsonStrings, enabledPluginIds })
 *
 *   // Re-run with cached records (plugin toggle in main thread)
 *   runPipeline(null, { cachedRecords, expandedKeys, enabledPluginIds })
 */

import { createLogger } from '@/utils/pipelineLogger';
import { buildSchemaSnapshot } from '@/utils/recordExpander';
import { pluginRegistry, getPluginsByStage } from '@/plugins/pluginRegistry';

const logger = createLogger('PipelineRunner');

const STAGES = ['parse', 'transform', 'analyze', 'post'];

/**
 * Run the full pipeline.
 *
 * @param {string|null} input - Text to parse, or null when using cachedRecords
 * @param {Object} options
 * @param {Array} [options.cachedRecords] - Pre-parsed records (skips Stage 1)
 * @param {string} [options.detectedFormat] - Cached format info
 * @param {boolean} [options.expandNestedJsonStrings=true] - Enable JSON expansion
 * @param {string[]} [options.enabledPluginIds] - Optional plugins to run
 * @param {Function} [options.progressCallback] - Progress reporting callback(percent)
 * @param {boolean} [options.skipPost=false] - Skip post stage (for plugin-only re-runs)
 * @returns {{ rows: Array, fieldMeta: Object, debug: Array, detectedFormat: string, timings: Object }}
 */
export function runPipeline(input, options = {}) {
  const t0 = performance.now();
  const {
    cachedRecords,
    detectedFormat: cachedDetectedFormat,
    expandNestedJsonStrings = true,
    enabledPluginIds = [],
    progressCallback,
    skipPost = false,
  } = options;

  const debug = [];
  const timings = {};

  let rows = [];
  let fieldMeta = {};
  let detectedFormat = cachedDetectedFormat || 'unknown';
  let decodedKeys = new Set();
  let formatDebug = { conversationArrays: [], toolArrays: [], homogeneousArrays: [] };

  // Build context for plugins
  const context = {
    expandNestedJsonStrings,
    progressCallback: progressCallback || (() => {}),
    logger,
    /**
     * Map fn over rows. Initially sequential (Array.map).
     * Infrastructure for future Worker-based parallelism.
     * @param {Array} arr - rows or any array
     * @param {Function} fn - (item, index) => mappedItem
     * @returns {Array}
     */
    parallel: (arr, fn) => arr.map(fn),
  };

  // ===== Stage 1: parse =====
  if (cachedRecords) {
    logger.stage('Stage 1: parse (cached)');
    rows = cachedRecords;
    logger.detail(`${rows.length} cached records`);
    logger.stageEnd();

    debug.push({
      stage: 'parse',
      id: 'formatParse',
      summary: `${rows.length} cached records`,
      elapsedMs: 0,
    });
  } else if (input != null) {
    logger.stage('Stage 1: parse');
    const tParse = performance.now();

    const parsePlugins = getPluginsByStage('parse');
    for (const plugin of parsePlugins) {
      const pt = performance.now();
      // Parse plugins receive input text, not rows
      const pluginResult = plugin.process(input, fieldMeta, context);
      const elapsed = performance.now() - pt;

      // Parse plugin returns { rows, fieldMeta, _pluginDebug }
      if (pluginResult.rows) rows = pluginResult.rows;
      if (pluginResult.fieldMeta) fieldMeta = pluginResult.fieldMeta;
      if (fieldMeta._detectedFormat) detectedFormat = fieldMeta._detectedFormat;

      debug.push({
        stage: 'parse',
        id: plugin.id,
        required: plugin.required,
        skipped: false,
        summary: pluginResult._pluginDebug?.summary || '',
        elapsedMs: Math.round(elapsed),
        debug: pluginResult._pluginDebug || null,
      });
    }

    timings.parse = performance.now() - tParse;
    logger.stageEnd();
  }

  if (rows.length === 0) {
    timings.total = performance.now() - t0;
    return {
      rows: [],
      fieldMeta: { detectedFields: [], expandCandidates: [] },
      debug,
      detectedFormat,
      timings,
    };
  }

  // ===== Stage 2: transform (required + enabled optional) =====
  logger.stage('Stage 2: transform');
  const tTransform = performance.now();

  const transformPlugins = getPluginsByStage('transform');
  for (const plugin of transformPlugins) {
    // Skip disabled optional plugins — add to debug as skipped
    if (!plugin.required && enabledPluginIds && !enabledPluginIds.includes(plugin.id)) {
      debug.push({
        stage: 'transform',
        id: plugin.id,
        required: false,
        skipped: true,
        summary: '',
        elapsedMs: 0,
        debug: null,
      });
      continue;
    }

    const pt = performance.now();
    const pluginResult = plugin.process(rows, fieldMeta, context);
    const elapsed = performance.now() - pt;

    if (pluginResult.rows) rows = pluginResult.rows;
    if (pluginResult.fieldMeta) {
      fieldMeta = pluginResult.fieldMeta;
      // Merge decoded keys
      if (fieldMeta._decodedKeys) {
        for (const key of fieldMeta._decodedKeys) decodedKeys.add(key);
      }
      if (fieldMeta._formatDebug) formatDebug = fieldMeta._formatDebug;
    }

    debug.push({
      stage: 'transform',
      id: plugin.id,
      required: plugin.required,
      skipped: false,
      summary: pluginResult._pluginDebug?.summary || '',
      elapsedMs: Math.round(elapsed),
      debug: pluginResult._pluginDebug || null,
    });
  }

  timings.transform = performance.now() - tTransform;
  logger.stageEnd();

  // ===== Stage 3: analyze (optional + required) =====
  logger.stage('Stage 3: analyze');
  const tAnalyze = performance.now();

  const analyzePlugins = getPluginsByStage('analyze');
  for (const plugin of analyzePlugins) {
    if (!plugin.required && enabledPluginIds && !enabledPluginIds.includes(plugin.id)) {
      debug.push({
        stage: 'analyze',
        id: plugin.id,
        required: false,
        skipped: true,
        summary: '',
        elapsedMs: 0,
        debug: null,
      });
      continue;
    }

    const pt = performance.now();
    const fieldsBefore = (fieldMeta.detectedFields || []).map(f => f.key);
    const pluginResult = plugin.process(rows, fieldMeta, context);
    const elapsed = performance.now() - pt;
    const fieldsAfter = (fieldMeta.detectedFields || []).map(f => f.key);

    if (pluginResult.rows) rows = pluginResult.rows;
    if (pluginResult.fieldMeta) fieldMeta = pluginResult.fieldMeta;

    const addedKeys = fieldsAfter.filter(k => !fieldsBefore.includes(k));
    const removedKeys = fieldsBefore.filter(k => !fieldsAfter.includes(k));

    debug.push({
      stage: 'analyze',
      id: plugin.id,
      required: plugin.required,
      skipped: false,
      summary: pluginResult._pluginDebug?.summary || '',
      elapsedMs: Math.round(elapsed),
      fieldsBefore: fieldsBefore.length,
      fieldsAfter: fieldsAfter.length,
      addedKeys,
      removedKeys,
      debug: pluginResult._pluginDebug || null,
    });
  }

  timings.analyze = performance.now() - tAnalyze;
  logger.stageEnd();

  // ===== Stage 4: post (always runs, unless skipPost) =====
  if (!skipPost) {
    logger.stage('Stage 4: post');
    const tPost = performance.now();

    const postPlugins = getPluginsByStage('post');
    for (const plugin of postPlugins) {
      // Skip disabled optional plugins
      if (!plugin.required && enabledPluginIds && !enabledPluginIds.includes(plugin.id)) {
        debug.push({
          stage: 'post',
          id: plugin.id,
          required: false,
          skipped: true,
          summary: '',
          elapsedMs: 0,
          debug: null,
        });
        continue;
      }

      const pt = performance.now();
      const pluginResult = plugin.process(rows, fieldMeta, context);
      const elapsed = performance.now() - pt;

      if (pluginResult.rows) rows = pluginResult.rows;
      if (pluginResult.fieldMeta) fieldMeta = pluginResult.fieldMeta;

      debug.push({
        stage: 'post',
        id: plugin.id,
        required: plugin.required,
        skipped: false,
        summary: pluginResult._pluginDebug?.summary || '',
        elapsedMs: Math.round(elapsed),
        debug: pluginResult._pluginDebug || null,
      });
    }

    timings.post = performance.now() - tPost;
    logger.stageEnd();
  }

  // Build schema snapshot from first record
  const schemaSnapshot = rows.length > 0 ? buildSchemaSnapshot(rows[0]) : null;

  // Clean up internal metadata from fieldMeta
  const cleanMeta = { ...fieldMeta };
  delete cleanMeta._detectedFormat;
  delete cleanMeta._decodedKeys;
  delete cleanMeta._formatDebug;
  delete cleanMeta._typeInfo;

  timings.total = performance.now() - t0;

  return {
    rows,
    fieldMeta: {
      ...cleanMeta,
      schemaSnapshot,
    },
    debug,
    detectedFormat,
    formatDebug,
    timings,
  };
}
