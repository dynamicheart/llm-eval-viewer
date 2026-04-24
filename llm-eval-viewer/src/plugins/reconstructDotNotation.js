/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Plugin: Merge scattered dot-notation fields into unified JSON fields.
 *
 * Groups ALL fields under a common root prefix (e.g. RequestData.messages,
 * RequestData.tools.[0].function.name, RequestData.top_p) and reconstructs
 * them into a single RequestData JSON object per row.
 *
 * - Root field (e.g. RequestData) → visible, clickable → opens JSON dialog
 * - Direct sub-fields (e.g. RequestData.messages) → hidden but kept in config,
 *   user can toggle on to see specialized dialogs (conversation, tool, etc.)
 * - Array-indexed leaves (e.g. RequestData.tools.[0].function.name) → removed
 *
 * Reconstructed data is stored in row._reconstructed_<rootKey>.
 */

import { registerPlugin } from './pluginRegistry';

const ARRAY_INDEX_RE = /^\[(\d+)\]$/;

/**
 * Set a value in a nested object by dot-separated path.
 * Handles array indices like "tools.[0].function.name".
 */
function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;
    const isArrayIdx = ARRAY_INDEX_RE.test(part);

    if (isArrayIdx) {
      const idx = parseInt(part.slice(1, -1), 10);
      if (!Array.isArray(current)) break;
      while (current.length <= idx) current.push(undefined);
      if (isLast) {
        current[idx] = value;
      } else {
        const nextIsArrayIdx = ARRAY_INDEX_RE.test(parts[i + 1]);
        if (current[idx] == null || typeof current[idx] !== 'object') {
          current[idx] = nextIsArrayIdx ? [] : {};
        }
        current = current[idx];
      }
    } else {
      if (isLast) {
        current[part] = value;
      } else {
        const nextIsArrayIdx = ARRAY_INDEX_RE.test(parts[i + 1]);
        if (current[part] == null || typeof current[part] !== 'object') {
          current[part] = nextIsArrayIdx ? [] : {};
        }
        current = current[part];
      }
    }
  }

  return obj;
}

/**
 * Get a value from a nested object by dot-separated path.
 */
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Detect if a key contains array-indexed notation (e.g. "X.[0].name").
 */
function hasArrayIndex(key) {
  return /\.\[\d+\]/.test(key);
}

/**
 * Parse [role] content text format into structured message array.
 */
function parseTextMessages(text) {
  if (!text || typeof text !== 'string') return null;
  const lines = text.split('\n');
  const messages = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(/^\[(system|user|assistant|human|ai|bot)\]\s*(.*)/i);
    if (match) {
      if (current) messages.push(current);
      current = { role: match[1].toLowerCase(), content: match[2] || '' };
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line;
    }
  }
  if (current) messages.push(current);

  return messages.length > 0 ? messages : null;
}

/**
 * Detect if a string value looks like [role] content format.
 */
function isTextMessageFormat(value) {
  if (!value || typeof value !== 'string') return false;
  return /^\[(system|user|assistant|human|ai|bot)\]/im.test(value);
}

