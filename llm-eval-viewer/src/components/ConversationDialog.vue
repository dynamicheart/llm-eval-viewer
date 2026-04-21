<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    width="60%"
    top="6vh"
  >
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center">
        <span>{{ title }} <span v-if="blockCount > 0" class="title-count">{{ itemCountText }}</span></span>
        <div style="display: flex; gap: 8px; align-items: center">
          <el-input
            v-if="showFilter"
            v-model="filterText"
            size="small"
            clearable
            :placeholder="filterPlaceholder || $t('custom.filterConversation')"
            style="width: 200px"
          />
          <el-button size="small" type="primary" plain @click="copyContent">
            {{ $t('common.copy') }}
          </el-button>
        </div>
      </div>
    </template>

    <div v-if="filteredBlocks.length" ref="chatContainerRef" class="chat-container">
      <div
        v-for="(msg, idx) in filteredBlocks"
        :key="idx"
        class="chat-msg"
        :class="'chat-' + msg.roleClass"
      >
        <div class="chat-role">
          <span
            v-if="isCollapsible(idx, msg)"
            class="role-toggle"
            @click="toggleCollapse(idx)"
          >
            <el-icon class="tool-arrow" :class="{ 'is-expanded': !isCollapsed(idx, msg) }">
              <ArrowRight />
            </el-icon>
          </span>
          <span class="role-label">{{ msg.displayRole }}</span>
          <span v-if="msg.fnName" class="fn-name">{{ msg.fnName }}</span>
          <span v-if="msg.callId" class="call-id" @click.stop="copyText(msg.callId)">{{ msg.callId }}</span>
          <span v-if="msg.content" class="msg-length">{{ msg.content.length }} chars</span>
        </div>

        <!-- Tool call / tool result: render as collapsible JSON -->
        <template v-if="msg.isToolBlock">
          <div v-show="!isCollapsed(idx, msg)" class="tool-block">
            <pre class="tool-code"><code v-html="highlightJson(msg.content)"></code></pre>
          </div>
        </template>

        <!-- Normal message: render as markdown -->
        <template v-else>
          <div v-show="!isCollapsed(idx, msg)" class="chat-text-wrapper">
            <div
              v-if="renderedHtmlMap[idx]"
              class="chat-text markdown-body"
              v-html="renderedHtmlMap[idx]"
            ></div>
            <div v-else class="chat-text">{{ msg.content }}</div>
          </div>
        </template>
      </div>
    </div>
    <div v-else class="chat-empty">{{ $t('detailDialog.noSolution') }}</div>
  </el-dialog>
</template>

<script>
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { ArrowRight } from '@element-plus/icons-vue';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import { renderMathMarkdown } from '@/utils/renderMathMarkdown';

hljs.registerLanguage('json', json);

const ROLE_LABELS = {
  system: 'SYSTEM',
  user: 'USER',
  assistant: 'ASSISTANT',
  human: 'HUMAN',
  ai: 'AI',
  bot: 'BOT',
};

