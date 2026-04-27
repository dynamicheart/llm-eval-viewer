/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

export function formatNumber(value) {
  if (typeof value !== 'number') return value;
  if (Number.isInteger(value)) return value.toLocaleString();
  // 小数位不超过4位则原样显示
  const full = value.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
  const decLen = full.split('.')[1]?.length ?? 0;
  if (decLen <= 4) return full;
  // 小数位5-6位：原样显示（如 0.00001）
  if (decLen <= 6) return full;
  // 小数位超过6位，用toFixed(4)；若截断后为0，改用4位有效数字
  const f4 = value.toFixed(4);
  if (parseFloat(f4) === 0) return value.toPrecision(4);
  return parseFloat(f4).toLocaleString('en-US', { maximumFractionDigits: 4 });
}
