/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

import { createApp } from 'vue';
import App from '@/App.vue';

import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import '@/assets/styles/common.css';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';

import router from './router';
import i18n from './i18n';

const app = createApp(App);
app.use(ElementPlus);
app.use(router);
app.use(i18n);
app.mount('#app');
