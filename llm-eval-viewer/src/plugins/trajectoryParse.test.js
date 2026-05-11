/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

import { describe, it, expect } from 'vitest';
import trajectoryParse from './trajectoryParse';

const TRAJECTORY_TEXT = JSON.stringify({ type: 'START', span_id: 'abc', trace_id: 't1', time_unix_nano: 1, parent_span_id: '', name: 'task.test', attributes: { type: 'task', name: 'test', inputs: { task_input: { message: 'Build a calculator' } } }, events: [], status: { code: 'UNSET', message: null } })
  + '\n' + JSON.stringify({ type: 'UPDATE', span_id: 'abc', time_unix_nano: 2, attributes: null, events: null, status: null })
  + '\n' + JSON.stringify({ type: 'START', span_id: 'agent1', time_unix_nano: 3, parent_span_id: 'abc', trace_id: 't1', name: 'agent.test', attributes: { type: 'agent', name: 'test', inputs: { agent_input: { user_prompt: 'Build a calculator', model_name: 'gpt-4', max_iterations: 100, context_limit: 131072 } } }, events: [], status: { code: 'UNSET', message: null } })
  + '\n' + JSON.stringify({ type: 'START', span_id: 'oai1', time_unix_nano: 4, parent_span_id: 'agent1', trace_id: 't1', name: 'openai_completion', attributes: { _client_key: 'main', inputs: { messages: [{ role: 'user', content: 'Build a calculator' }], model: 'gpt-4', kwargs: { temperature: 0.7, top_p: 1, top_k: -1, max_tokens: 4096 } } }, events: [], status: { code: 'UNSET', message: null } })
  + '\n' + JSON.stringify({ type: 'UPDATE', span_id: 'oai1', time_unix_nano: 5, attributes: { outputs: { id: 'chatcmpl-1', choices: [{ finish_reason: 'stop', index: 0, message: { content: 'Sure, I will build it.' } }] } }, events: null, status: null })
  + '\n' + JSON.stringify({ type: 'END', span_id: 'oai1', time_unix_nano: 6, attributes: null, events: null, status: { code: 'OK', message: null } })
  + '\n' + JSON.stringify({ type: 'START', span_id: 'oai2', time_unix_nano: 7, parent_span_id: 'agent1', trace_id: 't1', name: 'openai_completion', attributes: { _client_key: 'main', inputs: { messages: [{ role: 'user', content: 'Build a calculator' }, { role: 'assistant', content: 'Sure, I will build it.' }, { role: 'user', content: 'Here is the terminal output.' }], model: 'gpt-4', kwargs: { temperature: 0.7 } } }, events: [], status: { code: 'UNSET', message: null } })
  + '\n' + JSON.stringify({ type: 'UPDATE', span_id: 'abc', time_unix_nano: 8, attributes: { outputs: { score: 0.85, test_results: { tests: 5, passed: 4, failed: 1 } } }, events: null, status: null })
  + '\n' + JSON.stringify({ type: 'END', span_id: 'agent1', time_unix_nano: 9, attributes: null, events: null, status: { code: 'OK', message: null } })
  + '\n' + JSON.stringify({ type: 'END', span_id: 'abc', time_unix_nano: 10, attributes: null, events: null, status: { code: 'OK', message: null } });

