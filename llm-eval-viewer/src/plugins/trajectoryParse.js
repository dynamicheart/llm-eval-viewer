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
    s => s.type === 'START' && s.name && (s.name.startsWith('agent.') || s.name.endsWith('_agent') || s.name === 'search'),
  );
  if (agentSpans.length === 0) return null;

  // Prefer the deepest agent span (the one with a parent_span_id)
  const agentSpan = agentSpans.find(s => s.parent_span_id) || agentSpans[0];
  const attrs = agentSpan.attributes || {};
  const agentInput = attrs.inputs?.agent_input || attrs.inputs?.task_input || attrs.inputs || {};

  const completionSpans = spans.filter(
    s => s.type === 'START' && s.name === 'openai_completion',
  );

  // Build span_id → UPDATE outputs map (assistant responses)
  const outputsBySpanId = {};
  for (const s of spans) {
    if (s.type === 'UPDATE' && s.span_id) {
      const outputs = s.attributes?.outputs;
      if (outputs && outputs.choices) {
        const choice = outputs.choices[0];
        const msg = choice?.message || null;
        const psf = choice?.provider_specific_fields || {};
        outputsBySpanId[s.span_id] = {
          message: msg,
          finish_reason: choice?.finish_reason || null,
          native_finish_reason: psf.native_finish_reason || null,
        };
      }
    }
  }

  // Split completions by parent: agent completions vs judge/eval completions
  const agentSpanId = agentSpan.span_id;
  const agentCompletions = [];
  const judgeCompletions = [];
  for (const cs of completionSpans) {
    if (cs.parent_span_id === agentSpanId) {
      agentCompletions.push(cs);
    } else {
      judgeCompletions.push(cs);
    }
  }

  const conversation = buildConversation(agentCompletions, outputsBySpanId);
  const rawCalls = buildRawCalls(agentCompletions, outputsBySpanId);
  const spanTree = buildSpanTree(spans, outputsBySpanId);
  const judgeConversation = judgeCompletions.length > 0 ? buildConversation(judgeCompletions, outputsBySpanId) : null;
  const judgeRawCalls = judgeCompletions.length > 0 ? buildRawCalls(judgeCompletions, outputsBySpanId) : [];

  // Model config from first completion span
  let modelConfig = {};
  if (agentCompletions.length > 0) {
    const kwargs = agentCompletions[0].attributes?.inputs?.kwargs || {};
    modelConfig = {
      model: agentCompletions[0].attributes?.inputs?.model || agentInput.model_name || '',
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

  const row = {
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
    rawCalls,
    spanTree,
    trace_id: spans[0]?.trace_id || '',
    total_spans: spans.length,
    completion_count: completionSpans.length,
  };

  // Diagnostics: collect non-standard finish reasons + server errors
  const diag = {};
  for (const c of rawCalls) {
    const reason = c.native_finish_reason || c.finish_reason || 'no_response';
    if (reason !== 'stop' && reason !== 'tool_calls') {
      diag[reason] = (diag[reason] || 0) + 1;
    }
  }
  for (const s of spans) {
    if (s.type === 'UPDATE' && s.status?.code === 'ERROR') {
      diag['server_error'] = (diag['server_error'] || 0) + 1;
    }
  }
  if (Object.keys(diag).length) row.diagnostics = diag;

  if (judgeConversation) {
    row.conversations = [conversation, judgeConversation];
    row.rawCallsList = [rawCalls, judgeRawCalls];
  }

  return row;
}

function buildConversation(completionSpans, outputsBySpanId) {
  if (completionSpans.length === 0) return [];

  // Simplified: take last completion's full input + its output
  const last = completionSpans[completionSpans.length - 1];
  const msgs = last.attributes?.inputs?.messages;
  if (!Array.isArray(msgs)) return [];

  const conversation = [];
  const seenMsgKeys = new Set();
  let pendingToolCallId = null;

  for (const msg of msgs) {
    appendMessage(msg, conversation, seenMsgKeys, pendingToolCallId);
    pendingToolCallId = getPendingToolCallId(conversation);
  }

  const outputInfo = outputsBySpanId[last.span_id];
  if (outputInfo && outputInfo.message) {
    appendMessage(outputInfo.message, conversation, seenMsgKeys, pendingToolCallId);
    if (outputInfo.native_finish_reason) {
      const lastMsg = conversation[conversation.length - 1];
      if (lastMsg) lastMsg.native_finish_reason = outputInfo.native_finish_reason;
    }
    if (outputInfo.finish_reason) {
      const lastMsg = conversation[conversation.length - 1];
      if (lastMsg) lastMsg.finish_reason = outputInfo.finish_reason;
    }
  }

  // Dedup warning: check if earlier completions had messages not in the last one
  if (completionSpans.length > 1) {
    const firstMsgs = completionSpans[0].attributes?.inputs?.messages;
    if (Array.isArray(firstMsgs)) {
      const lastKeys = new Set(msgs.map(m =>
        `${m.role}:${String(m.content ?? '').slice(0, 80)}`,
      ));
      const missing = firstMsgs.filter(m =>
        !lastKeys.has(`${m.role}:${String(m.content ?? '').slice(0, 80)}`),
      );
      if (missing.length > 0) {
        logger.detail(`dedup warning: ${missing.length} msgs in first completion not found in last (possible context truncation)`);
      }
    }
  }

  return conversation;
}

function buildRawCalls(completionSpans, outputsBySpanId) {
  const calls = [];
  for (let i = 0; i < completionSpans.length; i++) {
    const cs = completionSpans[i];
    const msgs = cs.attributes?.inputs?.messages;
    const outputInfo = outputsBySpanId[cs.span_id] || null;
    const output = outputInfo?.message || null;

    // Extract only new messages (after the last assistant in input)
    let newMsgs = [];
    if (Array.isArray(msgs)) {
      let lastAsstIdx = -1;
      for (let j = msgs.length - 1; j >= 0; j--) {
        if (msgs[j].role === 'assistant') { lastAsstIdx = j; break; }
      }
      newMsgs = msgs.slice(lastAsstIdx + 1);
    }

    const hasOutput = output && (output.content || output.tool_calls);
    calls.push({
      index: i + 1,
      span_id: cs.span_id,
      input: newMsgs,
      output: output ? {
        role: 'assistant',
        content: output.content ?? null,
        reasoning_content: output.reasoning_content ?? null,
        tool_calls: output.tool_calls ?? null,
      } : null,
      empty: !hasOutput,
      finish_reason: outputInfo?.finish_reason || null,
      native_finish_reason: outputInfo?.native_finish_reason || null,
    });
  }
  return calls;
}

function buildSpanTree(spans, outputsBySpanId) {
  const startSpans = spans.filter(s => s.type === 'START' && s.name);
  const nodeMap = {};

  // First pass: create all nodes
  for (const s of startSpans) {
    const node = { name: s.name, span_id: s.span_id, parent_span_id: s.parent_span_id, children: [] };

    if (s.name === 'openai_completion') {
      const outputInfo = outputsBySpanId[s.span_id];
      const output = outputInfo?.message || null;
      if (output) {
        if (output.tool_calls && output.tool_calls.length > 0) {
          node.result = output.tool_calls.map(tc => tc.function?.name || 'tool_call').join(', ');
          node.type = 'tool_call';
        } else if (output.content) {
          node.result = output.content.length > 60 ? output.content.slice(0, 60) + '...' : output.content;
          node.type = 'content';
        } else {
          node.result = null;
          node.type = 'empty';
        }
      } else {
        node.result = null;
        node.type = 'empty';
      }

      // Input preview
      const msgs = s.attributes?.inputs?.messages;
      if (Array.isArray(msgs)) {
        node.inputCount = msgs.length;
        let lastAsstIdx = -1;
        for (let j = msgs.length - 1; j >= 0; j--) {
          if (msgs[j].role === 'assistant') { lastAsstIdx = j; break; }
        }
        const newMsgs = msgs.slice(lastAsstIdx + 1);
        node.inputPreview = newMsgs.slice(0, 3).map(m => ({
          role: m.role,
          text: typeof m.content === 'string' ? (m.content.length > 100 ? m.content.slice(0, 100) + '...' : m.content) : '',
        }));
      }

      // Output preview
      if (output) {
        const parts = [];
        if (output.reasoning_content) parts.push(`[reasoning: ${output.reasoning_content.length} chars]`);
        if (output.content) parts.push(output.content.length > 120 ? output.content.slice(0, 120) + '...' : output.content);
        if (output.tool_calls) {
          for (const tc of output.tool_calls) {
            const args = tc.function?.arguments || '';
            parts.push(`${tc.function?.name}(${args.length > 80 ? args.slice(0, 80) + '...' : args})`);
          }
        }
        const effectiveReason = outputInfo?.native_finish_reason || outputInfo?.finish_reason;
        if (effectiveReason && effectiveReason !== 'stop' && effectiveReason !== 'tool_calls') parts.push(`[${effectiveReason}]`);
        node.outputPreview = parts.join('\n') || null;
      }
    }

    nodeMap[s.span_id] = node;
  }

  // Second pass: link children to parents
  const roots = [];
  for (const node of Object.values(nodeMap)) {
    const parent = node.parent_span_id ? nodeMap[node.parent_span_id] : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function getPendingToolCallId(conversation) {
  if (conversation.length === 0) return null;
  const last = conversation[conversation.length - 1];
  if (last.tool_calls && last.tool_calls.length === 1) {
    return last.tool_calls[0].id;
  }
  return null;
}

function appendMessage(msg, conversation, seenMsgKeys, pendingToolCallId) {
  const toolCalls = msg.tool_calls;
  const reasoning = msg.reasoning_content;
  const key = `${msg.role}:${String(msg.content ?? '').slice(0, 80)}:${toolCalls?.[0]?.id || ''}`;
  if (seenMsgKeys.has(key)) return;
  seenMsgKeys.add(key);

  const enriched = { role: msg.role, content: msg.content };

  if (msg.role === 'assistant') {
    if (reasoning) {
      enriched.reasoning_content = reasoning;
    }

    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      enriched.tool_calls = toolCalls;
      if (!enriched.content) enriched.content = '';
      pendingToolCallId = toolCalls.length === 1 ? toolCalls[0].id : null;
    } else if (typeof msg.content === 'string') {
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed.commands) && parsed.commands.length > 0) {
          const synthCalls = parsed.commands
            .filter(c => c.keystrokes)
            .map((c) => {
              const id = `call_${toolCallCounter++}`;
              return {
                id,
                type: 'function',
                function: { name: 'terminal', arguments: c.keystrokes },
              };
            });
          enriched.tool_calls = synthCalls;
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
  }

  if (msg.role === 'tool') {
    enriched.tool_call_id = msg.tool_call_id || pendingToolCallId || '';
  } else if (msg.role === 'user' && typeof msg.content === 'string' && isTerminalOutput(msg.content)) {
    enriched.role = 'tool';
    enriched.tool_call_id = pendingToolCallId || '';
    enriched.content = msg.content;
  }

  conversation.push(enriched);
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

    row.rawSpans = spans;

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
