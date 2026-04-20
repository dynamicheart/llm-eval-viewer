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
  flattenValue,
  tryParseJsonString,
  detectFieldTypes,
  assignFieldVisibility,
  formatConversationArray,
  LOW_PRIORITY_PATTERNS,
  HIGH_PRIORITY_PATTERNS,
} from './customParserHelpers';

// ===== Helpers =====

function loadFixture(filename) {
  return readFileSync(resolve(__dirname, '__fixtures__', filename), 'utf-8');
}

function parseNdjson(text) {
  return text.split('\n').filter(Boolean).map(l => JSON.parse(l));
}

/**
 * Simulate the worker's expandRecord logic (simplified for tests).
 */
function expandRecord(record) {
  const topKeys = new Set(Object.keys(record).map(k => k.toLowerCase()));
  const result = { ...record };

  for (const [key, value] of Object.entries(result)) {
    if (key.startsWith('_raw_')) continue;
    if (typeof value !== 'string') continue;
    const parsed = tryParseJsonString(value);
    if (parsed !== null) {
      const flat = flattenValue(parsed, key);
      const deduped = {};
      for (const [fk, fv] of Object.entries(flat)) {
        const lastSegment = fk.includes('.') ? fk.split('.').slice(-1)[0] : fk;
        if (!topKeys.has(lastSegment.toLowerCase())) {
          deduped[fk] = fv;
        }
      }
      if (Object.keys(deduped).length > 0) {
        result[`_raw_${key}`] = value;
        Object.assign(result, deduped);
        delete result[key];
      }
    }
  }
  return result;
}

/**
 * Run the full pipeline: parse → flatten → expand → detect types → assign visibility.
 */
function runPipeline(records) {
  const expandedKeys = new Set();
  const rows = records.map((record, idx) => {
    // First flatten the record (like the worker does)
    const flat = flattenValue(record);
    // Then expand JSON strings in the flattened result
    const expanded = expandRecord(flat);
    const origKeys = new Set(Object.keys(flat));
    for (const key of Object.keys(expanded)) {
      if (!origKeys.has(key) && !key.startsWith('_raw_')) {
        expandedKeys.add(key);
      }
    }
    expanded.index = idx + 1;
    return expanded;
  });

  const allKeys = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!key.startsWith('_raw_') && key !== '_rawJsonText') allKeys.add(key);
    }
  }

  const typeInfo = detectFieldTypes(rows, Array.from(allKeys));
  const fields = Array.from(allKeys).map(key => ({
    key,
    label: key.split('.').pop(),
    detectedType: (typeInfo[key] || {}).detectedType || 'string',
    isExpanded: expandedKeys.has(key),
    emptyRate: (typeInfo[key] || {}).emptyRate || 0,
  }));

  assignFieldVisibility(fields, 10);
  return { rows, fields, typeInfo };
}

// ===== Tests =====

describe('Integration: Inference Log NDJSON', () => {
  const text = loadFixture('sample-inference-log.ndjson');
  const records = parseNdjson(text);

  it('parses 3 records', () => {
    expect(records.length).toBe(3);
  });

  it('expands RequestData JSON string into dot-notation fields', () => {
    const { fields } = runPipeline(records);

    // RequestData was a JSON string → should be expanded
    const rdFields = fields.filter(f => f.key.startsWith('RequestData.'));
    expect(rdFields.length).toBeGreaterThan(0);

    // RequestData.messages should be detected as conversation
    const messagesField = fields.find(f => f.key === 'RequestData.messages');
    expect(messagesField).toBeDefined();
    expect(messagesField.detectedType).toBe('conversation');
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
    const { typeInfo } = runPipeline(records);

    // Model should have emptyRate close to 0
    expect(typeInfo['Model'].emptyRate).toBe(0);

    // Fields that exist but are empty strings in all rows should have high emptyRate
    if (typeInfo['SessionID']) {
      expect(typeInfo['SessionID'].emptyRate).toBeGreaterThan(0.5);
    }
  });
});

