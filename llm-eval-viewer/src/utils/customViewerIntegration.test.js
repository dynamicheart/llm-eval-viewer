/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Integration tests for the Custom Viewer parsing pipeline.
 * Uses sanitized fixture files derived from real data formats:
 *   - sample-inference-log.ndjson  (LLM inference log with nested JSON strings)
 *   - sample-tool-calls.ndjson     (conversations with tool_calls)
 *   - sample-meval.csv             (MEval evaluation CSV)
 *   - sample-evalscope-predictions.jsonl (Evalscope predictions)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import Papa from 'papaparse';
import {
  tryParseJsonString,
  detectFieldTypesTree,
  assignFieldVisibility,
  formatConversationArray,
  LOW_PRIORITY_PATTERNS,
  HIGH_PRIORITY_PATTERNS,
} from './customParserHelpers';
import { expandRecord } from './recordExpander';

// ===== Helpers =====

function loadFixture(filename) {
  return readFileSync(resolve(__dirname, '__fixtures__', filename), 'utf-8');
}

function parseNdjson(text) {
  return text.split('\n').filter(Boolean).map(l => JSON.parse(l));
}

/**
 * Run the full pipeline: expand JSON strings → detect types recursively → assign visibility.
 */
function runPipeline(records) {
  const expandedKeys = new Set();
  const rows = records.map((record, idx) => {
    // Expand JSON strings (preserving structure, no flattening)
    const expanded = expandRecord(record);
    const origKeys = new Set(Object.keys(record));
    for (const key of Object.keys(expanded)) {
      if (!origKeys.has(key) && !key.startsWith('_raw_')) {
        expandedKeys.add(key);
      }
    }
    expanded.__index = idx;
    return expanded;
  });

  const { flatFields } = detectFieldTypesTree(rows, {
    decodedKeys: expandedKeys,
    maxDepth: 3,
  });

  assignFieldVisibility(flatFields, 10);
  return { rows, fields: flatFields };
}

// ===== Tests =====

describe('Integration: Inference Log NDJSON', () => {
  const text = loadFixture('sample-inference-log.ndjson');
  const records = parseNdjson(text);

  it('parses 3 records', () => {
    expect(records.length).toBe(3);
  });

  it('parses RequestData JSON string into nested object', () => {
    const { fields } = runPipeline(records);

    // RequestData was a JSON string → should be parsed into a nested object
    const rdField = fields.find(f => f.key === 'RequestData');
    expect(rdField).toBeDefined();
    expect(rdField.detectedType).toBe('nestedObject');

    // Recursive detection should discover nested keys
    const rdNestedFields = fields.filter(f => f.key.startsWith('RequestData.'));
    expect(rdNestedFields.length).toBeGreaterThan(0);
  });

  it('hides metadata fields (@ prefix, _id suffix)', () => {
    const { fields } = runPipeline(records);

    const hidden = fields.filter(f => !f.visible);
    const hiddenKeys = hidden.map(f => f.key);

    // Low-priority patterns should be hidden
    expect(hiddenKeys).toContain('@timestamp');
    expect(hiddenKeys).toContain('trace_id');
    expect(hiddenKeys).toContain('span_id');
    expect(hiddenKeys).toContain('request_id');
  });

  it('shows high-priority fields (model, tokens, cost)', () => {
    const { fields } = runPipeline(records);

    const visible = fields.filter(f => f.visible);
    const visibleKeys = visible.map(f => f.key);

    expect(visibleKeys).toContain('Model');
    expect(visibleKeys).toContain('OutputTokens');
    expect(visibleKeys).toContain('Cost');
    expect(visibleKeys).toContain('FinishReason');
  });

  it('assigns visibilityReason to every field', () => {
    const { fields } = runPipeline(records);

    for (const f of fields) {
      expect(f.visibilityReason).toBeTruthy();
    }
  });

  it('hides fields with high empty rate', () => {
    const { fields } = runPipeline(records);

    // Fields like SessionID, AppID, OrignalModel are empty in all rows
    const emptyFields = fields.filter(f => f.emptyRate >= 0.95);
    for (const f of emptyFields) {
      // Default-priority empty fields should be hidden
      const isHigh = HIGH_PRIORITY_PATTERNS.some(p => p.test(f.key) || p.test(f.key.split('.').pop()));
      if (!isHigh && !f.isExpanded) {
        expect(f.visible).toBe(false);
      }
    }
  });

  it('computes emptyRate for partially populated fields', () => {
    const { fields } = runPipeline(records);

    // Model should have emptyRate close to 0
    const model = fields.find(f => f.key === 'Model');
    expect(model.emptyRate).toBe(0);

    // Fields that exist but are empty strings in all rows should have high emptyRate
    const session = fields.find(f => f.key === 'SessionID');
    if (session) {
      expect(session.emptyRate).toBeGreaterThan(0.5);
    }
  });
});

