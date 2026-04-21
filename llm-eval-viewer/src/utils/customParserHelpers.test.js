/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { describe, it, expect } from 'vitest';
import {
  isConversationLikeArray,
  isHomogeneousObjectArray,
  formatConversationArray,
  flattenValue,
  tryParseJsonString,
  detectFieldTypes,
  assignFieldVisibility,
} from './customParserHelpers';

// ===== isHomogeneousObjectArray =====

describe('isHomogeneousObjectArray', () => {
  it('returns false for empty array', () => {
    expect(isHomogeneousObjectArray([])).toBe(false);
  });

  it('returns false for single-item array', () => {
    expect(isHomogeneousObjectArray([{ role: 'user', content: 'hi' }])).toBe(false);
  });

  it('returns false for array exceeding MAX_ARRAY_EXPAND', () => {
    const arr = Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `msg${i}` }));
    expect(isHomogeneousObjectArray(arr)).toBe(false);
  });

  it('returns false for non-object items', () => {
    expect(isHomogeneousObjectArray([1, 2, 3])).toBe(false);
  });

  it('returns false for array of arrays', () => {
    expect(isHomogeneousObjectArray([[1], [2]])).toBe(false);
  });

  it('returns false for objects with no keys', () => {
    expect(isHomogeneousObjectArray([{}, {}])).toBe(false);
  });

  it('returns false when key count difference > 1', () => {
    const arr = [
      { role: 'user', content: 'hi', extra: 'x' },
      { role: 'assistant' },
    ];
    expect(isHomogeneousObjectArray(arr)).toBe(false);
  });

  it('returns true for homogeneous conversation array', () => {
    const arr = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'user', content: 'how are you?' },
    ];
    expect(isHomogeneousObjectArray(arr)).toBe(true);
  });

  it('returns true when one item has 1 extra key (within tolerance)', () => {
    const arr = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello', name: 'bot' },
    ];
    expect(isHomogeneousObjectArray(arr)).toBe(true);
  });
});

// ===== formatConversationArray =====

describe('formatConversationArray', () => {
  it('formats conversation with role and content', () => {
    const arr = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    const result = formatConversationArray(arr);
    expect(result).toBe('[user] hello\n\n[assistant] hi there');
  });

  it('truncates long conversations', () => {
    const arr = [
      { role: 'user', content: 'a'.repeat(3000) },
    ];
    const result = formatConversationArray(arr, 2000);
    expect(result.length).toBeLessThanOrEqual(2000 + 10);
    expect(result).toContain('...');
  });

  it('handles non-string content', () => {
    const arr = [
      { role: 'assistant', content: { text: 'structured' } },
    ];
    const result = formatConversationArray(arr);
    expect(result).toBe('[assistant] {"text":"structured"}');
  });

  it('handles missing content', () => {
    const arr = [
      { role: 'user' },
    ];
    const result = formatConversationArray(arr);
    // JSON.stringify('') = '""', so missing content becomes '[user] ""'
    expect(result).toBe('[user] ""');
  });

  it('formats assistant message with tool_calls', () => {
    const arr = [
      { role: 'user', content: 'What is the weather?' },
      {
        role: 'assistant',
        content: 'Let me check.',
        tool_calls: [
          { id: 'call_1', function: { name: 'get_weather', arguments: '{"location":"Beijing"}' } },
        ],
      },
      { role: 'tool', name: 'get_weather', content: '{"temperature": 25}' },
      { role: 'assistant', content: 'It is 25 degrees.' },
    ];
    const result = formatConversationArray(arr);
    expect(result).toContain('[user] What is the weather?');
    expect(result).toContain('[assistant] Let me check.');
    expect(result).toContain('[tool_call:get_weather:call_1]');
    expect(result).toContain('{"location":"Beijing"}');
    expect(result).toContain('[tool:get_weather]');
    expect(result).toContain('{"temperature": 25}');
    expect(result).toContain('[assistant] It is 25 degrees.');
  });

  it('formats assistant message with tool_calls but no text content', () => {
    const arr = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { function: { name: 'search', arguments: '{"query":"test"}' } },
        ],
      },
    ];
    const result = formatConversationArray(arr);
    // Should not have an empty [assistant] line, only the tool_call
    expect(result).not.toContain('[assistant]');
    expect(result).toContain('[tool_call:search]');
    expect(result).toContain('{"query":"test"}');
  });

  it('formats tool result with tool_call_id fallback', () => {
    const arr = [
      { role: 'tool', tool_call_id: 'call_abc', content: 'result data' },
    ];
    const result = formatConversationArray(arr);
    expect(result).toContain('[tool:call_abc]');
    expect(result).toContain('result data');
  });

  it('formats multiple tool_calls in one assistant message', () => {
    const arr = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'c1', function: { name: 'fn_a', arguments: '{}' } },
          { id: 'c2', function: { name: 'fn_b', arguments: '{"x":1}' } },
        ],
      },
    ];
    const result = formatConversationArray(arr);
    expect(result).toContain('[tool_call:fn_a:c1]');
    expect(result).toContain('[tool_call:fn_b:c2]');
  });

  it('handles OpenAI multimodal content (array with type:text parts)', () => {
    const arr = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello from multimodal' },
          { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
        ],
      },
      { role: 'assistant', content: 'I see the image.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Second user message' },
        ],
      },
    ];
    const result = formatConversationArray(arr);
    // Should extract text from text parts, skip image_url
    expect(result).toContain('[user] Hello from multimodal');
    expect(result).not.toContain('example.com');
    expect(result).toContain('[assistant] I see the image.');
    expect(result).toContain('[user] Second user message');
    // parseFromText roundtrip should recover all 3 blocks
    const lines = result.split('\n');
    const blocks = [];
    let current = null;
    for (const line of lines) {
      const m = line.match(/^\[(system|user|assistant|human|ai|bot|tool_call:\S+|tool:\S+)\]\s*(.*)/i);
      if (m) {
        if (current) blocks.push(current);
        current = { role: m[1].split(':')[0].toLowerCase(), content: m[2] || '' };
        continue;
      }
      if (current) current.content += (current.content ? '\n' : '') + line;
    }
    if (current) blocks.push(current);
    expect(blocks.length).toBe(3);
    expect(blocks.filter(b => b.role === 'user').length).toBe(2);
  });

  it('does not truncate by default (no maxLen)', () => {
    const arr = [
      { role: 'user', content: 'a'.repeat(300000) },
      { role: 'assistant', content: 'short reply' },
    ];
    const result = formatConversationArray(arr);
    // Should NOT be truncated — all content preserved
    expect(result).toContain('short reply');
    expect(result.length).toBeGreaterThan(300000);
  });
});