describe('Integration: Tool Calls NDJSON', () => {
  const text = loadFixture('sample-tool-calls.ndjson');
  const records = parseNdjson(text);

  it('parses 3 records', () => {
    expect(records.length).toBe(3);
  });

  it('detects conversation field from expanded RequestData.messages', () => {
    const { fields } = runPipeline(records);

    const messagesField = fields.find(f => f.key === 'RequestData.messages');
    expect(messagesField).toBeDefined();
    expect(messagesField.detectedType).toBe('conversation');
    expect(messagesField.visible).toBe(true);
  });

  it('preserves tool_calls in the raw RequestData for ConversationDialog', () => {
    const expanded = expandRecord(records[0]);
    const rawRd = expanded['_raw_RequestData'];
    expect(rawRd).toBeDefined();

    const rd = JSON.parse(rawRd);
    expect(rd.messages).toBeDefined();

    // Find assistant message with tool_calls
    const assistantWithTools = rd.messages.find(
      m => m.role === 'assistant' && Array.isArray(m.tool_calls),
    );
    expect(assistantWithTools).toBeDefined();
    expect(assistantWithTools.tool_calls[0].function.name).toBe('get_weather');

    // Find tool response
    const toolMsg = rd.messages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg.name).toBe('get_weather');
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

  it('expands messages array into indexed sub-fields', () => {
    const { rows, fields } = runPipeline(records);
    // Evalscope messages have only 1 item with complex structure (id, content, source, ...)
    // so they get expanded into indexed sub-fields like messages.[0].content
    const msgSubFields = fields.filter(f => f.key.includes('messages'));
    expect(msgSubFields.length).toBeGreaterThan(0);

    // The flattened row should have the sub-field values
    expect(rows[0]['messages.[0].role']).toBeDefined();
  });

  it('assigns model field as high priority', () => {
    const { fields } = runPipeline(records);
    const modelField = fields.find(f => f.key === 'model');
    expect(modelField).toBeDefined();
    expect(modelField.visible).toBe(true);
    expect(modelField.visibilityReason).toBe('highPriority');
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
      { key: 'RequestData.max_tokens', detectedType: 'number', isExpanded: true, isLongString: false },
      { key: 'RequestData.temperature', detectedType: 'number', isExpanded: true, isLongString: false },
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
    expect(visibleKeys).toContain('AnswerContent');
    expect(visibleKeys).toContain('InputTokens');
    expect(visibleKeys).toContain('TotalTokens');
    expect(visibleKeys).toContain('OutputTokens');
    expect(visibleKeys).toContain('FinishReason');
  });

  it('high-priority fields have visibilityReason=highPriority', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);

    const highPri = ['Model', 'Cost', 'AnswerContent', 'InputTokens', 'TotalTokens', 'OutputTokens', 'FinishReason'];
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

  it('expanded non-chat fields are hidden', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);
    const visibleKeys = fields.filter(f => f.visible).map(f => f.key);

    expect(visibleKeys).not.toContain('RequestData.model');
    expect(visibleKeys).not.toContain('RequestData.stream');
    expect(visibleKeys).not.toContain('RequestData.max_tokens');

    const expanded = fields.find(f => f.key === 'RequestData.model');
    expect(expanded.visibilityReason).toBe('expandedNonChat');
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

  it('maxVisible limit hides default-priority fields with lower scores', () => {
    const fields = makeInferenceLogFields();
    assignFieldVisibility(fields, 10);
    const hiddenKeys = fields.filter(f => !f.visible).map(f => f.key);

    // These are default-priority (0) but outside maxVisible limit
    expect(hiddenKeys).toContain('AnswerTokens');
    expect(hiddenKeys).toContain('ReasoningTokens');
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
    const allKeys = result.meta.fields;

    const typeInfo = detectFieldTypes(result.data, allKeys);
    const fields = allKeys.map(key => ({
      key,
      label: key.split('.').pop(),
      detectedType: (typeInfo[key] || {}).detectedType || 'string',
      isExpanded: false,
      emptyRate: (typeInfo[key] || {}).emptyRate || 0,
      constantRate: (typeInfo[key] || {}).constantRate || 0,
      isLongString: (typeInfo[key] || {}).isLongString || false,
    }));
    assignFieldVisibility(fields, 10);
    return { fields, typeInfo };
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

    // With maxVisible=10 and only 9 total fields, all are visible.
    // But the sort order matters: long-content fields should come first.
    const questionIdx = visibleKeys.indexOf('问题');
    const metaIdx = visibleKeys.indexOf('任务 ID');
    expect(questionIdx).toBeLessThan(metaIdx);

    const refAnswerIdx = visibleKeys.indexOf('参考答案');
    const categoryIdIdx = visibleKeys.indexOf('一级分类');
    expect(refAnswerIdx).toBeLessThan(categoryIdIdx);
  });

  it('field types are correctly detected for Chinese-named columns', () => {
    const { typeInfo } = runCsvPipeline(text);

    // 问题 has long text (avg >50 chars) → detected as string (not enum, despite ≤20 unique values)
    expect(typeInfo['问题'].detectedType).toBe('string');
    expect(typeInfo['问题'].isLongString).toBe(true);
    expect(typeInfo['参考答案'].isLongString).toBe(true);

    // 一级分类 has short text → detected as enum
    expect(typeInfo['一级分类'].detectedType).toBe('enum');
    expect(typeInfo['一级分类'].isLongString).toBe(false);
  });

  it('every field has a visibilityReason', () => {
    const { fields } = runCsvPipeline(text);
    for (const f of fields) {
      expect(f.visibilityReason).toBeTruthy();
    }
  });
});
