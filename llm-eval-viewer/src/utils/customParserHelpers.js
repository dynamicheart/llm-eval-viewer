/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Shared parser utilities for the Custom Viewer.
 * Used by customParser.worker.js and unit tests.
 */

export const MAX_ARRAY_EXPAND = 10;
export const ENUM_THRESHOLD = 20;
export const SAMPLE_SIZE_FOR_TYPE = 50;
export const PREVIEW_LENGTH_THRESHOLD = 50;

/**
 * Detect if an array looks like a conversation (chat messages) — all items are
 * plain objects with a "role" key. No size limit, unlike isHomogeneousObjectArray.
 */
export function isConversationLikeArray(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return false;
  // Check first few items as a fast heuristic
  const sampleLimit = Math.min(arr.length, 5);
  for (let i = 0; i < sampleLimit; i++) {
    const item = arr[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
    if (!('role' in item)) return false;
  }
  return true;
}

/**
 * Detect if an array is a "homogeneous object array" — all items are plain objects
 * with similar keys. Typical for conversation/message arrays.
 */
export function isHomogeneousObjectArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  if (arr.length === 1) return false;
  if (arr.length > MAX_ARRAY_EXPAND) return false;

  const firstItem = arr[0];
  if (typeof firstItem !== 'object' || firstItem === null || Array.isArray(firstItem)) return false;

  const keys = Object.keys(firstItem).sort();
  if (keys.length === 0) return false;

  for (let i = 1; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
    const itemKeys = Object.keys(item).sort();
    if (Math.abs(itemKeys.length - keys.length) > 1) return false;
  }

  return true;
}

/**
 * Format a homogeneous object array into a readable conversation string.
 * Supports tool_calls on assistant messages and tool-role messages.
 */
export function formatConversationArray(arr, maxLen = 2000) {
  const lines = [];
  for (const item of arr) {
    const role = item.role || '';
    const content = typeof item.content === 'string' ? item.content : JSON.stringify(item.content || '');

    // Assistant message with tool_calls
    if (role === 'assistant' && Array.isArray(item.tool_calls) && item.tool_calls.length > 0) {
      if (content && content !== '""') {
        lines.push(`[assistant] ${content}`);
      }
      for (const tc of item.tool_calls) {
        const fn = tc.function || tc;
        const name = fn.name || 'unknown';
        const args = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || {});
        const id = tc.id || '';
        lines.push(`[tool_call:${name}${id ? ':' + id : ''}] ${args}`);
      }
      continue;
    }

    // Tool result message
    if (role === 'tool') {
      const name = item.name || item.tool_call_id || '';
      lines.push(`[tool:${name}] ${content}`);
      continue;
    }

    lines.push(`[${role}] ${content}`);
  }
  const text = lines.join('\n\n');
  return text.length > maxLen ? text.slice(0, maxLen) + '\n...' : text;
}

/**
 * Deep flatten an object/array into dot-notation keys.
 * Homogeneous object arrays are kept as single formatted fields.
 */
export function flattenValue(value, parentKey = '', depth = 0, maxDepth = 3) {
  const result = {};

  if (value === null || value === undefined) {
    result[parentKey] = '';
    return result;
  }

  if (Array.isArray(value)) {
    if (parentKey === '') {
      result[''] = JSON.stringify(value);
      return result;
    }
    // Conversation arrays (items have "role" key) are kept as single fields,
    // regardless of array size.
    if (isConversationLikeArray(value)) {
      result[parentKey] = formatConversationArray(value, 100000);
      return result;
    }
    if (isHomogeneousObjectArray(value)) {
      result[parentKey] = formatConversationArray(value, 100000);
      return result;
    }
    const limit = Math.min(value.length, MAX_ARRAY_EXPAND);
    for (let i = 0; i < limit; i++) {
      const itemKey = `${parentKey}.[${i}]`;
      const item = value[i];
      if (item !== null && typeof item === 'object' && depth < maxDepth) {
        Object.assign(result, flattenValue(item, itemKey, depth + 1, maxDepth));
      } else {
        result[itemKey] = item === null || item === undefined ? '' : typeof item === 'object' ? JSON.stringify(item) : item;
      }
    }
    return result;
  }

  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const fullKey = parentKey ? `${parentKey}.${k}` : k;
      if (v === null || v === undefined) {
        result[fullKey] = '';
      } else if (Array.isArray(v) || typeof v === 'object') {
        if (depth < maxDepth) {
          Object.assign(result, flattenValue(v, fullKey, depth + 1, maxDepth));
        } else {
          result[fullKey] = JSON.stringify(v);
        }
      } else {
        result[fullKey] = v;
      }
    }
    return result;
  }

  result[parentKey] = value;
  return result;
}

/**
 * Try to parse a string as JSON and return the parsed value.
 */
export function tryParseJsonString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < 2) return null;
  if ((trimmed[0] !== '{' && trimmed[0] !== '[') || trimmed.length > 2000000) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect field types by sampling rows.
 * Returns { [key]: { detectedType: string, isLongString: boolean, emptyRate: number } }
 */
