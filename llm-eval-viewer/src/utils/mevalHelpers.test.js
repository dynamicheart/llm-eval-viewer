/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { describe, it, expect } from 'vitest';
import { inferDataset } from './mevalHelpers';

describe('inferDataset', () => {
  it('returns GPQA for Chemistry/Physics/Biology', () => {
    expect(inferDataset('Chemistry', '', '', '未知')).toBe('GPQA');
    expect(inferDataset('Physics', '', '', '未知')).toBe('GPQA');
    expect(inferDataset('Biology', '', '', '未知')).toBe('GPQA');
  });

  it('trims whitespace from category2', () => {
    expect(inferDataset('  Chemistry  ', '', '', '未知')).toBe('GPQA');
  });

  it('returns LiveCodeBench for easy/medium/hard', () => {
    expect(inferDataset('easy', '', '', '未知')).toBe('LiveCodeBench');
    expect(inferDataset('medium', '', '', '未知')).toBe('LiveCodeBench');
    expect(inferDataset('hard', '', '', '未知')).toBe('LiveCodeBench');
  });

  it('returns HumanEval when question contains signature marker', () => {
    expect(inferDataset('', 'Given function signature and docstring, complete it', '', '未知')).toBe('HumanEval');
  });

  it('returns AIME25 for calculation question with pid >= 44243093', () => {
    expect(inferDataset('', 'This is a calculation question', '44243093', '未知')).toBe('AIME25');
    expect(inferDataset('', 'This is a calculation question', '50000000', '未知')).toBe('AIME25');
  });

  it('returns AIME24 for calculation question with pid < 44243093', () => {
    expect(inferDataset('', 'This is a calculation question', '44243092', '未知')).toBe('AIME24');
    expect(inferDataset('', 'This is a calculation question', '1000000', '未知')).toBe('AIME24');
  });

  it('returns AIME for calculation question with non-numeric promptId', () => {
    expect(inferDataset('', 'This is a calculation question', 'abc', '未知')).toBe('AIME');
    expect(inferDataset('', 'This is a calculation question', '', '未知')).toBe('AIME');
  });

  it('falls back to category2 when present', () => {
    expect(inferDataset('CustomDataset', 'some question', '', '未知')).toBe('CustomDataset');
  });

  it('falls back to unknownLabel when category2 is empty', () => {
    expect(inferDataset('', 'some question', '', '未知')).toBe('未知');
    expect(inferDataset(null, 'some question', '', 'Unknown')).toBe('Unknown');
  });
});