// ===== flattenValue =====

describe('flattenValue', () => {
  it('flattens a simple object with dot notation', () => {
    const result = flattenValue({ a: 1, b: 'hello' }, 'parent');
    expect(result).toEqual({
      'parent.a': 1,
      'parent.b': 'hello',
    });
  });

  it('flattens nested objects', () => {
    const result = flattenValue({ a: { x: 1, y: 2 } }, 'parent');
    expect(result).toEqual({
      'parent.a.x': 1,
      'parent.a.y': 2,
    });
  });

  it('flattens arrays with index notation', () => {
    const result = flattenValue(['a', 'b', 'c'], 'items');
    expect(result).toEqual({
      'items.[0]': 'a',
      'items.[1]': 'b',
      'items.[2]': 'c',
    });
  });

  it('keeps homogeneous object arrays as single formatted field', () => {
    const arr = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const result = flattenValue(arr, 'messages');
    expect(result['messages']).toBe('[user] hi\n\n[assistant] hello');
  });

  it('flattens non-homogeneous arrays by index', () => {
    const arr = [
      { type: 'text', value: 'hello' },
      { type: 'image', url: 'http://img.png' },
      'plain string',
    ];
    const result = flattenValue(arr, 'content');
    expect(result['content.[0].type']).toBe('text');
    expect(result['content.[0].value']).toBe('hello');
    expect(result['content.[1].type']).toBe('image');
    expect(result['content.[2]']).toBe('plain string');
  });

  it('handles null and undefined values', () => {
    const result = flattenValue({ a: null, b: undefined }, 'parent');
    expect(result).toEqual({
      'parent.a': '',
      'parent.b': '',
    });
  });

  it('returns JSON string for top-level array without parent key', () => {
    const result = flattenValue([1, 2, 3], '');
    expect(result['']).toBe('[1,2,3]');
  });

  it('respects maxDepth', () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    const result = flattenValue(deep, 'parent', 0, 1);
    // depth 0 -> enter object, depth 1 -> a.b is object, depth 1 >= maxDepth 1 -> stringify
    expect(result['parent.a.b']).toBe('{"c":{"d":1}}');
  });

  it('limits array expansion to MAX_ARRAY_EXPAND', () => {
    const arr = Array.from({ length: 20 }, (_, i) => `item${i}`);
    const result = flattenValue(arr, 'items');
    // MAX_ARRAY_EXPAND is 10
    expect(Object.keys(result).length).toBe(10);
    expect(result['items.[0]']).toBe('item0');
    expect(result['items.[9]']).toBe('item9');
    expect(result['items.[10]']).toBeUndefined();
  });

  it('flattens nested objects in array items up to maxDepth', () => {
    const arr = [
      { key: 'value', nested: { x: 1 } },
    ];
    const result = flattenValue(arr, 'items', 0, 1);
    // depth 0 -> enter array. depth 1 for each item's object: key is primitive, nested exceeds maxDepth
    expect(result['items.[0].key']).toBe('value');
    expect(result['items.[0].nested']).toBe('{"x":1}');
  });
});

