/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

import { describe, it, expect } from 'vitest';
import hyevalParse from './hyevalParse';

const VARIANT_A_LINE = JSON.stringify({
  taskId: 'task_1',
  questionId: '12345',
  payload: {
    messages: [{ role: 'user', content: 'Who painted the Mona Lisa?' }],
    ref_answer: 'Leonardo da Vinci',
    avg_score: 1,
    score: [[1]],
    trial_details: {
      run_input_data: { agent_name: 'browser_agent', task_config: {} },
      run_output_data: {
        agent_output: {},
        task_output: {
          answer: 'leonardo da vinci',
          prediction: 'Based on my research, the Mona Lisa was painted by Leonardo da Vinci.',
          score: 1,
        },
      },
      trajectory_info: { trajectory_path: '/traces/trace1.jsonl' },
    },
  },
});

const VARIANT_B_LINE = JSON.stringify({
  taskId: 'task_2',
  questionId: '67890',
  payload: {
    messages: [],
    avg_score: 0,
    score: [[0]],
    trial_details: {
      run_input_data: {
        agent_name: 'terminus2',
        task_config: {
          message: 'Set up a gRPC server that stores KV pairs',
          task_dir: '/benchmarks/grpc-kv',
        },
      },
      run_output_data: {
        agent_output: { exit_status: 'completed', n_iterations: 42 },
        task_output: {
          score: 0,
          test_results: {
            results: {
              tests: [
                { name: 'test_server_starts', status: 'passed', message: '' },
                { name: 'test_put_get', status: 'failed', message: 'Connection refused' },
              ],
            },
          },
        },
      },
      trajectory_info: { trajectory_path: '/traces/trace2.jsonl' },
    },
  },
});

const VARIANT_C_LINE = JSON.stringify({
  taskId: 44900,
  exerciseVersionId: 1075,
  questionId: 240184302,
  id: 42465998600220,
  productType: 'VLM',
  exerciseId: -1,
  date: '2026-05-23',
  payload: {
    __infer_status__: 'infer_success',
    __judge_status__: 'judge_success',
    _internal_question_id_: 240184302,
    avg_completion_tokens: 9539,
    avg_prompt_tokens: 482,
    avg_score: 0,
    max_score: 0,
    messages: [
      { role: 'system', content: '' },
      { role: 'user', content: 'Which choices are correct for this question?' },
    ],
    ref_answer: 'AB, A, AC',
    responses: [['BC, A, AB']],
    gpt_response: [['{\n    "参考答案的答案总结": "AB, A, AC",\n    "模型回复的答案总结": "BC, A, AB",\n    "是否一致": 0\n}']],
    thinking_responses: [['Let me think about this carefully...']],
    score: [[0]],
    usage: [[{ finish_reason: 'stop', stop_reason: '', result: {} }]],
    source: 'open_benchmark://bbeh_mini',
    task_lv1: '逻辑推理',
    task_lv2: 'sportqa',
    language: '英文',
    avg_finish_reason_length: 0,
  },
});

const VARIANT_C_FAILED_LINE = JSON.stringify({
  taskId: 44900,
  exerciseVersionId: 1075,
  questionId: 240199999,
  id: 42465998600221,
  productType: 'VLM',
  exerciseId: -1,
  date: '2026-05-23',
  payload: {
    __infer_status__: 'infer_failed',
    __judge_status__: 'judge_failed',
    avg_score: -100000,
    max_score: -100000,
    messages: [
      { role: 'system', content: '' },
      { role: 'user', content: 'Failed question' },
    ],
    score: [[-100000]],
    responses: [['']],
  },
});

const VARIANT_C_WITH_DIFFICULTY = JSON.stringify({
  taskId: 44900,
  exerciseVersionId: 1088,
  questionId: 272160600,
  id: 42465998600300,
  productType: 'VLM',
  exerciseId: -1,
  date: '2026-05-23',
  payload: {
    __infer_status__: 'infer_success',
    __judge_status__: 'judge_success',
    avg_score: 1,
    max_score: 1,
    messages: [{ role: 'user', content: 'Solve this logic puzzle' }],
    ref_answer: '25',
    responses: [['25']],
    score: [[1]],
    source: 'create://hecheng_animal_swap_20250903',
    task_lv1: '符号推理',
    task_lv2: '混合符号推理',
    task_lv3: '动物搬家',
    difficulty: '简单',
  },
});

const HYEVAL_TEXT = VARIANT_A_LINE + '\n' + VARIANT_B_LINE;

