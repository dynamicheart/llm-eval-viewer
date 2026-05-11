/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Generic parser worker for the Custom Viewer.
 * Thin executor — all logic lives in registered pipeline plugins.
 */

import { runPipeline } from '@/utils/pipelineRunner';

// Import plugins to register them
import '@/plugins/formatParse';
import '@/plugins/detectTypes';
import '@/plugins/scoring';
import '@/plugins/trajectoryParse';
import '@/plugins/hyevalParse';

// ===== Message handler =====

self.onmessage = (e) => {
  const { text, expandNestedJsonStrings = true, fileName } = e.data;

  const result = runPipeline(text, {
    expandNestedJsonStrings,
    enabledPluginIds: [], // No optional plugins in worker (they run in main thread)
    progressCallback: (percent) => {
      self.postMessage({ type: 'progress', percent });
    },
    fileName,
  });

  self.postMessage({
    type: 'done',
    rows: result.rows,
    timings: result.timings,
    fieldMeta: result.fieldMeta,
    detectedFormat: result.detectedFormat,
    formatDebug: result.formatDebug,
  });
};