// ===== tryParseJsonString =====

describe('tryParseJsonString', () => {
  it('parses a JSON object string', () => {
    const result = tryParseJsonString('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('parses a JSON array string', () => {
    const result = tryParseJsonString('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns null for non-string input', () => {
    expect(tryParseJsonString(123)).toBe(null);
    expect(tryParseJsonString(null)).toBe(null);
    expect(tryParseJsonString({})).toBe(null);
  });

  it('parses valid short JSON objects and arrays', () => {
    expect(tryParseJsonString('{}')).toEqual({});
    expect(tryParseJsonString('[]')).toEqual([]);
  });

  it('returns null for single-char strings', () => {
    expect(tryParseJsonString('{')).toBe(null);
    expect(tryParseJsonString('[')).toBe(null);
  });

  it('returns null for strings not starting with { or [', () => {
    expect(tryParseJsonString('hello world')).toBe(null);
    expect(tryParseJsonString('123')).toBe(null);
  });

  it('returns null for invalid JSON', () => {
    expect(tryParseJsonString('{"key": broken}')).toBe(null);
  });

  it('returns null for JSON primitives (not objects)', () => {
    expect(tryParseJsonString('"hello"')).toBe(null);
    expect(tryParseJsonString('42')).toBe(null);
    expect(tryParseJsonString('true')).toBe(null);
    expect(tryParseJsonString('null')).toBe(null);
  });

  it('returns null for overly long strings', () => {
    const longStr = '{"data":"' + 'x'.repeat(2000001) + '"}';
    expect(tryParseJsonString(longStr)).toBe(null);
  });

  it('trims whitespace before parsing', () => {
    const result = tryParseJsonString('  {"key": "value"}  ');
    expect(result).toEqual({ key: 'value' });
  });
});

// ===== detectFieldTypes =====

describe('detectFieldTypes', () => {
  it('detects number type', () => {
    const rows = [
      { score: 1 },
      { score: 2 },
      { score: 3 },
    ];
    const result = detectFieldTypes(rows, ['score']);
    expect(result.score.detectedType).toBe('number');
  });

  it('detects boolean type', () => {
    const rows = [
      { pass: true },
      { pass: false },
      { pass: true },
    ];
    const result = detectFieldTypes(rows, ['pass']);
    expect(result.pass.detectedType).toBe('boolean');
  });

  it('detects enum type when unique values <= 20', () => {
    const values = ['cat', 'dog', 'bird', 'cat', 'dog'];
    const rows = values.map((v) => ({ animal: v }));
    const result = detectFieldTypes(rows, ['animal']);
    expect(result.animal.detectedType).toBe('enum');
  });

  it('detects string type when unique values > 20', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      text: `unique text ${i}`,
    }));
    const result = detectFieldTypes(rows, ['text']);
    expect(result.text.detectedType).toBe('string');
  });

  it('detects isLongString based on average length', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      text: 'x'.repeat(200),
    }));
    const result = detectFieldTypes(rows, ['text']);
    expect(result.text.isLongString).toBe(true);
  });

  it('isLongString is false for short values', () => {
    const rows = [{ text: 'hi' }, { text: 'hello' }];
    const result = detectFieldTypes(rows, ['text']);
    expect(result.text.isLongString).toBe(false);
  });

  it('detects conversation type when values match [role] pattern', () => {
    const conversationText = '[user] hello\n\n[assistant] hi there\n\n[user] how are you?';
    const rows = Array.from({ length: 10 }, () => ({
      messages: conversationText,
    }));
    const result = detectFieldTypes(rows, ['messages']);
    expect(result.messages.detectedType).toBe('conversation');
  });

  it('detects conversation type with mixed case roles', () => {
    const conversationText = '[User] hello\n\n[ASSISTANT] hi there';
    const rows = Array.from({ length: 10 }, () => ({
      messages: conversationText,
    }));
    const result = detectFieldTypes(rows, ['messages']);
    expect(result.messages.detectedType).toBe('conversation');
  });

  it('detects conversation type with system role', () => {
    const conversationText = '[system] you are helpful\n\n[user] hello\n\n[assistant] hi';
    const rows = Array.from({ length: 10 }, () => ({
      messages: conversationText,
    }));
    const result = detectFieldTypes(rows, ['messages']);
    expect(result.messages.detectedType).toBe('conversation');
  });

  it('does not detect conversation type when not enough votes', () => {
    // Only 2 out of 10 have conversation pattern (< 30%)
    const conversationText = '[user] hello\n\n[assistant] hi';
    const rows = Array.from({ length: 10 }, (_, i) => ({
      messages: i < 2 ? conversationText : `plain text ${i}`,
    }));
    const result = detectFieldTypes(rows, ['messages']);
    expect(result.messages.detectedType).not.toBe('conversation');
  });

  it('does not detect conversation for single-line text', () => {
    const rows = Array.from({ length: 5 }, () => ({
      messages: '[user] hello',
    }));
    const result = detectFieldTypes(rows, ['messages']);
    // Only 1 line, not >= 2
    expect(result.messages.detectedType).not.toBe('conversation');
  });

  it('detects human/bot as conversation roles', () => {
    const conversationText = '[human] hello\n\n[bot] hi there';
    const rows = Array.from({ length: 10 }, () => ({
      messages: conversationText,
    }));
    const result = detectFieldTypes(rows, ['messages']);
    expect(result.messages.detectedType).toBe('conversation');
  });

  it('detects ai as conversation role', () => {
    const conversationText = '[user] hello\n\n[ai] hi there';
    const rows = Array.from({ length: 10 }, () => ({
      messages: conversationText,
    }));
    const result = detectFieldTypes(rows, ['messages']);
    expect(result.messages.detectedType).toBe('conversation');
  });

  it('handles missing keys gracefully (undefined values are skipped)', () => {
    const rows = [{ a: 1 }, { b: 2 }];
    const result = detectFieldTypes(rows, ['a', 'b']);
    // Each key only appears in 1 row, but both are numbers
    expect(result.a.detectedType).toBe('number');
    expect(result.b.detectedType).toBe('number');
  });

  it('handles empty rows', () => {
    const result = detectFieldTypes([], ['a', 'b']);
    expect(result.a).toEqual({ detectedType: 'string', isLongString: false, emptyRate: 0, constantRate: 0 });
    expect(result.b).toEqual({ detectedType: 'string', isLongString: false, emptyRate: 0, constantRate: 0 });
  });

  it('samples at most SAMPLE_SIZE_FOR_TYPE rows', () => {
    const rows = Array.from({ length: 100 }, () => ({
      animal: 'cat',
    }));
    const result = detectFieldTypes(rows, ['animal']);
    expect(result.animal.detectedType).toBe('enum');
  });
});

