/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { ref, watch } from 'vue';

/**
 * Single-pass statistics computation for view data.
 *
 * Instead of letting each component independently iterate over tableData,
 * this composable watches tableData and computes all needed statistics
 * in one pass. Components receive pre-computed results as props.
 *
 * @param {import('vue').Ref<Array>} tableData - Reactive table data array
 * @param {Object} config
 * @param {string[]} [config.distributionFields] - Field names to compute distributions for
 * @param {Array<{key: string, label: string, color: string}>} [config.histogramFields] - Fields for histogram
 * @param {Object} [config.datasetStats] - Dataset stats config
 * @param {string} config.datasetStats.datasetField - Field name for dataset grouping
 * @param {string} config.datasetStats.resultField - Field name for result values
 * @param {string} config.datasetStats.resultFalseValue - Value considered "wrong" (e.g. '0')
 * @param {string} config.datasetStats.finishReasonField - Field name for finish reason
 * @param {string} config.datasetStats.promptTokenField - Field name for prompt tokens
 * @param {string} config.datasetStats.completionTokenField - Field name for completion tokens
 * @param {string} [config.datasetStats.unknownLabel] - Label for unknown dataset
 */
export function useViewStats(tableData, config = {}) {
  const {
    distributionFields = [],
    histogramFields = [],
    datasetStats: dsConfig = null,
  } = config;

  // ===== Output refs =====

  // { [fieldName]: [ { key, label, count, percentage } ] }
  const distributions = ref({});

  // { [fieldKey]: { values: number[], avg: string } }
  const histogramData = ref({});

  // Dataset stats (only if dsConfig provided)
  const datasetStatsRows = ref([]);
  const globalStats = ref({ totalSamples: 0, avgPrompt: '-', avgComp: '-' });

  // ===== Single-pass computation =====

  function recompute() {
    const data = tableData.value;
    const len = data.length;

    if (len === 0) {
      distributions.value = {};
      histogramData.value = {};
      datasetStatsRows.value = [];
      globalStats.value = { totalSamples: 0, avgPrompt: '-', avgComp: '-' };
      return;
    }

    // Accumulators
    const distMaps = {};
    for (const field of distributionFields) {
      distMaps[field] = new Map();
    }

    const histAccum = {};
    for (const field of histogramFields) {
      histAccum[field.key] = { values: [], sum: 0, count: 0 };
    }

    let dsMap = null;
    let globalPromptSum = 0, globalPromptCount = 0;
    let globalCompSum = 0, globalCompCount = 0;

    if (dsConfig) {
      dsMap = {};
    }

    // === Single pass ===
    for (let i = 0; i < len; i++) {
      const row = data[i];

      // Distributions
      for (const field of distributionFields) {
        const key = row[field] ?? '__unknown__';
        const map = distMaps[field];
        map.set(key, (map.get(key) || 0) + 1);
      }

      // Histograms
      for (const field of histogramFields) {
        const v = row[field.key];
        if (typeof v === 'number' && v >= 0) {
          histAccum[field.key].values.push(v);
          histAccum[field.key].sum += v;
          histAccum[field.key].count += 1;
        }
      }

      // Dataset stats
      if (dsConfig) {
        const ds = row[dsConfig.datasetField] || dsConfig.unknownLabel || 'Unknown';
        if (!dsMap[ds]) {
          dsMap[ds] = { dataset: ds, total: 0, correct: 0, nonStopCount: 0, promptSum: 0, compSum: 0, tokenCount: 0 };
        }
        const entry = dsMap[ds];
        entry.total += 1;

        const result = row[dsConfig.resultField];
        if (result && result !== dsConfig.resultFalseValue) entry.correct += 1;

        const fr = row[dsConfig.finishReasonField];
        if (fr && fr !== 'stop') entry.nonStopCount += 1;

        const pt = Number(row[dsConfig.promptTokenField]);
        const ct = Number(row[dsConfig.completionTokenField]);
        if (pt >= 0 || ct >= 0) {
          entry.promptSum += (pt >= 0 ? pt : 0);
          entry.compSum += (ct >= 0 ? ct : 0);
          entry.tokenCount += 1;
        }

        // Global token averages
        if (pt >= 0) { globalPromptSum += pt; globalPromptCount++; }
        if (ct >= 0) { globalCompSum += ct; globalCompCount++; }
      }
    }

    // === Build distribution output ===
    const newDist = {};
    for (const field of distributionFields) {
      const map = distMaps[field];
      newDist[field] = Array.from(map.entries()).map(([key, count]) => ({
        key,
        label: String(key),
        count,
        percentage: ((count / len) * 100).toFixed(1),
      }));
    }
    distributions.value = newDist;

    // === Build histogram output ===
    const newHist = {};
    for (const field of histogramFields) {
      const acc = histAccum[field.key];
      newHist[field.key] = {
        values: acc.values,
        avg: acc.count > 0 ? (acc.sum / acc.count).toFixed(1) : '-',
      };
    }
    histogramData.value = newHist;

    // === Build dataset stats output ===
    if (dsConfig && dsMap) {
      datasetStatsRows.value = Object.values(dsMap).map((item) => ({
        ...item,
        wrong: item.total - item.correct,
        accuracy: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0,
        avgPromptTokens: item.tokenCount > 0 ? Math.round(item.promptSum / item.tokenCount) : '-',
        avgCompletionTokens: item.tokenCount > 0 ? Math.round(item.compSum / item.tokenCount) : '-',
      })).sort((a, b) => b.total - a.total);

      globalStats.value = {
        totalSamples: len,
        avgPrompt: globalPromptCount > 0 ? Math.round(globalPromptSum / globalPromptCount) : '-',
        avgComp: globalCompCount > 0 ? Math.round(globalCompSum / globalCompCount) : '-',
      };
    } else {
      datasetStatsRows.value = [];
      globalStats.value = { totalSamples: len, avgPrompt: '-', avgComp: '-' };
    }
  }

  // Watch tableData reference changes (not deep — data is replaced, not mutated)
  watch(tableData, recompute);

  // Initial computation
  recompute();

  return {
    distributions,
    histogramData,
    datasetStatsRows,
    globalStats,
  };
}