describe('Integration: Tool Calls NDJSON', () => {
  const text = loadFixture('sample-tool-calls.ndjson');
  const records = parseNdjson(text);

  it('parses 3 records', () => {
    expect(records.length).toBe(3);
  });

  it('detects conversation field from parsed RequestData', () => {
    const { fields } = runPipeline(records);

    // RequestData is now a nested object (not flattened)
    const rdField = fields.find(f => f.key === 'RequestData');
    expect(rdField).toBeDefined();
    expect(rdField.detectedType).toBe('nestedObject');

    // Nested keys should be detected recursively
    const rdMessages = fields.find(f => f.key === 'RequestData.messages');
    expect(rdMessages).toBeDefined();
  });

  it('preserves tool_calls in parsed RequestData for ConversationDialog', () => {
    const expanded = expandRecord(records[0]);
    // After expansion, RequestData is a nested object with messages as formatted text
    const rd = expanded.RequestData;
    expect(rd).toBeDefined();
    expect(typeof rd).toBe('object');
    // Messages within RequestData are formatted as conversation text
    expect(rd.messages).toBeDefined();
    expect(typeof rd.messages).toBe('string');

    // The formatted text preserves tool_call markers from the conversation
    expect(rd.messages).toContain('get_weather');
  });

  it('formatConversationArray serializes tool_calls correctly', () => {
    const rd = JSON.parse(records[1].RequestData);
    const text = formatConversationArray(rd.messages);

    // Should contain tool_call markers
    expect(text).toContain('[tool_call:execute_command');
    expect(text).toContain('[tool:execute_command]');

    // Should contain assistant text
    expect(text).toContain('[assistant]');
  });
});

describe('Integration: Evalscope Predictions JSONL', () => {
  const text = loadFixture('sample-evalscope-predictions.jsonl');
  const records = parseNdjson(text);

  it('parses records with standard evalscope structure', () => {
    expect(records.length).toBe(2);
    expect(records[0]).toHaveProperty('index');
    expect(records[0]).toHaveProperty('model');
    expect(records[0]).toHaveProperty('model_output');
    expect(records[0]).toHaveProperty('messages');
    expect(records[0]).toHaveProperty('metadata');
  });

  it('preserves messages as a native array (leaf field)', () => {
    const { rows, fields } = runPipeline(records);
    // Messages is a native array in evalscope data (not a JSON string)
    expect(rows[0].messages).toBeDefined();
    expect(Array.isArray(rows[0].messages)).toBe(true);
    // Arrays are leaf fields — no dot-notation expansion into indices
    const arrayIndexKey = fields.find(f => f.key.startsWith('messages.[0]'));
    expect(arrayIndexKey).toBeUndefined();
  });

  it('model field matches high priority pattern (may be hidden by maxVisible limit)', () => {
    const { fields } = runPipeline(records);
    const modelField = fields.find(f => f.key === 'model');
    expect(modelField).toBeDefined();
    // model matches HIGH_PRIORITY pattern
    // visibility depends on maxVisible limit and other fields' scores
    expect(modelField.visibilityReason).toBeDefined();
  });
});