// ===== isConversationLikeArray =====

describe('isConversationLikeArray', () => {
  it('returns false for empty array', () => {
    expect(isConversationLikeArray([])).toBe(false);
  });

  it('returns false for single-item array', () => {
    expect(isConversationLikeArray([{ role: 'user' }])).toBe(false);
  });

  it('returns true for 2-item conversation array', () => {
    expect(isConversationLikeArray([
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'hello' },
    ])).toBe(true);
  });

  it('returns true for large conversation arrays (no size limit)', () => {
    const arr = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`,
    }));
    expect(isConversationLikeArray(arr)).toBe(true);
  });

  it('returns true for 418-item array (real badcase size)', () => {
    const arr = Array.from({ length: 418 }, (_, i) => ({
      role: i % 3 === 0 ? 'system' : i % 3 === 1 ? 'user' : 'assistant',
      content: `msg ${i}`,
    }));
    expect(isConversationLikeArray(arr)).toBe(true);
  });

  it('returns false when items lack "role" key', () => {
    expect(isConversationLikeArray([
      { text: 'hello' },
      { text: 'world' },
    ])).toBe(false);
  });

  it('returns false for non-object items', () => {
    expect(isConversationLikeArray(['a', 'b'])).toBe(false);
  });

  it('returns false when first item is null', () => {
    expect(isConversationLikeArray([null, { role: 'user' }])).toBe(false);
  });

  it('returns false when first items have role but later ones do not', () => {
    // Only checks first 5 items (sampleLimit)
    expect(isConversationLikeArray([
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'hi' },
      { text: 'no role' },  // This won't be checked (sampleLimit=5)
    ])).toBe(true);
  });
});

// ===== flattenValue: conversation array handling =====

describe('flattenValue > conversation arrays', () => {
  it('formats small conversation arrays as single field', () => {
    const arr = [
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'hello' },
    ];
    const result = flattenValue(arr, 'messages');
    expect(result['messages']).toContain('[system] be helpful');
    expect(result['messages']).toContain('[user] hello');
    expect(result['messages.[0]']).toBeUndefined();
  });

  it('formats large conversation arrays (26 items) as single field', () => {
    const arr = Array.from({ length: 26 }, (_, i) => ({
      role: i % 3 === 0 ? 'system' : i % 3 === 1 ? 'user' : 'assistant',
      content: `message content ${i} with some detail`,
    }));
    const result = flattenValue(arr, 'messages');
    expect(result['messages']).toContain('[system] message content 0');
    expect(result['messages']).toContain('[user] message content 1');
    expect(result['messages']).toContain('[assistant] message content 2');
    // Should NOT have index-based keys
    expect(result['messages.[0]']).toBeUndefined();
    expect(result['messages.[25]']).toBeUndefined();
  });

  it('formats very large conversation arrays (418 items)', () => {
    const arr = Array.from({ length: 418 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg ${i}`,
    }));
    const result = flattenValue(arr, 'messages');
    expect(result['messages']).toContain('[user] msg 0');
    expect(result['messages']).toContain('[assistant] msg 1');
    expect(Object.keys(result).length).toBe(1);
  });
});

