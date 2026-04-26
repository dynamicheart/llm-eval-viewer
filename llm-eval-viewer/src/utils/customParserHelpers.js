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
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const CONV_ROLE_RE = /^\[(system|user|assistant|human|ai|bot|tool_call:\S*|tool:\S*)\]/i;
const TOOL_DEF_RE = /^\[tool:[^\]]+\]\s*\{/;

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
export function formatConversationArray(arr, maxLen = Infinity) {
  const lines = [];
  for (const item of arr) {
    const role = item.role || '';
    let content;
    if (typeof item.content === 'string') {
      content = item.content;
    } else if (Array.isArray(item.content)) {
      // OpenAI multimodal format: [{type: "text", text: "..."}, {type: "image_url", ...}]
      content = item.content
        .filter(part => part.type === 'text')
        .map(part => part.text || '')
        .join('\n');
    } else {
      content = JSON.stringify(item.content || '');
    }

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
 * Format tool definitions as conversation-like text to reuse the chat preview.
 * Uses [tool:name] prefix with JSON content — ConversationDialog distinguishes
 * tool definitions (JSON content) from tool results (plain text) by content type.
 */
export function formatToolDefinitions(arr) {
  return arr.map(item => {
    const fn = item.function || item;
    const name = fn.name || '?';
    return `[tool:${name}] ${JSON.stringify(item)}`;
  }).join('\n\n');
}

/**
 * Detect if an array contains tool/function definitions (items with `function.name`).
 */
export function isToolDefinitionsArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.every(item =>
    typeof item === 'object' && item !== null &&
    typeof item.function?.name === 'string'
  );
}

/**
 * Try to parse a string as JSON and return the parsed value.
 */
export function tryParseJsonString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < 2) return null;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first !== '{' || last !== '}') && (first !== '[' || last !== ']')) return null;
  if (trimmed.length > 2000000) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse "[role] content" text format into structured message array.
 * Used by extractMessageStats, reconstructDotNotation, and FormatConv plugin.
 */
export function parseTextMessages(text) {
  if (!text || typeof text !== 'string') return null;
  const lines = text.split('\n');
  const messages = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(/^\[(system|user|assistant|human|ai|bot)\]\s*(.*)/i);
    if (match) {
      if (current) messages.push(current);
      current = { role: match[1].toLowerCase(), content: match[2] || '' };
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line;
    }
  }
  if (current) messages.push(current);

  return messages.length > 0 ? messages : null;
}

/**
 * Skipped key prefixes for type detection.
 */
const SKIP_KEY_PREFIXES = ['_raw_', '_reconstructed_', '_decoded_'];
const SKIP_KEYS = new Set(['_rawJsonText']);

function shouldSkipKey(key) {
  return SKIP_KEYS.has(key) || SKIP_KEY_PREFIXES.some(p => key.startsWith(p));
}

/**
 * Scan a nested object's string properties for conversation/tool-definition patterns.
 * Returns { path: string, isToolDef: boolean } or null.
 */
function scanObjectForConversation(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  for (const [subKey, subVal] of Object.entries(obj)) {
    if (typeof subVal === 'string' && subVal.length > 0) {
      const lines = subVal.split('\n');
      if (lines.length >= 2 && lines.some(l => CONV_ROLE_RE.test(l.trim()))) {
        const roleLines = lines.filter(l => CONV_ROLE_RE.test(l.trim()));
        const toolDefLines = roleLines.filter(l => TOOL_DEF_RE.test(l.trim()));
        return { path: subKey, isToolDef: roleLines.length >= 2 && toolDefLines.length === roleLines.length };
      }
    }
  }
  return null;
}

/**
 * Recursive type detection that walks nested JSON structure.
 * Returns both a tree (for hierarchical debug display) and a flat field list
 * (for scoring and UI backward compatibility).
 *
 * @param {Array} rows - sampled rows
 * @param {Object} options
 * @param {Set<string>} options.decodedKeys - top-level keys that were decoded from JSON strings
 * @param {number} [options.maxDepth=3] - max recursion depth into nested objects
 * @returns {{ tree: TreeNode[], flatFields: FieldDescriptor[] }}
 */
