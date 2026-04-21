/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Generic parser worker for the Custom Viewer.
 * Core logic lives in @/utils/customParserHelpers.js for testability.
 */

import Papa from 'papaparse';
import {
  isConversationLikeArray,
  isHomogeneousObjectArray,
  isToolDefinitionsArray,
  formatConversationArray,
  formatToolDefinitions,
  flattenValue,
  tryParseJsonString,
  detectFieldTypes,
  assignFieldVisibility,
} from '@/utils/customParserHelpers';

const PROGRESS_INTERVAL = 500;
const MAX_EXPAND_DEPTH = 5;
const DEFAULT_VISIBLE_FIELDS = 10;
const PHASE1_WEIGHT = 0.5; // Step 1 (parsing) occupies 0-50%, Step 2 (expanding) occupies 50-100%

// ===== Message handler =====

self.onmessage = (e) => {
  const { text, expandNestedJsonStrings = true } = e.data;
  const t0 = performance.now();
  const timings = {};

  // 1. Parse input format
  let records;
  let isCsv = false;
  let phase1Done = false; // whether Step 1 needed per-line parsing

  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    const firstLine = trimmed.split('\n')[0];
    if (firstLine && (firstLine.includes(',') || firstLine.includes('\t'))) {
      const delimiter = firstLine.includes('\t') ? '\t' : ',';
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter,
      });
      if (result.data && result.data.length > 0 && result.meta.fields.length > 0) {
        records = result.data;
        isCsv = true;
      }
    }
  }

  if (!isCsv) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        records = parsed;
      } else {
        records = [parsed];
      }
    } catch {
      // JSONL: parse line by line with progress reporting
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
        if (i % PROGRESS_INTERVAL === 0) {
          const phase1Percent = Math.round((i / lineTotal) * 100 * PHASE1_WEIGHT);
          self.postMessage({ type: 'progress', percent: phase1Percent });
        }
      }
      records.length = recordIdx;
      self.postMessage({ type: 'progress', percent: Math.round(100 * PHASE1_WEIGHT) });
      phase1Done = true;
    }
  }

  timings.formatDetect = performance.now() - t0;

  if (records.length === 0) {
    self.postMessage({
      type: 'done',
      rows: [],
      fieldMeta: { detectedFields: [], expandCandidates: [] },
    });
    return;
  }

  const total = records.length;

  // 2. Build flat rows with recursive JSON string expansion
  const allExpandedKeys = new Set();
  const rows = new Array(total);
  const tExpand = performance.now();

  // Pre-compute shared topKeys from first record (CSV/JSON rows share columns)
  const sharedTopKeys = expandNestedJsonStrings && total > 0
    ? new Set(Object.keys(records[0]).map(k => k.toLowerCase()))
    : null;

  for (let idx = 0; idx < total; idx++) {
    let record = records[idx];

    if (expandNestedJsonStrings) {
      record = expandRecord(record, 0, sharedTopKeys);

      const origKeys = new Set(Object.keys(records[idx]));
      for (const key of Object.keys(record)) {
        if (!origKeys.has(key) && !key.startsWith('_raw_') && !key.startsWith('[')) {
          allExpandedKeys.add(key);
        }
      }
    }

    record.index = idx + 1;

    rows[idx] = record;

    if (idx % PROGRESS_INTERVAL === 0) {
      const rawPercent = Math.round((idx / total) * 100);
      const percent = phase1Done
        ? Math.round(PHASE1_WEIGHT * 100 + rawPercent * (1 - PHASE1_WEIGHT))
        : rawPercent;
      self.postMessage({ type: 'progress', percent });
    }
  }

  self.postMessage({ type: 'progress', percent: 100 });

  timings.expand = performance.now() - tExpand;

  // 3. Collect all keys and detect types
  const tCollectKeys = performance.now();
  const allKeysSet = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key.startsWith('_raw_') || key === '_rawJsonText') continue;
      allKeysSet.add(key);
    }
  }
  const allKeys = Array.from(allKeysSet);

  const tDetectTypes = performance.now();
  timings.collectKeys = tDetectTypes - tCollectKeys;

  const typeInfo = detectFieldTypes(rows, allKeys);

  // 4. Build field descriptors with smart priority sorting
  const tBuildFields = performance.now();
  timings.detectTypes = tBuildFields - tDetectTypes;
  const detectedFields = allKeys.map((key) => {
    const info = typeInfo[key] || { detectedType: 'string', isLongString: false };
    const isExpanded = allExpandedKeys.has(key);

    return {
      key,
      label: key.split('.').pop().replace(/^\[(\d+)\]$/, '[$1]'),
      detectedType: info.detectedType,
      isExpanded,
      isLongString: info.isLongString || false,
      emptyRate: info.emptyRate || 0,
      constantRate: info.constantRate || 0,
    };
  });

  assignFieldVisibility(detectedFields, DEFAULT_VISIBLE_FIELDS);

  timings.buildFields = performance.now() - tBuildFields;

  // 5. Build schema snapshot from first record for structure preview
  const schemaSnapshot = buildSchemaSnapshot(records[0]);

  timings.total = performance.now() - t0;

  self.postMessage({
    type: 'done',
    rows,
    timings,
    fieldMeta: {
      detectedFields,
      expandCandidates: Array.from(allExpandedKeys).filter(k => !k.includes('.')),
      schemaSnapshot,
    },
  });
};