describe('hyevalParse', () => {
  describe('detect', () => {
    it('returns true for variant A (browsecomp)', () => {
      expect(hyevalParse.detect(VARIANT_A_LINE)).toBe(true);
    });

    it('returns true for variant B (terminal_bench)', () => {
      expect(hyevalParse.detect(VARIANT_B_LINE)).toBe(true);
    });

    it('returns true for variant C (standard eval without trial_details)', () => {
      expect(hyevalParse.detect(VARIANT_C_LINE)).toBe(true);
    });

    it('returns true for variant C with difficulty field', () => {
      expect(hyevalParse.detect(VARIANT_C_WITH_DIFFICULTY)).toBe(true);
    });

    it('returns false for regular JSONL', () => {
      expect(hyevalParse.detect('{"name":"alice"}\n{"name":"bob"}')).toBe(false);
    });

    it('returns false for OTel trajectory', () => {
      const otel = JSON.stringify({ type: 'START', span_id: 'x', trace_id: 't1' });
      expect(hyevalParse.detect(otel)).toBe(false);
    });

    it('returns false for JSON array', () => {
      expect(hyevalParse.detect('[{"a":1}]')).toBe(false);
    });

    it('returns false for CSV', () => {
      expect(hyevalParse.detect('name,score\nalice,1')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hyevalParse.detect('')).toBe(false);
    });
  });

  describe('process', () => {
    it('returns empty rows for null input', () => {
      const result = hyevalParse.process(null, {}, {});
      expect(result.rows).toEqual([]);
    });

    it('parses variant A correctly', () => {
      const result = hyevalParse.process(VARIANT_A_LINE, {}, {});
      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];
      expect(row.question_id).toBe('12345');
      expect(row.question).toBe('Who painted the Mona Lisa?');
      expect(row.ref_answer).toBe('Leonardo da Vinci');
      expect(row.prediction).toContain('Leonardo da Vinci');
      expect(row.answer).toBe('leonardo da vinci');
      expect(row.score).toBe(1);
      expect(row.trajectory_path).toBe('/traces/trace1.jsonl');
    });

    it('parses variant B correctly', () => {
      const result = hyevalParse.process(VARIANT_B_LINE, {}, {});
      expect(result.rows).toHaveLength(1);
      const row = result.rows[0];
      expect(row.question_id).toBe('67890');
      expect(row.question).toBe('Set up a gRPC server that stores KV pairs');
      expect(row.ref_answer).toBeNull();
      expect(row.prediction).toBeNull();
      expect(row.score).toBe(0);
      expect(row.agent_name).toBe('terminus2');
      expect(row.exit_status).toBe('completed');
      expect(row.n_iterations).toBe(42);
      expect(row.test_results.results.tests).toHaveLength(2);
      expect(row.task_dir).toBe('/benchmarks/grpc-kv');
    });

    it('handles mixed-variant file', () => {
      const result = hyevalParse.process(HYEVAL_TEXT, {}, {});
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].ref_answer).toBe('Leonardo da Vinci');
      expect(result.rows[1].agent_name).toBe('terminus2');
    });

    it('sets _detectedFormat to hyeval', () => {
      const result = hyevalParse.process(VARIANT_A_LINE, {}, {});
      expect(result.fieldMeta._detectedFormat).toBe('hyeval');
    });

    it('reports correct debug summary', () => {
      const result = hyevalParse.process(HYEVAL_TEXT, {}, {});
      expect(result._pluginDebug.summary).toBe('2 hyeval records');
      expect(result._pluginDebug.rowCount).toBe(2);
    });

    it('skips malformed lines', () => {
      const text = VARIANT_A_LINE + '\n{bad json\n' + VARIANT_B_LINE;
      const result = hyevalParse.process(text, {}, {});
      expect(result.rows).toHaveLength(2);
    });

    it('uses avg_score as fallback when task_output.score is missing', () => {
      const line = JSON.stringify({
        questionId: '999',
        payload: {
          messages: [{ role: 'user', content: 'test' }],
          avg_score: 0.5,
          trial_details: {
            run_input_data: {},
            run_output_data: { task_output: {} },
          },
        },
      });
      const result = hyevalParse.process(line, {}, {});
      expect(result.rows[0].score).toBe(0.5);
    });

    describe('variant C (standard eval)', () => {
      it('parses basic standard eval correctly', () => {
        const result = hyevalParse.process(VARIANT_C_LINE, {}, {});
        expect(result.rows).toHaveLength(1);
        const row = result.rows[0];
        expect(row.question_id).toBe(240184302);
        expect(row.question).toBe('Which choices are correct for this question?');
        expect(row.ref_answer).toBe('AB, A, AC');
        expect(row.prediction).toBe('BC, A, AB');
        expect(row.score).toBe(0);
        expect(row.avg_score).toBe(0);
        expect(row.agent_name).toBeNull();
        expect(row.exit_status).toBeNull();
      });

      it('extracts gpt_response as judge_response', () => {
        const result = hyevalParse.process(VARIANT_C_LINE, {}, {});
        const row = result.rows[0];
        expect(row.judge_response).toContain('是否一致');
      });

      it('extracts thinking_responses as thinking', () => {
        const result = hyevalParse.process(VARIANT_C_LINE, {}, {});
        const row = result.rows[0];
        expect(row.thinking).toBe('Let me think about this carefully...');
      });

      it('extracts metadata fields', () => {
        const result = hyevalParse.process(VARIANT_C_WITH_DIFFICULTY, {}, {});
        const row = result.rows[0];
        expect(row.task_lv1).toBe('符号推理');
        expect(row.task_lv2).toBe('混合符号推理');
        expect(row.task_lv3).toBe('动物搬家');
        expect(row.difficulty).toBe('简单');
        expect(row.source).toBe('create://hecheng_animal_swap_20250903');
      });

      it('extracts token stats', () => {
        const result = hyevalParse.process(VARIANT_C_LINE, {}, {});
        const row = result.rows[0];
        expect(row.avg_completion_tokens).toBe(9539);
        expect(row.avg_prompt_tokens).toBe(482);
      });

      it('extracts infer/judge status', () => {
        const result = hyevalParse.process(VARIANT_C_LINE, {}, {});
        const row = result.rows[0];
        expect(row.infer_status).toBe('infer_success');
        expect(row.judge_status).toBe('judge_success');
      });

      it('handles failed cases (score = -100000)', () => {
        const result = hyevalParse.process(VARIANT_C_FAILED_LINE, {}, {});
        expect(result.rows).toHaveLength(1);
        const row = result.rows[0];
        expect(row.score).toBe(-100000);
        expect(row.infer_status).toBe('infer_failed');
        expect(row.judge_status).toBe('judge_failed');
      });

      it('skips empty system message and uses user message as question', () => {
        const result = hyevalParse.process(VARIANT_C_LINE, {}, {});
        expect(result.rows[0].question).toBe('Which choices are correct for this question?');
      });

      it('uses first user message when system is empty', () => {
        const line = JSON.stringify({
          taskId: 1,
          questionId: 100,
          payload: {
            __infer_status__: 'infer_success',
            __judge_status__: 'judge_success',
            messages: [
              { role: 'system', content: '' },
              { role: 'user', content: 'Real question here' },
            ],
            score: [[1]],
            avg_score: 1,
            responses: [['answer']],
          },
        });
        const result = hyevalParse.process(line, {}, {});
        expect(result.rows[0].question).toBe('Real question here');
      });

      it('handles mixed agent + standard eval lines', () => {
        const mixed = VARIANT_A_LINE + '\n' + VARIANT_C_LINE + '\n' + VARIANT_B_LINE;
        const result = hyevalParse.process(mixed, {}, {});
        expect(result.rows).toHaveLength(3);
        expect(result.rows[0].agent_name).toBe('browser_agent');
        expect(result.rows[1].question_id).toBe(240184302);
        expect(result.rows[2].agent_name).toBe('terminus2');
      });

      it('extracts finish_reason from usage', () => {
        const result = hyevalParse.process(VARIANT_C_LINE, {}, {});
        expect(result.rows[0].finish_reason).toBe('stop');
      });

      it('finish_reason is null when usage is missing', () => {
        const line = JSON.stringify({
          taskId: 1,
          questionId: 200,
          payload: {
            __infer_status__: 'infer_success',
            __judge_status__: 'judge_success',
            messages: [{ role: 'user', content: 'q' }],
            score: [[0.5]],
            avg_score: 0.5,
          },
        });
        const result = hyevalParse.process(line, {}, {});
        expect(result.rows[0].finish_reason).toBeNull();
      });

      it('handles lines with no responses array', () => {
        const line = JSON.stringify({
          taskId: 1,
          questionId: 200,
          payload: {
            __infer_status__: 'infer_success',
            __judge_status__: 'judge_success',
            messages: [{ role: 'user', content: 'q' }],
            score: [[0.5]],
            avg_score: 0.5,
          },
        });
        const result = hyevalParse.process(line, {}, {});
        expect(result.rows[0].prediction).toBeNull();
        expect(result.rows[0].thinking).toBeNull();
        expect(result.rows[0].judge_response).toBeNull();
      });
    });
  });
});