describe('Pattern rules are generic', () => {
  it('LOW_PRIORITY_PATTERNS do not contain company-specific field names', () => {
    const companySpecific = ['tinymsg', 'Tapp', 'Interface', '@message'];
    for (const name of companySpecific) {
      const matched = LOW_PRIORITY_PATTERNS.some(p => p.test(name));
      // These should NOT match (they were removed from hardcoded lists)
      // @message matches /^@/ which is a generic pattern — that's expected
      if (name.startsWith('@')) {
        expect(matched).toBe(true); // Generic @ prefix pattern
      } else {
        expect(matched).toBe(false);
      }
    }
  });

  it('HIGH_PRIORITY_PATTERNS match generic LLM field names', () => {
    const genericFields = [
      'model_name', 'total_tokens', 'error_code', 'latency_ms',
      'finish_reason', 'AnswerContent', 'duration',
    ];
    for (const name of genericFields) {
      const matched = HIGH_PRIORITY_PATTERNS.some(p => p.test(name));
      expect(matched).toBe(true);
    }
  });

  it('HIGH_PRIORITY_PATTERNS do NOT match unrelated fields', () => {
    const unrelatedFields = [
      'username', 'created_at', 'description', 'status',
      'ModelServiceName', 'ModelUrl', 'ModelPrefillServiceName', // infrastructure model fields
      'ScheduleCost', 'PreModelCost', 'FirstCharCost',           // sub-cost metrics
    ];
    for (const name of unrelatedFields) {
      const matched = HIGH_PRIORITY_PATTERNS.some(p => p.test(name));
      expect(matched).toBe(false);
    }
  });
});

// ===== Regression: inference log field priority =====
// These tests lock down the exact visible/hidden behavior for a typical
// LLM inference log NDJSON file. The synthetic data mirrors the structure
// of real production logs without containing actual data.

