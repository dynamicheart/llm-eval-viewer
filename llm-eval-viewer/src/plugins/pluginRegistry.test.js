/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock useDebugMode to avoid localStorage dependency
vi.mock('@/composables/useDebugMode', () => ({
  isDebugLogging: () => false,
  useDebugMode: () => ({ debugMode: { value: false } }),
}));

import { pluginRegistry, registerPlugin, getPluginsByStage, getOptionalPlugins, runPlugins } from './pluginRegistry';

// Clear registry before each test
beforeEach(() => {
  pluginRegistry.length = 0;
});

describe('registerPlugin', () => {
  it('applies default stage/required/execution/order', () => {
    registerPlugin({
      id: 'test1',
      process(rows) { return { rows, fieldMeta: {} }; },
    });
    expect(pluginRegistry).toHaveLength(1);
    expect(pluginRegistry[0].stage).toBe('transform');
    expect(pluginRegistry[0].required).toBe(false);
    expect(pluginRegistry[0].execution).toBe('rerunnable');
    expect(pluginRegistry[0].order).toBe(0);
  });

  it('preserves explicitly set metadata', () => {
    registerPlugin({
      id: 'test2',
      stage: 'parse',
      required: true,
      execution: 'once',
      order: 10,
      process(rows) { return { rows, fieldMeta: {} }; },
    });
    expect(pluginRegistry[0].stage).toBe('parse');
    expect(pluginRegistry[0].required).toBe(true);
    expect(pluginRegistry[0].execution).toBe('once');
    expect(pluginRegistry[0].order).toBe(10);
  });
});

describe('getPluginsByStage', () => {
  it('returns plugins filtered by stage, sorted by order', () => {
    registerPlugin({ id: 'b', stage: 'transform', order: 20, process(rows) { return { rows, fieldMeta: {} }; } });
    registerPlugin({ id: 'a', stage: 'transform', order: 10, process(rows) { return { rows, fieldMeta: {} }; } });
    registerPlugin({ id: 'c', stage: 'analyze', order: 5, process(rows) { return { rows, fieldMeta: {} }; } });

    const transform = getPluginsByStage('transform');
    expect(transform).toHaveLength(2);
    expect(transform[0].id).toBe('a');
    expect(transform[1].id).toBe('b');

    const analyze = getPluginsByStage('analyze');
    expect(analyze).toHaveLength(1);
    expect(analyze[0].id).toBe('c');

    const post = getPluginsByStage('post');
    expect(post).toHaveLength(0);
  });

  it('returns empty array for unknown stage', () => {
    registerPlugin({ id: 'x', stage: 'transform', process(rows) { return { rows, fieldMeta: {} }; } });
    expect(getPluginsByStage('unknown')).toHaveLength(0);
  });
});

describe('getOptionalPlugins', () => {
  it('returns only non-required plugins, sorted by order', () => {
    registerPlugin({ id: 'opt1', required: false, order: 20, process(rows) { return { rows, fieldMeta: {} }; } });
    registerPlugin({ id: 'req1', required: true, process(rows) { return { rows, fieldMeta: {} }; } });
    registerPlugin({ id: 'opt2', required: false, order: 5, process(rows) { return { rows, fieldMeta: {} }; } });

    const optional = getOptionalPlugins();
    expect(optional).toHaveLength(2);
    expect(optional[0].id).toBe('opt2'); // lower order first
    expect(optional[1].id).toBe('opt1');
  });

  it('returns empty array when all plugins are required', () => {
    registerPlugin({ id: 'r1', required: true, process(rows) { return { rows, fieldMeta: {} }; } });
    registerPlugin({ id: 'r2', required: true, process(rows) { return { rows, fieldMeta: {} }; } });

    expect(getOptionalPlugins()).toHaveLength(0);
  });
});

describe('runPlugins', () => {
  it('runs plugins in order and passes results between them', () => {
    registerPlugin({
      id: 'add_field',
      process(rows, fieldMeta) {
        for (const row of rows) row.added = 'yes';
        return { rows, fieldMeta };
      },
    });
    registerPlugin({
      id: 'transform_field',
      process(rows, fieldMeta) {
        for (const row of rows) row.added = 'modified';
        return { rows, fieldMeta };
      },
    });

    const rows = [{ a: 1 }, { a: 2 }];
    const fieldMeta = { detectedFields: [] };
    const result = runPlugins(rows, fieldMeta, ['add_field', 'transform_field']);

    expect(result.rows[0].added).toBe('modified');
    expect(result.rows[1].added).toBe('modified');
    expect(result.pluginDebug).toHaveLength(2);
    expect(result.pluginDebug[0].id).toBe('add_field');
    expect(result.pluginDebug[1].id).toBe('transform_field');
  });

  it('collects pluginDebug from plugins that return it', () => {
    registerPlugin({
      id: 'debug_plugin',
      process(rows, fieldMeta) {
        return { rows, fieldMeta, pluginDebug: { summary: 'test summary' } };
      },
    });

    const result = runPlugins([{ a: 1 }], { detectedFields: [] }, ['debug_plugin']);
    expect(result.pluginDebug[0].summary).toBe('test summary');
    expect(result.pluginDebug[0].debug).toEqual({ summary: 'test summary' });
  });

  it('skips unknown plugin IDs', () => {
    const result = runPlugins([{ a: 1 }], { detectedFields: [] }, ['nonexistent']);
    expect(result.pluginDebug).toHaveLength(0);
    expect(result.rows).toEqual([{ a: 1 }]);
  });

  it('accepts optional context parameter (backward-compatible)', () => {
    let contextReceived = null;
    registerPlugin({
      id: 'ctx_plugin',
      process(rows, fieldMeta, context) {
        contextReceived = context;
        return { rows, fieldMeta };
      },
    });

    runPlugins([{ a: 1 }], { detectedFields: [] }, ['ctx_plugin'], { logger: 'test' });
    expect(contextReceived).toEqual({ logger: 'test' });
  });

  it('includes stage in plugin debug info', () => {
    registerPlugin({
      id: 'stage_test',
      stage: 'analyze',
      process(rows, fieldMeta) { return { rows, fieldMeta }; },
    });

    const result = runPlugins([{ a: 1 }], { detectedFields: [] }, ['stage_test']);
    expect(result.pluginDebug[0].stage).toBe('analyze');
  });
});