export function detectFieldTypesTree(rows, options = {}) {
  const { decodedKeys = new Set(), maxDepth = 3 } = options;
  const sampleSize = Math.min(rows.length, SAMPLE_SIZE_FOR_TYPE);

  // Accumulators keyed by dot-path
  const accumulators = {};

  function ensureAccumulator(path) {
    if (!accumulators[path]) {
      accumulators[path] = {
        typeCounts: {},
        stringValues: new Set(),
        stringLengthSum: 0,
        stringCount: 0,
        emptyCount: 0,
        uniqueValues: new Set(),
        nonEmptyCount: 0,
        isoTimestampVotes: 0,
        nestedConversationPath: null,
        nestedToolDefPath: null,
        conversationVotes: 0,
        toolDefVotes: 0,
      };
    }
    return accumulators[path];
  }

  function countValue(acc, value) {
    if (value === undefined || value === null || value === '') {
      acc.emptyCount++;
      return;
    }

    if (typeof value === 'number') {
      acc.typeCounts.number = (acc.typeCounts.number || 0) + 1;
      acc.nonEmptyCount++;
      if (acc.uniqueValues.size <= ENUM_THRESHOLD) acc.uniqueValues.add(value);
    } else if (typeof value === 'boolean') {
      acc.typeCounts.boolean = (acc.typeCounts.boolean || 0) + 1;
      acc.nonEmptyCount++;
      if (acc.uniqueValues.size <= ENUM_THRESHOLD) acc.uniqueValues.add(value);
    } else if (typeof value === 'string') {
      acc.typeCounts.string = (acc.typeCounts.string || 0) + 1;
      acc.nonEmptyCount++;
      acc.stringValues.add(value);
      if (acc.uniqueValues.size <= ENUM_THRESHOLD) acc.uniqueValues.add(value);
      acc.stringLengthSum += value.length;
      acc.stringCount++;
      if (ISO_TIMESTAMP_RE.test(value)) acc.isoTimestampVotes++;
      const lines = value.split('\n');
      if (lines.length >= 2 && lines.some(l => CONV_ROLE_RE.test(l.trim()))) {
        acc.conversationVotes++;
        const roleLines = lines.filter(l => CONV_ROLE_RE.test(l.trim()));
        const toolDefLines = roleLines.filter(l => TOOL_DEF_RE.test(l.trim()));
        if (roleLines.length >= 2 && toolDefLines.length === roleLines.length) {
          acc.toolDefVotes++;
        }
      }
    } else if (typeof value === 'object') {
      if (Array.isArray(value)) {
        acc.typeCounts.array = (acc.typeCounts.array || 0) + 1;
      } else {
        acc.typeCounts.object = (acc.typeCounts.object || 0) + 1;
        if (!acc.nestedConversationPath) {
          const hit = scanObjectForConversation(value);
          if (hit) {
            if (hit.isToolDef) acc.nestedToolDefPath = hit.path;
            else acc.nestedConversationPath = hit.path;
          }
        }
      }
      acc.nonEmptyCount++;
    }
  }

  function walkValue(value, pathParts, depth, rootKey) {
    const path = pathParts.join('.');
    ensureAccumulator(path);
    countValue(accumulators[path], value);

    // Stop recursing if max depth reached or value is not a plain object
    if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }
    if (depth >= maxDepth) return;

    for (const [childKey, childValue] of Object.entries(value)) {
      walkValue(childValue, [...pathParts, childKey], depth + 1, rootKey);
    }
  }

  // Walk each sampled row
  for (let i = 0; i < sampleSize; i++) {
    const row = rows[i];
    for (const key of Object.keys(row)) {
      if (shouldSkipKey(key)) continue;
      walkValue(row[key], [key], 0, key);
    }
  }

  // Build result from accumulators
  const pathAccs = Object.entries(accumulators);

  // Build flat fields list
  const flatFields = pathAccs.map(([path, acc]) => {
    const lastSegment = path.split('.').pop();
    const dotCount = path.includes('.') ? path.split('.').length - 1 : 0;
    const isExpanded = decodedKeys.has(path.split('.')[0]);
    const result = finalizeType(path, acc, sampleSize);
    return {
      key: path,
      label: lastSegment.replace(/^\[(\d+)\]$/, '[$1]'),
      depth: dotCount,
      detectedType: result.detectedType,
      isExpanded,
      isLongString: result.isLongString,
      emptyRate: result.emptyRate,
      constantRate: result.constantRate,
      uniqueCount: result.uniqueCount,
      avgValueLength: result.avgValueLength,
      isTimestamp: result.isTimestamp,
      conversationPath: result.conversationPath,
    };
  });

  // Build tree structure
  const tree = buildTreeFromFlat(flatFields);

  return { tree, flatFields };
}

/**
 * Finalize type detection for a single accumulator.
 */
