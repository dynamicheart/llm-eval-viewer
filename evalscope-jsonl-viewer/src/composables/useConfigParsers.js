/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * 插件式实验配置名解析器
 *
 * 每个 parser: { name, test(dirName), parse(dirName) → { label, detail } }
 * 逐个尝试 test()，首个匹配的 parser 执行 parse()。
 * 全部不匹配则 fallback 为 "实验 N"。
 */

const parsers = [
  {
    name: 'kunlunxin',
    // 匹配: YYYYMMDD_HHMMSS_{config_tag}
    test: (name) => /^\d{8}_\d{6}_.+/.test(name),
    parse: (name) => {
      // 去掉时间戳前缀
      const ts = name.slice(0, 15); // YYYYMMDD_HHMMSS
      const configTag = name.slice(16); // 剩余部分

      const parts = configTag.split('_');

      // 尝试提取各字段
      let weightParts = [];
      let sampling = '';
      let effort = '';
      let flags = [];
      let serverParts = [];

      const samplingValues = ['strict', 'rejection', 'rand'];
      const effortValues = ['high', 'low', 'none', 'thinking', 'enable'];
      const flagValues = ['mtp2', 'penalty', 'fafast', 'projfast', 'rparser'];
      const serverKeywords = ['single', '2p2d', '4p4d', 'tp8', 'tp4', 'ep16', 'ep8'];

      let phase = 'weight'; // weight → sampling → effort → flags → server

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];

        if (phase === 'weight') {
          if (p === 'strict') {
            sampling = 'Strict';
            phase = 'effort';
            continue;
          }
          if (p === 'rejection') {
            // rejection_rand
            sampling = 'Rejection';
            if (parts[i + 1] === 'rand') { i++; sampling = 'Rejection Rand'; }
            phase = 'effort';
            continue;
          }
          weightParts.push(p);
          continue;
        }

        if (phase === 'effort') {
          if (effortValues.includes(p)) {
            if (p === 'enable' && parts[i + 1] === 'thinking') {
              effort = 'enable_thinking';
              i++;
            } else if (p === 'no' && parts[i + 1] === 'thinking') {
              effort = 'no_thinking';
              i++;
            } else {
              effort = p;
            }
            phase = 'flags';
            continue;
          }
          phase = 'flags';
        }

        if (phase === 'flags') {
          if (flagValues.includes(p)) {
            flags.push(p);
            continue;
          }
          phase = 'server';
        }

        if (phase === 'server') {
          serverParts.push(p);
        }
      }

      const weight = weightParts.join('_') || '?';
      const server = serverParts.join('_') || '?';

      const labelParts = [weight];
      if (sampling) labelParts.push(sampling);
      if (effort) labelParts.push(effort);
      if (flags.length) labelParts.push(flags.join('+'));

      return {
        label: labelParts.join(' | '),
        detail: {
          timestamp: ts,
          weight,
          sampling,
          effort,
          flags,
          server,
          raw: configTag,
        },
      };
    },
  },
];

/**
 * 解析实验目录名
 * @param {string} dirName - 实验目录名（第二级）
 * @param {number} index - 序号（fallback 用）
 * @returns {{ label: string, detail: object }}
 */
export function parseExperimentName(dirName, index) {
  for (const parser of parsers) {
    if (parser.test(dirName)) {
      return parser.parse(dirName);
    }
  }
  return {
    label: `实验 ${index + 1}`,
    detail: { raw: dirName },
  };
}

/**
 * 解析服务目录名
 * @param {string} dirName - 服务目录名（第一级）
 * @returns {{ serviceTag: string, ip: string, port: string }}
 */
export function parseServiceDir(dirName) {
  // 格式: {service_tag}_{ip}_{port}
  // IP 格式: a.b.c.d → 从后往前找
  const match = dirName.match(/^(.+?)_(\d+\.\d+\.\d+\.\d+)_(\d+)$/);
  if (match) {
    return { serviceTag: match[1], ip: match[2], port: match[3] };
  }
  return { serviceTag: dirName, ip: '', port: '' };
}