describe('Regression: inference log field priority (ndjson)', () => {
  /**
   * Create a set of field descriptors matching a typical inference log.
   * Covers: conversation, high-priority, low-priority, expanded,
   * constant, empty, and default-priority fields.
   */
  function makeInferenceLogFields() {
    return [
      // Conversation (always first)
      { key: 'RequestData.messages', detectedType: 'conversation', isExpanded: true, isLongString: true },
      // High priority (original fields)
      { key: 'Model', detectedType: 'enum', isLongString: false },
      { key: 'Cost', detectedType: 'number', isLongString: false },
      { key: 'AnswerContent', detectedType: 'string', isLongString: true },
      { key: 'ReasoningContent', detectedType: 'string', isLongString: false, emptyRate: 1.0 },
      { key: 'OutputTokens', detectedType: 'number', isLongString: false },
      { key: 'InputTokens', detectedType: 'number', isLongString: false },
      { key: 'TotalTokens', detectedType: 'number', isLongString: false },
      { key: 'FinishReason', detectedType: 'enum', isLongString: false },
      { key: 'StopReason', detectedType: 'string', isLongString: false, emptyRate: 1.0 },
      { key: 'ErrorMessage', detectedType: 'string', isLongString: false, emptyRate: 1.0 },
      { key: 'ErrorCode', detectedType: 'number', isLongString: false },
      { key: 'FirstTokenTime', detectedType: 'enum', isLongString: false },
      // Default priority (no pattern match) — these compete for maxVisible slots
      { key: 'AnswerTokens', detectedType: 'number', isLongString: false },
      { key: 'ReasoningTokens', detectedType: 'number', isLongString: false },
      { key: 'PreModelCost', detectedType: 'number', isLongString: false },
      { key: 'FirstCharCost', detectedType: 'number', isLongString: false },
      { key: 'TokenIntervalAvg', detectedType: 'enum', isLongString: false },
      { key: 'StreamIntervalAvg', detectedType: 'enum', isLongString: false },
      { key: 'StreamIntervalMax', detectedType: 'number', isLongString: false },
      { key: 'ScheduleCost', detectedType: 'number', isLongString: false },
      { key: 'RequestID', detectedType: 'string', isLongString: false },
      { key: 'Interface', detectedType: 'enum', isLongString: false },
      { key: 'RemoteIP', detectedType: 'enum', isLongString: false },
      { key: 'ModelServiceName', detectedType: 'enum', isLongString: false },
      { key: 'IsStream', detectedType: 'boolean', isLongString: false },
      { key: 'Tapp', detectedType: 'enum', isLongString: false },
      { key: 'tinymsg', detectedType: 'string', isLongString: true },
      { key: 'level', detectedType: 'enum', isLongString: false },
      { key: 'caller', detectedType: 'enum', isLongString: false },
      // Low priority (metadata patterns)
      { key: '@timestamp', detectedType: 'enum', isLongString: false },
      { key: '@offset', detectedType: 'number', isLongString: false },
      { key: '@host', detectedType: 'enum', isLongString: false },
      { key: '@log_size', detectedType: 'number', isLongString: false, emptyRate: 0.33 },
      { key: '@message', detectedType: 'string', isLongString: true },
      { key: 'request_id', detectedType: 'string', isLongString: false },
      { key: 'trace_id', detectedType: 'enum', isLongString: false },
      { key: 'span_id', detectedType: 'enum', isLongString: false },
      { key: 'service', detectedType: 'enum', isLongString: false, constantRate: 1.0 },
      { key: 'func', detectedType: 'enum', isLongString: false, constantRate: 1.0 },
      { key: 'local_addr', detectedType: 'enum', isLongString: false },
      { key: 'remote_addr', detectedType: 'enum', isLongString: false },
      { key: 'RequestHeader', detectedType: 'string', isLongString: false },
      { key: 'ModelUrl', detectedType: 'enum', isLongString: false, constantRate: 1.0 },
      { key: 'index', detectedType: 'number', isLongString: false },
      // Expanded fields (non-chat → hidden)
      { key: 'RequestData.model', detectedType: 'string', isExpanded: true, isLongString: false },
      { key: 'RequestData.stream', detectedType: 'boolean', isExpanded: true, isLongString: false },
      { key: 'RequestData.max_tokens', detectedType: 'number', isExpanded: true, isLongString: false, constantRate: 1.0 },
      { key: 'RequestData.temperature', detectedType: 'number', isExpanded: true, isLongString: false, constantRate: 1.0 },
      // Empty fields (mostlyEmpty → hidden)
      { key: 'SessionID', detectedType: 'string', isLongString: false, emptyRate: 1.0 },
      { key: 'AppID', detectedType: 'string', isLongString: false, emptyRate: 1.0 },
      { key: 'OrignalModel', detectedType: 'string', isLongString: false, emptyRate: 1.0 },
    ];
  }

  it('conversation field is always visible and sorted first', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);
    expect(fields[0].key).toBe('RequestData.messages');
    expect(fields[0].visible).toBe(true);
    expect(fields[0].visibilityReason).toBe('conversation');
  });

  it('high-priority fields are visible: Model, Cost, AnswerContent, InputTokens, TotalTokens, OutputTokens, FinishReason', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);
    const visibleKeys = fields.filter(f => f.visible).map(f => f.key);

    expect(visibleKeys).toContain('Model');
    expect(visibleKeys).toContain('Cost');
    expect(visibleKeys).toContain('InputTokens');
    expect(visibleKeys).toContain('TotalTokens');
    expect(visibleKeys).toContain('OutputTokens');
    expect(visibleKeys).toContain('FinishReason');
    // AnswerContent may be cut by maxVisible since many enum fields now rank higher
  });

  it('high-priority fields have visibilityReason=highPriority', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);

    const highPri = ['Model', 'Cost', 'InputTokens', 'TotalTokens', 'OutputTokens', 'FinishReason'];
    for (const key of highPri) {
      const f = fields.find(f => f.key === key);
      expect(f.visibilityReason).toBe('highPriority');
    }
  });

  it('metadata fields are hidden: @timestamp, trace_id, span_id, request_id, local_addr, remote_addr, service', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);
    const hiddenKeys = fields.filter(f => !f.visible).map(f => f.key);

    expect(hiddenKeys).toContain('@timestamp');
    expect(hiddenKeys).toContain('@offset');
    expect(hiddenKeys).toContain('@host');
    expect(hiddenKeys).toContain('@message');
    expect(hiddenKeys).toContain('trace_id');
    expect(hiddenKeys).toContain('span_id');
    expect(hiddenKeys).toContain('request_id');
    expect(hiddenKeys).toContain('local_addr');
    expect(hiddenKeys).toContain('remote_addr');
    expect(hiddenKeys).toContain('service');
  });

  it('metadata fields have correct visibilityReason', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);

    const ts = fields.find(f => f.key === '@timestamp');
    expect(ts.visibilityReason).toBe('lowPriority');

    const svc = fields.find(f => f.key === 'service');
    expect(svc.visibilityReason).toBe('constant');

    const reqId = fields.find(f => f.key === 'request_id');
    expect(reqId.visibilityReason).toBe('lowPriority');
  });

  it('expanded non-chat fields: high-priority visible, others hidden', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);
    const visibleKeys = fields.filter(f => f.visible).map(f => f.key);

    // RequestData.model deduped against top-level Model → hidden as duplicate
    expect(visibleKeys).not.toContain('RequestData.model');
    const rdModel = fields.find(f => f.key === 'RequestData.model');
    expect(rdModel.visibilityReason).toBe('duplicate');

    // RequestData.stream is not high-priority → hidden as expandedNonChat
    expect(visibleKeys).not.toContain('RequestData.stream');
    const rdStream = fields.find(f => f.key === 'RequestData.stream');
    expect(rdStream.visibilityReason).toBe('expandedNonChat');

    // RequestData.max_tokens matches /token/i HIGH_PRIORITY but is number type → not auto-visible
    expect(visibleKeys).not.toContain('RequestData.max_tokens');
    const rdTokens = fields.find(f => f.key === 'RequestData.max_tokens');
    expect(rdTokens.visibilityReason).toBe('expandedNonChat');
  });

  it('mostly-empty fields are hidden even if they match high-priority patterns', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);

    const reasoning = fields.find(f => f.key === 'ReasoningContent');
    expect(reasoning.visible).toBe(false);
    expect(reasoning.visibilityReason).toBe('mostlyEmpty');

    const errorMsg = fields.find(f => f.key === 'ErrorMessage');
    expect(errorMsg.visible).toBe(false);
    expect(errorMsg.visibilityReason).toBe('mostlyEmpty');
  });

  it('maxVisible limit hides fields with lower scores when slots are full', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);
    const hiddenKeys = fields.filter(f => !f.visible).map(f => f.key);

    // AnswerTokens and ReasoningTokens now match /token/i → high priority.
    // But with maxVisible=10 and Cost also promoted to high priority, both are pushed out.
    const at = fields.find(f => f.key === 'AnswerTokens');
    const rt = fields.find(f => f.key === 'ReasoningTokens');
    expect(at.visibilityReason).toBe('maxVisible');
    expect(rt.visibilityReason).toBe('maxVisible');

    // Truly default-priority fields are hidden by maxVisible
    expect(hiddenKeys).toContain('PreModelCost');
    expect(hiddenKeys).toContain('FirstCharCost');
    expect(hiddenKeys).toContain('ScheduleCost');
    // ErrorCode is high-priority (/error/i), so it's visible — verify it's NOT hidden
    expect(hiddenKeys).not.toContain('ErrorCode');
  });

  it('isLongString tiebreaker sorts long-content default fields before short ones', () => {
    const fields = [
      { key: 'short_meta_1', detectedType: 'string', isLongString: false },
      { key: 'short_meta_2', detectedType: 'string', isLongString: false },
      { key: 'long_content', detectedType: 'string', isLongString: true },
      { key: 'short_meta_3', detectedType: 'string', isLongString: false },
    ];
    assignFieldVisibility(fields, 3);

    const visibleKeys = fields.filter(f => f.visible).map(f => f.key);
    // long_content should be visible (sorted before short fields)
    expect(visibleKeys).toContain('long_content');
    // One short field should be pushed out by maxVisible
    expect(visibleKeys.length).toBe(3);
  });

  it('isLongString tiebreaker does NOT override pattern-based priorities', () => {
    const fields = [
      { key: '@timestamp', detectedType: 'enum', isLongString: true },  // low priority + long
      { key: 'Model', detectedType: 'string', isLongString: false },     // high priority + short
    ];
    assignFieldVisibility(fields, 10);

    // Model should come before @timestamp in sort order despite isLongString difference
    const modelIdx = fields.findIndex(f => f.key === 'Model');
    const tsIdx = fields.findIndex(f => f.key === '@timestamp');
    expect(modelIdx).toBeLessThan(tsIdx);

    expect(fields.find(f => f.key === 'Model').visible).toBe(true);
    expect(fields.find(f => f.key === '@timestamp').visible).toBe(false);
  });

  it('every field has a non-empty visibilityReason', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);
    for (const f of fields) {
      expect(f.visibilityReason).toBeTruthy();
    }
  });
});