// ===== Full pipeline: badcase-style data =====

describe('badcase data pipeline', () => {
  /**
   * Simulate the worker's expandRecord function.
   */
  function expandRecord(record) {
    const MAX_EXPAND_DEPTH = 5;
    let depth = 0;
    let topKeys = new Set(Object.keys(record));

    let result = { ...record };

    for (let d = 0; d < MAX_EXPAND_DEPTH; d++) {
      let expanded = false;
      for (const [key, value] of Object.entries(result)) {
        if (key.startsWith('_raw_')) continue;
        if (typeof value !== 'string') continue;
        const parsed = tryParseJsonString(value);
        if (parsed !== null) {
          const flat = flattenValue(parsed, key);
          for (const fk of Object.keys(flat)) {
            const lastSegment = fk.includes('.') ? fk.split('.').slice(-1)[0] : fk;
            if (topKeys.has(lastSegment)) delete flat[fk];
          }
          if (Object.keys(flat).length > 0) {
            result[`_raw_${key}`] = value;
            for (const [fk, fv] of Object.entries(flat)) {
              result[fk] = fv;
            }
            delete result[key];
            expanded = true;
          }
        }
      }
      if (!expanded) break;
      for (const k of Object.keys(result)) {
        if (!k.startsWith('_raw_')) topKeys.add(k);
      }
    }

    return result;
  }

  /**
   * Create a mock badcase record matching the real data structure.
   */
  function makeBadcaseRecord(opts = {}) {
    const messages = opts.messages || [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am fine, thanks!' },
    ];
    const requestData = JSON.stringify({
      model: 'test-model',
      messages,
      stream: true,
      max_tokens: 4096,
    });
    const message = JSON.stringify({
      RequestID: 'req-001',
      Model: 'test-model',
      Cost: 12345,
      FinishReason: 'stop',
      RequestData: requestData,
      AnswerContent: 'This is the answer content.',
      OutputTokens: 100,
      InputTokens: 50,
    });

    return {
      '@timestamp': '2026-04-07 13:13:26.062',
      '@offset': 100,
      '@host': '11.139.24.219',
      level: 'info',
      '@message': message,
      // These duplicate keys from inside @message exist at top level
      RequestID: 'req-001',
      Model: 'test-model',
      Cost: 12345,
      FinishReason: 'stop',
      RequestData: requestData,
      AnswerContent: 'This is the answer content.',
      OutputTokens: 100,
      InputTokens: 50,
    };
  }

  it('expands nested JSON strings and formats conversation', () => {
    const record = makeBadcaseRecord();
    const expanded = expandRecord(record);

    // RequestData should be expanded
    expect(expanded['RequestData.messages']).toBeDefined();
    expect(expanded['RequestData.model']).toBeDefined();

    // Conversation field should be formatted as [role] content
    const conv = expanded['RequestData.messages'];
    expect(conv).toContain('[system] You are helpful.');
    expect(conv).toContain('[user] Hello!');
    expect(conv).toContain('[assistant] Hi there!');
    expect(conv).toContain('[user] How are you?');
    expect(conv).toContain('[assistant] I am fine, thanks!');
  });

  it('detects conversation type for multi-turn dialog', () => {
    const record = makeBadcaseRecord();
    const expanded = expandRecord(record);

    const allKeys = Object.keys(expanded).filter(k => !k.startsWith('_raw_'));
    const result = detectFieldTypes([expanded], allKeys);

    expect(result['RequestData.messages'].detectedType).toBe('conversation');
  });

  it('handles 26-message conversation (record 1 from real data)', () => {
    const messages = Array.from({ length: 26 }, (_, i) => ({
      role: i === 0 ? 'system' : i % 2 === 1 ? 'user' : 'assistant',
      content: `Message number ${i} with some content detail here.`,
    }));
    const record = makeBadcaseRecord({ messages });
    const expanded = expandRecord(record);

    const conv = expanded['RequestData.messages'];
    expect(conv).toContain('[system] Message number 0');
    expect(conv).toContain('[user] Message number 1');
    expect(conv).toContain('[assistant] Message number 2');
    // Should be a single formatted field, not expanded by index
    expect(conv).not.toContain('[0]');
  });

  it('handles 418-message conversation (max from real data)', () => {
    const messages = Array.from({ length: 418 }, (_, i) => ({
      role: i === 0 ? 'system' : i % 2 === 1 ? 'user' : 'assistant',
      content: `Turn ${i}: some conversation content here.`,
    }));
    const record = makeBadcaseRecord({ messages });
    const expanded = expandRecord(record);

    const conv = expanded['RequestData.messages'];
    expect(conv).toContain('[system] Turn 0');
    expect(conv).toContain('[user] Turn 1');
    // Index 417 is odd → role is 'user'
    expect(conv).toContain('[user] Turn 417');

    const allKeys = Object.keys(expanded).filter(k => !k.startsWith('_raw_'));
    const typeInfo = detectFieldTypes([expanded], allKeys);
    expect(typeInfo['RequestData.messages'].detectedType).toBe('conversation');
  });

  it('handles 2-message conversation (23 of 72 records)', () => {
    const messages = [
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'Hello!' },
    ];
    const record = makeBadcaseRecord({ messages });
    const expanded = expandRecord(record);

    const conv = expanded['RequestData.messages'];
    expect(conv).toContain('[system] Be helpful.');
    expect(conv).toContain('[user] Hello!');
  });

  it('@message expansion is skipped due to full dedup but RequestData still expands', () => {
    const record = makeBadcaseRecord();
    const expanded = expandRecord(record);

    // @message expansion is skipped because all @message.* fields are deduplicated
    // with top-level keys (Model, RequestID, etc.)
    // So @message stays as its original JSON string value
    expect(expanded['@message']).toBeDefined();
    expect(typeof expanded['@message']).toBe('string');

    // But the top-level RequestData (a copy) still gets expanded
    expect(expanded['RequestData.messages']).toBeDefined();
    expect(expanded['RequestData.messages']).toContain('[system]');

    // Fields like @message.Model should NOT appear (deduplicated)
    expect(expanded['@message.Model']).toBeUndefined();
    expect(expanded['@message.RequestID']).toBeUndefined();
  });
});

