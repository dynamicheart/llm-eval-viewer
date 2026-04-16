/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Pure helper functions extracted from jsonlParser.worker for testability.
 */

// ===== Reviews helpers =====

export function getSampleIdReviews(json, idx) {
  const sampleScore = json?.sample_score || {};
  const meta = sampleScore?.sample_metadata;
  if (meta?.question_id) return String(meta.question_id);
  if (meta?.problem_id) return String(meta.problem_id);
  if (meta?.task_id) return String(meta.task_id);
  if (sampleScore?.sample_id) return String(sampleScore.sample_id);
  return `row_${idx + 1}`;
}

export function getPriorityValue(obj, fields = ['acc', 'pass']) {
  for (const field of fields) {
    const val = obj?.[field];
    if (val !== undefined && val !== null) return val;
  }
  return '';
}

export function getSolutionFromSample(json, failedParseLabel) {
  const meta = json?.sample_score?.sample_metadata;

  if (typeof meta?.solution === 'string' && meta.solution.trim() !== '') {
    return { type: 'solution', content: meta.solution, render: 'markdown' };
  }

  if (meta && Object.keys(meta).length > 0) {
    return { type: 'metadata', content: JSON.stringify(meta, null, 2), render: 'json' };
  }

  const metadata = json?.sample_score?.score?.metadata;
  if (metadata && Object.keys(metadata).length > 0) {
    return { type: 'metadata', content: JSON.stringify(metadata, null, 2), render: 'json' };
  }

  return { type: 'empty', content: failedParseLabel, render: 'text' };
}

export function parseReviewLine(line, idx, failedParseLabel) {
  try {
    const json = JSON.parse(line);
    const score = json.sample_score?.score || {};
    return {
      index: json.index ?? idx + 1,
      id: getSampleIdReviews(json, idx),
      prompt: json.input || '',
      pred: score.extracted_prediction ?? '',
      gold: json.target ?? '',
      result: getPriorityValue(score.value, ['acc', 'pass']),
      content: score.prediction ?? '',
      solution: getSolutionFromSample(json, failedParseLabel),
      _rawJsonText: line,
    };
  } catch {
    return {
      index: idx + 1, id: 'parse_error', prompt: '', pred: '', gold: '',
      result: '', content: '',
      solution: { type: 'empty', content: failedParseLabel, render: 'text' },
      _rawJsonText: null,
    };
  }
}

// ===== Predictions helpers =====

export function getSampleIdPredictions(json, idx) {
  const meta = json?.metadata || {};
  if (meta?.question_id) return String(meta.question_id);
  if (meta?.problem_id) return String(meta.problem_id);
  if (meta?.task_id) return String(meta.task_id);
  return `row_${idx + 1}`;
}

export function parseContent(rawContent) {
  if (!rawContent) return { reasoning: null, text: '' };
  if (typeof rawContent === 'string') return { reasoning: null, text: rawContent };
  if (Array.isArray(rawContent)) {
    const reasoningItem = rawContent.find((item) => item.type === 'reasoning');
    const textItem = rawContent.find((item) => item.type === 'text');
    return {
      isReasoning: !!reasoningItem,
      reasoning: reasoningItem ? reasoningItem.reasoning || null : null,
      text: textItem ? textItem.text || '' : '',
    };
  }
  return { reasoning: null, text: '' };
}

export function parsePredictionLine(line, idx) {
  try {
    const json = JSON.parse(line);
    const content = json.model_output?.choices?.[0]?.message?.content || '';
    const usage = json.model_output?.usage || {};
    return {
      index: json.index ?? idx + 1,
      id: getSampleIdPredictions(json, idx),
      prompt: json.input || '',
      pred: '', gold: '', result: '',
      content: parseContent(content),
      input_tokens: usage.input_tokens ?? '',
      output_tokens: usage.output_tokens ?? '',
      total_tokens: usage.total_tokens ?? '',
      stop_reason: json.model_output?.choices?.[0]?.stop_reason || '',
      _rawJsonText: line,
    };
  } catch {
    return {
      index: idx + 1, id: 'parse_error', prompt: '', pred: '', gold: '', result: '',
      content: '', input_tokens: '', output_tokens: '', total_tokens: '', stop_reason: '',
      _rawJsonText: null,
    };
  }
}