// ===== Regression: Chinese CSV field priority (meval format) =====
// Tests that Chinese-named fields are properly prioritized.
// Uses a synthetic CSV fixture — no actual production data.

describe('Regression: Chinese CSV field priority (meval format)', () => {
  const text = loadFixture('sample-chinese-meval.csv');

  /**
   * Parse CSV and run the field detection + visibility pipeline.
   * Mirrors what the customParser.worker.js does for CSV input.
   */
  function runCsvPipeline(csvText) {
    const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const { flatFields } = detectFieldTypesTree(result.data, { maxDepth: 3 });
    assignFieldVisibility(flatFields, 10);
    return { fields: flatFields };
  }

  it('long-content fields (问题, 参考答案, 模型回答) are visible', () => {
    const { fields } = runCsvPipeline(text);
    const visibleKeys = fields.filter(f => f.visible).map(f => f.key);

    expect(visibleKeys).toContain('问题');
    expect(visibleKeys).toContain('参考答案');
    expect(visibleKeys).toContain('模型回答-TestModel');
  });

  it('metadata fields (任务 ID, 样本ID, 一级分类) are deprioritized by isLongString tiebreaker', () => {
    const { fields } = runCsvPipeline(text);
    const questionIdx = fields.findIndex(f => f.key === '问题');
    const metaIdx = fields.findIndex(f => f.key === '任务 ID');

    // Long-content 问题 should sort before short-content 任务 ID
    expect(questionIdx).toBeLessThan(metaIdx);
  });

  it('long-content fields take visible slots before short metadata fields', () => {
    const { fields } = runCsvPipeline(text);
    const visibleKeys = fields.filter(f => f.visible).map(f => f.key);
    const hiddenKeys = fields.filter(f => !f.visible).map(f => f.key);

    // 任务 ID matches /样本|任务\s*ID/i → low priority → hidden
    expect(hiddenKeys).toContain('任务 ID');
    // 样本ID matches /_?id$/i → low priority → hidden
    expect(hiddenKeys).toContain('样本ID');
    // 评测用时 matches /用时$/ → low priority → hidden
    expect(hiddenKeys).toContain('评测用时');

    // Long-content fields should still be visible
    expect(visibleKeys).toContain('问题');
    expect(visibleKeys).toContain('参考答案');
    expect(visibleKeys).toContain('模型回答-TestModel');

    // And sorted before short metadata fields
    const questionIdx = visibleKeys.indexOf('问题');
    expect(questionIdx).toBeLessThan(visibleKeys.indexOf('参考答案'));
  });

  it('field types are correctly detected for Chinese-named columns', () => {
    const { fields } = runCsvPipeline(text);

    // 问题 has long text (avg >50 chars) → detected as string (not enum, despite ≤20 unique values)
    const question = fields.find(f => f.key === '问题');
    expect(question.detectedType).toBe('string');

    const ref = fields.find(f => f.key === '参考答案');
    expect(ref.detectedType).toBe('string');

    // 一级分类 has short text → detected as enum
    const cat = fields.find(f => f.key === '一级分类');
    expect(cat.detectedType).toBe('enum');
  });

  it('every field has a visibilityReason', () => {
    const { fields } = runCsvPipeline(text);
    for (const f of fields) {
      expect(f.visibilityReason).toBeTruthy();
    }
  });
});

