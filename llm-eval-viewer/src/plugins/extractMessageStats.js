/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Plugin: Extract message statistics from conversation fields.
 *
 * Scans for conversation-type fields and extracts per-row statistics
 * as new columns: message count, tool call count, user message count,
 * system chars, and reasoning presence.
 */

import { registerPlugin } from './pluginRegistry';

/**
 * Try to get structured messages from a row for a given field.
 * Checks _reconstructed_* fields first, then falls back to parsing text.
 */
function getMessagesForField(row, fieldKey) {
  // Try _reconstructed_ path first
  const dotIdx = fieldKey.indexOf('.');
  if (dotIdx > 0) {
    const rootKey = fieldKey.substring(0, dotIdx);
    const subPath = fieldKey.substring(dotIdx + 1);
    const reconKey = `_reconstructed_${rootKey}`;
    const reconObj = row[reconKey];
    if (reconObj) {
      const val = navigatePath(reconObj, subPath);
      if (Array.isArray(val) && val.length > 0 && val[0]?.role) {
        return val;
      }
    }
  }

  // Fallback: try to parse the cell value as text format
  const raw = row[fieldKey];
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = parseTextMessages(raw);
    if (parsed && parsed.length > 0) return parsed;
  }

  return null;
}

function navigatePath(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

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

const PLUGIN_FIELDS = [
  { key: '_plugin_msg_count', label: 'Msg Count', type: 'number' },
  { key: '_plugin_tool_call_count', label: 'Tool Calls', type: 'number' },
  { key: '_plugin_user_msg_count', label: 'User Msgs', type: 'number' },
  { key: '_plugin_system_chars', label: 'System Chars', type: 'number' },
  { key: '_plugin_has_reasoning', label: 'Has Reasoning', type: 'boolean' },
];

const extractMessageStats = {
  id: 'extractMessageStats',
  nameKey: 'custom.pluginStatsName',
  descriptionKey: 'custom.pluginStatsDesc',

  process(rows, fieldMeta) {
    if (!rows || rows.length === 0) return { rows, fieldMeta };

    // Find all conversation-type fields
    const conversationFields = (fieldMeta.detectedFields || [])
      .filter((f) => f.detectedType === 'conversation')
      .map((f) => f.key);

    if (conversationFields.length === 0) return { rows, fieldMeta };

    // Use the first conversation field for stats extraction
    const primaryField = conversationFields[0];

    for (const row of rows) {
      const messages = getMessagesForField(row, primaryField);
      if (!messages || messages.length === 0) {
        row._plugin_msg_count = 0;
        row._plugin_tool_call_count = 0;
        row._plugin_user_msg_count = 0;
        row._plugin_system_chars = 0;
        row._plugin_has_reasoning = false;
        continue;
      }

      let toolCallCount = 0;
      let userMsgCount = 0;
      let systemChars = 0;
      let hasReasoning = false;

      for (const msg of messages) {
        if (msg.role === 'user' || msg.role === 'human') {
          userMsgCount++;
        } else if (msg.role === 'system') {
          systemChars += (msg.content || '').length;
        }

        // Check for tool_calls in assistant messages
        if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
          toolCallCount += msg.tool_calls.length;
        }

        // Check for reasoning_content
        if (msg.reasoning_content) {
          hasReasoning = true;
        }

        // Check for reasoning role in text messages
        if (msg.role === 'reasoning') {
          hasReasoning = true;
        }
      }

      row._plugin_msg_count = messages.length;
      row._plugin_tool_call_count = toolCallCount;
      row._plugin_user_msg_count = userMsgCount;
      row._plugin_system_chars = systemChars;
      row._plugin_has_reasoning = hasReasoning;
    }

    // Add plugin fields to detectedFields
    const existingKeys = new Set((fieldMeta.detectedFields || []).map((f) => f.key));
    const newFields = [...(fieldMeta.detectedFields || [])];

    for (const pf of PLUGIN_FIELDS) {
      if (existingKeys.has(pf.key)) continue;

      // Calculate empty rate
      const emptyCount = rows.filter((r) => r[pf.key] === 0 || r[pf.key] === false).length;
      const emptyRate = rows.length > 0 ? emptyCount / rows.length : 0;

      newFields.push({
        key: pf.key,
        label: pf.label,
        detectedType: pf.type,
        emptyRate,
        constantRate: pf.type === 'boolean' ? 1 - emptyRate : 0,
        visibilityReason: 'plugin',
        visible: false,
        searchable: false,
        filterable: pf.type === 'boolean',
        previewable: false,
        sortable: true,
        isExpanded: false,
        isPluginField: true,
      });
    }

    return {
      rows,
      fieldMeta: { ...fieldMeta, detectedFields: newFields },
    };
  },
};

registerPlugin(extractMessageStats);

export default extractMessageStats;