function finalizeType(path, acc, sampleSize) {
  let detectedType = 'string';
  let isLongString = false;

  if (acc.stringCount > 0) {
    const avgLen = acc.stringLengthSum / acc.stringCount;
    isLongString = avgLen > PREVIEW_LENGTH_THRESHOLD;
  }

  const total = (acc.typeCounts.number || 0) + (acc.typeCounts.string || 0) +
    (acc.typeCounts.boolean || 0) + (acc.typeCounts.object || 0) + (acc.typeCounts.array || 0);

  if (acc.typeCounts.object === total && total > 0) {
    detectedType = 'nestedObject';
  } else if (acc.typeCounts.array === total && total > 0) {
    detectedType = 'nestedObject';
  } else if (acc.typeCounts.number === total && total > 0) {
    detectedType = 'number';
  } else if (acc.typeCounts.boolean === total && total > 0) {
    detectedType = 'boolean';
  } else if (acc.typeCounts.string > 0) {
    if ((acc.conversationVotes || 0) > sampleSize * 0.3) {
      detectedType = (acc.toolDefVotes || 0) > sampleSize * 0.3 ? 'toolList' : 'conversation';
    } else if (acc.stringValues.size <= ENUM_THRESHOLD && acc.stringValues.size <= sampleSize && !isLongString) {
      detectedType = 'enum';
    } else {
      detectedType = 'string';
    }
  }

  let conversationPath = null;
  if (detectedType === 'nestedObject') {
    if (acc.nestedConversationPath) conversationPath = acc.nestedConversationPath;
    else if (acc.nestedToolDefPath) conversationPath = acc.nestedToolDefPath;
  }

  const emptyRate = sampleSize > 0 ? acc.emptyCount / sampleSize : 0;
  const constantRate = acc.nonEmptyCount > 1 && acc.uniqueValues.size === 1 ? 1.0
    : acc.nonEmptyCount > 1 && acc.uniqueValues.size <= 2 ? 0.5 : 0;

  return {
    detectedType,
    isLongString,
    emptyRate,
    constantRate,
    uniqueCount: acc.uniqueValues.size,
    avgValueLength: acc.stringCount > 0 ? Math.round(acc.stringLengthSum / acc.stringCount) : 0,
    isTimestamp: acc.nonEmptyCount > 0 && (acc.isoTimestampVotes / acc.nonEmptyCount) >= 0.8,
    conversationPath,
  };
}

/**
 * Build a hierarchical tree from flat field descriptors.
 */
function buildTreeFromFlat(flatFields) {
  const rootMap = new Map();

  for (const field of flatFields) {
    const segments = field.key.split('.');
    if (segments.length === 1) {
      if (!rootMap.has(field.key)) {
        rootMap.set(field.key, { ...field, children: field.depth === 0 ? [] : null });
      } else {
        // Update root node with detection data (may have been created as parent placeholder)
        const node = rootMap.get(field.key);
        Object.assign(node, field);
        if (field.depth === 0) node.children = [];
      }
    } else {
      // Navigate/create the tree path
      const rootKey = segments[0];
      if (!rootMap.has(rootKey)) {
        rootMap.set(rootKey, {
          key: rootKey,
          label: rootKey,
          fullPath: rootKey,
          depth: 0,
          detectedType: 'nestedObject',
          emptyRate: 0,
          constantRate: 0,
          uniqueCount: 0,
          avgValueLength: 0,
          isTimestamp: false,
          isExpanded: false,
          conversationPath: null,
          children: [],
        });
      }
      let current = rootMap.get(rootKey);
      // Ensure children array exists
      if (!current.children) current.children = [];

      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        const parentPath = segments.slice(0, i).join('.');
        const childPath = segments.slice(0, i + 1).join('.');
        const isLeaf = i === segments.length - 1;

        let childNode = current.children?.find(c => c.key === seg);
        if (!childNode) {
          childNode = {
            key: seg,
            fullPath: childPath,
            depth: i,
            detectedType: isLeaf ? field.detectedType : 'nestedObject',
            emptyRate: isLeaf ? field.emptyRate : 0,
            constantRate: isLeaf ? field.constantRate : 0,
            uniqueCount: isLeaf ? field.uniqueCount : 0,
            avgValueLength: isLeaf ? field.avgValueLength : 0,
            isTimestamp: isLeaf ? field.isTimestamp : false,
            isExpanded: field.isExpanded,
            conversationPath: isLeaf ? field.conversationPath : null,
            children: isLeaf ? null : [],
          };
          current.children.push(childNode);
        } else if (isLeaf) {
          // Update leaf node with actual detection data
          Object.assign(childNode, {
            detectedType: field.detectedType,
            emptyRate: field.emptyRate,
            constantRate: field.constantRate,
            uniqueCount: field.uniqueCount,
            avgValueLength: field.avgValueLength,
            isTimestamp: field.isTimestamp,
            conversationPath: field.conversationPath,
          });
          childNode.children = null;
        }
        if (childNode.children) current = childNode;
        else break;
      }
    }
  }

  // Convert children arrays to null for leaf nodes
  function cleanChildren(node) {
    if (node.children && node.children.length === 0) node.children = null;
    else if (node.children) node.children.forEach(cleanChildren);
  }
  for (const node of rootMap.values()) cleanChildren(node);

  return Array.from(rootMap.values());
}

