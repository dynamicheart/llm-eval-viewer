/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

import { createLogger } from '@/utils/pipelineLogger';
import { registerPlugin } from './pluginRegistry';

const logger = createLogger('trajectoryParse');

const TERMINAL_OUTPUT_PREFIXES = ['New Terminal Output:', 'Current Terminal Screen:', 'Current terminal state:'];
const isTerminalOutput = (content) => TERMINAL_OUTPUT_PREFIXES.some(p => content.startsWith(p));

let toolCallCounter = 0;

function extractTrajectoryRow(spans) {
  toolCallCounter = 0;
  const agentSpans = spans.filter(
    s => s.type === 'START' && s.name && s.name.startsWith('agent.'),
  );
  if (agentSpans.length === 0) return null;

  const agentSpan = agentSpans[0];
  const attrs = agentSpan.attributes || {};
  const agentInput = attrs.inputs?.agent_input || attrs.agent_input || {};

  const completionSpans = spans.filter(
    s => s.type === 'START' && s.name === 'openai_completion',
  );

  const conversation = [];
  const seenMsgKeys = new Set();
  let pendingToolCallId = null;

  for (const cs of completionSpans) {
    const msgs = cs.attributes?.inputs?.messages;
    if (!Array.isArray(msgs)) continue;
    for (const msg of msgs) {
      const key = `${msg.role}:${String(msg.content ?? '').slice(0, 80)}`;
      if (seenMsgKeys.has(key)) continue;
      seenMsgKeys.add(key);

      const enriched = { role: msg.role, content: msg.content };

      if (msg.role === 'assistant' && typeof msg.content === 'string') {
        try {
          const parsed = JSON.parse(msg.content);
          if (Array.isArray(parsed.commands) && parsed.commands.length > 0) {
            const toolCalls = parsed.commands
              .filter(c => c.keystrokes)
              .map((c, i) => {
                const id = `call_${toolCallCounter++}`;
                return {
                  id,
                  type: 'function',
                  function: { name: 'terminal', arguments: c.keystrokes },
                };
              });
            enriched.tool_calls = toolCalls;
            pendingToolCallId = toolCalls.length === 1 ? toolCalls[0].id : null;
          }
          if (parsed.analysis || parsed.plan) {
            const parts = [];
            if (parsed.analysis) parts.push(parsed.analysis);
            if (parsed.plan) parts.push(parsed.plan);
            enriched.content = parts.join('\n\n');
            if (parts.length === 2) {
              enriched._sections = [
                { label: 'Analysis', length: parts[0].length },
                { label: 'Plan', length: parts[1].length },
              ];
            }
          }
        } catch { /* not JSON */ }
      }

      // Convert terminal output user messages to tool results
      if (msg.role === 'user' && typeof msg.content === 'string' && isTerminalOutput(msg.content)) {
        enriched.role = 'tool';
        enriched.tool_call_id = pendingToolCallId || '';
        enriched.content = msg.content;
        pendingToolCallId = null;
      }

      conversation.push(enriched);
    }
  }

  // Model config from first completion span
  let modelConfig = {};
  if (completionSpans.length > 0) {
    const kwargs = completionSpans[0].attributes?.inputs?.kwargs || {};
    modelConfig = {
      model: completionSpans[0].attributes?.inputs?.model || agentInput.model_name || '',
      temperature: kwargs.temperature,
      top_p: kwargs.top_p,
      top_k: kwargs.top_k,
      max_tokens: kwargs.max_tokens,
    };
  }

  // Score from task UPDATE events
  let score = null;
  let testResults = null;
  for (const s of spans) {
    if (s.type === 'UPDATE') {
      const outputs = s.attributes?.outputs;
      if (!outputs) continue;
      if (outputs.score !== undefined) score = outputs.score;
      if (outputs.test_results !== undefined) testResults = outputs.test_results;
    }
  }

  return {
    task: agentInput.user_prompt || '',
    model_name: agentInput.model_name || modelConfig.model || '',
    temperature: modelConfig.temperature ?? null,
    top_p: modelConfig.top_p ?? null,
    top_k: modelConfig.top_k ?? null,
    max_tokens: modelConfig.max_tokens ?? null,
    max_iterations: agentInput.max_iterations ?? null,
    context_limit: agentInput.context_limit ?? null,
    score,
    test_results: typeof testResults === 'object' ? JSON.stringify(testResults, null, 2) : testResults,
    conversation,
    trace_id: spans[0]?.trace_id || '',
    total_spans: spans.length,
    completion_count: completionSpans.length,
  };
}

const trajectoryParse = {
  id: 'trajectoryParse',
  stage: 'parse',
  required: false,
  execution: 'once',
  order: -10,

  detect(text) {
    const firstLine = text.trimStart().split('\n').find(l => l.trim());
    if (!firstLine) return false;
    try {
      const obj = JSON.parse(firstLine);
      return !!(obj.type === 'START' && obj.span_id && obj.trace_id);
    } catch {
      return false;
    }
  },

  process(text, fieldMeta) {
    if (text == null) return { rows: [], fieldMeta };

    const lines = text.split('\n').filter(l => l.trim());
    const spans = [];
    for (const line of lines) {
      try { spans.push(JSON.parse(line)); } catch { /* skip */ }
    }

    if (spans.length === 0) return { rows: [], fieldMeta };

    const row = extractTrajectoryRow(spans);
    if (!row) return { rows: [], fieldMeta };

    logger.detail(`parsed trajectory: ${row.total_spans} spans, ${row.conversation?.length || 0} msgs`);

    return {
      rows: [row],
      fieldMeta: { ...fieldMeta, _detectedFormat: 'otel-trajectory' },
      _pluginDebug: {
        summary: `1 trajectory, ${row.total_spans} spans, ${row.conversation?.length || 0} msgs`,
      },
    };
  },
};

registerPlugin(trajectoryParse);
export default trajectoryParse;