export default {
  components: { ArrowRight },

  props: {
    visible: Boolean,
    text: { type: String, default: '' },
    messages: { type: Array, default: null },
    title: { type: String, default: '' },
    showFilter: { type: Boolean, default: true },
    filterFn: { type: Function, default: null },
    filterPlaceholder: { type: String, default: '' },
    isToolList: { type: Boolean, default: false },
  },
  emits: ['update:visible'],

  setup(props) {
    const { t } = useI18n();
    // Collapse state is a separate reactive ref — NOT stored inside computed blocks.
    // Key: block index, Value: true = collapsed, false = expanded.
    const collapseState = ref({});
    // Rendered HTML is also a separate reactive ref keyed by block index.
    const renderedHtmlMap = ref({});

    /**
     * Build display blocks from structured messages array (OpenAI format).
     * Directly reads role, content, tool_calls, reasoning_content — no regex needed.
     */
    function parseFromMessages(msgs) {
      const blocks = [];
      for (const msg of msgs) {
        const role = (msg.role || '').toLowerCase();
        const content = typeof msg.content === 'string' ? msg.content : (msg.content != null ? JSON.stringify(msg.content) : '');

        // Assistant with tool_calls
        if (role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          // Reasoning content (e.g. DeepSeek <think> blocks)
          if (msg.reasoning_content) {
            blocks.push({
              role: 'reasoning',
              roleClass: 'system',
              displayRole: 'REASONING',
              fnName: null,
              content: msg.reasoning_content,
              isToolBlock: false,
            });
          }
          if (content) {
            blocks.push({
              role: 'assistant',
              roleClass: 'assistant',
              displayRole: ROLE_LABELS.assistant,
              fnName: null,
              content,
              isToolBlock: false,
            });
          }
          for (const tc of msg.tool_calls) {
            const fn = tc.function || tc;
            const name = fn.name || 'unknown';
            const args = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || {});
            // Store the full tool_call object as content
            const fullObj = {
              id: tc.id || '',
              function: { name, arguments: args },
              type: tc.type || 'function',
            };
            blocks.push({
              role: 'tool_call',
              roleClass: 'tool-call',
              displayRole: 'TOOL CALL',
              fnName: name,
              callId: tc.id || '',
              content: JSON.stringify(fullObj, null, 2),
              isToolBlock: true,
            });
          }
          continue;
        }

        // Tool result
        if (role === 'tool') {
          blocks.push({
            role: 'tool',
            roleClass: 'tool-result',
            displayRole: 'TOOL RESULT',
            fnName: msg.name || '',
            callId: msg.tool_call_id || '',
            content,
            isToolBlock: true,
          });
          continue;
        }

        // Standard message (system, user, assistant, etc.)
        // Reasoning content for assistant
        if (role === 'assistant' && msg.reasoning_content) {
          blocks.push({
            role: 'reasoning',
            roleClass: 'system',
            displayRole: 'REASONING',
            fnName: null,
            content: msg.reasoning_content,
            isToolBlock: false,
          });
        }

        blocks.push({
          role,
          roleClass: role === 'human' ? 'user' : role === 'ai' || role === 'bot' ? 'assistant' : role,
          displayRole: ROLE_LABELS[role] || role.toUpperCase(),
          fnName: null,
          content,
          isToolBlock: false,
        });
      }
      return blocks;
    }

    /**
     * Parse display blocks from [role] content text format (legacy fallback).
     */
    function parseFromText(text) {
      if (!text) return [];
      const lines = text.split('\n');
      const blocks = [];
      let current = null;

      for (const line of lines) {
        const stdMatch = line.match(/^\[(system|user|assistant|human|ai|bot)\]\s*(.*)/i);
        if (stdMatch) {
          if (current) blocks.push(current);
          const role = stdMatch[1].toLowerCase();
          current = {
            role,
            roleClass: role,
            displayRole: ROLE_LABELS[role] || role.toUpperCase(),
            fnName: null,
            content: stdMatch[2] || '',
            isToolBlock: false,
          };
          continue;
        }

        const tcMatch = line.match(/^\[tool_call:([^\]]+)\]\s*(.*)/i);
        if (tcMatch) {
          if (current) blocks.push(current);
          const parts = tcMatch[1].split(':');
          const fnName = parts[0];
          const callId = parts.length > 1 ? parts.slice(1).join(':') : '';
          const args = tcMatch[2] || '{}';
          // Reconstruct full tool_call object
          const fullObj = {
            id: callId || undefined,
            function: { name: fnName, arguments: args },
            type: 'function',
          };
          current = {
            role: 'tool_call',
            roleClass: 'tool-call',
            displayRole: 'TOOL CALL',
            fnName,
            callId,
            content: JSON.stringify(fullObj, null, 2),
            isToolBlock: true,
          };
          continue;
        }

        const trMatch = line.match(/^\[tool:([^\]]+)\]\s*(.*)/i);
        if (trMatch) {
          if (current) blocks.push(current);
          const content = trMatch[2] || '';
          const tag = trMatch[1];
          // Distinguish between tool_call_id (starts with "call") and tool name
          const isCallId = tag.startsWith('call');
          // Tool definitions have a tool name tag and JSON content; tool results have call IDs
          const isDef = !isCallId && content.trimStart().startsWith('{');
          current = {
            role: isDef ? 'tool_def' : 'tool',
            roleClass: isDef ? 'tool-def' : 'tool-result',
            displayRole: isDef ? 'TOOL' : 'TOOL RESULT',
            fnName: isCallId ? '' : tag,
            callId: isCallId ? tag : '',
            content,
            isToolBlock: true,
          };
          continue;
        }

        if (current) {
          current.content += (current.content ? '\n' : '') + line;
        }
      }
      if (current) blocks.push(current);
      return blocks;
    }

    /**
     * Parsed blocks — only depends on props (messages/text), NOT on collapse state.
     * This prevents toggle from triggering a full reparse + markdown re-render.
     */
    const parsed = computed(() => {
      let blocks;
      if (Array.isArray(props.messages) && props.messages.length > 0) {
        blocks = parseFromMessages(props.messages);
      } else {
        blocks = parseFromText(props.text);
      }

      // Pretty-print JSON in tool blocks
      for (const b of blocks) {
        if (b.isToolBlock) {
          try {
            const p = JSON.parse(b.content);
            b.content = JSON.stringify(p, null, 2);
          } catch { /* keep original */ }
        }
      }

      return blocks;
    });

    const blockCount = computed(() => parsed.value.length);
    const itemCountText = computed(() =>
      props.isToolList
        ? t('custom.toolCount', { count: blockCount.value })
        : t('custom.messageCount', { count: blockCount.value }),
    );

    const filterText = ref('');
    const filteredBlocks = computed(() => {
      const q = filterText.value.trim().toLowerCase();
      if (!q) return parsed.value;
      if (props.filterFn) return parsed.value.filter(b => props.filterFn(b, q));
      return parsed.value.filter(b =>
        (b.fnName || '').toLowerCase().includes(q) ||
        (b.callId || '').toLowerCase().includes(q) ||
        (b.content || '').toLowerCase().includes(q),
      );
    });

    /**
     * Whether a message at index `idx` supports collapsing (long content).
     */
    function isCollapsible(idx, msg) {
      return msg.content.length > 0;
    }

    /**
     * Determine if a message at index `idx` should be collapsed.
     * Reads from the reactive `collapseState` ref — called directly in template.
     */
    function isCollapsed(idx, msg) {
      // Explicit user toggle always takes precedence
      if (idx in collapseState.value) return collapseState.value[idx];
      // Short content defaults to expanded
      if (msg.content.length < 500) return false;
      // Default: collapsed
      return true;
    }

    function toggleCollapse(idx) {
      const msg = filteredBlocks.value[idx];
      const current = isCollapsed(idx, msg);
      collapseState.value = { ...collapseState.value, [idx]: !current };
    }

    const chatContainerRef = ref(null);

    // Reset collapse state and filter when content changes (new dialog opened)
    watch(
      () => [props.messages, props.text],
      () => {
        collapseState.value = {};
        filterText.value = '';
        // Reset scroll to top when switching between conversations/tools
        nextTick(() => {
          if (chatContainerRef.value) chatContainerRef.value.scrollTop = 0;
        });
      },
    );

    // Render markdown for non-tool assistant messages into a separate reactive map.
    watch(
      () => parsed.value,
      async (blocks) => {
        const newHtmlMap = {};
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          if (b.isToolBlock) continue;
          if (['assistant', 'ai', 'bot'].includes(b.role) && b.content) {
            try {
              newHtmlMap[i] = await renderMathMarkdown(b.content);
            } catch {
              // fallback to plain text (no entry in map)
            }
          }
        }
        renderedHtmlMap.value = newHtmlMap;
      },
      { immediate: true },
    );

    function highlightJson(text) {
      try {
        return hljs.highlight(text, { language: 'json' }).value;
      } catch {
        return text;
      }
    }

    const copyContent = async () => {
      let content = props.text;
      if (!content && Array.isArray(props.messages) && props.messages.length > 0) {
        content = JSON.stringify(props.messages, null, 2);
      }
      if (!content) {
        ElMessage.warning(t('common.nothingToCopy'));
        return;
      }
      try {
        await navigator.clipboard.writeText(content);
        ElMessage.success(t('common.copiedToClipboard'));
      } catch {
        ElMessage.error(t('common.copyFailed'));
      }
    };

    const copyText = async (text) => {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        ElMessage.success(t('common.copiedToClipboard'));
      } catch {
        ElMessage.error(t('common.copyFailed'));
      }
    };

    return { chatContainerRef, parsed, blockCount, itemCountText, filteredBlocks, filterText, renderedHtmlMap, isCollapsible, isCollapsed, toggleCollapse, highlightJson, copyContent, copyText };
  },
};
</script>

