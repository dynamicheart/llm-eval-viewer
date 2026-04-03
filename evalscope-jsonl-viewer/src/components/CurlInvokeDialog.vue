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

    <el-divider content-position="left">参数</el-divider>
    <el-form label-width="140px" size="small" class="param-form">
      <el-row gutter="20">
        <el-col :span="10">
          <!-- 左侧的表单项 -->
          <el-form-item label="Service URL">
            <el-input v-model="form.serviceUrl" />
          </el-form-item>

          <el-form-item label="max_tokens">
            <el-input-number
              v-model="form.max_tokens"
              :precision="0"
              :step-strictly="true"
              :min="1"
              :step="4096"
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
        </el-col>

        <el-col :span="12">
          <el-form-item label="Model">
            <el-input v-model="form.model" />
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

          <el-form-item label="top_k">
            <el-input-number
              v-model="form.top_k"
              :min="0"
              :precision="0"
              :step-strictly="true"
              :step="1"
            />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="Options">
        <el-checkbox v-model="form.stream">stream</el-checkbox>
        <el-checkbox v-model="form.return_token_ids"
          >return_token_ids</el-checkbox
        >
        <el-checkbox v-model="form.chat_template_kwargs_enabled"
          >chat_template_kwargs</el-checkbox
        >
        <el-checkbox v-model="form.repetition_penalty_enabled">
          repetition_penalty
        </el-checkbox>
      </el-form-item>

      <el-form-item
        v-if="form.chat_template_kwargs_enabled"
        label="Chat Template"
      >
        <div class="tri-row">
          <div class="tri-item">
            <span class="tri-label">enable_thinking</span>
            <el-segmented
              v-model="form.chat_template_kwargs.enable_thinking"
              :options="triOptions"
              size="small"
            />
          </div>

          <div class="tri-item">
            <span class="tri-label">thinking</span>
            <el-segmented
              v-model="form.chat_template_kwargs.thinking"
              :options="triOptions"
              size="small"
            />
          </div>

          <div class="tri-item">
            <span class="tri-label">reasoning_effort</span>
            <el-segmented
              v-model="form.chat_template_kwargs.reasoning_effort"
              :options="reasoningEffortOptions"
              size="small"
            />
          </div>
        </div>
      </el-form-item>

      <el-form-item
        v-if="form.repetition_penalty_enabled"
        label="repetition_penalty"
        prop="repetition_penalty"
      >
        <el-input-number
          v-model="form.repetition_penalty"
          :min="0.01"
          :step="0.01"
          :precision="2"
          controls-position="right"
        />
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

  chat_template_kwargs_enabled: cache.chat_template_kwargs_enabled ?? false,
  chat_template_kwargs: {
    enable_thinking: cache.chat_template_kwargs?.enable_thinking ?? 'none', // 'none' | 'true' | 'false'
    thinking: cache.chat_template_kwargs?.thinking ?? 'none',
    reasoning_effort: cache.chat_template_kwargs?.reasoning_effort ?? 'none', // 'none' | 'high' | 'low' | 'no_think'
  },

  repetition_penalty_enabled: cache.repetition_penalty_enabled ?? false,
  repetition_penalty: cache.repetition_penalty ?? 1.05,
});

const triOptions = [
  { label: 'none', value: 'none' },
  { label: 'false', value: 'false' },
  { label: 'true', value: 'true' },
];

const reasoningEffortOptions = [
  { label: 'none', value: 'none' },
  { label: 'high', value: 'high' },
  { label: 'low', value: 'low' },
  { label: 'no_think', value: 'no_think' },
];

watch(
  form,
  () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(form));
  },
  { deep: true }
);

function buildPayload() {
  const basePayload = {
    model: form.model,
    temperature: form.temperature,
    top_p: form.top_p,
    top_k: form.top_k,
    max_tokens: form.max_tokens,
    messages: [
      {
        role: 'user',
        content: props.rawJson?.prompt ?? '',
      },
    ],
  };

  const optionalPayloadFields: Record<string, any> = {};

  if (form.repetition_penalty_enabled) {
    optionalPayloadFields.repetition_penalty = form.repetition_penalty;
  }

  if (form.chat_template_kwargs_enabled) {
    const kwargs: any = {};
    for (const [k, v] of Object.entries(form.chat_template_kwargs)) {
      if (v === 'none') continue;
      if (k === 'reasoning_effort') {
        kwargs[k] = v; // string value: 'high' | 'low' | 'no_think'
      } else {
        kwargs[k] = v === 'true'; // boolean value
      }
    }
    if (Object.keys(kwargs).length) {
      optionalPayloadFields.extra_body = { chat_template_kwargs: kwargs };
    }
  }

  if (form.stream) {
    optionalPayloadFields.stream_options = { include_usage: true };
  }

  optionalPayloadFields.stream = form.stream;
  optionalPayloadFields.return_token_ids = form.return_token_ids;

  return { ...basePayload, ...optionalPayloadFields };
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

.param-form {
  margin-top: 4px;
}

.param-form :deep(.el-form-item__label) {
  color: #606266;
  font-size: 13px;
}

.param-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.curl-code {
  max-height: 30vh;
  overflow: auto;
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

.curl-code code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.service-url-input {
  width: 600px;
}

.model-input {
  width: 180px;
}

.tri-row {
  display: flex;
  gap: 16px;
}

.tri-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tri-item + .tri-item {
  margin-left: 16px;
  padding-left: 16px;
}

.tri-item .el-segmented:hover {
  background-color: #f5f7fa;
  border-radius: 4px;
  cursor: pointer;
}

.tri-label {
  font-size: 13px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.45);
  line-height: 1.3;
  letter-spacing: 0.02em;
  white-space: nowrap;
  user-select: none;
  margin-right: 6px; /* 文字和控件间距 */
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
    Arial, sans-serif;
}
</style>
