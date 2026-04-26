/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Record expansion utilities extracted from customParser.worker.js.
 * Testable independently from the Worker threading environment.
 *
 * Key behavior: parses JSON string fields into nested objects/arrays,
 * preserving the original JSON structure (no dot-notation flattening).
 * Native arrays are preserved as-is (not converted to text).
 */

import {
  isConversationLikeArray,
  isHomogeneousObjectArray,
  isToolDefinitionsArray,
  tryParseJsonString,
} from './customParserHelpers';

export const MAX_EXPAND_DEPTH = 5;

/**
 * Expand a record by:
 * 1. Parsing JSON string fields into nested objects/arrays (preserve structure)
 * 2. Recording special array info in expDebug (without converting to text)
 * 3. Deep-expanding nested JSON strings within parsed objects (multi-layer JSON)
 * 4. Storing original string values as _raw_<key> backups
 *
 * Unlike the old behavior, this does NOT flatten JSON into dot-notation keys.
 * The parsed object is stored directly as the field value.
 *
 * @param {Object} record - Input record
 * @param {number} [depth=0] - Current recursion depth
 * @param {Set<string>} [topKeys=null] - Known top-level keys (lowercase) for dedup
 * @param {Object} [expDebug=null] - Debug accumulator for expansion info
 * @returns {Object} Expanded record
 */
export function expandRecord(record, depth = 0, topKeys = null, expDebug = null) {
  if (depth >= MAX_EXPAND_DEPTH) return record;

  if (!topKeys) topKeys = new Set(Object.keys(record).map(k => k.toLowerCase()));

  // Early scan: skip entire expansion if no expandable values exist.
  const keys = Object.keys(record);
  let hasExpandable = false;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key.startsWith('_raw_')) continue;
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      const c = value.charCodeAt(0);
      if (c === 123 || c === 91) { hasExpandable = true; break; }
    }
    // Also process records with native arrays (for debug info recording)
    if (Array.isArray(value) && value.length >= 2 && depth === 0) {
      hasExpandable = true; break;
    }
  }
  if (!hasExpandable) return record;

  let expanded = false;
  const result = { ...record };

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key.startsWith('_raw_')) continue;
    const value = result[key];

    // Record debug info for native arrays (e.g., messages/tools) but keep as-is
    if (Array.isArray(value) && value.length >= 2 && depth === 0) {
      recordArrayDebugInfo(expDebug, key, value);
    }

    // Handle JSON strings → parse and store as nested object (preserve structure)
    if (typeof value !== 'string') continue;
    if (value.length > 0) {
      const c = value.charCodeAt(0);
      if (c !== 123 && c !== 91) continue;
    }
    const parsed = tryParseJsonString(value);
    if (parsed === null) continue;

    // Record debug info for parsed arrays but keep as native arrays
    if (Array.isArray(parsed)) {
      recordArrayDebugInfo(expDebug, key, parsed);
    }

    // Store parsed object/array as field value (preserve JSON structure)
    result[`_raw_${key}`] = value;
    result[key] = parsed;
    expanded = true;
  }

  if (expanded) {
    // Deep-expand JSON strings within parsed objects (handles multi-layer JSON)
    for (let i = 0; i < Object.keys(result).length; i++) {
      const key = Object.keys(result)[i];
      if (key.startsWith('_raw_')) continue;
      const value = result[key];
      if (typeof value === 'object' && value !== null) {
        deepExpandValues(value, expDebug, key, 0, MAX_EXPAND_DEPTH);
      }
    }

    const resultKeys = Object.keys(result);
    for (let i = 0; i < resultKeys.length; i++) {
      topKeys.add(resultKeys[i].toLowerCase());
    }

    return result;
  }

  return record;
}

/**
 * Record debug info for a recognized array type (conversation, tool, homogeneous).
 * Does NOT modify the array itself.
 */
function recordArrayDebugInfo(expDebug, key, arr) {
  if (!expDebug) return;
  if (isConversationLikeArray(arr)) {
    if (expDebug.conversationArrays.length < 5) expDebug.conversationArrays.push(key);
  } else if (isToolDefinitionsArray(arr)) {
    if (expDebug.toolArrays.length < 5) expDebug.toolArrays.push(key);
  } else if (isHomogeneousObjectArray(arr)) {
    if (expDebug.homogeneousArrays.length < 5) expDebug.homogeneousArrays.push(key);
  }
}

/**
 * Recursively walk into a parsed object and expand any nested JSON strings.
 * Handles multi-layer encoded JSON (JSON string containing another JSON string).
 *
 * @param {*} obj - The value to walk (object or array)
 * @param {Object} [expDebug] - Debug accumulator
 * @param {string} [pathPrefix=''] - Dot-notation path for debug tracking
 * @param {number} [depth=0] - Current depth
 * @param {number} [maxDepth] - Max recursion depth
 */
