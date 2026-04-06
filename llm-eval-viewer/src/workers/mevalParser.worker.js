/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import Papa from 'papaparse';

/**
 * Infer dataset name from category and question content.
 * Duplicated from MevalView because workers cannot access Vue composables.
 */
function inferDataset(category2, question, promptId, unknownLabel) {
  const c2 = (category2 || '').trim();
  if (['Chemistry', 'Physics', 'Biology'].includes(c2)) return 'GPQA';
  if (['easy', 'medium', 'hard'].includes(c2)) return 'LiveCodeBench';
  if (question.includes('function signature and docstring')) return 'HumanEval';
  if (question.includes('calculation question')) {
    const pid = Number(promptId);
    if (!isNaN(pid)) return pid >= 44243093 ? 'AIME25' : 'AIME24';
    return 'AIME';
  }
  return c2 || unknownLabel;
}

self.onmessage = (e) => {
  const { text, unknownLabel } = e.data;

  const { data, meta } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = meta.fields || [];

  // Dynamically detect model column: find "模型回答-XXX" not ending with "-请求详情"
  const modelAnswerCols = headers.filter(
    (h) => h.startsWith('模型回答-') && !h.endsWith('-请求详情')
  );
  const detectedModel = modelAnswerCols.length > 0
    ? modelAnswerCols[0].replace('模型回答-', '')
    : '';

  const requestDetailCol = `模型回答-${detectedModel}-请求详情`;
  const resultCol = `标注结果-${detectedModel}`;
  const resultDetailCol = `标注结果详情-${detectedModel}`;

  const rows = data.map((row, idx) => {
    let promptTokens = '';
    let completionTokens = '';
    let totalTokens = '';
    let costTime = null;
    let finishReason = '';
    const requestDetailText = row[requestDetailCol] || '';

    try {
      const detail = JSON.parse(requestDetailText);
      const ri = detail[0]?.request_info || {};
      const usage = ri.response?.usage || {};
      promptTokens = usage.prompt_tokens ?? '';
      completionTokens = usage.completion_tokens ?? '';
      totalTokens = usage.total_tokens ?? '';
      costTime = ri.cost_time ?? null;
      finishReason = ri.response?.choices?.[0]?.finish_reason || '';
    } catch {
      // keep defaults
    }

    let extractedAnswer = '';
    const resultDetailText = row[resultDetailCol] || '';
    try {
      const evalDetail = JSON.parse(resultDetailText);
      extractedAnswer = evalDetail?.evaluator?.extracted_answer || '';
    } catch {
      // keep defaults
    }

    const question = row['问题'] || '';

    return {
      index: idx + 1,
      sampleId: row['样本ID'] || '',
      traceId: row['TraceId'] || '',
      category1: row['一级分类'] || '',
      category2: row['二级分类'] || '',
      category3: row['三级分类'] || '',
      dataset: inferDataset(row['二级分类'], question, row['提示词 ID'], unknownLabel),
      question,
      referenceAnswer: row['参考答案'] || '',
      result: row[resultCol] || '',
      modelAnswer: row[`模型回答-${detectedModel}`] || '',
      prompt: row['问题'] || '',
      promptTokens,
      completionTokens,
      totalTokens,
      costTime,
      extractedAnswer,
      finishReason,
      // Keep raw text strings — avoid structured clone of large nested objects
      _requestDetailText: requestDetailText,
      _resultDetailText: resultDetailText,
    };
  });

  self.postMessage({ rows, modelName: detectedModel });
};
