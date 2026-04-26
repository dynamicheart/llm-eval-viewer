/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Plugin: Dedup nested fields.
 *
 * Detects nested object fields whose content largely duplicates top-level fields.
 * Common in log systems where the same event data appears at both levels.
 * E.g. @message.RequestID duplicates top-level RequestID.
 *
 * Checks:
 * 1. Key overlap: nested object keys vs top-level keys (must be >80%)
 * 2. Value spot-check: up to 3 overlapping key values must match exactly
 *
 * Matching nested objects are deleted from rows. The key set is stored in
 * fieldMeta._dedupedKeys so detectTypes can skip them.
 */

import { registerPlugin } from './pluginRegistry';
import { createLogger } from '@/utils/pipelineLogger';

const logger = createLogger('dedupNestedFields');

const KEY_OVERLAP_THRESHOLD = 0.8;
const SAMPLE_SIZE = 10;

const dedupNestedFields = {
  id: 'dedupNestedFields',
  nameKey: 'custom.pluginDedupNestedName',
  descriptionKey: 'custom.pluginDedupNestedDesc',
  stage: 'post',
  required: false,
  execution: 'rerunnable',
  order: 15,

  /**
   * @param {Array} rows
   * @param {Object} fieldMeta
   * @returns {{ rows: Array, fieldMeta: Object }}
   */
  process(rows, fieldMeta) {
    if (!rows || rows.length === 0) return { rows, fieldMeta };

    logger.stage('scanning for duplicate nested fields');

    const sampleRows = rows.slice(0, SAMPLE_SIZE);
    const topLevelKeys = new Set();

    // Collect all top-level keys from sample (excluding internal keys)
    for (const row of sampleRows) {
      for (const key of Object.keys(row)) {
        if (key.startsWith('_raw_') || key.startsWith('_reconstructed_') || key.startsWith('_decoded_')) continue;
        topLevelKeys.add(key);
      }
    }

    // Find nested object fields to check
    const nestedObjectKeys = [];
    for (const key of topLevelKeys) {
      const sample = sampleRows.find(r => r[key] != null && typeof r[key] === 'object' && !Array.isArray(r[key]));
      if (sample) {
        nestedObjectKeys.push(key);
      }
    }

    if (nestedObjectKeys.length === 0) {
      logger.stageEnd();
      return { rows, fieldMeta };
    }

    const dedupedKeys = [];

    for (const nestedKey of nestedObjectKeys) {
      // Check across sample rows
      let allRowsDuplicate = true;
      for (const row of sampleRows) {
        const nestedObj = row[nestedKey];
        if (nestedObj == null || typeof nestedObj !== 'object' || Array.isArray(nestedObj)) continue;

        const nestedSubKeys = Object.keys(nestedObj);
        if (nestedSubKeys.length === 0) { allRowsDuplicate = false; break; }

        // Key overlap check
        let overlapCount = 0;
        for (const subKey of nestedSubKeys) {
          if (topLevelKeys.has(subKey)) overlapCount++;
        }
        const overlapRatio = overlapCount / nestedSubKeys.length;

        if (overlapRatio < KEY_OVERLAP_THRESHOLD) { allRowsDuplicate = false; break; }

        // Value spot-check: compare up to 3 overlapping key values
        let matchCount = 0;
        let checkCount = 0;
        for (const subKey of nestedSubKeys) {
          if (!topLevelKeys.has(subKey)) continue;
          const nestedVal = nestedObj[subKey];
          const topVal = row[subKey];
          checkCount++;
          if (JSON.stringify(nestedVal) === JSON.stringify(topVal)) {
            matchCount++;
          }
          if (checkCount >= 3) break;
        }

        if (checkCount === 0 || matchCount < checkCount) { allRowsDuplicate = false; break; }
      }

      if (allRowsDuplicate) {
        dedupedKeys.push(nestedKey);
        logger.detail(`${nestedKey}: values match top-level fields`);
      }
    }

    if (dedupedKeys.length === 0) {
      logger.stageEnd();
      return { rows, fieldMeta };
    }

    // Remove from rows
    const newRows = rows.map(row => {
      const cleaned = { ...row };
      for (const dk of dedupedKeys) {
        delete cleaned[dk];
        delete cleaned[`_raw_${dk}`];
      }
      return cleaned;
    });

    // Remove from detectedFields and detectedFieldsTree
    fieldMeta = {
      ...fieldMeta,
      detectedFields: (fieldMeta.detectedFields || []).filter(
        f => !dedupedKeys.includes(f.key) && !dedupedKeys.some(dk => f.key.startsWith(dk + '.'))
      ),
      detectedFieldsTree: (fieldMeta.detectedFieldsTree || []).filter(
        n => !dedupedKeys.includes(n.key)
      ),
    };

    logger.detail(`removed ${dedupedKeys.length} fields: ${dedupedKeys.join(', ')}`);
    logger.stageEnd();

    return {
      rows: newRows,
      fieldMeta,
      _pluginDebug: {
        summary: `${dedupedKeys.length} duplicate fields removed`,
        dedupedCount: dedupedKeys.length,
        dedupedKeys,
      },
    };
  },
};

registerPlugin(dedupNestedFields);

export default dedupNestedFields;
