/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Plugin: detectTypes — Detect field types by sampling rows.
 *
 * Wraps customParserHelpers.detectFieldTypes().
 * Required, post-stage, order 10.
 */

import { createLogger } from '@/utils/pipelineLogger';
import { detectFieldTypes, detectFieldTypesTree } from '@/utils/customParserHelpers';
import { registerPlugin } from './pluginRegistry';

const logger = createLogger('detectTypes');

const detectTypes = {
  id: 'detectTypes',
  nameKey: 'custom.pluginDetectTypesName',
  descriptionKey: 'custom.pluginDetectTypesDesc',
  stage: 'post',
  required: true,
  execution: 'once',
  order: 10,

  /**
   * @param {Array} rows
   * @param {Object} fieldMeta
   * @returns {{ rows: Array, fieldMeta: Object }}
   */
  process(rows, fieldMeta) {
    if (!rows || rows.length === 0) return { rows, fieldMeta };

    logger.stage(`detecting types for ${rows.length} rows`);

    const decodedKeys = fieldMeta._decodedKeys || new Set();

    const { tree, flatFields } = detectFieldTypesTree(rows, {
      decodedKeys,
      maxDepth: 3,
    });

    logger.detail(`${flatFields.length} fields typed (including nested)`);
    logger.stageEnd();

    return {
      rows,
      fieldMeta: {
        ...fieldMeta,
        detectedFields: flatFields,
        detectedFieldsTree: tree,
        expandCandidates: Array.from(decodedKeys),
      },
      _pluginDebug: {
        summary: `${flatFields.length} fields detected`,
        fieldCount: flatFields.length,
        tree,
      },
    };
  },
};

registerPlugin(detectTypes);

export default detectTypes;
