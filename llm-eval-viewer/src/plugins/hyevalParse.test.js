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

const HYEVAL_TEXT = VARIANT_A_LINE + '\n' + VARIANT_B_LINE;

describe('hyevalParse', () => {
  describe('detect', () => {
    it('returns true for variant A (browsecomp)', () => {
      expect(hyevalParse.detect(VARIANT_A_LINE)).toBe(true);
    });

    it('returns true for variant B (terminal_bench)', () => {
      expect(hyevalParse.detect(VARIANT_B_LINE)).toBe(true);
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
  });
});