export function detectFieldTypes(rows, allKeys) {
  const sampleSize = Math.min(rows.length, SAMPLE_SIZE_FOR_TYPE);
  const accumulators = {};

  for (const key of allKeys) {
    accumulators[key] = {
      typeCounts: {},
      stringValues: new Set(),
      stringLengthSum: 0,
      stringCount: 0,
      emptyCount: 0,
      uniqueValues: new Set(),
      nonEmptyCount: 0,
    };
  }

  for (let i = 0; i < sampleSize; i++) {
    const row = rows[i];
    for (const key of allKeys) {
      const v = row[key];
      const acc = accumulators[key];

      // Treat undefined, null, and empty string as "empty"
      if (v === undefined || v === null || v === '') {
        acc.emptyCount++;
        continue;
      }

      if (typeof v === 'number') {
        acc.typeCounts.number = (acc.typeCounts.number || 0) + 1;
        acc.nonEmptyCount++;
        if (acc.uniqueValues.size <= ENUM_THRESHOLD) acc.uniqueValues.add(v);
      } else if (typeof v === 'boolean') {
        acc.typeCounts.boolean = (acc.typeCounts.boolean || 0) + 1;
        acc.nonEmptyCount++;
        if (acc.uniqueValues.size <= ENUM_THRESHOLD) acc.uniqueValues.add(v);
      } else if (typeof v === 'string') {
        acc.typeCounts.string = (acc.typeCounts.string || 0) + 1;
        acc.nonEmptyCount++;
        acc.stringValues.add(v);
        if (acc.uniqueValues.size <= ENUM_THRESHOLD) acc.uniqueValues.add(v);
        acc.stringLengthSum += v.length;
        acc.stringCount++;
        // Track per-row conversation votes
        const lines = v.split('\n');
        if (lines.length >= 2 && lines.some(l => /^\[(system|user|assistant|human|ai|bot|tool_call:\S*|tool:\S*)\]/i.test(l.trim()))) {
          acc.conversationVotes = (acc.conversationVotes || 0) + 1;
        }
      }
    }
  }

  const result = {};
  for (const key of allKeys) {
    const acc = accumulators[key];
    let detectedType = 'string';
    let isLongString = false;

    // Compute average string length first — needed for enum exclusion
    if (acc.stringCount > 0) {
      const avgLen = acc.stringLengthSum / acc.stringCount;
      isLongString = avgLen > PREVIEW_LENGTH_THRESHOLD;
    }

    const total = (acc.typeCounts.number || 0) + (acc.typeCounts.string || 0) + (acc.typeCounts.boolean || 0);

    if (acc.typeCounts.number === total && total > 0) {
      detectedType = 'number';
    } else if (acc.typeCounts.boolean === total && total > 0) {
      detectedType = 'boolean';
    } else if (acc.typeCounts.string > 0) {
      // Check conversation pattern first (before enum check)
      if ((acc.conversationVotes || 0) > sampleSize * 0.3) {
        detectedType = 'conversation';
      } else if (acc.stringValues.size <= ENUM_THRESHOLD && acc.stringValues.size <= sampleSize && !isLongString) {
        detectedType = 'enum';
      } else {
        detectedType = 'string';
      }
    }

    const emptyRate = sampleSize > 0 ? acc.emptyCount / sampleSize : 0;
    // constantRate: how "constant" is this field (1.0 = all non-empty values are identical)
    const constantRate = acc.nonEmptyCount > 1 && acc.uniqueValues.size === 1 ? 1.0
      : acc.nonEmptyCount > 1 && acc.uniqueValues.size <= 2 ? 0.5
      : 0;

    result[key] = { detectedType, isLongString, emptyRate, constantRate };
  }

  return result;
}

/**
 * Pattern-based low-priority field rules.
 * Match infrastructure/metadata fields common across log formats.
 */
export const LOW_PRIORITY_PATTERNS = [
  /^@/,              // @timestamp, @host, @offset ...
  /^_raw/,           // internal expansion artifacts
  /^index$/i,        // row index
  /_id$/i,           // request_id, trace_id, span_id ...
  /_addr$/i,         // local_addr, remote_addr ...
  /^trace/i,         // trace* series
  /^span/i,          // span* series
  /^service$/i,
  /^func$/i,
  /url$/i,           // ModelUrl, ModelPrefillUrl, ...
  /header$/i,        // RequestHeader, ResponseHeader ...
  /^strategy/i,      // StrategyType, ...
  /^(request|schedule)(start|end)time$/i,  // timestamp details
];

/**
 * Pattern-based high-priority field rules.
 * Match fields commonly important in LLM evaluation/inference logs.
 */
export const HIGH_PRIORITY_PATTERNS = [
  /^model(_name)?$/i,            // Model, model_name (NOT ModelServiceName, ModelUrl)
  /token/i,                      // OutputTokens, total_tokens, ...
  /^cost$/i,                     // Cost (NOT ScheduleCost, PreModelCost)
  /^finish_?reason$/i,           // FinishReason, finish_reason
  /^stop_?reason$/i,             // StopReason, stop_reason
  /^error[_]?(message|code|msg)?$/i,  // ErrorMessage, error_code, ErrorCode (NOT generic_error_rate)
  /^(answer|reasoning)_?content$/i,      // AnswerContent, ReasoningContent
  /^(latency|duration)/i,      // latency, latency_ms, duration (NOT sub-metrics like StreamIntervalAvg)
  /^model_?output$/i,           // model_output (evalscope)
];

