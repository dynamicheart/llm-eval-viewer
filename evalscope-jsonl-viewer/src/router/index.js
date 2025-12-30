/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

import { createRouter, createWebHashHistory } from 'vue-router';
import ReviewsView from '@/views/ReviewsView.vue';
import PredictionsView from '@/views/PredictionsView.vue';

const routes = [
  {
    path: '/',
    redirect: '/reviews',
  },
  {
    path: '/reviews',
    name: 'Reviews',
    component: ReviewsView,
  },
  {
    path: '/predictions',
    name: 'Predictions',
    component: PredictionsView,
  },
];

const router = createRouter({
  history: createWebHashHistory(), // ← 关键
  routes,
});

export default router;
