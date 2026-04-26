/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Plugin: Decode JSON strings.
 *
 * The primary JSON processing plugin. Handles:
 * - Parse JSON string fields into nested objects/arrays (preserve structure)
 * - Multi-layer nested JSON decoding (double/triple encoded strings)
 * - Format special arrays (conversations, tool definitions) as text
 *
 * Runs first in transform stage (order: 5), before optional plugins.
 */

import { registerPlugin } from './pluginRegistry';
import { createLogger } from '@/utils/pipelineLogger';
import { expandRecord } from '@/utils/recordExpander';

const logger = createLogger('decodeNestedJson');
const PROGRESS_INTERVAL = 500;

const decodeNestedJson = {
  id: 'decodeNestedJson',
  nameKey: 'custom.pluginDecodeName',
  descriptionKey: 'custom.pluginDecodeDesc',
  stage: 'transform',
  required: false,
  execution: 'once',
  order: 5,

  /**
   * @param {Array} rows - records from parse stage
   * @param {Object} fieldMeta
   * @param {Object} context - { expandNestedJsonStrings, progressCallback, parallel }
   * @returns {{ rows: Array, fieldMeta: Object }}
   */
  process(rows, fieldMeta, context) {
    if (!rows || rows.length === 0) return { rows, fieldMeta };

    const { expandNestedJsonStrings = true, progressCallback, parallel = (arr, fn) => arr.map(fn) } = context || {};
    if (!expandNestedJsonStrings) return { rows, fieldMeta };

    logger.stage(`decoding ${rows.length} records`);

    const total = rows.length;
    const decodedKeys = new Set();
    const formatDebug = { conversationArrays: [], toolArrays: [], homogeneousArrays: [] };

    // Pre-compute shared topKeys from first record
    const sharedTopKeys = total > 0
      ? new Set(Object.keys(rows[0]).map(k => k.toLowerCase()))
      : null;

    const processedRows = parallel(rows, (record, idx) => {
      const processed = expandRecord(record, 0, sharedTopKeys, formatDebug);

      // Track which fields were decoded (string → object/array)
      for (const key of Object.keys(record)) {
        if (key.startsWith('_raw_')) continue;
        const origValue = record[key];
        const newValue = processed[key];
        if (typeof origValue === 'string' && typeof newValue === 'object' && newValue !== null) {
          decodedKeys.add(key);
        }
      }

      processed.__index = idx;

      if (idx % PROGRESS_INTERVAL === 0 && progressCallback) {
        progressCallback(Math.round(50 + (idx / total) * 50));
      }

      return processed;
    });

    if (progressCallback) progressCallback(100);

    logger.detail(`decoded: ${decodedKeys.size} fields, ${formatDebug.conversationArrays.length} conv arrays, ${formatDebug.toolArrays.length} tool arrays, ${formatDebug.homogeneousArrays.length} homo arrays`);
    logger.stageEnd();

    return {
      rows: processedRows,
      fieldMeta: {
        ...fieldMeta,
        _decodedKeys: decodedKeys,
        _formatDebug: formatDebug,
      },
      _pluginDebug: {
        summary: `${decodedKeys.size} decoded fields`,
        decodedFieldCount: decodedKeys.size,
        formatDebug,
      },
    };
  },
};

registerPlugin(decodeNestedJson);

export default decodeNestedJson;