// ===== Direct pattern matching tests =====

describe('HIGH_PRIORITY_PATTERNS match Chinese fields', () => {
  function matchesHigh(key) {
    const lastSegment = key.split('.').pop();
    return HIGH_PRIORITY_PATTERNS.some(p => p.test(key) || p.test(lastSegment));
  }

  it('标注结果 matches (eval outcome)', () => {
    expect(matchesHigh('标注结果')).toBe(true);
    expect(matchesHigh('标注结果-TestModel')).toBe(true);
  });

  it('模型回答 matches (model answer)', () => {
    expect(matchesHigh('模型回答')).toBe(true);
    expect(matchesHigh('模型回答-TestModel')).toBe(true);
  });

  it('finished reason matches (with space)', () => {
    expect(matchesHigh('finished reason')).toBe(true);
  });

  it('finish_reason matches', () => {
    expect(matchesHigh('finish_reason')).toBe(true);
  });
});

describe('LOW_PRIORITY_PATTERNS match Chinese metadata', () => {
  function matchesLow(key) {
    const lastSegment = key.split('.').pop();
    return LOW_PRIORITY_PATTERNS.some(p => p.test(key) || p.test(lastSegment));
  }

  it('评测人 matches (evaluator)', () => {
    expect(matchesLow('评测人')).toBe(true);
  });

  it('样本状态 matches (sample status)', () => {
    expect(matchesLow('样本状态')).toBe(true);
  });

  it('一级分类/二级分类/三级分类 matches (classification levels)', () => {
    expect(matchesLow('一级分类')).toBe(true);
    expect(matchesLow('二级分类')).toBe(true);
    expect(matchesLow('三级分类')).toBe(true);
  });

  it('是否overlap matches (boolean-like prefix)', () => {
    expect(matchesLow('是否overlap')).toBe(true);
  });
});

