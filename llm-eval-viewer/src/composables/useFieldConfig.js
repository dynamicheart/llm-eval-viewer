/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { ref, computed, watch } from 'vue';
import { DISTRIBUTION_SELECT_PATTERNS, HISTOGRAM_SELECT_PATTERNS, assignFieldVisibility } from '@/utils/customParserHelpers';

/**
 * Field configuration manager for the Custom Viewer.
 *
 * Manages which fields are visible, searchable, filterable, previewable,
 * and their display order. Persists configuration per file in localStorage.
 *
 * @param {Object} options
 * @param {string} [options.storagePrefix='custom_viewer_config'] - localStorage key prefix
 */
export function useFieldConfig(options = {}) {
  const { storagePrefix = 'custom_viewer_config' } = options;

  const fieldConfig = ref(null);
  const lastFileId = ref(null);
  const _cachedFieldMeta = ref(null);
  const _cachedPriorityDebug = ref(null);

  const activeColumns = computed(() => {
    if (!fieldConfig.value) return [];
    return fieldConfig.value.fields.filter((f) => f.visible);
  });

  const enumFields = computed(() => {
    if (!fieldConfig.value) return [];
    return fieldConfig.value.fields.filter(
      (f) => f.detectedType === 'enum' && (f.emptyRate || 0) < 0.95,
    );
  });

  const numericFields = computed(() => {
    if (!fieldConfig.value) return [];
    return fieldConfig.value.fields.filter(
      (f) => f.detectedType === 'number' && (f.emptyRate || 0) < 0.95 && (f.constantRate || 0) < 1.0,
    );
  });

  /**
   * Group fields into a tree structure by dot-notation prefix.
   * Returns an array of { groupKey, groupLabel, fields, visibleCount, totalCount }.
   * Top-level fields (no dot) go into a special '__top__' group.
   */
  const fieldTree = computed(() => {
    if (!fieldConfig.value) return [];
    const groups = new Map();
    const TOP_KEY = '__top__';

    for (const field of fieldConfig.value.fields) {
      const dotIdx = field.key.indexOf('.');
      const groupKey = dotIdx > 0 ? field.key.substring(0, dotIdx) : TOP_KEY;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(field);
    }

    const result = [];
    // Top-level group first
    if (groups.has(TOP_KEY)) {
      const fields = groups.get(TOP_KEY);
      result.push({
        groupKey: TOP_KEY,
        groupLabel: '__top__',
        fields,
        visibleCount: fields.filter((f) => f.visible).length,
        totalCount: fields.length,
      });
    }
    // Then other groups
    for (const [key, fields] of groups) {
      if (key === TOP_KEY) continue;
      result.push({
        groupKey: key,
        groupLabel: key,
        fields,
        visibleCount: fields.filter((f) => f.visible).length,
        totalCount: fields.length,
      });
    }
    return result;
  });

  // --- Smart selection (patterns defined in customParserHelpers.js) ---

  function _lastSegment(key) {
    return key.split('.').pop();
  }

  function _tryAdd(selected, reasons, field, reason, max) {
    if (selected.length >= max || !field || selected.includes(field.key)) return;
    selected.push(field.key);
    reasons[field.key] = reason;
  }

  /**
   * Smart-select fields from a candidate list using pattern config.
   * @param {Array} candidates - field descriptors
   * @param {Array} patterns - [{ re, reason }] from customParserHelpers
   * @param {number} max - max fields to select
   */
  function _smartSelect(candidates, patterns, max = 2) {
    const selected = [];
    const reasons = {};
    const add = (f, r) => _tryAdd(selected, reasons, f, r, max);

    for (const { re, reason } of patterns) {
      const match = candidates.find((f) => re.test(f.key) || re.test(_lastSegment(f.key)));
      if (match) add(match, reason);
      if (selected.length >= max) break;
    }
    return { selected, reasons };
  }

  /**
   * Smart-select distribution fields from enum fields (max 2).
   * Smart-select histogram fields from numeric fields (max 2).
   * Patterns are defined in customParserHelpers.js alongside priority rules.
   */
  function _smartSelectDistFields(enumFields, max = 2) {
    return _smartSelect(enumFields, DISTRIBUTION_SELECT_PATTERNS, max);
  }

  function _smartSelectHistFields(numericFields, max = 2) {
    return _smartSelect(numericFields, HISTOGRAM_SELECT_PATTERNS, max);
  }

  const CONFIG_VERSION = 5;

  // ===== Debounced auto-save =====
  // Catches all mutations (including direct v-model changes from the panel)
  // without requiring explicit saveConfig() calls everywhere.

  let _saveDebounceTimer = null;

  watch(
    fieldConfig,
    () => {
      if (!fieldConfig.value || !lastFileId.value) return;
      if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
      _saveDebounceTimer = setTimeout(() => _persistConfig(), 800);
    },
    { deep: true },
  );

  /**
   * Write current config to localStorage (internal).
   */
  function _persistConfig(fileId) {
    if (!fieldConfig.value) return;
    const id = fileId || lastFileId.value;
    if (!id) return;
    const storageKey = `${storagePrefix}_${id}`;
    localStorage.setItem(storageKey, JSON.stringify(fieldConfig.value));
  }

  /**
   * Force-flush config to localStorage immediately (for critical operations).
   */
  function saveConfig(fileId) {
    if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
    _persistConfig(fileId);
  }

  /**
   * Auto-configure from parser-detected field metadata.
   */
  function autoConfigure(fieldMeta) {
    const fields = (fieldMeta.detectedFields || []).map((f) => ({
      key: f.key,
      label: f.label || f.key,
      detectedType: f.detectedType || 'string',
      isExpanded: f.isExpanded || false,
      emptyRate: f.emptyRate || 0,
      constantRate: f.constantRate || 0,
      visibilityReason: f.visibilityReason || '',
      visible: f.visible ?? true,
      searchable: f.searchable ?? false,
      filterable: f.filterable ?? false,
      previewable: f.previewable ?? false,
      sortable: f.sortable ?? true,
    }));

    // Auto-configure stats: smart-select from ALL matching fields (not just visible).
    // Low-priority enum fields (e.g. 一级分类, 样本状态) are hidden as columns
    // but still valuable as distribution charts.
    const allEnums = fields.filter((f) => f.detectedType === 'enum' && (f.emptyRate || 0) < 0.95);
    const { selected: distributionFields, reasons: distReasons } = _smartSelectDistFields(allEnums);

    // Histogram: skip constant fields (single-bar histogram is useless)
    const allNumbers = fields.filter((f) => f.detectedType === 'number' && (f.emptyRate || 0) < 0.95 && (f.constantRate || 0) < 1.0);
    const { selected: histogramFields, reasons: histReasons } = _smartSelectHistFields(allNumbers);

    return {
      version: CONFIG_VERSION,
      fields,
      statsConfig: {
        distributionFields,
        histogramFields,
        selectionReasons: { ...distReasons, ...histReasons },
      },
    };
  }

  /**
   * Initialize field config: restore from localStorage or auto-configure.
   */
  function initFromMeta(fileId, fieldMeta) {
    lastFileId.value = fileId;
    _cachedFieldMeta.value = fieldMeta;
    _cachedPriorityDebug.value = fieldMeta.priorityDebug || null;
    const storageKey = `${storagePrefix}_${fileId}`;

    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Discard saved config if version is outdated
        if (parsed.version !== CONFIG_VERSION) {
          localStorage.removeItem(storageKey);
        } else {
          const merged = mergeConfigs(parsed, fieldMeta);
          fieldConfig.value = merged;
          return;
        }
      } catch {
        // Ignore corrupt config
      }
    }

    fieldConfig.value = autoConfigure(fieldMeta);
    saveConfig(fileId);
  }

  /**
   * Merge saved/preset config with new field metadata.
   * Iterates in savedConfig's field order to preserve user-arranged ordering,
   * then appends any new fields from fieldMeta that don't exist in saved.
   */
  function mergeConfigs(savedConfig, fieldMeta) {
    const newFields = fieldMeta.detectedFields || [];
    const currentKeySet = new Set(newFields.map((f) => f.key));

    // Build lookup of current parser-detected fields by key
    const currentMap = new Map();
    for (const f of newFields) {
      currentMap.set(f.key, f);
    }

    // 1. Iterate saved fields in saved order → preserves user sorting
    const fields = [];
    const usedKeys = new Set();

    for (const sf of savedConfig.fields || []) {
      const current = currentMap.get(sf.key);
      if (!current) continue; // Field no longer exists in data, drop it
      usedKeys.add(sf.key);
      fields.push({
        key: sf.key,
        label: sf.label || current.label || sf.key,
        detectedType: current.detectedType || sf.detectedType || 'string',
        isExpanded: current.isExpanded || false,
        emptyRate: current.emptyRate || 0,
        constantRate: current.constantRate || 0,
        visibilityReason: current.visibilityReason || '',
        visible: sf.visible ?? current.visible ?? true,
        searchable: sf.searchable ?? current.searchable ?? false,
        filterable: sf.filterable ?? current.filterable ?? false,
        previewable: sf.previewable ?? current.previewable ?? false,
        sortable: sf.sortable ?? current.sortable ?? true,
      });
    }

    // 2. Append new fields not in saved config (in detection order)
    for (const nf of newFields) {
      if (usedKeys.has(nf.key)) continue;
      fields.push({
        key: nf.key,
        label: nf.label || nf.key,
        detectedType: nf.detectedType || 'string',
        isExpanded: nf.isExpanded || false,
        emptyRate: nf.emptyRate || 0,
        constantRate: nf.constantRate || 0,
        visibilityReason: nf.visibilityReason || '',
        visible: nf.visible ?? false,
        searchable: nf.searchable ?? false,
        filterable: nf.filterable ?? false,
        previewable: nf.previewable ?? false,
        sortable: nf.sortable ?? true,
      });
    }

    // Merge stats config: keep saved settings but remove fields that no longer exist
    const existingKeys = new Set(fields.map((f) => f.key));
    const savedDist = savedConfig.statsConfig?.distributionFields || [];
    const savedHist = savedConfig.statsConfig?.histogramFields || [];
    const savedReasons = savedConfig.statsConfig?.selectionReasons || {};
    const filteredReasons = {};
    for (const [k, v] of Object.entries(savedReasons)) {
      if (existingKeys.has(k)) filteredReasons[k] = v;
    }

    return {
      version: CONFIG_VERSION,
      fields,
      statsConfig: {
        distributionFields: savedDist.filter((k) => existingKeys.has(k)),
        histogramFields: savedHist.filter((k) => existingKeys.has(k)),
        selectionReasons: filteredReasons,
      },
    };
  }

  // ===== Mutation helpers =====
  // No explicit saveConfig() — the debounced deep watcher handles persistence.

  function toggleFieldVisibility(key) {
    if (!fieldConfig.value) return;
    const field = fieldConfig.value.fields.find((f) => f.key === key);
    if (field) field.visible = !field.visible;
  }

  function updateFieldLabel(key, label) {
    if (!fieldConfig.value) return;
    const field = fieldConfig.value.fields.find((f) => f.key === key);
    if (field) field.label = label;
  }

  function toggleSearchable(key) {
    if (!fieldConfig.value) return;
    const field = fieldConfig.value.fields.find((f) => f.key === key);
    if (field) field.searchable = !field.searchable;
  }

  function toggleFilterable(key) {
    if (!fieldConfig.value) return;
    const field = fieldConfig.value.fields.find((f) => f.key === key);
    if (field) field.filterable = !field.filterable;
  }

  function togglePreviewable(key) {
    if (!fieldConfig.value) return;
    const field = fieldConfig.value.fields.find((f) => f.key === key);
    if (field) field.previewable = !field.previewable;
  }

  function moveField(fromIndex, toIndex) {
    if (!fieldConfig.value) return;
    const { fields } = fieldConfig.value;
    if (fromIndex < 0 || fromIndex >= fields.length || toIndex < 0 || toIndex >= fields.length) return;
    const [item] = fields.splice(fromIndex, 1);
    fields.splice(toIndex, 0, item);
  }

  /**
   * Toggle visibility of all fields in a group.
   * If any field in the group is visible, hide all; otherwise show all.
   */
  function toggleGroupVisibility(groupKey) {
    if (!fieldConfig.value) return;
    const isTop = groupKey === '__top__';
    const groupFields = fieldConfig.value.fields.filter((f) => {
      if (isTop) return !f.key.includes('.');
      return f.key.startsWith(groupKey + '.');
    });
    const anyVisible = groupFields.some((f) => f.visible);
    for (const f of groupFields) {
      f.visible = !anyVisible;
    }
  }

  function setStatsConfig(distributionFields, histogramFields) {
    if (!fieldConfig.value) return;
    const existingReasons = fieldConfig.value.statsConfig?.selectionReasons || {};
    fieldConfig.value.statsConfig = { distributionFields, histogramFields, selectionReasons: existingReasons };
  }

  function resetToDefaults(rescore = false) {
    if (!_cachedFieldMeta.value) return;
    if (rescore) {
      const detectedFields = _cachedFieldMeta.value.detectedFields;
      const { debugMeta } = assignFieldVisibility(detectedFields);
      _cachedPriorityDebug.value = debugMeta;
    }
    fieldConfig.value = autoConfigure(_cachedFieldMeta.value);
    saveConfig();
  }

  // ===== Preset management =====

  const PRESETS_STORAGE_KEY = 'custom_viewer_presets';
  const MAX_PRESETS = 20;
  const presets = ref([]);
  const activePresetId = ref(null);

  function _loadPresets() {
    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
      presets.value = raw ? JSON.parse(raw) : [];
    } catch {
      presets.value = [];
    }
  }
  _loadPresets();

  function _persistPresets() {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets.value));
  }

  /**
   * Strip runtime-only data from a config before storing as a preset.
   * Only keeps user-configurable properties to reduce storage size.
   */
  function _stripForPreset(config) {
    return {
      version: config.version,
      fields: (config.fields || []).map((f) => ({
        key: f.key,
        label: f.label,
        detectedType: f.detectedType,
        // isExpanded intentionally omitted — it's runtime metadata from the parser
        visible: f.visible,
        searchable: f.searchable,
        filterable: f.filterable,
        previewable: f.previewable,
        sortable: f.sortable,
      })),
      statsConfig: config.statsConfig
        ? {
            distributionFields: [...(config.statsConfig.distributionFields || [])],
            histogramFields: [...(config.statsConfig.histogramFields || [])],
            selectionReasons: { ...(config.statsConfig.selectionReasons || {}) },
          }
        : { distributionFields: [], histogramFields: [], selectionReasons: {} },
    };
  }

  /**
   * Save the current fieldConfig as a named preset.
   * If a preset with the same name exists, it is overwritten.
   */
  function savePreset(name) {
    if (!fieldConfig.value || !name) return;
    const now = Date.now();
    const existingIdx = presets.value.findIndex((p) => p.name === name);
    const entry = {
      id: existingIdx >= 0 ? presets.value[existingIdx].id : `p_${now}`,
      name,
      createdAt: existingIdx >= 0 ? presets.value[existingIdx].createdAt : now,
      config: _stripForPreset(fieldConfig.value),
    };
    if (existingIdx >= 0) {
      presets.value[existingIdx] = entry;
    } else {
      presets.value.push(entry);
      if (presets.value.length > MAX_PRESETS) {
        presets.value.shift();
      }
    }
    activePresetId.value = entry.id;
    _persistPresets();
  }

  /**
   * Apply a saved preset to the current file's field config.
   * Uses _cachedFieldMeta (original parser output) as the source of truth for
   * which fields actually exist. Preserves preset's field order.
   */
  function applyPreset(presetId) {
    const preset = presets.value.find((p) => p.id === presetId);
    if (!preset || !fieldConfig.value || !_cachedFieldMeta.value) return;
    activePresetId.value = presetId;
    fieldConfig.value = mergeConfigs(preset.config, _cachedFieldMeta.value);
    saveConfig();
  }

  /**
   * Clear the active preset selection (revert to file-specific config).
   */
  function clearActivePreset() {
    activePresetId.value = null;
  }

  /**
   * Delete a preset by id.
   */
  function deletePreset(presetId) {
    presets.value = presets.value.filter((p) => p.id !== presetId);
    if (activePresetId.value === presetId) activePresetId.value = null;
    _persistPresets();
  }

  /**
   * Clear all in-memory state AND the corresponding localStorage entry.
   */
  function clearConfig() {
    if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
    if (lastFileId.value) {
      const storageKey = `${storagePrefix}_${lastFileId.value}`;
      localStorage.removeItem(storageKey);
    }
    fieldConfig.value = null;
    lastFileId.value = null;
    _cachedFieldMeta.value = null;
    _cachedPriorityDebug.value = null;
    activePresetId.value = null;
  }

  /**
   * Remove all persisted field configs from localStorage (prefix scan).
   */
  function clearAllConfigs() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(storagePrefix + '_')) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    clearConfig();
  }

  return {
    fieldConfig,
    lastFileId,
    activeColumns,
    enumFields,
    numericFields,
    fieldTree,
    initFromMeta,
    saveConfig,
    toggleFieldVisibility,
    updateFieldLabel,
    toggleSearchable,
    toggleFilterable,
    togglePreviewable,
    moveField,
    toggleGroupVisibility,
    setStatsConfig,
    resetToDefaults,
    clearConfig,
    clearAllConfigs,
    // Presets
    presets,
    activePresetId,
    savePreset,
    applyPreset,
    clearActivePreset,
    deletePreset,
    // Debug
    priorityDebug: computed(() => _cachedPriorityDebug.value),
  };
}
