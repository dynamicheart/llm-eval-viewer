/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Plugin: Decode nested/double-encoded JSON strings.
 *
 * Scans string fields for values that are JSON-encoded strings containing
 * nested JSON strings (double or triple encoding). Recursively decodes
 * them into structured data.
 *
 * Example:
 *   Input:  "tinymsg.RequestData" = '{"messages":"[{\"role\":\"system\"}]"}'
 *   Output: decoded object { messages: [{ role: "system" }] }
 *
 * Stores decoded objects in row._decoded_<key> and sets cell values
 * to a readable JSON string for display. The Enhanced Data tab in the
 * JSON dialog will show proper objects instead of escaped strings.
 */

import { registerPlugin } from './pluginRegistry';

const MAX_DEPTH = 5;

/**
 * Try to parse a string as JSON. Returns the parsed value or null.
 */
function tryParseJson(str) {
  if (typeof str !== 'string' || str.length < 2) return null;
  const trimmed = str.trim();
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Recursively decode nested JSON strings within a parsed value.
 */
function deepDecode(value, depth) {
  if (depth >= MAX_DEPTH) return value;

  if (typeof value === 'string') {
    const parsed = tryParseJson(value);
    if (parsed !== null) {
      return deepDecode(parsed, depth + 1);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepDecode(item, depth));
  }

  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = deepDecode(val, depth);
    }
    return result;
  }

  return value;
}

const decodeNestedJson = {
  id: 'decodeNestedJson',
  nameKey: 'custom.pluginDecodeName',
  descriptionKey: 'custom.pluginDecodeDesc',

  process(rows, fieldMeta) {
    if (!rows || rows.length === 0) return { rows, fieldMeta };

    const processedRows = rows.map((r) => ({ ...r }));
    const newDetectedFields = [...(fieldMeta.detectedFields || [])];

    // Find string fields (include expanded sub-fields too)
    const stringFields = newDetectedFields.filter((f) => f.detectedType === 'string');

    if (stringFields.length === 0) return { rows, fieldMeta };

    // Sample first few rows to find double-encoded candidates
    const sampleRows = processedRows.slice(0, Math.min(10, processedRows.length));
    const candidates = [];

    for (const field of stringFields) {
      for (const sampleRow of sampleRows) {
        const sampleVal = sampleRow?.[field.key];
        if (typeof sampleVal !== 'string') continue;
        const decoded = deepDecode(sampleVal, 0);
        // Only candidates where the result is an object/array (not a primitive or same string)
        if (decoded !== sampleVal && typeof decoded === 'object' && decoded !== null) {
          candidates.push(field);
          break;
        }
      }
    }

    if (candidates.length === 0) return { rows, fieldMeta };

    console.log(`[decodeNestedJson] found ${candidates.length} double-encoded fields:`, candidates.map((f) => f.key));

    // Process each candidate field across all rows
    for (const field of candidates) {
      let decodeCount = 0;

      for (const row of processedRows) {
        const val = row[field.key];
        if (typeof val !== 'string') continue;

        const decoded = deepDecode(val, 0);
        if (decoded === val || typeof decoded !== 'object' || decoded === null) continue;

        // Store original encoded string
        row[`_decoded_original_${field.key}`] = val;
        // Store decoded object for Enhanced Data tab
        row[`_decoded_${field.key}`] = decoded;
        // Set display value to nicely formatted JSON
        row[field.key] = JSON.stringify(decoded, null, 2);
        decodeCount++;
      }

      if (decodeCount > 0) {
        console.log(`[decodeNestedJson] decoded ${field.key} in ${decodeCount}/${processedRows.length} rows`);

        // Update field meta
        const metaField = newDetectedFields.find((f) => f.key === field.key);
        if (metaField) {
          metaField.detectedType = 'decodedJson';
          metaField.previewable = true;
          metaField.visibilityReason = 'plugin';
          metaField.isPluginField = true;
        }
      }
    }

    return {
      rows: processedRows,
      fieldMeta: { ...fieldMeta, detectedFields: newDetectedFields },
    };
  },
};

registerPlugin(decodeNestedJson);

export default decodeNestedJson;
