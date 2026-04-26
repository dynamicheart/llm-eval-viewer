/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { describe, it, expect } from 'vitest';
import { expandRecord, buildSchemaSnapshot, MAX_EXPAND_DEPTH } from './recordExpander';

// ===== expandRecord =====

describe('expandRecord', () => {
  it('returns record unchanged when nothing to expand', () => {
    const record = { name: 'test', value: 42 };
    const result = expandRecord(record);
    expect(result).toEqual(record);
  });

  it('parses a JSON string field into a nested object', () => {
    const record = { name: 'test', data: '{"key": "value"}' };
    const result = expandRecord(record);
    expect(result.data).toEqual({ key: 'value' });
    expect(result['_raw_data']).toBe('{"key": "value"}');
  });

  it('preserves conversation arrays as native arrays', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    const record = { messages };
    const result = expandRecord(record);
    // Native arrays are preserved as-is (not converted to text)
    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.messages).toEqual(messages);
  });

  it('preserves tool definition arrays as native arrays', () => {
    const tools = [
      { function: { name: 'search', description: 'search tool' } },
      { function: { name: 'calc', description: 'calc tool' } },
    ];
    const record = { tools };
    const result = expandRecord(record);
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools).toEqual(tools);
  });

  it('preserves homogeneous object arrays as native arrays', () => {
    const items = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ];
    const record = { items, data: '{"key":"value"}' };
    const expDebug = { conversationArrays: [], toolArrays: [], homogeneousArrays: [] };
    const result = expandRecord(record, 0, null, expDebug);
    expect(expDebug.homogeneousArrays).toContain('items');
    // Homogeneous arrays are kept as native arrays
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('parses nested JSON strings recursively (multi-layer)', () => {
    const inner = JSON.stringify({ deep: 42 });
    const outer = JSON.stringify({ inner });
    const record = { data: outer };
    const result = expandRecord(record);
    // data is parsed to {inner: '{"deep": 42}'}, then inner is deep-expanded to {deep: 42}
    expect(result.data.inner.deep).toBe(42);
  });

  it('preserves JSON structure without flattening', () => {
    const record = { config: JSON.stringify({ host: 'localhost', port: 8080, nested: { db: 'test' } }) };
    const result = expandRecord(record);
    expect(result.config).toEqual({ host: 'localhost', port: 8080, nested: { db: 'test' } });
    expect(result['config.host']).toBeUndefined();
    expect(result['config.port']).toBeUndefined();
    expect(result['_raw_config']).toBe(JSON.stringify({ host: 'localhost', port: 8080, nested: { db: 'test' } }));
  });

  it('skips _raw_ prefixed keys', () => {
    const record = { _raw_data: '{"key": "value"}' };
    const result = expandRecord(record);
    expect(result['_raw_data']).toBe('{"key": "value"}');
  });

  it('does not expand native arrays but records debug info when string triggers expansion', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    const record = { chat: messages, data: '{"key":"value"}' };
    const expDebug = { conversationArrays: [], toolArrays: [], homogeneousArrays: [] };
    expandRecord(record, 0, null, expDebug);
    // Debug info is still recorded for native arrays when expansion happens
    expect(expDebug.conversationArrays).toContain('chat');
  });

  it('records debug info for tool arrays when expansion happens', () => {
    const tools = [
      { function: { name: 'fn1' } },
      { function: { name: 'fn2' } },
    ];
    const record = { tools, data: '{"key":"value"}' };
    const expDebug = { conversationArrays: [], toolArrays: [], homogeneousArrays: [] };
    expandRecord(record, 0, null, expDebug);
    expect(expDebug.toolArrays).toContain('tools');
  });

  it('records debug info for homogeneous arrays when expansion happens', () => {
    const items = [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ];
    const record = { items, data: '{"key":"value"}' };
    const expDebug = { conversationArrays: [], toolArrays: [], homogeneousArrays: [] };
    expandRecord(record, 0, null, expDebug);
    expect(expDebug.homogeneousArrays).toContain('items');
  });

  it('parses a realistic record preserving JSON structure', () => {
    const messages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const requestData = JSON.stringify({ model: 'test', messages, stream: true });
    const record = {
      RequestID: 'req-001',
      Model: 'test-model',
      Cost: 100,
      RequestData: requestData,
    };
    const result = expandRecord(record);

    // RequestData is parsed as a nested object (not flattened)
    expect(result.RequestData).toBeDefined();
    expect(typeof result.RequestData).toBe('object');
    expect(result.RequestData.messages).toBeDefined();
    // Messages array within RequestData is preserved as native array
    expect(Array.isArray(result.RequestData.messages)).toBe(true);
    expect(result.RequestData.messages[0].role).toBe('system');
    // Top-level fields preserved
    expect(result.RequestID).toBe('req-001');
    expect(result.Cost).toBe(100);
    expect(result.Model).toBe('test-model');
    // No dot-notation flattening
    expect(result['RequestData.messages']).toBeUndefined();
    expect(result['RequestData.model']).toBeUndefined();
  });

  it('preserves parsed conversation arrays from JSON strings', () => {
    const record = { chat: JSON.stringify([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]) };
    const result = expandRecord(record);
    // Parsed array is preserved as native array (not formatted as text)
    expect(Array.isArray(result.chat)).toBe(true);
    expect(result.chat[0].role).toBe('user');
    expect(result['_raw_chat']).toBeDefined();
  });

  it('preserves parsed tool definition arrays from JSON strings', () => {
    const record = { tools: JSON.stringify([
      { function: { name: 'search', description: 'search' } },
      { function: { name: 'calc', description: 'calc' } },
    ]) };
    const result = expandRecord(record);
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools[0].function.name).toBe('search');
    expect(result['_raw_tools']).toBeDefined();
  });
});

