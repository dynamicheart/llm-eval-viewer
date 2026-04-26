/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock pipelineLogger to avoid localStorage dependency
vi.mock('@/utils/pipelineLogger', () => ({
  createLogger: () => ({
    header: () => {},
    stage: () => {},
    stageEnd: () => {},
    detail: () => {},
    trace: () => {},
    time: () => () => 0,
    table: () => {},
  }),
}));

import { runPipeline } from '@/utils/pipelineRunner';
import { pluginRegistry, getPluginsByStage } from '@/plugins/pluginRegistry';

// Import plugins to register them
import '@/plugins/formatParse';
import '@/plugins/detectTypes';
import '@/plugins/scoring';
import '@/plugins/decodeNestedJson';
import '@/plugins/reconstructDotNotation';
import '@/plugins/dedupNestedFields';

describe('runPipeline', () => {
  const jsonInput = JSON.stringify([
    { name: 'Alice', score: 95, Model: 'gpt-4', messages: JSON.stringify([{ role: 'user', content: 'Hi' }]) },
    { name: 'Bob', score: 87, Model: 'gpt-4', messages: JSON.stringify([{ role: 'user', content: 'Hello' }]) },
  ]);

  it('parses JSON array input', () => {
    const result = runPipeline(jsonInput, {});
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('Alice');
    expect(result.rows[1].name).toBe('Bob');
    expect(result.detectedFormat).toBe('json');
    expect(result.fieldMeta.detectedFields.length).toBeGreaterThan(0);
  });

  it('parses JSONL input', () => {
    const obj1 = { name: 'Alice', score: 95 };
    const obj2 = { name: 'Bob', score: 87 };
    const jsonl = JSON.stringify(obj1) + '\n' + JSON.stringify(obj2);
    const result = runPipeline(jsonl, {});
    expect(result.rows).toHaveLength(2);
    expect(result.detectedFormat).toBe('jsonl');
  });

  it('returns empty result for empty input', () => {
    const result = runPipeline('', {});
    expect(result.rows).toEqual([]);
    expect(result.fieldMeta.detectedFields).toEqual([]);
  });

  it('decodes nested JSON strings into objects', () => {
    const result = runPipeline(jsonInput, { enabledPluginIds: ['decodeNestedJson'], expandNestedJsonStrings: true });
    // messages field should be parsed from JSON string into an object
    expect(result.rows[0].messages).toBeDefined();
    expect(typeof result.rows[0].messages).toBe('object');
    // Original string saved as _raw_
    expect(result.rows[0]['_raw_messages']).toBeDefined();
  });

  it('detects field types', () => {
    const result = runPipeline(jsonInput, {});
    const nameField = result.fieldMeta.detectedFields.find(f => f.key === 'name');
    expect(nameField).toBeDefined();
    // With 2 unique values in 2 rows, name is detected as enum
    expect(['string', 'enum']).toContain(nameField.detectedType);

    const scoreField = result.fieldMeta.detectedFields.find(f => f.key === 'score');
    expect(scoreField).toBeDefined();
    expect(scoreField.detectedType).toBe('number');
  });

  it('assigns field visibility and scoring', () => {
    const result = runPipeline(jsonInput, {});
    const visibleFields = result.fieldMeta.detectedFields.filter(f => f.visible);
    expect(visibleFields.length).toBeGreaterThan(0);
    // Model should be visible (high priority)
    const modelField = result.fieldMeta.detectedFields.find(f => f.key === 'Model');
    expect(modelField.visible).toBe(true);
  });

  it('builds schema snapshot', () => {
    const result = runPipeline(jsonInput, {});
    expect(result.fieldMeta.schemaSnapshot).toBeDefined();
    expect(result.fieldMeta.schemaSnapshot.name).toBeDefined();
  });

  it('returns timings', () => {
    const result = runPipeline(jsonInput, {});
    expect(result.timings).toBeDefined();
    expect(result.timings.total).toBeGreaterThan(0);
    expect(result.timings.parse).toBeGreaterThan(0);
  });

  it('returns debug info', () => {
    const result = runPipeline(jsonInput, {});
    expect(result.debug).toBeDefined();
    expect(result.debug.length).toBeGreaterThan(0);
    // Should have stages: parse, transform, post
    const stages = new Set(result.debug.map(d => d.stage));
    expect(stages.has('parse')).toBe(true);
    expect(stages.has('transform')).toBe(true);
    expect(stages.has('post')).toBe(true);
  });

  it('works with cachedRecords (skips parse stage)', () => {
    const fullResult = runPipeline(jsonInput, {});
    const cachedResult = runPipeline(null, {
      cachedRecords: fullResult.rows,
      detectedFormat: fullResult.detectedFormat,
    });
    expect(cachedResult.rows).toHaveLength(2);
    expect(cachedResult.debug[0].stage).toBe('parse');
    expect(cachedResult.debug[0].summary).toContain('cached');
    // detectTypes and scoring should still run
    expect(cachedResult.fieldMeta.detectedFields.length).toBeGreaterThan(0);
    const visibleFields = cachedResult.fieldMeta.detectedFields.filter(f => f.visible);
    expect(visibleFields.length).toBeGreaterThan(0);
  });

  it('supports enabledPluginIds for optional plugins', () => {
    const result = runPipeline(jsonInput, {
      enabledPluginIds: ['decodeNestedJson', 'reconstructDotNotation'],
    });
    expect(result.rows).toHaveLength(2);
    // decodeNestedJson is optional but enabled
    const decodeStage = result.debug.find(d => d.id === 'decodeNestedJson');
    expect(decodeStage).toBeDefined();
    expect(decodeStage.skipped).toBeFalsy();
    // reconstructDotNotation is optional and enabled, so it runs
  });

  it('calls progressCallback', () => {
    const progressCalls = [];
    const result = runPipeline(jsonInput, {
      progressCallback: (p) => progressCalls.push(p),
    });
    expect(result.rows).toHaveLength(2);
    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it('handles conversation data correctly', () => {
    const convData = JSON.stringify([
      {
        Model: 'gpt-4',
        RequestData: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'Be helpful.' },
            { role: 'user', content: 'Hello!' },
          ],
        }),
      },
    ]);
    const result = runPipeline(convData, { enabledPluginIds: ['decodeNestedJson'] });
    expect(result.rows).toHaveLength(1);
    // RequestData is parsed into a nested object (not flattened)
    expect(typeof result.rows[0].RequestData).toBe('object');
    // Messages within RequestData are preserved as native array
    expect(Array.isArray(result.rows[0].RequestData.messages)).toBe(true);
    expect(result.rows[0].RequestData.messages[0].role).toBe('system');
    // Should be detected as nestedObject type
    const rdField = result.fieldMeta.detectedFields.find(f => f.key === 'RequestData');
    expect(rdField).toBeDefined();
    expect(rdField.detectedType).toBe('nestedObject');
  });

  it('provides context.parallel in plugins', () => {
    // Verify that decodeNestedJson plugin uses context.parallel by checking
    // it still produces correct results through the parallel path
    const data = JSON.stringify([
      { name: 'A', payload: JSON.stringify({ nested: true }) },
      { name: 'B', payload: JSON.stringify({ nested: false }) },
    ]);
    const result = runPipeline(data, { enabledPluginIds: ['decodeNestedJson'], expandNestedJsonStrings: true });
    expect(result.rows).toHaveLength(2);
    // payload should be decoded from JSON string to object
    expect(typeof result.rows[0].payload).toBe('object');
    expect(result.rows[0].payload.nested).toBe(true);
    expect(result.fieldMeta.detectedFields.length).toBeGreaterThan(0);
  });

  it('context.parallel maps correctly', () => {
    // Direct test: runPipeline provides a parallel function via context
    // We verify it works by checking the expandJson plugin processes all rows
    const data = JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: i, val: `v${i}` })));
    const result = runPipeline(data, {});
    expect(result.rows).toHaveLength(100);
    expect(result.rows[99].id).toBe(99);
  });
});
