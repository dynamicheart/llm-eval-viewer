/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { describe, it, expect } from 'vitest';
import {
  parseContent,
  getSolutionFromSample,
  getSampleIdReviews,
  getSampleIdPredictions,
  getPriorityValue,
} from './jsonlHelpers';

// ===== parseContent =====

describe('parseContent', () => {
  it('returns empty result for falsy input', () => {
    expect(parseContent(null)).toEqual({ reasoning: null, text: '' });
    expect(parseContent(undefined)).toEqual({ reasoning: null, text: '' });
    expect(parseContent('')).toEqual({ reasoning: null, text: '' });
  });

  it('wraps a plain string', () => {
    expect(parseContent('hello world')).toEqual({ reasoning: null, text: 'hello world' });
  });

  it('extracts reasoning and text from array content', () => {
    const content = [
      { type: 'reasoning', reasoning: 'Let me think...' },
      { type: 'text', text: 'The answer is 42' },
    ];
    expect(parseContent(content)).toEqual({
      isReasoning: true,
      reasoning: 'Let me think...',
      text: 'The answer is 42',
    });
  });

  it('handles array with only text item', () => {
    const content = [{ type: 'text', text: 'just text' }];
    expect(parseContent(content)).toEqual({ isReasoning: false, reasoning: null, text: 'just text' });
  });

  it('handles array with only reasoning item', () => {
    const content = [{ type: 'reasoning', reasoning: 'thinking' }];
    expect(parseContent(content)).toEqual({ isReasoning: true, reasoning: 'thinking', text: '' });
  });

  it('handles array with empty reasoning field', () => {
    const content = [
      { type: 'reasoning', reasoning: '' },
      { type: 'text', text: 'answer' },
    ];
    expect(parseContent(content)).toEqual({ isReasoning: true, reasoning: null, text: 'answer' });
  });

  it('returns empty result for non-string non-array objects', () => {
    expect(parseContent({ foo: 'bar' })).toEqual({ reasoning: null, text: '' });
    expect(parseContent(123)).toEqual({ reasoning: null, text: '' });
  });
});

// ===== getSolutionFromSample =====

describe('getSolutionFromSample', () => {
  const FAIL = 'Parse failed';

  it('returns solution when sample_metadata.solution is a non-empty string', () => {
    const json = { sample_score: { sample_metadata: { solution: 'x = 42' } } };
    expect(getSolutionFromSample(json, FAIL)).toEqual({
      type: 'solution',
      content: 'x = 42',
      render: 'markdown',
    });
  });

  it('ignores whitespace-only solution string', () => {
    const json = { sample_score: { sample_metadata: { solution: '   ' } } };
    const result = getSolutionFromSample(json, FAIL);
    // Falls through to metadata branch since meta has keys
    expect(result.type).toBe('metadata');
    expect(result.render).toBe('json');
  });

  it('returns metadata JSON when sample_metadata has keys but no solution', () => {
    const json = { sample_score: { sample_metadata: { question_id: '123', difficulty: 'hard' } } };
    const result = getSolutionFromSample(json, FAIL);
    expect(result.type).toBe('metadata');
    expect(result.render).toBe('json');
    expect(JSON.parse(result.content)).toEqual({ question_id: '123', difficulty: 'hard' });
  });

  it('falls back to score.metadata when sample_metadata is empty', () => {
    const json = { sample_score: { score: { metadata: { key: 'val' } } } };
    const result = getSolutionFromSample(json, FAIL);
    expect(result.type).toBe('metadata');
    expect(JSON.parse(result.content)).toEqual({ key: 'val' });
  });

  it('returns empty fallback when nothing is available', () => {
    expect(getSolutionFromSample({}, FAIL)).toEqual({
      type: 'empty',
      content: FAIL,
      render: 'text',
    });
  });

  it('handles null json gracefully', () => {
    expect(getSolutionFromSample(null, FAIL)).toEqual({
      type: 'empty',
      content: FAIL,
      render: 'text',
    });
  });
});

// ===== getSampleIdReviews =====

describe('getSampleIdReviews', () => {
  it('prefers question_id', () => {
    const json = { sample_score: { sample_metadata: { question_id: 'q1', problem_id: 'p1' }, sample_id: 's1' } };
    expect(getSampleIdReviews(json, 0)).toBe('q1');
  });

  it('falls back to problem_id', () => {
    const json = { sample_score: { sample_metadata: { problem_id: 'p1' } } };
    expect(getSampleIdReviews(json, 0)).toBe('p1');
  });

  it('falls back to task_id', () => {
    const json = { sample_score: { sample_metadata: { task_id: 't1' } } };
    expect(getSampleIdReviews(json, 0)).toBe('t1');
  });

  it('falls back to sample_id', () => {
    const json = { sample_score: { sample_id: 's1' } };
    expect(getSampleIdReviews(json, 0)).toBe('s1');
  });

  it('falls back to row_N', () => {
    expect(getSampleIdReviews({}, 5)).toBe('row_6');
  });
});

// ===== getSampleIdPredictions =====

describe('getSampleIdPredictions', () => {
  it('prefers question_id from metadata', () => {
    const json = { metadata: { question_id: 'q1', problem_id: 'p1' } };
    expect(getSampleIdPredictions(json, 0)).toBe('q1');
  });

  it('falls back to row_N', () => {
    expect(getSampleIdPredictions({}, 3)).toBe('row_4');
  });
});

// ===== getPriorityValue =====

describe('getPriorityValue', () => {
  it('returns first matching field value', () => {
    expect(getPriorityValue({ acc: 0.95, pass: 1 })).toBe(0.95);
  });

  it('skips undefined fields', () => {
    expect(getPriorityValue({ pass: 1 })).toBe(1);
  });

  it('returns 0 as a valid value (not skipped)', () => {
    expect(getPriorityValue({ acc: 0 })).toBe(0);
  });

  it('returns false as a valid value (not skipped)', () => {
    expect(getPriorityValue({ acc: false })).toBe(false);
  });

  it('returns empty string when no fields match', () => {
    expect(getPriorityValue({})).toBe('');
    expect(getPriorityValue(null)).toBe('');
  });
});