/**
 * Detect field types by sampling rows (flat, legacy).
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
      isoTimestampVotes: 0,
      nestedConversationPath: null,
      nestedToolDefPath: null,
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
        if (ISO_TIMESTAMP_RE.test(v)) acc.isoTimestampVotes++;
        // Track per-row conversation / tool-definition votes
        const lines = v.split('\n');
        if (lines.length >= 2 && lines.some(l => CONV_ROLE_RE.test(l.trim()))) {
          acc.conversationVotes = (acc.conversationVotes || 0) + 1;
          // Tool definitions: ALL non-empty role lines are [tool:name] with JSON content
          const roleLines = lines.filter(l => CONV_ROLE_RE.test(l.trim()));
          const toolDefLines = roleLines.filter(l => TOOL_DEF_RE.test(l.trim()));
          if (roleLines.length >= 2 && toolDefLines.length === roleLines.length) {
            acc.toolDefVotes = (acc.toolDefVotes || 0) + 1;
          }
        }
      } else if (typeof v === 'object') {
        // Nested objects from JSON expansion or native arrays
        if (Array.isArray(v)) {
          acc.typeCounts.array = (acc.typeCounts.array || 0) + 1;
        } else {
          acc.typeCounts.object = (acc.typeCounts.object || 0) + 1;
          // Scan nested object for conversation/tool patterns
          if (!acc.nestedConversationPath) {
            const hit = scanObjectForConversation(v);
            if (hit) {
              if (hit.isToolDef) {
                acc.nestedToolDefPath = hit.path;
              } else {
                acc.nestedConversationPath = hit.path;
              }
            }
          }
        }
        acc.nonEmptyCount++;
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

    const total = (acc.typeCounts.number || 0) + (acc.typeCounts.string || 0) + (acc.typeCounts.boolean || 0) + (acc.typeCounts.object || 0) + (acc.typeCounts.array || 0);

    if (acc.typeCounts.object === total && total > 0) {
      detectedType = 'nestedObject';
    } else if (acc.typeCounts.array === total && total > 0) {
      detectedType = 'nestedObject';
    } else if (acc.typeCounts.number === total && total > 0) {
      detectedType = 'number';
    } else if (acc.typeCounts.boolean === total && total > 0) {
      detectedType = 'boolean';
    } else if (acc.typeCounts.string > 0) {
      // Check conversation / toolList pattern first (before enum check)
      if ((acc.conversationVotes || 0) > sampleSize * 0.3) {
        detectedType = (acc.toolDefVotes || 0) > sampleSize * 0.3 ? 'toolList' : 'conversation';
      } else if (acc.stringValues.size <= ENUM_THRESHOLD && acc.stringValues.size <= sampleSize && !isLongString) {
        detectedType = 'enum';
      } else {
        detectedType = 'string';
      }
    }

    // Nested object containing conversation/tool arrays → mark with path
    let conversationPath = null;
    if (detectedType === 'nestedObject') {
      if (acc.nestedConversationPath) {
        conversationPath = acc.nestedConversationPath;
      } else if (acc.nestedToolDefPath) {
        conversationPath = acc.nestedToolDefPath;
      }
    }

    const emptyRate = sampleSize > 0 ? acc.emptyCount / sampleSize : 0;
    // constantRate: how "constant" is this field (1.0 = all non-empty values are identical)
    const constantRate = acc.nonEmptyCount > 1 && acc.uniqueValues.size === 1 ? 1.0
      : acc.nonEmptyCount > 1 && acc.uniqueValues.size <= 2 ? 0.5
      : 0;

    result[key] = {
      detectedType, isLongString, emptyRate, constantRate,
      uniqueCount: acc.uniqueValues.size,
      avgValueLength: acc.stringCount > 0 ? Math.round(acc.stringLengthSum / acc.stringCount) : 0,
      isTimestamp: acc.nonEmptyCount > 0 && (acc.isoTimestampVotes / acc.nonEmptyCount) >= 0.8,
      conversationVotes: acc.conversationVotes || 0,
      toolDefVotes: acc.toolDefVotes || 0,
    };
  }

  return result;
}

// ===== Field Priority Configuration =====
//
// All field priority rules are defined here in one place.
// Patterns are pluggable: import and extend to customize behavior.
//
// Usage:
//   import { HIGH_PRIORITY_PATTERNS, LOW_PRIORITY_PATTERNS } from '@/utils/customParserHelpers';
//   // Add custom patterns:
//   HIGH_PRIORITY_PATTERNS.push(/^my_important_field$/i);
//
// Matching logic:
//   Each pattern is tested against both the full key AND its last dot-segment.
//   E.g. key="RequestData.finish_reason" → also tests "finish_reason".
//
// Expanded field auto-visibility rules:
//   conversation   → always visible
//   enum + HIGH    → visible (good for filtering / distribution charts)
//   number + HIGH  → visible only if non-constant (e.g. tokens vary, temperature=0.7 doesn't)
//   string + HIGH  → NOT auto-visible (user can manually enable)
//   any + not HIGH → NOT auto-visible

/**
 * High-priority field patterns.
 * Fields matching these are shown prominently in the table.
 */