const reconstructDotNotation = {
  id: 'reconstructDotNotation',
  nameKey: 'custom.pluginReconstructName',
  descriptionKey: 'custom.pluginReconstructDesc',

  process(rows, fieldMeta) {
    if (!rows || rows.length === 0) return { rows, fieldMeta };

    const processedRows = rows.map((row) => ({ ...row }));
    const newDetectedFields = [...(fieldMeta.detectedFields || [])];

    // Step 1: Group ALL dot-notation fields by root prefix
    const rootGroups = new Map();
    for (const field of newDetectedFields) {
      const dotIdx = field.key.indexOf('.');
      if (dotIdx <= 0) continue;

      const rootKey = field.key.substring(0, dotIdx);
      if (!rootGroups.has(rootKey)) {
        rootGroups.set(rootKey, []);
      }
      rootGroups.get(rootKey).push(field);
    }

    if (rootGroups.size === 0) return { rows, fieldMeta };

    const processedRoots = new Set();

    // Step 2: For each root group, reconstruct the unified object
    for (const [rootKey, subFields] of rootGroups) {
      // Skip groups with only one sub-field (not worth merging)
      if (subFields.length < 1) continue;

      // Reconstruct objects for each row
      for (const row of processedRows) {
        const obj = {};
        for (const field of subFields) {
          const subPath = field.key.substring(rootKey.length + 1);
          const value = row[field.key];
          if (value == null || value === '') continue;
          setNestedValue(obj, subPath, value);
        }

        if (Object.keys(obj).length > 0) {
          row[`_reconstructed_${rootKey}`] = obj;
          // Set display value for the root field
          row[rootKey] = JSON.stringify(obj, null, 2);
        }
      }

      // Step 3: Update fieldMeta

      // 3a: Add or update root field as nestedObject
      const existingRoot = newDetectedFields.find((f) => f.key === rootKey);
      const emptyCount = processedRows.filter((r) => !r[`_reconstructed_${rootKey}`]).length;
      const emptyRate = processedRows.length > 0 ? emptyCount / processedRows.length : 0;

      if (existingRoot) {
        existingRoot.detectedType = 'nestedObject';
        existingRoot.visibilityReason = 'reconstructed_root';
        existingRoot.visible = true;
        existingRoot.previewable = true;
        existingRoot.isPluginField = true;
      } else {
        newDetectedFields.unshift({
          key: rootKey,
          label: rootKey,
          detectedType: 'nestedObject',
          emptyRate,
          constantRate: 0,
          visibilityReason: 'reconstructed_root',
          visible: true,
          previewable: true,
          searchable: false,
          filterable: false,
          sortable: false,
          isExpanded: false,
          isPluginField: true,
        });
      }

      // 3b: Handle sub-fields
      for (const field of subFields) {
        if (hasArrayIndex(field.key)) {
          // Array-indexed leaf (e.g. X.tools.[0].function.name) → mark for removal
          field.visibilityReason = 'reconstructed';
          field.visible = false;
          field.isPluginField = true;
        } else {
          // Direct sub-field (e.g. X.messages, X.top_p) → hide but keep in config
          field.visibilityReason = 'reconstructed_sub';
          field.visible = false;
          field.isPluginField = true;
        }
      }

      processedRoots.add(rootKey);

      // Step 4: Detect conversation/toolList sub-fields within reconstructed objects
      detectSpecialSubFields(processedRows, rootKey, newDetectedFields, subFields);
    }

    // Step 5: Check for [role] content text in any string field (global scan)
    for (const field of newDetectedFields) {
      if (field.detectedType === 'conversation') continue;
      const sampleVal = processedRows.find((r) => r[field.key] != null && r[field.key] !== '')?.[field.key];
      if (!sampleVal || !isTextMessageFormat(sampleVal)) continue;

      const parsed = parseTextMessages(sampleVal);
      if (!parsed || parsed.length === 0) continue;

      // If this field belongs to a reconstructed root, store structured messages
      const dotIdx = field.key.indexOf('.');
      if (dotIdx > 0) {
        const rootKey = field.key.substring(0, dotIdx);
        if (processedRoots.has(rootKey)) {
          const reconKey = `_reconstructed_${rootKey}`;
          const subPath = field.key.substring(dotIdx + 1);
          for (const row of processedRows) {
            const val = row[field.key];
            if (val && isTextMessageFormat(val)) {
              const msgs = parseTextMessages(val);
              if (msgs) {
                if (!row[reconKey]) row[reconKey] = {};
                setNestedValue(row[reconKey], subPath, msgs);
              }
            }
          }
        }
      }

      if (field.detectedType !== 'conversation') {
        field.detectedType = 'conversation';
        field.visibilityReason = 'conversation';
        field.visible = true;
      }
    }

    console.log(`[reconstructDotNotation] merged ${processedRoots.size} root groups:`, [...processedRoots]);

    return {
      rows: processedRows,
      fieldMeta: { ...fieldMeta, detectedFields: newDetectedFields },
    };
  },
};

/**
 * Detect special sub-field types (conversation, toolList) within reconstructed objects.
 * Updates field types and stores structured data in _reconstructed_.
 */
function detectSpecialSubFields(processedRows, rootKey, newDetectedFields, subFields) {
  const reconKey = `_reconstructed_${rootKey}`;

  for (const field of subFields) {
    if (hasArrayIndex(field.key)) continue;

    const subPath = field.key.substring(rootKey.length + 1);

    // Sample first non-empty value from reconstructed data
    const sampleRow = processedRows.find((r) => {
      const obj = r[reconKey];
      return obj && getNestedValue(obj, subPath) != null;
    });
    if (!sampleRow) continue;

    const sampleVal = getNestedValue(sampleRow[reconKey], subPath);

    // Check for conversation (array of objects with role property)
    if (Array.isArray(sampleVal) && sampleVal.length > 0 && sampleVal[0]?.role) {
      if (field.detectedType !== 'conversation') {
        field.detectedType = 'conversation';
        field.visibilityReason = 'conversation';
        // Don't force visible - keep hidden as reconstructed_sub, user can enable
      }
      continue;
    }

    // Check for toolList (array of objects with function or type=function)
    if (Array.isArray(sampleVal) && sampleVal.length > 0 && typeof sampleVal[0] === 'object') {
      const firstItem = sampleVal[0];
      if (firstItem && (firstItem.function || firstItem.type === 'function')) {
        if (field.detectedType !== 'toolList') {
          field.detectedType = 'toolList';
          field.visibilityReason = 'toolList';
        }
        continue;
      }
    }
  }
}

registerPlugin(reconstructDotNotation);

export default reconstructDotNotation;