function deepExpandValues(obj, expDebug, pathPrefix, depth, maxDepth) {
  if (depth >= maxDepth) return;
  if (typeof obj !== 'object' || obj === null) return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      const itemPath = `${pathPrefix}.[${i}]`;
      if (typeof item === 'string' && item.length > 0) {
        const c = item.charCodeAt(0);
        if (c === 123 || c === 91) {
          const parsed = tryParseJsonString(item);
          if (parsed !== null) {
            obj[i] = handleParsedValue(parsed, itemPath, expDebug, depth + 1, maxDepth);
          }
        }
      } else if (typeof item === 'object' && item !== null) {
        deepExpandValues(item, expDebug, itemPath, depth + 1, maxDepth);
      }
    }
    return;
  }

  const entries = Object.entries(obj);
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (typeof value === 'string' && value.length > 0) {
      const c = value.charCodeAt(0);
      if (c === 123 || c === 91) {
        const parsed = tryParseJsonString(value);
        if (parsed !== null) {
          obj[key] = handleParsedValue(parsed, fullPath, expDebug, depth + 1, maxDepth);
        }
      }
    } else if (Array.isArray(value) && value.length >= 2) {
      // Record debug info for special arrays within parsed objects, but keep native
      recordArrayDebugInfo(expDebug, fullPath, value);
      deepExpandValues(value, expDebug, fullPath, depth + 1, maxDepth);
    } else if (typeof value === 'object' && value !== null) {
      deepExpandValues(value, expDebug, fullPath, depth + 1, maxDepth);
    }
  }
}

/**
 * Handle a parsed JSON value: record debug info for special arrays, deep-expand nested objects.
 * Always returns the native parsed value (no text conversion).
 */
function handleParsedValue(parsed, path, expDebug, depth, maxDepth) {
  if (Array.isArray(parsed)) {
    recordArrayDebugInfo(expDebug, path, parsed);
    // Keep as array, deep-expand its items
    deepExpandValues(parsed, expDebug, path, depth, maxDepth);
    return parsed;
  }
  // Object — keep as object, deep-expand its values
  deepExpandValues(parsed, expDebug, path, depth, maxDepth);
  return parsed;
}

/**
 * Build a schema snapshot from a record for structure preview.
 * Shows types, item counts, and samples for nested structures.
 *
 * @param {Object} record - Input record
 * @param {number} [depth=0] - Current recursion depth
 * @param {number} [maxDepth=2] - Max recursion depth
 * @returns {Object|null} Schema snapshot tree
 */
export function buildSchemaSnapshot(record, depth = 0, maxDepth = 2) {
  if (!record || typeof record !== 'object' || depth > maxDepth) return null;

  const snapshot = {};
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('_raw_')) continue;
    if (value === null || value === undefined) {
      snapshot[key] = { type: 'null' };
    } else if (Array.isArray(value)) {
      const sample = value[0];
      if (value.length > 0 && Array.isArray(sample)) {
        // Multi-level array: [[{role,...},...], ...]
        if (sample.length > 0 && typeof sample[0] === 'object' && sample[0] !== null && 'role' in sample[0]) {
          snapshot[key] = { type: 'array', itemType: 'multiConversation', length: value.length };
        } else {
          snapshot[key] = { type: 'array', itemType: 'array', length: value.length };
        }
      } else if (value.length > 0 && sample && typeof sample === 'object' && 'role' in sample) {
        snapshot[key] = { type: 'array', itemType: 'conversation', length: value.length };
      } else if (value.length > 0 && typeof sample === 'object') {
        snapshot[key] = { type: 'array', itemType: 'object', length: value.length, sample: buildSchemaSnapshot(sample, depth + 1, maxDepth) };
      } else {
        snapshot[key] = { type: 'array', itemType: typeof (sample ?? ''), length: value.length };
      }
    } else if (typeof value === 'object') {
      snapshot[key] = { type: 'object', children: buildSchemaSnapshot(value, depth + 1, maxDepth) };
    } else if (typeof value === 'string') {
      // Check if it's a JSON string
      const parsed = tryParseJsonString(value);
      if (parsed !== null) {
        snapshot[key] = { type: 'json_string', inner: buildSchemaSnapshot(parsed, depth + 1, maxDepth) };
      } else {
        snapshot[key] = { type: 'string', sample: value.length > 60 ? value.slice(0, 60) + '...' : value };
      }
    } else {
      snapshot[key] = { type: typeof value, sample: value };
    }
  }
  return snapshot;
}