<style scoped>
.title-count {
  font-size: 12px;
  opacity: 0.5;
  font-weight: 400;
}

.chat-container {
  max-height: 72vh;
  overflow-y: auto;
  padding: 4px 0;
}

.chat-empty {
  text-align: center;
  padding: 40px;
  color: var(--el-text-color-secondary);
}

.chat-msg {
  margin-bottom: 10px;
  padding: 8px 14px;
  border-radius: 8px;
}

.chat-role {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.role-toggle {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.tool-arrow {
  font-size: 11px;
  transition: transform 0.2s;
  color: var(--ev-text-secondary);
}

.tool-arrow.is-expanded {
  transform: rotate(90deg);
}

.role-label {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.75;
  letter-spacing: 0.5px;
}

.msg-length {
  font-size: 10px;
  color: var(--ev-text-secondary);
  opacity: 0.6;
  margin-left: auto;
}

.fn-name {
  font-size: 11px;
  font-family: monospace;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.06);
  color: var(--ev-text-secondary);
}

.call-id {
  font-size: 10px;
  font-family: monospace;
  color: var(--ev-text-secondary);
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.call-id:hover {
  opacity: 0.85;
  text-decoration: underline;
}

.chat-text {
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Markdown body within chat */
.chat-text.markdown-body {
  white-space: normal;
}

.chat-text.markdown-body :deep(pre) {
  background: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  margin: 8px 0;
}

.chat-text.markdown-body :deep(code) {
  font-size: 12px;
}

.chat-text.markdown-body :deep(p) {
  margin: 4px 0;
}

/* System */
.chat-system {
  background: var(--el-fill-color-light, #f0f2f5);
}

.chat-system .role-label {
  color: #e6a23c;
}

.chat-system .chat-text {
  font-size: 12px;
  opacity: 0.8;
}

/* User */
.chat-user {
  background: #ecf5ff;
  margin-left: 40px;
}

.chat-user .role-label {
  color: #409eff;
}

/* Assistant */
.chat-assistant {
  background: #f0f9eb;
}

.chat-assistant .role-label {
  color: #67c23a;
}

/* Tool Call */
.chat-tool-call {
  background: #f3efff;
  border-left: 3px solid #9b59b6;
}

.chat-tool-call .role-label {
  color: #9b59b6;
}

.chat-tool-call .fn-name {
  background: rgba(155, 89, 182, 0.1);
  color: #9b59b6;
}

/* Tool Result */
.chat-tool-result {
  background: #effaf5;
  border-left: 3px solid #1abc9c;
}

.chat-tool-result .role-label {
  color: #1abc9c;
}

.chat-tool-result .fn-name {
  background: rgba(26, 188, 156, 0.1);
  color: #1abc9c;
}

/* Tool Definition */
.chat-tool-def {
  background: #f0f5ff;
  border-left: 3px solid #6366f1;
}

.chat-tool-def .role-label {
  color: #6366f1;
}

.chat-tool-def .fn-name {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

/* Tool block (collapsible code) */
.tool-block {
  margin-top: 4px;
}

.tool-code {
  margin: 4px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.04);
  overflow-x: auto;
  font-size: 11px;
  line-height: 1.5;
  max-height: 300px;
  overflow-y: auto;
}

/* Dark mode */
html.dark .chat-system {
  background: #2c2c2c;
}

html.dark .chat-user {
  background: #1a3a5c;
}

html.dark .chat-assistant {
  background: #1a2e1a;
}

html.dark .chat-tool-call {
  background: #2a1f3d;
  border-left-color: #b57edc;
}

html.dark .chat-tool-call .role-label {
  color: #b57edc;
}

html.dark .chat-tool-call .fn-name {
  background: rgba(181, 126, 220, 0.15);
  color: #b57edc;
}

html.dark .chat-tool-result {
  background: #1a2f2a;
  border-left-color: #4cd4a0;
}

html.dark .chat-tool-result .role-label {
  color: #4cd4a0;
}

html.dark .chat-tool-result .fn-name {
  background: rgba(76, 212, 160, 0.15);
  color: #4cd4a0;
}

html.dark .chat-tool-def {
  background: #1e2340;
  border-left-color: #818cf8;
}

html.dark .chat-tool-def .role-label {
  color: #818cf8;
}

html.dark .chat-tool-def .fn-name {
  background: rgba(129, 140, 248, 0.15);
  color: #818cf8;
}

html.dark .fn-name {
  background: rgba(255, 255, 255, 0.08);
}

html.dark .tool-code {
  background: rgba(255, 255, 255, 0.06);
}

html.dark .chat-text.markdown-body :deep(pre) {
  background: rgba(255, 255, 255, 0.06);
}
</style>
