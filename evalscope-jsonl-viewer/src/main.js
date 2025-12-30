/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

// main.js
import { createApp } from 'vue';
import App from '@/App.vue';

import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import '@/assets/styles/common.css';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';

import router from './router'; // 新增，导入路由配置

const app = createApp(App);
app.use(ElementPlus);
app.use(router); // 挂载路由
app.mount('#app');