function matchesPatterns(patterns, key, lastSegment) {
  return patterns.some(p => p.test(key) || p.test(lastSegment));
}

/**
 * Sort and assign visibility to detected fields.
 * Uses pattern-based priority rules instead of hardcoded field name lists.
 *
 * Priority scoring (lower = higher priority):
 *   -100  conversation type
 *   -50   matches HIGH_PRIORITY_PATTERNS (original field)
 *   -40   matches HIGH_PRIORITY_PATTERNS (expanded field)
 *     0   default
 *   +15   constantRate == 1.0 (all values identical, additive)
 *   +20   deeply nested (>3 dot segments)
 *   +20   emptyRate >= 0.80 (additive)
 *   +80   emptyRate >= 0.95 (additive, replaces +20; overrides high-priority)
 *   +40   matches LOW_PRIORITY_PATTERNS
 *
 * After visibility assignment, each field gets a `visibilityReason` string.
 *
 * @param {Array} fields - field descriptors with { key, detectedType, isExpanded, emptyRate }
 * @param {number} maxVisible - max visible fields
 * @returns {Array} the same array, mutated with .visible, .searchable, .visibilityReason, etc.
 */
export function assignFieldVisibility(fields, maxVisible = 10) {
  function fieldPriority(field) {
    const key = field.key;
    const lastSegment = key.split('.').pop();

    if (field.detectedType === 'conversation') return -100;

    let priority = 0;

    // Pattern-based category
    const isHigh = matchesPatterns(HIGH_PRIORITY_PATTERNS, key, lastSegment);
    const isLow = matchesPatterns(LOW_PRIORITY_PATTERNS, key, lastSegment);

    if (isHigh) {
      priority = field.isExpanded ? -40 : -50;
    } else if (isLow) {
      priority = 40;
    } else if (key.includes('.') && key.split('.').length > 3) {
      priority = 20;
    }

    // Empty-rate additive penalty
    // Nearly-all-empty fields should be hidden regardless of pattern priority
    const emptyRate = field.emptyRate || 0;
    if (emptyRate >= 0.95) priority += 80;
    else if (emptyRate >= 0.80) priority += 20;

    // Constant-value additive penalty (all rows have same value = low information)
    const constantRate = field.constantRate || 0;
    if (constantRate >= 1.0) priority += 15;

    return priority;
  }

  fields.sort((a, b) => {
    const pa = fieldPriority(a);
    const pb = fieldPriority(b);
    if (pa !== pb) return pa - pb;
    if (a.isExpanded !== b.isExpanded) return a.isExpanded ? 1 : -1;
    return 0;
  });

  let visibleCount = 0;
  const visibleKeysLower = new Set();

  for (const field of fields) {
    if (field.isExpanded) {
      field.visible = field.detectedType === 'conversation';
      field.searchable = field.detectedType === 'enum' || field.detectedType === 'string';
      field.filterable = field.detectedType === 'enum';
      field.previewable = field.detectedType === 'conversation';
      field.sortable = field.detectedType === 'number';
      field._isDuplicate = false;
      if (field.visible) {
        visibleKeysLower.add(field.key.toLowerCase());
        visibleCount++;
      }
    } else {
      const lastSegment = field.key.split('.').pop().toLowerCase();
      const isDuplicate = visibleKeysLower.has(lastSegment);
      const priority = fieldPriority(field);
      field._isDuplicate = isDuplicate;
      field.visible = !isDuplicate && priority < 30 && visibleCount < maxVisible;
      field.searchable = false;
      field.filterable = field.detectedType === 'enum';
      field.previewable = !!field.isLongString;
      field.sortable = true;
      if (field.visible) {
        visibleKeysLower.add(lastSegment);
        visibleCount++;
      }
    }
  }

  // Annotate visibility reasons
  for (const field of fields) {
    if (field.visible) {
      if (field.detectedType === 'conversation') {
        field.visibilityReason = 'conversation';
      } else if (fieldPriority(field) < 0) {
        field.visibilityReason = 'highPriority';
      } else {
        field.visibilityReason = 'default';
      }
    } else {
      if (field._isDuplicate) {
        field.visibilityReason = 'duplicate';
      } else if (field.isExpanded && field.detectedType !== 'conversation') {
        field.visibilityReason = 'expandedNonChat';
      } else if ((field.emptyRate || 0) >= 0.80) {
        field.visibilityReason = 'mostlyEmpty';
      } else if ((field.constantRate || 0) >= 1.0 && fieldPriority(field) >= 30) {
        field.visibilityReason = 'constant';
      } else if (fieldPriority(field) >= 30) {
        field.visibilityReason = 'lowPriority';
      } else {
        field.visibilityReason = 'maxVisible';
      }
    }
    delete field._isDuplicate;
  }

  return fields;
}