describe('trajectoryParse', () => {
  describe('detect', () => {
    it('returns true for OTel trace JSONL', () => {
      expect(trajectoryParse.detect(TRAJECTORY_TEXT)).toBe(true);
    });

    it('returns false for regular JSONL', () => {
      const jsonl = '{"name":"alice","age":30}\n{"name":"bob","age":25}';
      expect(trajectoryParse.detect(jsonl)).toBe(false);
    });

    it('returns false for JSON array', () => {
      expect(trajectoryParse.detect('[{"a":1}]')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(trajectoryParse.detect('')).toBe(false);
    });

    it('returns false for CSV', () => {
      expect(trajectoryParse.detect('name,age\nalice,30')).toBe(false);
    });
  });

  describe('process', () => {
    it('parses trajectory into 1 row', () => {
      const result = trajectoryParse.process(TRAJECTORY_TEXT, {});
      expect(result.rows).toHaveLength(1);
      expect(result.fieldMeta._detectedFormat).toBe('otel-trajectory');
    });

    it('extracts task and model fields', () => {
      const row = trajectoryParse.process(TRAJECTORY_TEXT, {}).rows[0];
      expect(row.task).toBe('Build a calculator');
      expect(row.model_name).toBe('gpt-4');
      expect(row.max_iterations).toBe(100);
      expect(row.context_limit).toBe(131072);
      expect(row.temperature).toBe(0.7);
      expect(row.top_p).toBe(1);
      expect(row.top_k).toBe(-1);
      expect(row.max_tokens).toBe(4096);
    });

    it('extracts score and test_results', () => {
      const row = trajectoryParse.process(TRAJECTORY_TEXT, {}).rows[0];
      expect(row.score).toBe(0.85);
      expect(row.test_results).toContain('"tests": 5');
      expect(row.test_results).toContain('"passed": 4');
    });

    it('converts terminus2 commands to tool_calls on assistant messages', () => {
      const assistantMsg = JSON.stringify({ analysis: 'need to run R', plan: 'check R', commands: [{ keystrokes: 'which R\n', duration: 1 }] });
      const text = JSON.stringify({ type: 'START', span_id: 's1', trace_id: 't1', name: 'task.x', attributes: {}, events: [], status: {} })
        + '\n' + JSON.stringify({ type: 'START', span_id: 'a1', trace_id: 't1', parent_span_id: 's1', name: 'agent.x', attributes: { inputs: { agent_input: { user_prompt: 'test' } } }, events: [], status: {} })
        + '\n' + JSON.stringify({ type: 'START', span_id: 'o1', trace_id: 't1', parent_span_id: 'a1', name: 'openai_completion', attributes: { inputs: { messages: [{ role: 'user', content: 'do it' }, { role: 'assistant', content: assistantMsg }, { role: 'user', content: 'New Terminal Output:\nR not found' }] } }, events: [], status: {} })
        + '\n' + JSON.stringify({ type: 'END', span_id: 's1', trace_id: 't1', attributes: {}, events: [], status: {} });
      const row = trajectoryParse.process(text, {}).rows[0];

      const asst = row.conversation.find(m => m.role === 'assistant');
      expect(asst.tool_calls).toHaveLength(1);
      expect(asst.tool_calls[0].function.name).toBe('terminal');
      expect(asst.tool_calls[0].function.arguments).toBe('which R\n');
      expect(asst.tool_calls[0].id).toMatch(/^call_\d+$/);
      expect(asst.reasoning_content).toBeUndefined();
      expect(asst.content).toBe('need to run R\n\ncheck R');

      // Terminal output user message should become tool result
      const toolResult = row.conversation.find(m => m.role === 'tool');
      expect(toolResult).toBeDefined();
      expect(toolResult.tool_call_id).toBe(asst.tool_calls[0].id);
      expect(toolResult.content).toContain('New Terminal Output:');
    });

    it('deduplicates conversation across spans', () => {
      const row = trajectoryParse.process(TRAJECTORY_TEXT, {}).rows[0];
      expect(row.conversation).toHaveLength(3);
      expect(row.conversation[0]).toEqual({ role: 'user', content: 'Build a calculator' });
      expect(row.conversation[1]).toEqual({ role: 'assistant', content: 'Sure, I will build it.' });
      expect(row.conversation[2]).toEqual({ role: 'user', content: 'Here is the terminal output.' });
    });

    it('sets trace_id and total_spans', () => {
      const row = trajectoryParse.process(TRAJECTORY_TEXT, {}).rows[0];
      expect(row.trace_id).toBe('t1');
      expect(row.total_spans).toBe(10);
    });

    it('returns empty rows for non-trajectory JSONL', () => {
      const result = trajectoryParse.process('{"a":1}\n{"b":2}', {});
      expect(result.rows).toHaveLength(0);
    });

    it('handles null input', () => {
      const result = trajectoryParse.process(null, {});
      expect(result.rows).toHaveLength(0);
    });

    it('sets _pluginDebug summary', () => {
      const result = trajectoryParse.process(TRAJECTORY_TEXT, {});
      expect(result._pluginDebug.summary).toContain('1 trajectory');
      expect(result._pluginDebug.summary).toContain('10 spans');
      expect(result._pluginDebug.summary).toContain('3 msgs');
    });
  });
});
