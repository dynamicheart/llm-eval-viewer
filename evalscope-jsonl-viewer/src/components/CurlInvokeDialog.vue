<!--
  Copyright (c) 2025 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <el-dialog
    :model-value="dialogVisible"
    @update:model-value="$emit('update:dialogVisible', $event)"
    width="78%"
  >
    <template #header>
      <div class="dialog-header">
        <span class="dialog-title">{{ title }}</span>
        <el-button size="small" type="primary" plain @click="copyCurl">
          复制 curl
        </el-button>
      </div>
    </template>

    <!-- 参数区 -->
    <el-divider content-position="left">参数</el-divider>
    <el-form label-width="140px" size="small" class="param-form">
      <el-form-item class="service-url-input" label="Service URL">
        <el-input v-model="form.serviceUrl" />
      </el-form-item>

      <el-form-item label="Model">
        <el-input class="model-input" v-model="form.model" />
      </el-form-item>

      <el-form-item label="Max Tokens">
        <el-input-number
          v-model="form.max_tokens"
          :precision="0"
          :step-strictly="true"
          :min="1"
          :step="4096"
        />
      </el-form-item>

      <el-form-item label="temperature">
        <el-input-number
          v-model="form.temperature"
          :precision="1"
          :min="0"
          :max="2"
          :step="0.1"
        />
      </el-form-item>

      <el-form-item label="top_p">
        <el-input-number
          v-model="form.top_p"
          :precision="1"
          :min="0"
          :step="0.1"
        />
      </el-form-item>

      <el-form-item label="top_k">
        <el-input-number
          v-model="form.top_k"
          :min="0"
          :precision="0"
          :step-strictly="true"
          :step="1"
        />
      </el-form-item>

      <el-form-item label="Options">
        <el-checkbox v-model="form.stream">stream</el-checkbox>
        <el-checkbox v-model="form.return_token_ids">
          return_token_ids
        </el-checkbox>
      </el-form-item>
    </el-form>

    <el-divider content-position="left">预览</el-divider>

    <!-- curl -->
    <pre class="curl-code">
    <code ref="codeRef" class="language-bash"></code>
    </pre>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch, ref, onMounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import hljs from 'highlight.js';
import bash from 'highlight.js/lib/languages/bash';

import 'highlight.js/styles/github.css';

hljs.registerLanguage('bash', bash);

const codeRef = ref<HTMLElement | null>(null);

const props = defineProps({
  dialogVisible: Boolean,
  rawJson: Object,
  title: {
    type: String,
    default: '生成 Curl 命令',
  },
});

const CACHE_KEY = 'llm_curl_form_cache';

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

const cache = loadCache();

const form = reactive({
  serviceUrl: cache.serviceUrl || 'http://127.0.0.1:9300/v1/chat/completions',
  model: cache.model || props.rawJson?.model || 'base_model',
  temperature: cache.temperature ?? 0.6,
  top_p: cache.top_p ?? 0.6,
  top_k: cache.top_k ?? 20,
  stream: cache.stream ?? false,
  max_tokens: cache.max_tokens ?? 32768,
  return_token_ids: cache.return_token_ids ?? false,
});

watch(
  form,
  () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(form));
  },
  { deep: true }
);

function buildPayload() {
  const payload: any = {
    model: form.model,
    temperature: form.temperature,
    top_p: form.top_p,
    top_k: form.top_k,
    max_tokens: form.max_tokens,
    stream: form.stream,
    return_token_ids: form.return_token_ids,
    messages: [
      {
        role: 'user',
        content: props.rawJson?.prompt ?? '',
      },
    ],
  };

  if (payload.stream) {
    payload.stream_options = { include_usage: true };
  }

  return payload;
}

const curlCommand = computed(() => {
  const payload = buildPayload();
  const streamFlag = form.stream ? '-N ' : '';

  return `curl ${streamFlag}${form.serviceUrl} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;
});

watch(
  curlCommand,
  () => {
    if (props.dialogVisible) highlight();
  },
  { flush: 'post' }
);

async function highlight() {
  await nextTick();
  if (!codeRef.value) return;

  const el = codeRef.value;

  // 👇 关键两行
  el.dataset.highlighted = '';
  el.textContent = curlCommand.value;

  hljs.highlightElement(el);
}

watch(
  () => props.dialogVisible,
  (visible) => {
    if (visible) {
      highlight();
    }
  }
);

onMounted(highlight);

function copyCurl() {
  navigator.clipboard.writeText(curlCommand.value);
  ElMessage.success('curl 已复制');
}
</script>

<style scoped>
.curl-dialog :deep(.el-dialog__body) {
  padding-top: 10px;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-title {
  font-weight: 600;
  font-size: 15px;
}

/* 参数区整体 */
.param-form {
  margin-top: 4px;
}

/* label 弱化一点，更像工具 */
.param-form :deep(.el-form-item__label) {
  color: #606266;
  font-size: 13px;
}

/* 表单项更紧凑 */
.param-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.curl-code {
  max-height: 30vh; /* 限制最大高度 */
  overflow: auto; /* 超出部分显示滚动条 */
  background: #f6f8fa;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
}

.curl-code::-webkit-scrollbar {
  height: 8px;
}

.curl-code::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

/* 让代码区更“工程化” */
.curl-code code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* URL / model 宽度 */
.service-url-input {
  width: 600px;
}

.model-input {
  width: 180px;
}
</style>
