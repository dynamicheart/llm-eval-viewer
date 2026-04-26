/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Plugin: scoring — Sort fields and assign visibility.
 *
 * Wraps customParserHelpers.assignFieldVisibility().
 * Required, post-stage, order 20 (after detectTypes).
 */

import { createLogger } from '@/utils/pipelineLogger';
import { assignFieldVisibility } from '@/utils/customParserHelpers';
import { registerPlugin } from './pluginRegistry';

const logger = createLogger('scoring');

const DEFAULT_VISIBLE_FIELDS = 10;

const scoring = {
  id: 'scoring',
  nameKey: 'custom.pluginScoringName',
  descriptionKey: 'custom.pluginScoringDesc',
  stage: 'post',
  required: true,
  execution: 'once',
  order: 20,

  /**
   * @param {Array} rows
   * @param {Object} fieldMeta - must have detectedFields
   * @returns {{ rows: Array, fieldMeta: Object }}
   */
  process(rows, fieldMeta) {
    if (!fieldMeta.detectedFields || fieldMeta.detectedFields.length === 0) {
      return { rows, fieldMeta };
    }

    logger.stage(`scoring ${fieldMeta.detectedFields.length} fields`);

    const { debugMeta, patternMatchCounts } = assignFieldVisibility(
      fieldMeta.detectedFields,
      DEFAULT_VISIBLE_FIELDS,
    );

    logger.detail(`scored: ${fieldMeta.detectedFields.filter(f => f.visible).length} visible / ${fieldMeta.detectedFields.length} total`);
    logger.stageEnd();

    return {
      rows,
      fieldMeta: {
        ...fieldMeta,
        priorityDebug: debugMeta,
        patternMatchCounts,
      },
      _pluginDebug: {
        summary: `${fieldMeta.detectedFields.filter(f => f.visible).length} visible / ${fieldMeta.detectedFields.length} total`,
        visibleCount: fieldMeta.detectedFields.filter(f => f.visible).length,
        totalFields: fieldMeta.detectedFields.length,
      },
    };
  },
};

registerPlugin(scoring);

export default scoring;
