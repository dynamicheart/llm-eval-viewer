/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Infer dataset name from category and question content.
 * Pure function extracted from mevalParser.worker for testability.
 */
export function inferDataset(category2, question, promptId, unknownLabel) {
  const c2 = (category2 || '').trim();
  if (['Chemistry', 'Physics', 'Biology'].includes(c2)) return 'GPQA';
  if (['easy', 'medium', 'hard'].includes(c2)) return 'LiveCodeBench';
  if (question.includes('function signature and docstring')) return 'HumanEval';
  if (question.includes('calculation question')) {
    const pid = Number(promptId);
    if (promptId !== '' && !isNaN(pid)) return pid >= 44243093 ? 'AIME25' : 'AIME24';
    return 'AIME';
  }
  return c2 || unknownLabel;
}