// ===== assignFieldVisibility =====

describe('assignFieldVisibility', () => {
  function makeField(key, opts = {}) {
    return {
      key,
      detectedType: opts.detectedType || 'string',
      isExpanded: opts.isExpanded || false,
    };
  }

  it('conversation field is always visible and sorted first', () => {
    const fields = [
      makeField('@timestamp', { isExpanded: false }),
      makeField('Model', { isExpanded: false }),
      makeField('RequestData.messages', { isExpanded: true, detectedType: 'conversation' }),
      makeField('AnswerContent', { isExpanded: false }),
      makeField('request_id', { isExpanded: false }),
    ];
    assignFieldVisibility(fields, 10);

    // conversation should be first in sorted order
    expect(fields[0].key).toBe('RequestData.messages');
    expect(fields[0].visible).toBe(true);

    const visible = fields.filter(f => f.visible);
    const visibleKeys = visible.map(f => f.key);
    expect(visibleKeys).toContain('RequestData.messages');
    expect(visibleKeys).toContain('Model');
    expect(visibleKeys).toContain('AnswerContent');
    // @timestamp and request_id are low priority, hidden
    expect(visibleKeys).not.toContain('@timestamp');
    expect(visibleKeys).not.toContain('request_id');
  });

  it('high-priority fields (AnswerContent, ReasoningContent, Cost) are visible', () => {
    const fields = [
      makeField('ReasoningContent', { isExpanded: false }),
      makeField('AnswerContent', { isExpanded: false }),
      makeField('Cost', { isExpanded: false }),
      makeField('OutputTokens', { isExpanded: false }),
      makeField('FinishReason', { isExpanded: false }),
      makeField('ErrorMessage', { isExpanded: false }),
    ];
    assignFieldVisibility(fields, 10);

    const visible = fields.filter(f => f.visible);
    expect(visible.length).toBe(6);
  });

  it('low-priority fields (@timestamp, trace_id, service) are hidden', () => {
    const fields = [
      makeField('@timestamp'),
      makeField('trace_id'),
      makeField('service'),
      makeField('span_id'),
      makeField('local_addr'),
    ];
    assignFieldVisibility(fields, 10);

    expect(fields.every(f => f.visible === false)).toBe(true);
  });

  it('case-insensitive dedup: RequestData.model not shown when Model exists', () => {
    const fields = [
      makeField('Model', { isExpanded: false }),
      makeField('AnswerContent', { isExpanded: false }),
      makeField('ReasoningContent', { isExpanded: false }),
      makeField('RequestData.model', { isExpanded: true }),
      makeField('RequestData.stream', { isExpanded: true }),
      makeField('FinishReason', { isExpanded: false }),
      makeField('Cost', { isExpanded: false }),
      makeField('OutputTokens', { isExpanded: false }),
    ];
    assignFieldVisibility(fields, 10);

    const visible = fields.filter(f => f.visible);
    const visibleKeys = visible.map(f => f.key);
    // Model is visible, RequestData.model should be deduped (hidden)
    expect(visibleKeys).toContain('Model');
    expect(visibleKeys).not.toContain('RequestData.model');
    // RequestData.stream is also deduped if stream existed (it doesn't here, so it's an expanded field, not auto-visible unless conversation)
    expect(visibleKeys).not.toContain('RequestData.stream');
  });

  it('respects maxVisible limit', () => {
    const fields = [
      makeField('Model'),
      makeField('AnswerContent'),
      makeField('ReasoningContent'),
      makeField('Cost'),
      makeField('OutputTokens'),
      makeField('InputTokens'),
      makeField('TotalTokens'),
      makeField('FinishReason'),
      makeField('ErrorMessage'),
      makeField('ErrorCode'),
      makeField('FirstCharCost'),  // 11th — should be hidden
    ];
    assignFieldVisibility(fields, 10);

    const visible = fields.filter(f => f.visible);
    expect(visible.length).toBe(10);
    expect(visible[visible.length - 1].key).not.toBe('FirstCharCost');
  });

  it('realistic badcase: only key fields visible, metadata hidden, no duplicates', () => {
    const fields = [
      // High priority (original fields)
      makeField('Model'),
      makeField('FinishReason'),
      makeField('AnswerContent'),
      makeField('ReasoningContent'),
      makeField('Cost'),
      makeField('OutputTokens'),
      makeField('InputTokens'),
      makeField('TotalTokens'),
      makeField('AnswerTokens'),
      makeField('ReasoningTokens'),
      makeField('FirstCharCost'),
      makeField('ErrorMessage'),
      makeField('ErrorCode'),
      makeField('IsStream'),
      makeField('Tapp'),
      makeField('Interface'),
      // Low priority (metadata)
      makeField('@timestamp'),
      makeField('@offset'),
      makeField('@host'),
      makeField('@log_size'),
      makeField('@message'),
      makeField('request_id'),
      makeField('trace_id'),
      makeField('span_id'),
      makeField('service'),
      makeField('func'),
      makeField('local_addr'),
      makeField('remote_addr'),
      makeField('tinymsg'),
      // Expanded from RequestData — should be deduped or hidden
      makeField('RequestData.messages', { isExpanded: true, detectedType: 'conversation' }),
      makeField('RequestData.model', { isExpanded: true }),
      makeField('RequestData.stream', { isExpanded: true }),
      makeField('RequestData.max_tokens', { isExpanded: true }),
      makeField('RequestData.temperature', { isExpanded: true }),
      makeField('RequestData.top_p', { isExpanded: true }),
    ];
    assignFieldVisibility(fields, 10);

    const visible = fields.filter(f => f.visible);
    const visibleKeys = visible.map(f => f.key);

    // Conversation always visible
    expect(visibleKeys).toContain('RequestData.messages');

    // High priority visible (up to limit)
    expect(visibleKeys).toContain('Model');
    expect(visibleKeys).toContain('AnswerContent');
    expect(visibleKeys).toContain('ReasoningContent');
    expect(visibleKeys).toContain('FinishReason');

    // Duplicates hidden
    expect(visibleKeys).not.toContain('RequestData.model');

    // Metadata hidden
    expect(visibleKeys).not.toContain('@timestamp');
    expect(visibleKeys).not.toContain('request_id');
    expect(visibleKeys).not.toContain('trace_id');

    // Conversation is first in sort order
    expect(visible[0].key).toBe('RequestData.messages');
  });

  it('assigns visibilityReason to all fields', () => {
    const fields = [
      makeField('Model'),
      makeField('some_field'),
      makeField('@timestamp'),
      makeField('RequestData.model', { isExpanded: true }),
      makeField('RequestData.messages', { isExpanded: true, detectedType: 'conversation' }),
    ];
    assignFieldVisibility(fields, 10);

    // Every field should have a visibilityReason
    for (const f of fields) {
      expect(f.visibilityReason).toBeTruthy();
    }

    const conv = fields.find(f => f.key === 'RequestData.messages');
    expect(conv.visibilityReason).toBe('conversation');

    const model = fields.find(f => f.key === 'Model');
    expect(model.visibilityReason).toBe('highPriority');

    const ts = fields.find(f => f.key === '@timestamp');
    expect(ts.visibilityReason).toBe('lowPriority');

    const expanded = fields.find(f => f.key === 'RequestData.model');
    // RequestData.model is deduped against top-level Model → reason is 'duplicate'
    expect(expanded.visibilityReason).toBe('duplicate');
  });

  it('hides fields with >95% empty rate via penalty', () => {
    const fields = [
      { key: 'always_null', detectedType: 'string', isExpanded: false, emptyRate: 0.96 },
      { key: 'populated', detectedType: 'string', isExpanded: false, emptyRate: 0.1 },
    ];
    assignFieldVisibility(fields, 10);

    const nullField = fields.find(f => f.key === 'always_null');
    expect(nullField.visible).toBe(false);
    expect(nullField.visibilityReason).toBe('mostlyEmpty');

    const popField = fields.find(f => f.key === 'populated');
    expect(popField.visible).toBe(true);
  });

  it('high-priority field with high empty rate still visible', () => {
    const fields = [
      { key: 'model_name', detectedType: 'string', isExpanded: false, emptyRate: 0.90 },
      { key: 'other', detectedType: 'string', isExpanded: false, emptyRate: 0 },
    ];
    assignFieldVisibility(fields, 10);

    // model_name matches /model/i → priority -50 + 20 (empty penalty) = -30 → still < 30 → visible
    const modelField = fields.find(f => f.key === 'model_name');
    expect(modelField.visible).toBe(true);
  });

  it('pattern matching: *_id suffix is low priority', () => {
    const fields = [
      makeField('request_id'),
      makeField('some_id'),
      makeField('normal_field'),
    ];
    assignFieldVisibility(fields, 10);

    expect(fields.find(f => f.key === 'request_id').visible).toBe(false);
    expect(fields.find(f => f.key === 'some_id').visible).toBe(false);
    expect(fields.find(f => f.key === 'normal_field').visible).toBe(true);
  });

  it('pattern matching: *token* and *error* are high priority', () => {
    const fields = [
      makeField('total_tokens'),
      makeField('error_code'),
      makeField('other_field'),
    ];
    assignFieldVisibility(fields, 10);

    // All should be visible but high-priority sorted first
    expect(fields[0].key).toBe('total_tokens');
    expect(fields[1].key).toBe('error_code');
    expect(fields[0].visible).toBe(true);
    expect(fields[1].visible).toBe(true);
  });
});

