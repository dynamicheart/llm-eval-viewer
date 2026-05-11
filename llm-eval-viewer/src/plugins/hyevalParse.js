/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

import { registerPlugin } from './pluginRegistry';

function extractHyevalRow(obj) {
  const payload = obj.payload || {};
  const trialDetails = payload.trial_details || {};
  const runInput = trialDetails.run_input_data || {};
  const runOutput = trialDetails.run_output_data || {};
  const taskOutput = runOutput.task_output || {};
  const agentOutput = runOutput.agent_output || {};
  const taskConfig = runInput.task_config || {};
  const messages = payload.messages || [];
  const trajectoryInfo = trialDetails.trajectory_info || {};

  const question = (messages.length > 0 && messages[0].content)
    ? messages[0].content
    : (taskConfig.message || null);

  const score = taskOutput.score !== undefined
    ? taskOutput.score
    : (payload.avg_score ?? null);

  return {
    question_id: obj.questionId || null,
    question,
    ref_answer: payload.ref_answer !== undefined ? payload.ref_answer : null,
    prediction: taskOutput.prediction || null,
    answer: taskOutput.answer || null,
    score,
    avg_score: payload.avg_score ?? null,
    agent_name: runInput.agent_name || null,
    exit_status: agentOutput.exit_status || null,
    n_iterations: agentOutput.n_iterations ?? null,
    test_results: taskOutput.test_results || null,
    task_dir: taskConfig.task_dir || null,
    trajectory_path: trajectoryInfo.trajectory_path || null,
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
      return !!(
        obj.payload &&
        typeof obj.payload === 'object' &&
        obj.payload.trial_details &&
        typeof obj.payload.trial_details === 'object'
      );
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