export const HIGH_PRIORITY_PATTERNS = [
  // --- Model ---
  /^model(_name)?$/i,            // Model, model_name (NOT ModelServiceName, ModelUrl)

  // --- Sampling parameters ---
  /^temperature$/i,              // temperature
  /^top_?[pk]$/i,                // top_p, topp, top_k, topk
  /repetition_?penalty$/i,       // repetition_penalty
  /reasoning_?effort$/i,         // reasoning_effort
  // --- Token usage ---
  /token/i,                      // OutputTokens, total_tokens, completion_tokens, prompt_tokens

  // --- Cost ---
  /^cost$/i,                       // Cost (NOT ScheduleCost, PreModelCost, FirstCharCost)

  // --- Latency ---
  /^(latency|duration)/i,        // latency, latency_ms, duration

  // --- Finish / Stop reason ---
  /finish\w*[\s_]*reason$/i,      // finish_reason, FinishedReason, finished reason
  /^stop_?reason$/i,             // StopReason, stop_reason

  // --- Error ---
  /^error[_]?(message|code|msg)?$/i,  // ErrorMessage, error_code, ErrorCode

  // --- Content ---
  /^(answer|reasoning)_?content$/i,    // AnswerContent, ReasoningContent

  // --- Evaluation result (English) ---
  /result/i,                         // result, model_output
  /^model_?output$/i,                 // model_output (evalscope)

  // --- Evaluation result (Chinese) ---
  /结果/i,                           // 标注结果, 评分结果, 推理结果
  /^(回答|答案|模型回答)/i,           // 模型回答, 回答内容
];

/**
 * Low-priority field patterns.
 * Fields matching these are hidden by default (user can manually enable).
 */
export const LOW_PRIORITY_PATTERNS = [
  // --- Infrastructure / observability ---
  /^@/,                            // @timestamp, @host, @offset ...
  /^_raw/,                         // internal expansion artifacts
  /^index$/i,                      // row index
  /^trace/i,                       // trace_id, traceId ...
  /^span/i,                        // span_id, spanId ...
  /^service$/i,                    // service
  /^func$/i,                       // func
  /_addr$/i,                       // local_addr, remote_addr ...
  /url$/i,                         // ModelUrl, RequestUrl ...
  /header$/i,                      // RequestHeader, ResponseHeader ...
  /^strategy/i,                    // StrategyType ...

  // --- Timestamps / duration ---
  /^(request|schedule)(start|end)?time$/i,  // RequestStartTime, ScheduleEndTime, RequestTime
  /^firsttokentime$/i,                      // FirstTokenTime (timestamp, not TTFT)
  /用时$/,                                  // 评测用时
  /时间$/,                                  // 更新时间, 创建时间

  // --- Identifiers ---
  /_?id$/i,                        // request_id, 样本ID, TraceId, query_id
  /^(样本|任务)\s*ID$/i,           // 样本ID, 任务 ID

  // --- Serial numbers ---
  /序号$/,                          // Prompt序列号

  // --- Evaluation metadata (Chinese) ---
  /^(评测|标注|评审|打分)(人|员|者)?$/i,  // 评测人, 标注员, 评审者
  /状态$/,                          // 样本状态, 审核状态
  /^(一|二|三|四|五)级?分类/,        // 一级分类, 二级分类, 三级分类
  /^是否/,                          // 是否overlap, 是否正确
];

/**
 * Scoring algorithm step descriptors for debug visualization.
 * Display convention: positive = bonus (green), negative = penalty (red).
 * Higher score = higher priority (same convention internally and externally).
 */
