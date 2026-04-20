/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { ref, watch } from 'vue';

/**
 * Dynamic statistics computation for the Custom Viewer.
 *
 * Unlike useViewStats which reads config arrays once at creation,
 * this composable re-reads config from reactive getters on each recompute,
 * allowing fields to be added/removed at runtime via the field config panel.
 *
 * @param {import('vue').Ref<Array>} tableData - Reactive table data array
 * @param {Object} config
 * @param {Function} config.getDistributionFields - Returns string[] of field names for distributions
 * @param {Function} config.getHistogramFields - Returns Array<{key, label, color}> for histograms
 */
export function useDynamicViewStats(tableData, config = {}) {
  const { getDistributionFields = () => [], getHistogramFields = () => [] } = config;

  const distributions = ref({});
  const histogramData = ref({});
  const globalStats = ref({ totalSamples: 0 });

  function recompute() {
    const data = tableData.value;
    const len = data.length;

    if (len === 0) {
      distributions.value = {};
      histogramData.value = {};
      globalStats.value = { totalSamples: 0 };
      return;
    }

    // Read config dynamically (not cached from creation time)
    const distributionFields = getDistributionFields();
    const histogramFields = getHistogramFields();

    // Accumulators
    const distMaps = {};
    for (const field of distributionFields) {
      distMaps[field] = new Map();
    }

    const histAccum = {};
    for (const field of histogramFields) {
      histAccum[field.key] = { values: [], sum: 0, count: 0 };
    }

    // === Single pass ===
    for (let i = 0; i < len; i++) {
      const row = data[i];

      // Distributions
      for (const field of distributionFields) {
        const val = row[field];
        const key = val === null || val === undefined || val === '' ? '__empty__' : val;
        const map = distMaps[field];
        if (map) {
          map.set(key, (map.get(key) || 0) + 1);
        }
      }

      // Histograms
      for (const field of histogramFields) {
        const v = Number(row[field.key]);
        if (!isNaN(v) && v >= 0) {
          const acc = histAccum[field.key];
          if (acc) {
            acc.values.push(v);
            acc.sum += v;
            acc.count += 1;
          }
        }
      }
    }

    // === Build distribution output ===
    const newDist = {};
    for (const field of distributionFields) {
      const map = distMaps[field];
      if (!map) continue;
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
      if (!acc) continue;
      newHist[field.key] = {
        values: acc.values,
        avg: acc.count > 0 ? (acc.sum / acc.count).toFixed(1) : '-',
      };
    }
    histogramData.value = newHist;

    globalStats.value = { totalSamples: len };
  }

  watch([tableData, () => getDistributionFields(), () => getHistogramFields()], recompute);
  recompute();

  return {
    distributions,
    histogramData,
    globalStats,
  };
}
