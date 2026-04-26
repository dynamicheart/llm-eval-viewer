/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Type Rule Registry — pluggable type detection rules for field type inference.
 *
 * Each rule has an `id`, `order` (lower = higher priority), and a `check(acc, sampleSize)` function
 * that returns a detected type string or null (skip).
 *
 * `finalizeType()` iterates rules in order and uses the first match.
 */

const ENUM_THRESHOLD = 20;
const PREVIEW_LENGTH_THRESHOLD = 50;

const typeRules = [];

/**
 * Register a type detection rule.
 * @param {{ id: string, nameKey?: string, name?: string, descriptionKey?: string, description?: string, order?: number, check: (acc, sampleSize) => string|null }} rule
 */
export function registerTypeRule(rule) {
  if (!rule || typeof rule.id !== 'string' || typeof rule.check !== 'function') {
    throw new Error('Invalid type rule: must have id (string) and check (function)');
  }
  if (rule.order == null) rule.order = 100;
  typeRules.push(rule);
  typeRules.sort((a, b) => a.order - b.order);
}

/**
 * Get all registered type rules (sorted by order).
 * @returns {Array}
 */
export function getTypeRules() {
  return [...typeRules];
}

// ===== Built-in Rules =====

registerTypeRule({
  id: 'nestedObject',
  nameKey: 'typeRuleNestedObjectName',
  descriptionKey: 'typeRuleNestedObjectDesc',
  order: 10,
  check(acc) {
    // Only pure object arrays match early — array values are checked by more specific rules
    const total = countTotal(acc);
    if (total > 0 && acc.typeCounts.object === total) return 'nestedObject';
    return null;
  },
});

registerTypeRule({
  id: 'number',
  nameKey: 'typeRuleNumberName',
  descriptionKey: 'typeRuleNumberDesc',
  order: 20,
  check(acc) {
    const total = countTotal(acc);
    if (total > 0 && acc.typeCounts.number === total) return 'number';
    return null;
  },
});

registerTypeRule({
  id: 'boolean',
  nameKey: 'typeRuleBooleanName',
  descriptionKey: 'typeRuleBooleanDesc',
  order: 30,
  check(acc) {
    const total = countTotal(acc);
    if (total > 0 && acc.typeCounts.boolean === total) return 'boolean';
    return null;
  },
});

registerTypeRule({
  id: 'toolDefArray',
  nameKey: 'typeRuleToolDefArrayName',
  descriptionKey: 'typeRuleToolDefArrayDesc',
  order: 35,
  check(acc, sampleSize) {
    // Native array values where >30% are tool definitions [{function: {name}}, ...]
    if (!acc.typeCounts.array || !(acc.toolDefArrayVotes > 0)) return null;
    if (acc.toolDefArrayVotes > sampleSize * 0.3) return 'toolList';
    return null;
  },
});

registerTypeRule({
  id: 'multiConversationArray',
  nameKey: 'typeRuleMultiConversationArrayName',
  descriptionKey: 'typeRuleMultiConversationArrayDesc',
  order: 38,
  check(acc, sampleSize) {
    // Native array values where items are conversation arrays: [[{role},...], [{role},...], ...]
    if (!acc.typeCounts.array || !(acc.multiConversationArrayVotes > 0)) return null;
    if (acc.multiConversationArrayVotes > sampleSize * 0.3) return 'conversation';
    return null;
  },
});

registerTypeRule({
  id: 'conversationArray',
  nameKey: 'typeRuleConversationArrayName',
  descriptionKey: 'typeRuleConversationArrayDesc',
  order: 40,
  check(acc, sampleSize) {
    // Native array values where >30% look like [{role}, ...] conversations
    if (!acc.typeCounts.array || !(acc.conversationArrayVotes > 0)) return null;
    if (acc.conversationArrayVotes > sampleSize * 0.3) return 'conversation';
    return null;
  },
});

registerTypeRule({
  id: 'conversationString',
  nameKey: 'typeRuleConversationStringName',
  descriptionKey: 'typeRuleConversationStringDesc',
  order: 50,
  check(acc, sampleSize) {
    if (!acc.typeCounts.string) return null;
    if ((acc.conversationVotes || 0) > sampleSize * 0.3) {
      return (acc.toolDefVotes || 0) > sampleSize * 0.3 ? 'toolList' : 'conversation';
    }
    return null;
  },
});

registerTypeRule({
  id: 'nestedArray',
  nameKey: 'typeRuleNestedArrayName',
  descriptionKey: 'typeRuleNestedArrayDesc',
  order: 55,
  check(acc) {
    // Fallback for pure array fields not matched by more specific rules
    const total = countTotal(acc);
    if (total > 0 && acc.typeCounts.array === total) return 'nestedArray';
    return null;
  },
});

registerTypeRule({
  id: 'enum',
  nameKey: 'typeRuleEnumName',
  descriptionKey: 'typeRuleEnumDesc',
  order: 60,
  check(acc, sampleSize) {
    if (!acc.typeCounts.string) return null;
    const avgLen = acc.stringCount > 0 ? acc.stringLengthSum / acc.stringCount : 0;
    const isLongString = avgLen > PREVIEW_LENGTH_THRESHOLD;
    if (acc.stringValues.size <= ENUM_THRESHOLD && acc.stringValues.size <= sampleSize && !isLongString) {
      return 'enum';
    }
    return null;
  },
});

registerTypeRule({
  id: 'string',
  nameKey: 'typeRuleStringName',
  descriptionKey: 'typeRuleStringDesc',
  order: 100,
  check() {
    return 'string';
  },
});

// ===== Helpers =====

function countTotal(acc) {
  return (acc.typeCounts.number || 0) + (acc.typeCounts.string || 0) +
    (acc.typeCounts.boolean || 0) + (acc.typeCounts.object || 0) + (acc.typeCounts.array || 0);
}