export const SCORING_STEPS = [
  {
    step: 1,
    nameKey: 'scoringStepConversationName',
    condition: 'detectedType === "conversation" || detectedType === "toolList"',
    delta: '+100',
  },
  {
    step: 2,
    nameKey: 'scoringStepPatternName',
    condition: 'HIGH: +50/+40 | LOW: -40 | depth(>3 dots): -20',
    delta: 'variable',
  },
  {
    step: 3,
    nameKey: 'scoringStepEmptyName',
    condition: 'emptyRate >= 0.95 → -80 | emptyRate >= 0.80 → -20',
    delta: '-80 / -20',
  },
  {
    step: 4,
    nameKey: 'scoringStepConstantName',
    condition: 'constantRate >= 1.0 (all identical)',
    delta: '-55',
  },
  {
    step: 5,
    nameKey: 'scoringStepUniqueName',
    condition: 'uniqueCount > 5 → +5 | uniqueCount 2-5 → +2',
    delta: '+5 / +2',
  },
  {
    step: 6,
    nameKey: 'scoringStepContentName',
    condition: 'avgValueLength > 50 → +5 | avgValueLength > 10 → +2',
    delta: '+5 / +2',
  },
  {
    step: 7,
    nameKey: 'scoringStepTypeName',
    condition: 'enum: +3 | number: +1 | boolean: -3 | string: 0',
    delta: '+3 ~ -3',
  },
];

// ===== Stats Smart Selection =====
//
// Patterns for auto-selecting fields in distribution (pie) and histogram charts.
// Ordered by priority: P1 = most important, picked first (up to max per category).
// Each entry: { re: RegExp, reason: string }.
// The `reason` key is stored in statsConfig.selectionReasons for smart tag display.

/**
 * Distribution (pie chart) smart selection patterns.
 * Matches against enum fields. Max 2 selected.
 */
export const DISTRIBUTION_SELECT_PATTERNS = [
  { re: /finish\w*[\s_]*reason/i,  reason: 'stopReason' },   // P1: finish_reason, FinishedReason
  { re: /^stop_?reason/i,          reason: 'stopReason' },   // P1: stop_reason (alternative)
  { re: /^model(_name)?$/i,       reason: 'model' },        // P2: Model, model_name
  { re: /^error[_]?code$/i,       reason: 'errorCode' },    // P3: ErrorCode, error_code
  { re: /result|结果/i,           reason: 'result' },       // P4: 标注结果, result
];

/**
 * Histogram (bar chart) smart selection patterns.
 * Matches against numeric fields. Max 2 selected.
 */
export const HISTOGRAM_SELECT_PATTERNS = [
  { re: /input.?token|prompt.?token/i, reason: 'tokenUsage' },  // P1: input/prompt tokens
  { re: /output.?token|completion.?token/i, reason: 'tokenUsage' }, // P2: output/completion tokens
  { re: /^(latency|duration)/i,  reason: 'latency' },  // P3: latency, duration
  { re: /total.?token/i,         reason: 'tokenUsage' }, // P4: total tokens
  { re: /^cost$/i,               reason: 'cost' },       // P5: cost
];

function matchesPatterns(patterns, key, lastSegment) {
  return patterns.some(p => p.test(key) || p.test(lastSegment));
}

/**
 * Find which specific patterns match a key, keyed by regex source.
 * Returns an array of matched regex source strings.
 */
function findMatchingPatternSources(patterns, key, lastSegment) {
  const matched = [];
  for (const p of patterns) {
    if (p.test(key) || p.test(lastSegment)) {
      matched.push(p.source);
    }
  }
  return matched;
}

/**
 * Sort and assign visibility to detected fields.
 * Uses pattern-based priority rules instead of hardcoded field name lists.
 *
 * Priority scoring (higher = higher priority):
 *   +100  conversation / toolList type
 *    +50  matches HIGH_PRIORITY_PATTERNS (original field)
 *    +40  matches HIGH_PRIORITY_PATTERNS (expanded field)
 *      0  default
 *    -20  deeply nested (>3 dot segments)
 *    -20  emptyRate >= 0.80 (additive)
 *    -40  matches LOW_PRIORITY_PATTERNS
 *    -55  constantRate >= 1.0 (additive)
 *    -80  emptyRate >= 0.95 (additive, overrides most bonuses)
 *
 * After visibility assignment, each field gets a `visibilityReason` string.
 *
 * @param {Array} fields - field descriptors with { key, detectedType, isExpanded, emptyRate }
 * @param {number} maxVisible - max visible fields
 * @returns {{ fields: Array, debugMeta: Array }} the same array (mutated) and per-field scoring debug info
 */