// ===== Schema snapshot builder =====

function buildSchemaSnapshot(record, depth = 0, maxDepth = 2) {
  if (!record || typeof record !== 'object' || depth > maxDepth) return null;

  const snapshot = {};
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('_raw_')) continue;
    if (value === null || value === undefined) {
      snapshot[key] = { type: 'null' };
    } else if (Array.isArray(value)) {
      const sample = value[0];
      if (value.length > 0 && sample && typeof sample === 'object' && 'role' in sample) {
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

// ===== Local helpers (not exported) =====

function expandRecord(record, depth = 0, topKeys = null) {
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
    } else if (Array.isArray(value) && value.length >= 2) {
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

    // Handle already-array values (e.g., messages/tools in a single JSON object)
    if (Array.isArray(value) && value.length >= 2 && depth === 0) {
      if (isConversationLikeArray(value)) {
        result[key] = formatConversationArray(value);
        expanded = true;
        continue;
      }
      if (isToolDefinitionsArray(value)) {
        result[key] = formatToolDefinitions(value);
        expanded = true;
        continue;
      }
      if (isHomogeneousObjectArray(value)) {
        const flat = flattenValue(value, key);
        const flatKeys = Object.keys(flat);
        for (let j = 0; j < flatKeys.length; j++) {
          result[flatKeys[j]] = flat[flatKeys[j]];
        }
        delete result[key];
        expanded = true;
        continue;
      }
    }

    if (typeof value !== 'string') continue;
    if (value.length > 0) {
      const c = value.charCodeAt(0);
      if (c !== 123 && c !== 91) continue;
    }
    const parsed = tryParseJsonString(value);
    if (parsed !== null) {
      const flat = flattenValue(parsed, key);

      const flatKeys = Object.keys(flat);
      for (let j = 0; j < flatKeys.length; j++) {
        const fk = flatKeys[j];
        const lastSegment = fk.includes('.') ? fk.split('.').slice(-1)[0] : fk;
        if (topKeys.has(lastSegment.toLowerCase())) delete flat[fk];
      }

      if (Object.keys(flat).length > 0) {
        const remaining = Object.keys(flat);
        for (let j = 0; j < remaining.length; j++) {
          result[remaining[j]] = flat[remaining[j]];
        }
        delete result[key];
        expanded = true;
      }
    }
  }

  if (expanded) {
    const resultKeys = Object.keys(result);
    for (let i = 0; i < resultKeys.length; i++) {
      topKeys.add(resultKeys[i].toLowerCase());
    }
    return expandRecord(result, depth + 1, topKeys);
  }

  return result;
}
