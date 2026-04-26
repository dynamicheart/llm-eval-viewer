/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Reactive pipeline debug data store.
 * Collects debug information from all stages of the Custom Viewer pipeline:
 *   cache → parse → transform → analyze → post
 *
 * When debug mode is off, no objects are allocated (zero overhead).
 * Data is populated from CustomViewerView's onParseResult callback.
 *
 * Data shape:
 * @param {Object} data
 * @param {Object} data.cache - Cache stage data
 * @param {string} data.cache.status - 'hit' | 'miss'
 * @param {string} data.cache.fileId
 * @param {string} data.cache.parserVersion
 *
 * @param {Object} data.pipeline - Pipeline execution data
 * @param {Object} data.pipeline.timings - { parse, transform, analyze, post, total } (ms)
 * @param {number} data.pipeline.rowCount
 * @param {string} data.pipeline.detectedFormat - 'json' | 'jsonl' | 'csv' | 'tsv'
 * @param {Object} data.pipeline.formatDebug - { conversationArrays, toolArrays, homogeneousArrays }
 * @param {Array}  data.pipeline.stages - [{ stage, id, summary, elapsedMs, required, ... }]
 *
 * @param {Object} data.scoring - Scoring stage data (from fieldMeta.priorityDebug)
 * @param {Array}  data.scoring.debugMeta - Per-field scoring breakdown
 * @param {Array}  data.scoring.fieldTree - Hierarchical field tree from recursive type detection
 * @param {Object} data.scoring.patternMatchCounts - Pattern hit counts
 *
 * @param {Object} data.samples - Sample data snapshots
 * @param {Object} data.samples.original - Row 0 original data
 * @param {Object} data.samples.expanded - Row 0 after worker expansion
 * @param {Object} data.samples.afterPlugins - Row 0 after plugin pipeline
 */

import { ref } from 'vue';
import { isDebugLogging } from '@/composables/useDebugMode';

export const pipelineDebug = ref(null);

/**
 * Reset the pipeline debug store to null.
 */
export function resetPipelineDebug() {
  pipelineDebug.value = null;
}

/**
 * Populate the pipeline debug store with data from all pipeline stages.
 * Call this from onParseResult after the full pipeline completes.
 */
export function populatePipelineDebug(data) {
  if (!isDebugLogging()) return;
  pipelineDebug.value = data;
}
