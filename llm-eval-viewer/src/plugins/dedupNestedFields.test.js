/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

// Import all required plugins
import '@/plugins/formatParse';
import '@/plugins/detectTypes';
import '@/plugins/scoring';
import '@/plugins/decodeNestedJson';
import '@/plugins/reconstructDotNotation';
import '@/plugins/dedupNestedFields';
import { getPluginsByStage } from '@/plugins/pluginRegistry';
import { runPipeline } from '@/utils/pipelineRunner';

describe('dedupNestedFields', () => {
  // Data like the user's log: @message duplicates top-level fields
  const duplicatedData = JSON.stringify([
    {
      RequestID: 'req-001',
      Model: 'gpt-4',
      Cost: 2393,
      FinishReason: 'tool_calls',
      '@message': {
        RequestID: 'req-001',
        Model: 'gpt-4',
        Cost: 2393,
        FinishReason: 'tool_calls',
        ExtraMsg: 'some extra',
      },
    },
    {
      RequestID: 'req-002',
      Model: 'gpt-4',
      Cost: 1500,
      FinishReason: 'stop',
      '@message': {
        RequestID: 'req-002',
        Model: 'gpt-4',
        Cost: 1500,
        FinishReason: 'stop',
        ExtraMsg: 'another extra',
      },
    },
  ]);

  it('detects @message as duplicate and removes it from detectedFields', () => {
    const result = runPipeline(duplicatedData, {
      enabledPluginIds: ['dedupNestedFields'],
    });

    // @message should be completely removed, not just hidden
    const messageField = result.fieldMeta.detectedFields.find(f => f.key === '@message');
    expect(messageField).toBeUndefined();
  });

  it('also removes child fields of a deduped parent', () => {
    const result = runPipeline(duplicatedData, {
      enabledPluginIds: ['dedupNestedFields'],
    });

    // No child fields of @message should exist
    const childFields = result.fieldMeta.detectedFields.filter(f => f.key.startsWith('@message.'));
    expect(childFields).toEqual([]);
  });

  it('does NOT remove non-duplicate nested objects', () => {
    const data = JSON.stringify([
      {
        name: 'Alice',
        score: 95,
        metadata: { foo: 'bar', baz: 'qux' }, // no overlap with top-level
      },
    ]);
    const result = runPipeline(data, {
      enabledPluginIds: ['dedupNestedFields'],
    });

    const metaField = result.fieldMeta.detectedFields.find(f => f.key === 'metadata');
    expect(metaField).toBeDefined();
    // metadata's children should still be present
    const metaChildren = result.fieldMeta.detectedFields.filter(f => f.key.startsWith('metadata.'));
    expect(metaChildren.length).toBeGreaterThan(0);
  });

  it('skips when disabled', () => {
    const result = runPipeline(duplicatedData, {
      enabledPluginIds: [], // dedupNestedFields NOT enabled
    });

    // @message should still be present when dedup is disabled
    const messageField = result.fieldMeta.detectedFields.find(f => f.key === '@message');
    expect(messageField).toBeDefined();
  });

  it('returns dedup info in plugin debug', () => {
    const result = runPipeline(duplicatedData, {
      enabledPluginIds: ['dedupNestedFields'],
    });

    const dedupDebug = result.debug.find(d => d.id === 'dedupNestedFields');
    expect(dedupDebug).toBeDefined();
    expect(dedupDebug.debug.dedupedCount).toBeGreaterThan(0);
    expect(dedupDebug.debug.dedupedKeys).toContain('@message');
  });

  it('plugin is optional and in post stage', () => {
    const plugin = getPluginsByStage('post').find(p => p.id === 'dedupNestedFields');
    expect(plugin).toBeDefined();
    expect(plugin.required).toBe(false);
    expect(plugin.stage).toBe('post');
  });

  it('does not remove nested object with low key overlap', () => {
    const data = JSON.stringify([
      {
        name: 'Alice',
        Model: 'gpt-4',
        '@message': {
          name: 'Alice',
          // only 1/2 keys overlap with top-level (< 80%)
          completelyDifferentKey: 'value',
          anotherUnrelatedKey: 'value2',
        },
      },
    ]);
    const result = runPipeline(data, {
      enabledPluginIds: ['dedupNestedFields'],
    });

    const messageField = result.fieldMeta.detectedFields.find(f => f.key === '@message');
    expect(messageField).toBeDefined();
  });
});