// ===== detectFieldTypes: empty rate =====

describe('detectFieldTypes empty rate', () => {
  it('computes emptyRate for all-empty field', () => {
    const rows = [
      { a: '', b: 42 },
      { a: '', b: 43 },
      { a: null, b: 44 },
    ];
    const result = detectFieldTypes(rows, ['a', 'b']);
    expect(result.a.emptyRate).toBe(1);
    expect(result.a.detectedType).toBe('string');
    expect(result.b.emptyRate).toBe(0);
    expect(result.b.detectedType).toBe('number');
  });

  it('computes emptyRate for partially empty field', () => {
    const rows = [
      { a: 'hello', b: 1 },
      { a: '', b: 2 },
      { a: undefined, b: 3 },
      { a: 'world', b: 4 },
    ];
    const result = detectFieldTypes(rows, ['a', 'b']);
    expect(result.a.emptyRate).toBe(0.5);
    expect(result.a.detectedType).toBe('enum'); // 2 unique non-empty values
  });

  it('empty strings no longer inflate enum detection', () => {
    const rows = [
      { status: '' },
      { status: '' },
      { status: '' },
    ];
    const result = detectFieldTypes(rows, ['status']);
    // Previously: '' counted as string → 1 unique value → enum
    // Now: '' is empty → emptyRate=1, total=0 → default 'string'
    expect(result.status.detectedType).toBe('string');
    expect(result.status.emptyRate).toBe(1);
  });
});
