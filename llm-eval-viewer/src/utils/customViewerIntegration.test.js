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
import {
  flattenValue,
  tryParseJsonString,
  detectFieldTypes,
  assignFieldVisibility,
  formatConversationArray,
  isConversationLikeArray,
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
    const { rows, fields } = runPipeline(records);

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