// ===== buildSchemaSnapshot =====

describe('buildSchemaSnapshot', () => {
  it('returns null for null input', () => {
    expect(buildSchemaSnapshot(null)).toBe(null);
  });

  it('returns null for non-object input', () => {
    expect(buildSchemaSnapshot('string')).toBe(null);
    expect(buildSchemaSnapshot(42)).toBe(null);
  });

  it('returns null for depth exceeding maxDepth', () => {
    const obj = { a: 1 };
    expect(buildSchemaSnapshot(obj, 3, 2)).toBe(null);
  });

  it('detects primitive types', () => {
    const record = { name: 'test', count: 42, active: true };
    const result = buildSchemaSnapshot(record);
    expect(result.name.type).toBe('string');
    expect(result.name.sample).toBe('test');
    expect(result.count.type).toBe('number');
    expect(result.count.sample).toBe(42);
    expect(result.active.type).toBe('boolean');
    expect(result.active.sample).toBe(true);
  });

  it('detects null values', () => {
    const result = buildSchemaSnapshot({ empty: null });
    expect(result.empty.type).toBe('null');
  });

  it('detects plain arrays', () => {
    const result = buildSchemaSnapshot({ items: [1, 2, 3] });
    expect(result.items.type).toBe('array');
    expect(result.items.itemType).toBe('number');
    expect(result.items.length).toBe(3);
  });

  it('detects conversation arrays', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const result = buildSchemaSnapshot({ messages });
    expect(result.messages.type).toBe('array');
    expect(result.messages.itemType).toBe('conversation');
    expect(result.messages.length).toBe(2);
  });

  it('detects object arrays', () => {
    const items = [{ id: 1 }, { id: 2 }];
    const result = buildSchemaSnapshot({ items });
    expect(result.items.type).toBe('array');
    expect(result.items.itemType).toBe('object');
    expect(result.items.sample).toBeDefined();
  });

  it('detects nested objects', () => {
    const result = buildSchemaSnapshot({ config: { host: 'localhost', port: 8080 } });
    expect(result.config.type).toBe('object');
    expect(result.config.children.host.type).toBe('string');
    expect(result.config.children.port.type).toBe('number');
  });

  it('detects JSON strings', () => {
    const result = buildSchemaSnapshot({ data: '{"key": "value"}' });
    expect(result.data.type).toBe('json_string');
    expect(result.data.inner.key.type).toBe('string');
  });

  it('skips _raw_ prefixed keys', () => {
    const result = buildSchemaSnapshot({ _raw_data: 'hidden', name: 'visible' });
    expect(result['_raw_data']).toBeUndefined();
    expect(result.name).toBeDefined();
  });

  it('truncates long string samples', () => {
    const longStr = 'x'.repeat(100);
    const result = buildSchemaSnapshot({ text: longStr });
    expect(result.text.type).toBe('string');
    expect(result.text.sample).toContain('...');
    expect(result.text.sample.length).toBeLessThan(longStr.length);
  });

  it('respects maxDepth', () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    const result = buildSchemaSnapshot(deep, 0, 1);
    expect(result.a.type).toBe('object');
    expect(result.a.children.b.type).toBe('object');
    expect(result.a.children.b.children).toBeNull();
  });
});
