/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

import { createRouter, createWebHashHistory } from 'vue-router';
import ReviewsView from '@/views/ReviewsView.vue';
import PredictionsView from '@/views/PredictionsView.vue';
import MevalView from '@/views/MevalView.vue';

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
  {
    path: '/meval',
    name: 'Meval',
    component: MevalView,
  },
];

const router = createRouter({
  history: createWebHashHistory(), // use hash mode for static hosting
  routes,
});

export default router;