export function assignFieldVisibility(fields, maxVisible = 10) {
  // Memoize fieldPriority per-field to avoid redundant regex tests
  // (sort calls it ~2*N*logN times, visibility/annotation/debug add ~3N more).
  const _scoreCache = new Map();
  function fieldPriority(field) {
    const cached = _scoreCache.get(field.key);
    if (cached) return cached;
    const result = _computeFieldPriority(field);
    _scoreCache.set(field.key, result);
    return result;
  }

  function _computeFieldPriority(field) {
    const key = field.key;
    const lastSegment = key.split('.').pop();
    const breakdown = {
      patternCategory: 'none',   // 'high' | 'low' | 'depth' | 'conversation' | 'none'
      patternPenalty: 0,
      emptyPenalty: 0,
      constantPenalty: 0,
      uniqueBonus: 0,       // positive = more unique values
      contentBonus: 0,      // positive = longer content
      typeBonus: 0,         // type-based weight
    };

    if (field.detectedType === 'conversation' || field.detectedType === 'toolList') {
      breakdown.patternCategory = 'conversation';
      return { score: 100, breakdown };
    }

    let priority = 0;

    // Pattern-based category
    const isHigh = matchesPatterns(HIGH_PRIORITY_PATTERNS, key, lastSegment);
    const isLow = matchesPatterns(LOW_PRIORITY_PATTERNS, key, lastSegment);

    if (isHigh) {
      // Timestamp fields (80%+ values match ISO format) → low priority
      if (field.isTimestamp) {
        priority = -40;
        breakdown.patternCategory = 'low';
      } else {
        priority = field.isExpanded ? 40 : 50;
        breakdown.patternCategory = 'high';
      }
    } else if (isLow || field.isTimestamp) {
      priority = -40;
      breakdown.patternCategory = 'low';
    } else if ((field.depth ?? (key.includes('.') ? key.split('.').length - 1 : 0)) >= 3) {
      priority = -20;
      breakdown.patternCategory = 'depth';
    }
    breakdown.patternPenalty = priority;

    // Empty-rate additive penalty
    // Nearly-all-empty fields should be hidden regardless of pattern priority
    const emptyRate = field.emptyRate || 0;
    if (emptyRate >= 0.95) { priority -= 80; breakdown.emptyPenalty = 80; }
    else if (emptyRate >= 0.80) { priority -= 20; breakdown.emptyPenalty = 20; }

    // Constant-value additive penalty (all rows have same value = low information)
    // Strong enough to hide even high-priority constant fields (score +50 - 55 = -5)
    const constantRate = field.constantRate || 0;
    if (constantRate >= 1.0) { priority -= 55; breakdown.constantPenalty = 55; }

    // Unique count bonus: more unique values = more informative
    const uniqueCount = field.uniqueCount || 0;
    if (uniqueCount > 1 && uniqueCount <= 5) {
      priority += 2;
      breakdown.uniqueBonus = 2;
    } else if (uniqueCount > 5) {
      priority += 5;
      breakdown.uniqueBonus = 5;
    }

    // Content length bonus: longer average values = more informative content
    const avgLen = field.avgValueLength || 0;
    if (avgLen > 50) {
      priority += 5;
      breakdown.contentBonus = 5;
    } else if (avgLen > 10) {
      priority += 2;
      breakdown.contentBonus = 2;
    }

    // Type weight: enum > number > string > boolean
    const type = field.detectedType;
    if (type === 'enum') {
      priority += 3;
      breakdown.typeBonus = 3;
    } else if (type === 'number') {
      priority += 1;
      breakdown.typeBonus = 1;
    } else if (type === 'boolean') {
      priority -= 3;
      breakdown.typeBonus = -3;
    }

    return { score: priority, breakdown };
  }

  fields.sort((a, b) => {
    const pa = fieldPriority(a).score;
    const pb = fieldPriority(b).score;
    if (pa !== pb) return pb - pa;
    if (a.isExpanded !== b.isExpanded) return a.isExpanded ? 1 : -1;
    return 0;
  });

  let visibleCount = 0;
  const visibleKeysLower = new Map(); // lowercased lastSegment -> field.key (for duplicateOf tracking)

  for (const field of fields) {
    // Skip only fully-managed plugin fields:
    // - reconstructed_root: plugin already set visible = true
    // - reconstructed (array leaves): absorbed into parent, not meaningful
    // All other plugin fields (reconstructed_sub, decoded, etc.) go through scoring
    if (field.isPluginField && (field.visibilityReason === 'reconstructed_root' || field.visibilityReason === 'reconstructed')) {
      continue;
    }

    if (field.isExpanded) {
      const priority = fieldPriority(field).score;
      const lastSegment = field.key.split('.').pop().toLowerCase();
      const duplicateOf = visibleKeysLower.get(lastSegment);
      const isDuplicate = !!duplicateOf;
      field._isDuplicate = isDuplicate;
      field._duplicateOf = duplicateOf;
      // Conversation always visible.
      // High-priority enum expanded fields visible (for filtering/distribution).
      // High-priority number expanded fields visible only if non-constant (e.g. tokens vary, temperature doesn't).
      const isHighEnum = priority > 0 && field.detectedType === 'enum';
      const isHighNumber = priority > 0 && field.detectedType === 'number' && (field.constantRate || 0) < 1.0;
      const hasNestedConv = !!field.conversationPath;
      field.visible = !isDuplicate && (field.detectedType === 'conversation' || field.detectedType === 'toolList' || hasNestedConv || isHighEnum || isHighNumber);
      field.searchable = field.detectedType === 'enum' || field.detectedType === 'string';
      field.filterable = field.detectedType === 'enum';
      field.previewable = field.detectedType === 'conversation' || field.detectedType === 'toolList' || hasNestedConv;
      field.sortable = field.detectedType === 'number';
      if (field.visible) {
        visibleKeysLower.set(lastSegment, field.key);
        visibleCount++;
      }
    } else {
      const lastSegment = field.key.split('.').pop().toLowerCase();
      const duplicateOf = visibleKeysLower.get(lastSegment);
      const isDuplicate = !!duplicateOf;
      const priority = fieldPriority(field).score;
      field._isDuplicate = isDuplicate;
      field._duplicateOf = duplicateOf;
      field.visible = !isDuplicate && (field.conversationPath || priority > -30) && visibleCount < maxVisible;
      field.searchable = false;
      field.filterable = field.detectedType === 'enum';
      field.previewable = !!field.isLongString || !!field.conversationPath;
      field.sortable = true;
      if (field.visible) {
        visibleKeysLower.set(lastSegment, field.key);
        visibleCount++;
      }
    }
  }

  // Annotate visibility reasons
  for (const field of fields) {
    // Skip only fully-managed plugin fields (same logic as visibility loop above)
    if (field.isPluginField && (field.visibilityReason === 'reconstructed_root' || field.visibilityReason === 'reconstructed')) {
      continue;
    }

    if (field.visible) {
      if (field.detectedType === 'conversation') {
        field.visibilityReason = 'conversation';
      } else if (field.detectedType === 'toolList') {
        field.visibilityReason = 'toolList';
      } else if (field.conversationPath) {
        field.visibilityReason = 'conversation';
      } else if (fieldPriority(field).score > 0) {
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
      } else if ((field.constantRate || 0) >= 1.0 && fieldPriority(field).score <= -30) {
        field.visibilityReason = 'constant';
      } else if (fieldPriority(field).score <= -30) {
        field.visibilityReason = 'lowPriority';
      } else {
        field.visibilityReason = 'maxVisible';
      }
    }
    delete field._isDuplicate;
    delete field._duplicateOf;
  }

  const debugMeta = fields
    .filter(field => field.visibilityReason !== 'reconstructed')
    .map(field => {
    const { score, breakdown } = fieldPriority(field);
    return {
      key: field.key,
      score,
      patternCategory: breakdown.patternCategory,
      patternPenalty: breakdown.patternPenalty,
      emptyPenalty: breakdown.emptyPenalty,
      constantPenalty: breakdown.constantPenalty,
      uniqueBonus: breakdown.uniqueBonus,
      contentBonus: breakdown.contentBonus,
      typeBonus: breakdown.typeBonus,
      visible: field.visible,
      visibilityReason: field.visibilityReason,
      detectedType: field.detectedType,
      emptyRate: field.emptyRate || 0,
      constantRate: field.constantRate || 0,
      uniqueCount: field.uniqueCount || 0,
      avgValueLength: field.avgValueLength || 0,
      duplicateOf: field._duplicateOf || null,
    };
  });

  // Count per-pattern match frequency across all fields
  const patternMatchCounts = {};
  for (const field of fields) {
    const lastSegment = field.key.split('.').pop();
    for (const src of findMatchingPatternSources(HIGH_PRIORITY_PATTERNS, field.key, lastSegment)) {
      patternMatchCounts[src] = (patternMatchCounts[src] || 0) + 1;
    }
    for (const src of findMatchingPatternSources(LOW_PRIORITY_PATTERNS, field.key, lastSegment)) {
      patternMatchCounts[src] = (patternMatchCounts[src] || 0) + 1;
    }
  }

  return { fields, debugMeta, patternMatchCounts };
}
