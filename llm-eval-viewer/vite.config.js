/*
 * Copyright (c) 2025 dynamicheart
 * Licensed under the MIT License.
 */

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'

function getGitCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __COMMIT_HASH__: JSON.stringify(getGitCommitHash()),
  },
  base: process.env.VIEWER_BASE || '/llm-eval-viewer/',
  build: process.env.BUILD_LIB
    ? {
        lib: {
          entry: fileURLToPath(new URL('./src/index.js', import.meta.url)),
          name: 'LlmEvalViewer',
          formats: ['es'],
          fileName: 'llm-eval-viewer',
        },
        rollupOptions: {
          external: ['vue', 'vue-router', 'element-plus', 'vue-i18n'],
          output: {
            globals: {
              vue: 'Vue',
              'vue-router': 'VueRouter',
              'element-plus': 'ElementPlus',
              'vue-i18n': 'VueI18n',
            },
          },
        },
      }
    : undefined,
  test: {
    include: ['src/**/*.test.js'],
  },
})
