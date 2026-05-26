/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

/**
 * Library entry point for llm-eval-viewer.
 *
 * Usage as Vue plugin:
 *   import { LlmEvalViewer } from 'llm-eval-viewer'
 *   app.use(LlmEvalViewer, { basePath: '/viewer' })
 *
 * Usage as individual components:
 *   import { CustomViewerView, EvalscopeReviewsView } from 'llm-eval-viewer'
 */

import EvalscopeReviewsView from '@/views/EvalscopeReviewsView.vue';
import EvalscopePredictionsView from '@/views/EvalscopePredictionsView.vue';
import MevalView from '@/views/MevalView.vue';
import CustomViewerView from '@/views/CustomViewerView.vue';
import { pluginRegistry, registerPlugin, runPlugins, getPluginsByStage, getOptionalPlugins } from '@/plugins/pluginRegistry';

const viewerRoutes = [
  { path: 'evalscope/reviews', name: 'EvalscopeReviews', component: EvalscopeReviewsView },
  { path: 'evalscope/predictions', name: 'EvalscopePredictions', component: EvalscopePredictionsView },
  { path: 'meval', name: 'Meval', component: MevalView },
  { path: 'custom', name: 'CustomViewer', component: CustomViewerView },
];

const LlmEvalViewer = {
  install(app, options = {}) {
    const router = options.router;
    const basePath = options.basePath || '/viewer';

    if (router) {
      for (const route of viewerRoutes) {
        router.addRoute({
          path: `${basePath}/${route.path}`,
          name: route.name,
          component: route.component,
        });
      }
      router.addRoute({
        path: basePath,
        redirect: `${basePath}/evalscope/reviews`,
      });
    }

    app.config.globalProperties.$viewerBasePath = basePath;
  },
};

export {
  LlmEvalViewer,
  EvalscopeReviewsView,
  EvalscopePredictionsView,
  MevalView,
  CustomViewerView,
  viewerRoutes,
  pluginRegistry,
  registerPlugin,
  runPlugins,
  getPluginsByStage,
  getOptionalPlugins,
};

export default LlmEvalViewer;
