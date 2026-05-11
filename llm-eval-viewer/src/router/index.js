/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

import { createRouter, createWebHashHistory } from 'vue-router';
import EvalscopeReviewsView from '@/views/EvalscopeReviewsView.vue';
import EvalscopePredictionsView from '@/views/EvalscopePredictionsView.vue';
import MevalView from '@/views/MevalView.vue';
import CustomViewerView from '@/views/CustomViewerView.vue';

const routes = [
  {
    path: '/',
    redirect: '/evalscope/reviews',
  },

  // Evalscope routes
  {
    path: '/evalscope/reviews',
    name: 'EvalscopeReviews',
    component: EvalscopeReviewsView,
  },
  {
    path: '/evalscope/predictions',
    name: 'EvalscopePredictions',
    component: EvalscopePredictionsView,
  },

  // MEval routes
  {
    path: '/meval',
    name: 'Meval',
    component: MevalView,
  },

  // Custom Viewer routes
  {
    path: '/custom',
    name: 'CustomViewer',
    component: CustomViewerView,
  },

  // Hyeval (hidden)
  {
    path: '/hyeval',
    name: 'Hyeval',
    component: () => import('@/views/HevalView.vue'),
  },

  // Legacy redirects (backward compatibility, to be removed in the future)
  { path: '/reviews', redirect: '/evalscope/reviews' },
  { path: '/predictions', redirect: '/evalscope/predictions' },
];

const router = createRouter({
  history: createWebHashHistory(), // use hash mode for static hosting
  routes,
});

export default router;
