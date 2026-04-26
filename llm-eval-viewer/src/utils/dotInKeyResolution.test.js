/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

/*
 * Tests for dot-in-key handling.
 * Field names like "DeepSeek-V3.2-API" contain dots that should NOT be
 * treated as nesting separators.
 */
import { describe, it, expect } from 'vitest';

// ---- Extract pure logic from resolveRowValue / findRootKey for testing ----

function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function findRootKey(row, colKey) {
  for (const key of Object.keys(row)) {
    if (key.startsWith('_reconstructed_')) {
      const root = key.substring('_reconstructed_'.length);
      if (colKey === root || colKey.startsWith(root + '.')) return root;
    }
  }
  for (const key of Object.keys(row)) {
    if (key.startsWith('_')) continue;
    if (colKey === key || colKey.startsWith(key + '.')) return key;
  }
  return colKey.split('.')[0];
}

function resolveRowValue(row, colKey) {
  if (!colKey.includes('.')) return row[colKey];
  const rootKey = findRootKey(row, colKey);
  if (rootKey === colKey) return row[colKey];
  const reconObj = row[`_reconstructed_${rootKey}`];
  if (reconObj) {
    const val = getNestedValue(reconObj, colKey.substring(rootKey.length + 1));
    if (val !== undefined) return val;
  }
  const rootVal = row[rootKey];
  if (rootVal != null && typeof rootVal === 'object') {
    const val = getNestedValue(rootVal, colKey.substring(rootKey.length + 1));
    if (val !== undefined) return val;
  }
  return row[`_decoded_${colKey}`];
}

// ---- Tests ----

describe('dot-in-key resolution', () => {
  it('resolves nested value when root key contains dots (e.g. V3.2)', () => {
    const row = {
      '标注结果详情-DeepSeek-V3.2-Channel-INT8-p800-文生文-API': {
        evaluator: {
          extracted_answer: 'hello world',
        },
      },
    };

    const colKey = '标注结果详情-DeepSeek-V3.2-Channel-INT8-p800-文生文-API.evaluator.extracted_answer';
    expect(resolveRowValue(row, colKey)).toBe('hello world');
  });

  it('resolves simple nested value (no dots in key)', () => {
    const row = {
      model_output: {
        usage: { input_tokens: 115 },
      },
    };
    expect(resolveRowValue(row, 'model_output.usage.input_tokens')).toBe(115);
  });

  it('resolves top-level value (no dots at all)', () => {
    const row = { model: 'gpt-4' };
    expect(resolveRowValue(row, 'model')).toBe('gpt-4');
  });

  it('falls back to _decoded_ prefix', () => {
    const row = { '_decoded_foo.bar': 'decoded_value' };
    expect(resolveRowValue(row, 'foo.bar')).toBe('decoded_value');
  });

  it('prefers _reconstructed_ over original nested value', () => {
    const row = {
      model_output: { usage: { input_tokens: 100 } },
      _reconstructed_model_output: { usage: { input_tokens: 999 } },
    };
    expect(resolveRowValue(row, 'model_output.usage.input_tokens')).toBe(999);
  });

  it('findRootKey returns correct root for keys with multiple dots', () => {
    const row = {
      'pkg-v1.2.3-beta.data.field': { nested: true },
    };
    expect(findRootKey(row, 'pkg-v1.2.3-beta.data.field.nested')).toBe(
      'pkg-v1.2.3-beta.data.field',
    );
  });

  it('findRootKey splits on first dot when no match found', () => {
    const row = { other_key: {} };
    expect(findRootKey(row, 'a.b.c')).toBe('a');
  });

  it('returns undefined for non-existent path', () => {
    const row = { model_output: { usage: { input_tokens: 115 } } };
    expect(resolveRowValue(row, 'model_output.usage.nonexistent')).toBeUndefined();
  });

  it('does not treat dots in key names as nesting separators', () => {
    const row = {
      '模型回答-DeepSeek-V3.2-API-请求详情': [],
      '标注结果详情-DeepSeek-V3.2-API': {
        evaluator: { extracted_answer: '42' },
      },
    };
    // Top-level key with dot in name — should NOT be split
    expect(resolveRowValue(row, '模型回答-DeepSeek-V3.2-API-请求详情')).toEqual([]);
    // Nested under a key with dot in name
    expect(
      resolveRowValue(row, '标注结果详情-DeepSeek-V3.2-API.evaluator.extracted_answer'),
    ).toBe('42');
  });

  it('findRootKey prefers _reconstructed_ prefix over regular keys', () => {
    const row = {
      model_output: { usage: { input_tokens: 100 } },
      _reconstructed_model_output: { usage: { input_tokens: 200 } },
    };
    // _reconstructed_ keys are checked first
    expect(findRootKey(row, 'model_output.usage.input_tokens')).toBe('model_output');
  });

  it('findRootKey returns first matching prefix (insertion order)', () => {
    const row = {
      'pkg-v1.2.data': { field: 'a' },
      'pkg-v1.2.data.field': 'b',
    };
    // Object.keys order: 'pkg-v1.2.data' first → matches colKey
    expect(findRootKey(row, 'pkg-v1.2.data.field')).toBe('pkg-v1.2.data');
    // For deeper path, still matches first prefix
    expect(findRootKey(row, 'pkg-v1.2.data.field.xxx')).toBe('pkg-v1.2.data');
  });

  it('resolveRowValue returns top-level value when rootKey equals colKey (dot in name)', () => {
    const row = {
      'DeepSeek-V3.2-API': { model: 'test' },
    };
    // colKey has no dot, so it returns the value directly
    expect(resolveRowValue(row, 'DeepSeek-V3.2-API')).toEqual({ model: 'test' });
  });

  it('resolveRowValue handles _reconstructed_ with dot-in-key root', () => {
    const row = {
      '标注结果-V3.2-API': JSON.stringify({ score: 100 }),
      '_reconstructed_标注结果-V3.2-API': { score: 200, evaluator: { pass: true } },
    };
    expect(resolveRowValue(row, '标注结果-V3.2-API.score')).toBe(200);
    expect(resolveRowValue(row, '标注结果-V3.2-API.evaluator.pass')).toBe(true);
  });
});
