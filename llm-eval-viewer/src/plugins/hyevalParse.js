/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

import { registerPlugin } from './pluginRegistry';

function getFirstUserContent(messages) {
  if (!messages || !messages.length) return null;
  for (const m of messages) {
    if (m.role === 'user' && m.content) return m.content;
  }
  if (messages[0].content) return messages[0].content;
  return null;
}

/**
 * The question is the last user message: multi-turn datasets (e.g. MRCR) carry
 * the whole dialogue as context and only ask the actual question at the end.
 * Single-turn exports are unaffected (first == last user message).
 */
function getLastUserContent(messages) {
  if (!messages || !messages.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && m.content) return m.content;
  }
  return getFirstUserContent(messages);
}

/**
 * Prefer the normalized export field, then fall back to the dataset-owned
 * ground truth carried in payload.details. The latter is input metadata, not
 * model output (for example MRCR's prefixed target response).
 */
function getReferenceAnswer(payload) {
  if (payload.ref_answer != null) return payload.ref_answer;
  const details = payload.details;
  if (details && typeof details === 'object' && details.answer != null) {
    return details.answer;
  }
  return null;
}

function extractHyevalRow(obj) {
  const payload = obj.payload || {};
  const trialDetails = payload.trial_details;
  const messages = payload.messages || [];

  // Agent-eval exports carry run_input_data in trial_details; some standard
  // exports still include a trial_details stub holding telemetry only
  // (run_output_data.processor_results), which must take the standard path
  if (trialDetails && typeof trialDetails === 'object' && trialDetails.run_input_data) {
    return extractAgentRow(obj, payload, trialDetails, messages);
  }
  return extractStandardRow(obj, payload, messages);
}

function extractAgentRow(obj, payload, trialDetails, messages) {
  const runInput = trialDetails.run_input_data || {};
  const runOutput = trialDetails.run_output_data || {};
  const taskOutput = runOutput.task_output || {};
  const agentOutput = runOutput.agent_output || {};
  const agentConfig = runInput.agent_config || {};
  const taskConfig = runInput.task_config || {};
  const trajectoryInfo = trialDetails.trajectory_info || {};
  const usage = payload.usage;

  const question = (messages.length > 0 && messages[0].content)
    ? messages[0].content
    : (taskConfig.message || null);

  const score = taskOutput.score !== undefined
    ? taskOutput.score
    : (payload.avg_score ?? null);

  return {
    question_id: obj.questionId || null,
    question,
    ref_answer: getReferenceAnswer(payload),
    prediction: taskOutput.prediction || null,
    answer: taskOutput.answer || null,
    score,
    avg_score: payload.avg_score ?? null,
    agent_name: runInput.agent_name || null,
    exit_status: agentOutput.exit_status || null,
    n_iterations: agentOutput.n_iterations ?? null,
    final_answer: agentOutput.final_answer || null,
    test_results: taskOutput.test_results || null,
    task_dir: taskConfig.task_dir || null,
    trajectory_path: trajectoryInfo.trajectory_path || null,
    trajectory_chat_path: trajectoryInfo.trajectory_chat_path || null,
    masked_content_path: trajectoryInfo.masked_content_path || null,
    max_iterations: agentConfig.max_iterations ?? null,
    thinking: null,
    judge_response: null,
    task_lv1: null,
    task_lv2: null,
    task_lv3: null,
    difficulty: null,
    source: null,
    language: null,
    dataset: null,
    infer_status: null,
    judge_status: null,
    avg_completion_tokens: payload.avg_completion_tokens ?? null,
    avg_prompt_tokens: payload.avg_prompt_tokens ?? null,
    finish_reason: (Array.isArray(usage) && Array.isArray(usage[0]) && usage[0][0] && usage[0][0].finish_reason)
      ? usage[0][0].finish_reason
      : null,
    infer_time: (payload.time_info && payload.time_info.infer_complete_time) || null,
  };
}

function extractStandardRow(obj, payload, messages) {
  const question = getLastUserContent(messages);
  const responses = payload.responses;
  const prediction = (Array.isArray(responses) && Array.isArray(responses[0]) && responses[0][0])
    ? responses[0][0]
    : null;
  const gptResp = payload.gpt_response;
  const judgeResponse = (Array.isArray(gptResp) && Array.isArray(gptResp[0]) && gptResp[0][0])
    ? gptResp[0][0]
    : null;
  const thinkResp = payload.thinking_responses;
  const thinking = (Array.isArray(thinkResp) && Array.isArray(thinkResp[0]) && thinkResp[0][0])
    ? thinkResp[0][0]
    : null;
  const usage = payload.usage;
  const finishReason = (Array.isArray(usage) && Array.isArray(usage[0]) && usage[0][0] && usage[0][0].finish_reason)
    ? usage[0][0].finish_reason
    : null;

  return {
    question_id: obj.questionId || null,
    question,
    ref_answer: getReferenceAnswer(payload),
    prediction,
    answer: null,
    score: payload.avg_score ?? null,
    avg_score: payload.avg_score ?? null,
    agent_name: null,
    exit_status: null,
    n_iterations: null,
    final_answer: null,
    test_results: null,
    task_dir: null,
    trajectory_path: null,
    trajectory_chat_path: null,
    masked_content_path: null,
    max_iterations: null,
    thinking,
    judge_response: judgeResponse,
    task_lv1: payload.task_lv1 || null,
    task_lv2: payload.task_lv2 || null,
    task_lv3: payload.task_lv3 || null,
    difficulty: payload.difficulty || null,
    source: payload.source || null,
    language: payload.language || null,
    infer_status: payload.__infer_status__ || null,
    judge_status: payload.__judge_status__ || null,
    avg_completion_tokens: payload.avg_completion_tokens ?? null,
    avg_prompt_tokens: payload.avg_prompt_tokens ?? null,
    finish_reason: finishReason,
    infer_time: (payload.time_info && payload.time_info.infer_complete_time) || null,
  };
}

const hyevalParse = {
  id: 'hyevalParse',
  stage: 'parse',
  required: false,
  execution: 'once',
  order: -5,

  detect(text) {
    const firstLine = text.trimStart().split('\n').find(l => l.trim());
    if (!firstLine) return false;
    try {
      const obj = JSON.parse(firstLine);
      if (!obj.payload || typeof obj.payload !== 'object') return false;
      const p = obj.payload;
      if (p.trial_details && typeof p.trial_details === 'object') return true;
      if (p.__infer_status__ && Array.isArray(p.score)) return true;
      return false;
    } catch {
      return false;
    }
  },

  process(text, fieldMeta, context) {
    if (text == null) return { rows: [], fieldMeta };

    const { progressCallback } = context || {};
    const lines = text.split('\n');
    const rows = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.payload) {
          rows.push(extractHyevalRow(obj));
        }
      } catch { /* skip malformed */ }
      if (progressCallback && i % 200 === 0) {
        progressCallback(Math.round((i / lines.length) * 50));
      }
    }

    if (progressCallback) progressCallback(50);

    return {
      rows,
      fieldMeta: { ...fieldMeta, _detectedFormat: 'hyeval' },
      _pluginDebug: {
        summary: `${rows.length} hyeval records`,
        rowCount: rows.length,
      },
    };
  },
};

registerPlugin(hyevalParse);
export default hyevalParse;
