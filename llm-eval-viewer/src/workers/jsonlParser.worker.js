/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Generic JSONL parser worker for Reviews and Predictions views.
 * Receives { text, type, failedParseLabel } where type is 'reviews' | 'predictions'.
 * Returns { rows } with parsed row objects.
 *
 * Heavy JSON parsing happens off the main thread.
 * Large nested objects are kept as raw JSON text (_rawJsonText) to avoid
 * expensive structured clone of deeply nested objects.
 */

import { parseReviewLine, parsePredictionLine } from '@/utils/jsonlHelpers';

// ===== Message handler =====

self.onmessage = (e) => {
  const { text, type, failedParseLabel } = e.data;
  const lines = text.split('\n').filter(Boolean);
  const total = lines.length;
  const rows = new Array(total);
  const PROGRESS_INTERVAL = 500;

  for (let idx = 0; idx < total; idx++) {
    if (type === 'reviews') {
      rows[idx] = parseReviewLine(lines[idx], idx, failedParseLabel);
    } else {
      rows[idx] = parsePredictionLine(lines[idx], idx);
    }
    if (idx % PROGRESS_INTERVAL === 0) {
      self.postMessage({ type: 'progress', percent: Math.round((idx / total) * 100) });
    }
  }

  self.postMessage({ type: 'done', rows });
};
