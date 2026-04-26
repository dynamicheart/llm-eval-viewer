/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Plugin: formatParse — Stage 1: Parse input text into records.
 *
 * Handles JSON, JSONL, CSV, and TSV formats.
 * Required (always runs), executes once, cacheable.
 */

import Papa from 'papaparse';
import { createLogger } from '@/utils/pipelineLogger';
import { registerPlugin } from './pluginRegistry';

const logger = createLogger('formatParse');
const PROGRESS_INTERVAL = 500;

const formatParse = {
  id: 'formatParse',
  nameKey: 'custom.pluginFormatParseName',
  descriptionKey: 'custom.pluginFormatParseDesc',
  stage: 'parse',
  required: true,
  execution: 'once',
  order: 0,

  /**
   * @param {string|null} text - Input text (null when using cachedRecords)
   * @param {Object} fieldMeta
   * @param {Object} context - { progressCallback }
   * @returns {{ rows: Array, fieldMeta: Object }}
   */
  process(text, fieldMeta, context) {
    if (text == null) return { rows: [], fieldMeta };

    const { progressCallback } = context || {};
    let records = [];
    let detectedFormat = 'unknown';

    const trimmed = text.trimStart();

    // Try CSV/TSV first
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      const firstLine = trimmed.split('\n')[0];
      if (firstLine && (firstLine.includes(',') || firstLine.includes('\t'))) {
        const delimiter = firstLine.includes('\t') ? '\t' : ',';
        detectedFormat = delimiter === '\t' ? 'tsv' : 'csv';
        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          delimiter,
        });
        if (result.data && result.data.length > 0 && result.meta.fields.length > 0) {
          records = result.data;
        }
      }
    }

    // Try JSON
    if (records.length === 0) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          records = parsed;
          detectedFormat = 'json';
        } else {
          records = [parsed];
          detectedFormat = 'json';
        }
      } catch {
        // JSONL: parse line by line
        detectedFormat = 'jsonl';
        const lines = text.split('\n');
        const lineTotal = lines.length;
        records = new Array(lineTotal);
        let recordIdx = 0;
        for (let i = 0; i < lineTotal; i++) {
          const line = lines[i];
          if (!line) continue;
          try {
            records[recordIdx] = JSON.parse(line);
            recordIdx++;
          } catch {
            // Skip malformed lines
          }
          if (i % PROGRESS_INTERVAL === 0 && progressCallback) {
            progressCallback(Math.round((i / lineTotal) * 50));
          }
        }
        records.length = recordIdx;
        if (progressCallback) progressCallback(50);
      }
    }

    if (progressCallback) progressCallback(50);

    logger.detail(`parsed ${records.length} records as ${detectedFormat}`);

    return {
      rows: records,
      fieldMeta: {
        ...fieldMeta,
        _detectedFormat: detectedFormat,
      },
      _pluginDebug: {
        summary: `${records.length} records, format: ${detectedFormat}`,
        detectedFormat,
        rowCount: records.length,
      },
    };
  },
};

registerPlugin(formatParse);

export default formatParse;