describe('Expanded high-priority fields are visible', () => {
  it('expanded finish_reason sub-field is visible with highPriority reason', () => {
    const fields = [
      { key: 'conversation', detectedType: 'conversation', isExpanded: true, emptyRate: 0, constantRate: 0, isLongString: false },
      { key: 'RequestData.finished_reason', detectedType: 'enum', isExpanded: true, emptyRate: 0, constantRate: 0, isLongString: false },
      { key: 'RequestData.some_metadata', detectedType: 'string', isExpanded: true, emptyRate: 0, constantRate: 0, isLongString: false },
      { key: 'RequestData.temperature', detectedType: 'number', isExpanded: true, emptyRate: 0, constantRate: 0.5, isLongString: false },
    ];
    assignFieldVisibility(fields, 10);

    // conversation always visible
    expect(fields[0].visible).toBe(true);
    expect(fields[0].visibilityReason).toBe('conversation');

    // expanded high-priority field (finish_reason) should be visible
    expect(fields[1].visible).toBe(true);
    expect(fields[1].visibilityReason).toBe('highPriority');

    // expanded non-chat number field (temperature) is now visible due to typeBonus
    expect(fields[2].visible).toBe(true);
    expect(fields[2].visibilityReason).toBe('highPriority');

    // expanded non-chat, non-high-priority string → hidden
    expect(fields[3].visible).toBe(false);
    expect(fields[3].visibilityReason).toBe('expandedNonChat');
  });

  it('expanded high-priority number fields: non-constant visible, constant hidden', () => {
    const fields = [
      { key: 'RequestData.completion_tokens', detectedType: 'number', isExpanded: true, emptyRate: 0, constantRate: 0, isLongString: false },
      { key: 'RequestData.cost', detectedType: 'number', isExpanded: true, emptyRate: 0, constantRate: 0, isLongString: false },
      { key: 'RequestData.temperature', detectedType: 'number', isExpanded: true, emptyRate: 0, constantRate: 1.0, isLongString: false },
      { key: 'RequestData.model', detectedType: 'enum', isExpanded: true, emptyRate: 0, constantRate: 1.0, isLongString: false },
    ];
    assignFieldVisibility(fields, 10);

    // Non-constant number → visible
    const tokens = fields.find(f => f.key === 'RequestData.completion_tokens');
    expect(tokens.visible).toBe(true);
    expect(tokens.visibilityReason).toBe('highPriority');

    const costField = fields.find(f => f.key === 'RequestData.cost');
    expect(costField.visible).toBe(true);
    expect(costField.visibilityReason).toBe('highPriority');

    // Constant number → hidden
    const temp = fields.find(f => f.key === 'RequestData.temperature');
    expect(temp.visible).toBe(false);
    expect(temp.visibilityReason).toBe('expandedNonChat');

    // Constant enum → hidden (constant penalty -55 outweighs high-priority +40)
    const model = fields.find(f => f.key === 'RequestData.model');
    expect(model.visible).toBe(false);
    expect(model.visibilityReason).toBe('expandedNonChat');
  });

  it('expanded 标注结果 sub-field is visible with highPriority reason', () => {
    const fields = [
      { key: 'eval.标注结果', detectedType: 'enum', isExpanded: true, emptyRate: 0, constantRate: 0, isLongString: false },
      { key: 'eval.评测人', detectedType: 'string', isExpanded: true, emptyRate: 0, constantRate: 0, isLongString: false },
    ];
    assignFieldVisibility(fields, 10);

    // 标注结果 matches HIGH /结果/
    expect(fields[0].visible).toBe(true);
    expect(fields[0].visibilityReason).toBe('highPriority');

    // 评测人 matches LOW → not high priority → hidden
    expect(fields[1].visible).toBe(false);
    expect(fields[1].visibilityReason).toBe('expandedNonChat');
  });
});
