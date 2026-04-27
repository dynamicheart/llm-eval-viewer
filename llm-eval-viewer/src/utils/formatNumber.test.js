/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

import { describe, it, expect } from 'vitest';
import { formatNumber } from './formatNumber';

describe('formatNumber', () => {
  it('passes through non-number values', () => {
    expect(formatNumber('hello')).toBe('hello');
    expect(formatNumber(null)).toBe(null);
    expect(formatNumber(undefined)).toBe(undefined);
  });

  it('formats integers with locale separators', () => {
    expect(formatNumber(42)).toBe('42');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('keeps short decimals as-is', () => {
    expect(formatNumber(3.14)).toBe('3.14');
    expect(formatNumber(0.0001)).toBe('0.0001');
    expect(formatNumber(0.00001)).toBe('0.00001');
  });

  it('truncates long decimals to 4 decimal places', () => {
    expect(formatNumber(12.345678)).toBe('12.3457');
    expect(formatNumber(1234.56789)).toBe('1,234.5679');
    expect(formatNumber(0.123456789)).toBe('0.1235');
  });

  it('falls back to 4 significant digits when toFixed gives 0', () => {
    expect(formatNumber(0.000012345)).toBe('0.00001234');
    expect(formatNumber(0.0000012345)).toBe('0.000001234');
  });
});
