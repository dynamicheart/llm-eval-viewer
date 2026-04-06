/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * 样例数据：首次用户体验用
 *
 * 每个视图提供 2 条样例（带 reasoning + 不带 reasoning），
 * 以 JSONL / CSV 原始文本形式存储，直接交给对应 parseJsonl / parseCsv 处理。
 */

// ========== Predictions ==========
export const SAMPLE_PREDICTIONS_TEXT = [
  JSON.stringify({
    index: 1,
    model: 'sample_model',
    model_output: {
      choices: [{
        message: {
          content: 'To solve the equation \\(2^8 = 4^x\\):\n\n1. Rewrite \\(4\\) as \\(2^2\\): \\(4^x = (2^2)^x = 2^{2x}\\)\n2. Set exponents equal: \\(8 = 2x\\)\n3. Solve: \\(x = 4\\)\n\n**Final Answer:**\n\\[\n\\boxed{4}\n\\]',
          role: 'assistant',
        },
        stop_reason: 'stop',
      }],
      usage: { input_tokens: 38, output_tokens: 208, total_tokens: 246 },
    },
    metadata: { question_id: 'test/algebra/1004.json' },
  }),
  JSON.stringify({
    index: 2,
    model: 'sample_model',
    model_output: {
      choices: [{
        message: {
          content: [
            {
              type: 'reasoning',
              reasoning: 'We need to return sorted unique elements from the list.\nSteps:\n1. Remove duplicates: use set()\n2. Sort the unique elements: use sorted()\n\nThe example output is sorted in ascending order.\nLet\'s implement accordingly.',
            },
            {
              type: 'text',
              text: '### Solution Code\n```python\ndef unique(l: list):\n    \"\"\"Return sorted unique elements in a list\n    >>> unique([5, 3, 5, 2, 3, 3, 9, 0, 123])\n    [0, 2, 3, 5, 9, 123]\n    \"\"\"\n    return sorted(set(l))\n```\n\nThis removes duplicates with `set()` and sorts the result with `sorted()`.',
            },
          ],
          role: 'assistant',
        },
        stop_reason: 'stop',
      }],
      usage: { input_tokens: 97, output_tokens: 375, total_tokens: 472 },
    },
    metadata: { task_id: 'HumanEval/34' },
  }),
].join('\n');

// ========== Reviews ==========
export const SAMPLE_REVIEWS_TEXT = [
  JSON.stringify({
    index: 1,
    input: '**User**: \nHillary has eleven coins, all dimes and nickels. In total, the coins are worth 75 cents. How many nickels does she have?\nPlease reason step by step, and put your final answer within \\boxed{}.',
    target: '7',
    sample_score: {
      score: {
        value: { acc: 1.0 },
        extracted_prediction: '7',
        prediction: 'Let \\( n \\) be the number of nickels.\n\\[\n5n + 10(11 - n) = 75\n\\]\n\\[\n-5n + 110 = 75 \\implies n = 7\n\\]\n\nHillary has \\(\\boxed{7}\\) nickels.',
        metadata: {},
      },
      sample_id: 1,
      sample_metadata: {
        question_id: 'test/algebra/2199.json',
        solution: 'Let d = dimes, n = nickels. d+n=11, 10d+5n=75. Solving gives n=\\boxed{7}.',
      },
    },
  }),
  JSON.stringify({
    index: 2,
    input: '**User**: \nRead the following function signature and docstring, and fully implement the function described.\n\ndef unique(l: list):\n    \"\"\"Return sorted unique elements in a list\n    >>> unique([5, 3, 5, 2, 3, 3, 9, 0, 123])\n    [0, 2, 3, 5, 9, 123]\n    \"\"\"\n',
    target: 'return sorted(list(set(l)))\n',
    sample_score: {
      score: {
        value: { pass: true },
        extracted_prediction: 'def unique(l: list):\n    return sorted(set(l))\n',
        prediction: '```python\ndef unique(l: list):\n    \"\"\"Return sorted unique elements in a list\"\"\"\n    return sorted(set(l))\n```\n\nThis approach uses `set()` for deduplication and `sorted()` for ordering.',
        metadata: {
          task_id: 'HumanEval/34',
          timeout: 4,
          execution_result: { passed: true, result: 'passed' },
        },
      },
      sample_id: 2,
      sample_metadata: { task_id: 'HumanEval/34' },
    },
  }),
].join('\n');

// ========== MEval (CSV) ==========
const mevalHeaders = [
  '任务 ID', '样本ID', '样本加密ID', '提示词 ID',
  '一级分类', '二级分类', '三级分类', '翻译',
  '答案是否可接受', '备注', '评测人', '样本状态',
  'tag', '是否overlap', '评测用时', '更新时间',
  'Prompt序列号', 'TraceId', '问题', '参考答案',
  '模型回答-SampleModel', '模型回答-SampleModel-请求详情',
  '标注结果-SampleModel', '标注结果备注-SampleModel',
  '标注结果详情-SampleModel', '反馈-SampleModel',
].join(',');

const mevalRow1Detail = JSON.stringify([{
  request_info: {
    response: {
      usage: { prompt_tokens: 256, completion_tokens: 128, total_tokens: 384 },
      choices: [{ finish_reason: 'stop' }],
    },
    cost_time: 1500,
  },
}]);

const mevalRow2Detail = JSON.stringify([{
  request_info: {
    response: {
      usage: { prompt_tokens: 64, completion_tokens: 32, total_tokens: 96 },
      choices: [{ finish_reason: 'stop' }],
    },
    cost_time: 800,
  },
}]);

const mevalRow1ResultDetail = JSON.stringify({
  evaluator: {
    extracted_answer: 'def sort_list(l): return sorted(l)',
    score: 100,
    reason: 'Code is correct and passes all test cases.',
  },
});

const mevalRow2ResultDetail = JSON.stringify({
  evaluator: {
    extracted_answer: '4',
    score: 100,
    reason: 'The answer is correct.',
  },
});

function csvEscape(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const mevalRow1 = [
  '39996', '10001', 'abc123', '44332541',
  '推理能力', 'medium', 'atcoder', '',
  '', '', '自动评测器', '已评测',
  '', '否', '00:00:04', '2026-04-03',
  'P001', 'SampleModel:trace-001',
  'Write a Python function that sorts a list in ascending order.',
  'def sort_list(l): return sorted(l)',
  'Q: Write a Python function that sorts a list.\nA: def sort_list(l): return sorted(l)',
  mevalRow1Detail,
  '100', '',
  mevalRow1ResultDetail, '',
].map(csvEscape).join(',');

const mevalRow2 = [
  '39996', '10002', 'def456', '44332542',
  '推理能力', 'easy', 'atcoder', '',
  '', '', '自动评测器', '已评测',
  '', '否', '00:00:03', '2026-04-03',
  'P002', 'SampleModel:trace-002',
  'What is 2 + 2? Please solve step by step.',
  '4',
  'Q: What is 2 + 2?\nA: 2 + 2 = 4. The answer is 4.',
  mevalRow2Detail,
  '100', '',
  mevalRow2ResultDetail, '',
].map(csvEscape).join(',');

export const SAMPLE_MEVAL_TEXT = [mevalHeaders, mevalRow1, mevalRow2].join('\n');
