/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Plugin-style experiment config name parsers
 *
 * Each parser: { name, test(dirName), parse(dirName) → { label, detail } }
 * Try test() on each parser, first match executes parse().
 * Falls back to "Experiment N" if no match.
 */

import i18n from '@/i18n';

const t = (key, named) => i18n.global.t(key, named || {});

const parsers = [
  {
    name: 'kunlunxin',
    // Match: YYYYMMDD_HHMMSS_{config_tag}
    test: (name) => /^\d{8}_\d{6}_.+/.test(name),
    parse: (name) => {
      // Remove timestamp prefix
      const ts = name.slice(0, 15); // YYYYMMDD_HHMMSS
      const configTag = name.slice(16); // Remaining part

      const parts = configTag.split('_');

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
 * Parse experiment directory name
 * @param {string} dirName - Experiment directory name (second level)
 * @param {number} index - Index (for fallback)
 * @returns {{ label: string, detail: object }}
 */
export function parseExperimentName(dirName, index) {
  for (const parser of parsers) {
    if (parser.test(dirName)) {
      return parser.parse(dirName);
    }
  }
  return {
    label: t('configParsers.experimentFallback', { n: index + 1 }),
    detail: { raw: dirName },
  };
}

/**
 * Parse service directory name
 * @param {string} dirName - Service directory name (first level)
 * @returns {{ serviceTag: string, ip: string, port: string }}
 */
export function parseServiceDir(dirName) {
  // Format: {service_tag}_{ip}_{port}
  const match = dirName.match(/^(.+?)_(\d+\.\d+\.\d+\.\d+)_(\d+)$/);
  if (match) {
    return { serviceTag: match[1], ip: match[2], port: match[3] };
  }
  return { serviceTag: dirName, ip: '', port: '' };
}
