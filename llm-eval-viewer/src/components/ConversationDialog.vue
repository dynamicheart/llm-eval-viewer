<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    width="85%"
    top="6vh"
    class="conv-dialog"
  >
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center">
        <span>{{ title }} <span v-if="blockCount > 0" class="title-count">{{ itemCountText }}</span></span>
        <div style="display: flex; gap: 8px; align-items: center">
          <el-input
            v-if="showFilter && viewMode === 'chat'"
            v-model="filterText"
            size="small"
            clearable
            :placeholder="filterPlaceholder || $t('custom.filterConversation')"
            style="width: 200px"
          />
          <el-radio-group
            v-if="rawCalls.length"
            v-model="viewMode"
            size="small"
          >
            <el-radio-button value="chat">{{ $t('custom.viewModeChat') }}</el-radio-button>
            <el-radio-button value="json">{{ $t('custom.viewModeJson') }}</el-radio-button>
            <el-radio-button value="calls">{{ $t('custom.viewModeCalls') }}</el-radio-button>
            <el-radio-button v-if="rawSpans.length" value="jsonl">{{ $t('custom.viewModeJsonl') }}</el-radio-button>
          </el-radio-group>
          <el-button
            size="small"
            :type="codeWrap ? 'primary' : ''"
            plain
            :title="codeWrap ? 'Word Wrap: On' : 'Word Wrap: Off'"
            @click="codeWrap = !codeWrap"
          >Wrap</el-button>
          <el-button size="small" type="primary" plain style="margin-left: 0" @click="copyContent">
            {{ $t('common.copy') }}
          </el-button>
        </div>
      </div>
      <!-- Multi-conversation tabs (only in chat mode) -->
      <div v-if="conversationTabs.length > 1 && viewMode === 'chat'" class="conv-tabs">
        <button
          v-for="(tab, idx) in conversationTabs"
          :key="idx"
          class="conv-tab"
          :class="{ 'conv-tab-active': activeConvIdx === idx }"
          @click="activeConvIdx = idx"
        >{{ tab }}</button>
      </div>
    </template>

    <div v-if="viewMode === 'jsonl' && rawSpans.length" class="chat-scroll-wrapper" :class="{ 'code-wrap': codeWrap }">
      <div class="raw-jsonl-container">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
          <span class="raw-calls-summary" style="margin-bottom: 0;">{{ $t('custom.rawSpans', { count: rawSpans.length }) }}</span>
          <span v-if="finishReasonStats" class="finish-reason-stats">
            <span v-for="(count, reason) in finishReasonStats" :key="reason" class="finish-stat-item" :class="'finish-' + reason">{{ reason }}: {{ count }} ({{ Math.round(count / activeRawCalls.length * 100) }}%)</span>
          </span>
        </div>
        <!-- Raw span rows (indented by tree depth, collapsible) -->
        <template v-for="(span, si) in rawSpans" :key="si">
          <div
            v-if="!isSpanHidden(span)"
            class="jsonl-row"
            :style="{ paddingLeft: ((span.span_id && spanDepthMap[span.span_id]) || 0) * 16 + 'px' }"
          >
            <div class="jsonl-row-header" @click="expandedJsonlIdx[si] = !expandedJsonlIdx[si]">
              <span
                v-if="span.type === 'START' && spanHasChildren[span.span_id]"
                class="jsonl-collapse-toggle"
                @click.stop="toggleSpanCollapse(span.span_id)"
              >{{ collapsedSpanIds[span.span_id] ? '▶' : '▼' }}</span>
              <span v-else class="jsonl-collapse-placeholder"></span>
              <span class="jsonl-row-idx">{{ si }}</span>
              <span class="jsonl-row-type" :class="'jsonl-type-' + span.type">{{ span.type }}</span>
              <span v-if="span.name" class="jsonl-row-name">{{ span.name }}</span>
              <span class="jsonl-row-id">{{ span.span_id?.slice(0, 8) }}</span>
              <span v-if="span.parent_span_id" class="jsonl-row-parent">← {{ span.parent_span_id?.slice(0, 8) }}</span>
              <span v-if="spanCallIndexMap[span.span_id]" class="jsonl-call-idx">#{{ spanCallIndexMap[span.span_id] }}</span>
              <!-- Type tags on UPDATE spans (where the output lives) -->
              <span v-if="isSpanEmpty(span) === true" class="jsonl-empty-tag">EMPTY</span>
              <span v-else-if="isSpanEmpty(span) === 'reasoning'" class="jsonl-empty-tag jsonl-reasoning-tag">REASONING ONLY</span>
              <span v-else-if="spanOutputType(span) === 'tool_call'" class="jsonl-tag jsonl-tag-tool">TOOL</span>
              <span v-else-if="spanOutputType(span) === 'content'" class="jsonl-tag jsonl-tag-content">CONTENT</span>
              <span v-if="spanFinishReason(span)" class="jsonl-finish-reason" :class="'finish-' + spanFinishReason(span)">{{ spanFinishReason(span) }}</span>
            </div>
            <pre v-if="expandedJsonlIdx[si]" class="jsonl-row-detail tool-code"><code v-html="highlightJson(JSON.stringify(span, null, 2))"></code></pre>
          </div>
        </template>
      </div>
    </div>
    <div v-else-if="viewMode === 'json'" class="chat-scroll-wrapper" :class="{ 'code-wrap': codeWrap }">
      <div class="raw-jsonl-container">
        <pre class="tool-code raw-jsonl-code"><code v-html="highlightJson(messagesJson)"></code></pre>
      </div>
    </div>
    <div v-else-if="viewMode === 'calls' && rawCalls.length" class="chat-scroll-wrapper" :class="{ 'code-wrap': codeWrap }">
      <div class="raw-calls-container">
        <!-- Pipeline & Timeline & Span Tree toggles -->
        <div class="raw-viz-toggles">
          <button class="raw-viz-btn" :class="{ active: showPipeline }" @click="showPipeline = !showPipeline">{{ $t('custom.rawPipeline') }}</button>
          <button class="raw-viz-btn" :class="{ active: showTimeline }" @click="showTimeline = !showTimeline">{{ $t('custom.rawTimeline') }}</button>
          <button v-if="spanTree.length" class="raw-viz-btn" :class="{ active: showSpanTree }" @click="showSpanTree = !showSpanTree">{{ $t('custom.rawSpanTree') }}</button>
        </div>

        <!-- Pipeline view -->
        <div v-if="showPipeline" class="raw-pipeline">
          <div class="pipeline-step">
            <span class="pipeline-label">{{ $t('custom.pipelineRawSpans') }}</span>
            <span class="pipeline-count">{{ rawSpans.length }}</span>
            <span class="pipeline-fields">type, span_id, parent_span_id, name, attributes</span>
          </div>
          <div class="pipeline-arrow">↓ {{ $t('custom.pipelineFilterCompletion') }}</div>
          <div class="pipeline-step">
            <span class="pipeline-label">{{ $t('custom.pipelineCompletions') }}</span>
            <span class="pipeline-count">{{ pipelineStats.completions }}</span>
            <span class="pipeline-fields">span_id, attributes.inputs.messages</span>
          </div>
          <div class="pipeline-arrow">↓ {{ $t('custom.pipelineMatchUpdate') }}</div>
          <div class="pipeline-step">
            <span class="pipeline-label">{{ $t('custom.pipelineOutputs') }}</span>
            <span class="pipeline-count">{{ pipelineStats.updates }}</span>
            <span class="pipeline-fields">attributes.outputs.choices[0].message</span>
          </div>
          <div class="pipeline-arrow">↓ {{ $t('custom.pipelineSplitParent') }}</div>
          <div class="pipeline-step">
            <span class="pipeline-label">{{ $t('custom.pipelineAgentJudge') }}</span>
            <span class="pipeline-count">{{ pipelineStats.agentCount }} / {{ pipelineStats.judgeCount }}</span>
          </div>
          <div class="pipeline-arrow">↓ {{ $t('custom.pipelineDedup') }}</div>
          <div class="pipeline-step">
            <span class="pipeline-label">{{ $t('custom.pipelineConversation') }}</span>
            <span class="pipeline-count">{{ pipelineStats.conversationMsgs }} msgs</span>
            <span class="pipeline-fields">{{ $t('custom.pipelineDeduplicated') }}</span>
          </div>
        </div>

        <!-- Timeline view -->
        <div v-if="showTimeline" class="raw-timeline">
          <div class="timeline-bar-container">
            <div
              v-for="call in activeRawCalls"
              :key="'tl-' + call.index"
              class="timeline-bar"
              :class="timelineBarClass(call)"
              :title="timelineTooltip(call)"
            ></div>
          </div>
          <div class="timeline-legend">
            <span class="timeline-legend-item"><span class="tl-dot tl-tool"></span>{{ $t('custom.timelineToolCall') }}</span>
            <span class="timeline-legend-item"><span class="tl-dot tl-content"></span>{{ $t('custom.timelineContent') }}</span>
            <span class="timeline-legend-item"><span class="tl-dot tl-empty"></span>{{ $t('custom.timelineEmpty') }}</span>
          </div>
          <div class="timeline-stats">
            {{ $t('custom.timelineStats', { ok: activeRawCalls.filter(c => !c.empty).length, empty: activeRawCalls.filter(c => c.empty).length }) }}
          </div>
        </div>

        <!-- Span Tree view -->
        <div v-if="showSpanTree && spanTree.length" class="raw-span-tree">
          <div
            v-for="(item, fi) in flatSpanTree"
            :key="fi"
            class="tree-flat-node"
            :class="['tree-' + (item.type || 'branch'), { 'tree-expanded': expandedSpanIdx === fi }]"
            :style="{ paddingLeft: (item.depth * 16 + 4) + 'px' }"
          >
            <div class="tree-leaf-header" @click="item.type ? (expandedSpanIdx = expandedSpanIdx === fi ? null : fi) : null">
              <span class="tree-prefix">{{ item.prefix }}</span>
              <span class="tree-name" :class="{ 'tree-clickable': item.type }">{{ item.label }}</span>
              <template v-if="item.type">
                <span class="tree-arrow"> → </span>
                <span v-if="item.type === 'empty'" class="tree-result tree-empty-tag">EMPTY</span>
                <span v-else class="tree-result">{{ item.result }}</span>
              </template>
            </div>
            <div v-if="expandedSpanIdx === fi && item.node" class="tree-detail">
              <div v-if="item.node.inputPreview" class="tree-detail-section">
                <span class="tree-detail-label">Input ({{ item.node.inputCount }} msgs)</span>
                <div v-for="(msg, mi) in item.node.inputPreview" :key="mi" class="tree-detail-msg">
                  <span class="raw-input-role">{{ (msg.role || '').toUpperCase() }}</span>
                  <span class="raw-input-content">{{ msg.text }}</span>
                </div>
              </div>
              <div v-if="item.node.outputPreview" class="tree-detail-section">
                <span class="tree-detail-label">Output</span>
                <pre class="tree-detail-pre">{{ item.node.outputPreview }}</pre>
              </div>
            </div>
          </div>
        </div>

        <div v-if="rawCalls.length > 1" class="raw-calls-tabs">
          <button
            v-for="(calls, idx) in rawCalls"
            :key="idx"
            class="conv-tab"
            :class="{ 'conv-tab-active': rawCallsTab === idx }"
            @click="rawCallsTab = idx"
          >{{ idx === 0 ? 'Agent' : 'Judge' }} ({{ calls.length }})</button>
        </div>
        <div class="raw-calls-summary">
          {{ $t('custom.rawApiCalls', { count: activeRawCalls.length }) }}
          <span v-if="finishReasonStats" class="finish-reason-stats">
            <span v-for="(count, reason) in finishReasonStats" :key="reason" class="finish-stat-item" :class="'finish-' + reason">{{ reason }}: {{ count }} ({{ Math.round(count / activeRawCalls.length * 100) }}%)</span>
          </span>
        </div>
        <div
          v-for="call in activeRawCalls"
          :key="call.index"
          class="raw-call-card"
          :class="{ 'raw-call-empty': call.empty }"
        >
          <div class="raw-call-header">
            <span class="raw-call-num">#{{ call.index }}</span>
            <span v-if="(call.native_finish_reason || call.finish_reason) && (call.native_finish_reason || call.finish_reason) !== 'stop' && (call.native_finish_reason || call.finish_reason) !== 'tool_calls'" class="jsonl-finish-reason" :class="'finish-' + (call.native_finish_reason || call.finish_reason)">{{ call.native_finish_reason || call.finish_reason }}</span>
            <span v-else-if="!call.native_finish_reason && !call.finish_reason" class="jsonl-finish-reason finish-no_response">no_response</span>
            <span v-if="call.empty" class="jsonl-empty-tag">EMPTY</span>
            <span v-else-if="call.output?.tool_calls" class="raw-call-result">→ {{ call.output.tool_calls.map(tc => tc.function?.name).join(', ') }}</span>
            <span v-else-if="call.output?.content" class="raw-call-result">→ content</span>
          </div>
          <!-- Input section -->
          <div v-if="call.input && call.input.length" class="raw-call-section">
            <div class="raw-call-section-label">INPUT</div>
            <div class="raw-call-inputs">
              <div v-for="(msg, mi) in call.input" :key="mi" class="raw-call-input-msg" :class="'raw-input-' + msg.role">
                <span class="raw-input-role">{{ (msg.role || '').toUpperCase() }}</span>
                <span class="raw-input-content">{{ typeof msg.content === 'string' ? (msg.content.length > 150 ? msg.content.slice(0, 150) + '...' : msg.content) : '' }}</span>
              </div>
            </div>
          </div>
          <!-- Output section -->
          <div v-if="call.output" class="raw-call-section">
            <div class="raw-call-section-label">OUTPUT</div>
            <div class="raw-call-body">
              <div v-if="call.output.reasoning_content" class="raw-call-reasoning">
                <span class="raw-call-sub-label">Reasoning ({{ call.output.reasoning_content.length }} chars)</span>
                <pre class="tool-code">{{ call.output.reasoning_content.length > 200 ? call.output.reasoning_content.slice(0, 200) + '...' : call.output.reasoning_content }}</pre>
              </div>
              <div v-if="call.output.content" class="raw-call-content">
                <span class="raw-call-sub-label">Content</span>
                <div>{{ call.output.content }}</div>
              </div>
              <div v-if="call.output.tool_calls" class="raw-call-tools">
                <span class="raw-call-sub-label">Tool Calls</span>
                <div v-for="(tc, idx) in call.output.tool_calls" :key="idx" class="raw-call-tool-item">
                  <span class="fn-name">{{ tc.function?.name }}</span>
                  <span v-if="tc.function?.arguments" class="raw-call-tool-args">{{ tc.function.arguments.length > 80 ? tc.function.arguments.slice(0, 80) + '...' : tc.function.arguments }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="raw-call-section">
            <div class="raw-call-section-label">OUTPUT</div>
            <div class="raw-call-no-output">No output</div>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="toolBlocks.length || filteredBlocks.length" class="chat-scroll-wrapper" :class="{ 'code-wrap': codeWrap }">
      <div v-if="toolBlocks.length" class="tools-section">
        <div class="tools-section-title">TOOLS ({{ toolBlocks.length }})</div>
        <div
          v-for="(tool, idx) in toolBlocks"
          :key="'tool-' + idx"
          class="chat-msg chat-tool-def"
        >
          <div class="chat-role">
            <span
              v-if="isCollapsibleTool(idx, tool)"
              class="role-toggle"
              @click="toggleToolCollapse(idx)"
            >
              <el-icon class="tool-arrow" :class="{ 'is-expanded': !isToolCollapsed(idx) }">
                <ArrowRight />
              </el-icon>
            </span>
            <span class="role-label">TOOL</span>
            <span v-if="tool.fnName" class="fn-name">{{ tool.fnName }}</span>
          </div>
          <div v-show="!isToolCollapsed(idx)" class="tool-block">
            <pre class="tool-code"><code v-html="highlightJson(tool.content)"></code></pre>
          </div>
        </div>
      </div>

      <div v-if="filteredBlocks.length" class="chat-container">
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
              <template v-if="getSectionParts(msg)">
                <div
                  v-for="(part, pidx) in getSectionParts(msg)"
                  :key="pidx"
                  class="chat-section"
                >
                  <div v-if="part.label" class="section-label">
                    <span class="section-dot" :style="{ background: part.color }"></span>
                    <span class="section-label-text" :style="{ color: part.color }">{{ part.label }}</span>
                  </div>
                  <div
                    class="chat-text markdown-body"
                    v-html="sectionHtmlMap[idx + '-' + (part.label || 'rest')] || escapeHtml(part.text)"
                  ></div>
                </div>
              </template>
              <template v-else>
                <div
                  v-if="renderedHtmlMap[idx]"
                  class="chat-text markdown-body"
                  v-html="renderedHtmlMap[idx]"
                ></div>
                <div v-else class="chat-text">{{ msg.content }}</div>
              </template>
            </div>
          </template>
        </div>
      </div>
    </div>
    <div v-if="!filteredBlocks.length && !toolBlocks.length" class="chat-empty">{{ isToolList ? $t('detailDialog.noTools') : $t('detailDialog.noSolution') }}</div>
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
    conversations: { type: Array, default: null },
    rawCalls: { type: Array, default: () => [] },
    rawSpans: { type: Array, default: () => [] },
    spanTree: { type: Array, default: () => [] },
    tools: { type: Array, default: null },
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
    // Per-section rendered HTML, keyed by "blockIdx-sectionIdx"
    const sectionHtmlMap = ref({});

    // Code wrap toggle (default: on)
    const codeWrap = ref(true);

    // View mode: 'chat' | 'calls' | 'json' | 'jsonl'
    const viewMode = ref('chat');
    const rawCallsTab = ref(0);
    const activeRawCalls = computed(() => {
      const list = props.rawCalls;
      if (!list || !list.length) return [];
      if (Array.isArray(list[0])) return list[rawCallsTab.value] || [];
      return list;
    });

    const finishReasonStats = computed(() => {
      const calls = activeRawCalls.value;
      if (!calls.length) return null;
      const counts = {};
      for (const c of calls) {
        const reason = c.native_finish_reason || c.finish_reason || 'no_response';
        counts[reason] = (counts[reason] || 0) + 1;
      }
      if (Object.keys(counts).length === 1 && (counts['stop'] || counts['tool_calls'])) return null;
      return counts;
    });

    const spanCallIndexMap = computed(() => {
      const map = {};
      for (const c of activeRawCalls.value) {
        if (c.span_id) map[c.span_id] = c.index;
      }
      return map;
    });

    // Messages JSON (for JSON view mode)
    const messagesJson = computed(() => {
      let data;
      if (Array.isArray(props.conversations) && props.conversations.length > 0) {
        data = props.conversations;
      } else {
        data = props.messages;
      }
      return JSON.stringify(data, null, 2);
    });

    // Pipeline & Timeline & Span Tree
    const showPipeline = ref(false);
    const showTimeline = ref(false);
    const showSpanTree = ref(false);
    const expandedSpanIdx = ref(null);
    const expandedJsonlIdx = ref({});

    const pipelineStats = computed(() => {
      const spans = props.rawSpans || [];
      const completions = spans.filter(s => s.type === 'START' && s.name === 'openai_completion').length;
      const updates = spans.filter(s => s.type === 'UPDATE' && s.span_id).length;
      const agentSpan = spans.find(s => s.type === 'START' && s.name && (s.name.startsWith('agent.') || s.name.endsWith('_agent') || s.name === 'search'));
      const agentId = agentSpan?.span_id;
      const compSpans = spans.filter(s => s.type === 'START' && s.name === 'openai_completion');
      const agentCount = agentId ? compSpans.filter(s => s.parent_span_id === agentId).length : completions;
      const judgeCount = completions - agentCount;
      const msgs = props.messages;
      const convs = props.conversations;
      let conversationMsgs = 0;
      if (Array.isArray(convs) && convs.length > 0) {
        conversationMsgs = convs.reduce((sum, c) => sum + (Array.isArray(c) ? c.length : 0), 0);
      } else if (Array.isArray(msgs)) {
        conversationMsgs = msgs.length;
      }
      return { completions, updates, agentCount, judgeCount, conversationMsgs };
    });

    function timelineBarClass(call) {
      if (call.empty) return 'tl-empty';
      if (call.output?.tool_calls) return 'tl-tool';
      return 'tl-content';
    }

    function timelineTooltip(call) {
      const parts = [`#${call.index}`];
      if (call.empty) { parts.push('EMPTY'); }
      else if (call.output?.tool_calls) { parts.push(call.output.tool_calls[0]?.function?.name || 'tool_call'); }
      else { parts.push('content'); }
      return parts.join(' ');
    }

    // Flatten span tree for rendering
    const flatSpanTree = computed(() => {
      const items = [];
      let compIdx = 0;
      function walk(nodes, depth, parentIsLast) {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const isLast = i === nodes.length - 1;
          const prefix = depth === 0 ? '' : (isLast ? '└─ ' : '├─ ');
          const isCompletion = node.name === 'openai_completion';
          if (isCompletion) compIdx++;
          items.push({
            depth,
            prefix,
            label: isCompletion ? `#${compIdx} ${node.name}` : node.name,
            type: node.type || null,
            result: node.result || null,
            node: node.type ? node : null,
          });
          if (node.children && node.children.length > 0) {
            walk(node.children, depth + 1);
          }
        }
      }
      walk(props.spanTree, 0);
      return items;
    });

    // Depth map for JSONL indentation (span_id → depth)
    const spanDepthMap = computed(() => {
      const map = {};
      function walk(nodes, depth) {
        for (const node of nodes) {
          map[node.span_id] = depth;
          if (node.children?.length) walk(node.children, depth + 1);
        }
      }
      walk(props.spanTree, 0);
      return map;
    });

    // Collapsible spans: which span_ids have children, and which are collapsed
    const spanHasChildren = computed(() => {
      const map = {};
      function walk(nodes) {
        for (const node of nodes) {
          if (node.children?.length) {
            map[node.span_id] = true;
            walk(node.children);
          }
        }
      }
      walk(props.spanTree, 0);
      return map;
    });

    const collapsedSpanIds = ref({});

    // All descendant span_ids for each node (for hiding)
    const spanDescendants = computed(() => {
      const map = {};
      function collect(node) {
        const ids = [];
        for (const child of (node.children || [])) {
          ids.push(child.span_id);
          ids.push(...collect(child));
        }
        map[node.span_id] = ids;
        return ids;
      }
      for (const root of props.spanTree) collect(root);
      return map;
    });

    // Completion type map (span_id → 'empty' | 'tool_call' | 'content')
    const spanTypeMap = computed(() => {
      const map = {};
      function walk(nodes) {
        for (const node of nodes) {
          if (node.type) map[node.span_id] = node.type;
          if (node.children?.length) walk(node.children);
        }
      }
      walk(props.spanTree);
      return map;
    });

    function isSpanEmpty(span) {
      if (span.type !== 'UPDATE') return false;
      const outputs = span.attributes?.outputs;
      if (!outputs) return false;
      if (!outputs.choices) return false;
      const choice = outputs.choices[0];
      if (!choice) return true;
      const msg = choice.message;
      if (!msg) return true;
      const hasContent = msg.content;
      const hasTools = msg.tool_calls && msg.tool_calls.length > 0;
      if (!hasContent && !hasTools) {
        const hasReasoning = msg.reasoning_content || choice.reasoning_content;
        return hasReasoning ? 'reasoning' : true;
      }
      return false;
    }

    function spanOutputType(span) {
      if (span.type !== 'UPDATE') return null;
      const outputs = span.attributes?.outputs;
      if (!outputs || !outputs.choices) return null;
      const msg = outputs.choices[0]?.message;
      if (!msg) return null;
      if (msg.tool_calls && msg.tool_calls.length > 0) return 'tool_call';
      if (msg.content) return 'content';
      return null;
    }

    function spanFinishReason(span) {
      if (span.type === 'UPDATE') {
        const choice = span.attributes?.outputs?.choices?.[0];
        if (!choice) return null;
        const reason = choice.provider_specific_fields?.native_finish_reason || choice.finish_reason;
        if (!reason || reason === 'stop' || reason === 'tool_calls') return null;
        return reason;
      }
      if (span.type === 'START' && span.name === 'openai_completion') {
        const call = activeRawCalls.value.find(c => c.span_id === span.span_id);
        if (call && !call.native_finish_reason && !call.finish_reason) return 'no_response';
      }
      return null;
    }

    function toggleSpanCollapse(spanId) {
      const nowCollapsed = !collapsedSpanIds.value[spanId];
      collapsedSpanIds.value = { ...collapsedSpanIds.value, [spanId]: nowCollapsed };
      if (nowCollapsed) {
        // Close the parent's own JSON detail
        const idx = props.rawSpans.findIndex(s => s.span_id === spanId);
        if (idx !== -1 && expandedJsonlIdx.value[idx]) {
          expandedJsonlIdx.value[idx] = false;
        }
      }
    }

    function isSpanHidden(span) {
      const id = span.span_id;
      for (const [parentId, collapsed] of Object.entries(collapsedSpanIds.value)) {
        if (!collapsed) continue;
        const descendants = spanDescendants.value[parentId];
        if (descendants && descendants.includes(id)) return true;
      }
      return false;
    }

    // Tool blocks from tools prop (reconstructed tools array)
    const toolCollapseState = ref({});

    // Multi-conversation support: active tab index
    const activeConvIdx = ref(0);

    const conversationTabs = computed(() => {
      if (!Array.isArray(props.conversations) || props.conversations.length <= 1) return [];
      return props.conversations.map((conv, idx) => {
        const count = Array.isArray(conv) ? conv.length : 0;
        return `${t('custom.conversationTab', { idx: idx + 1 })} (${count})`;
      });
    });

    // Active messages — either from conversations tab or direct messages prop
    const activeMessages = computed(() => {
      if (Array.isArray(props.conversations) && props.conversations.length > 1) {
        return props.conversations[activeConvIdx.value] || [];
      }
      return props.messages;
    });

    const toolBlocks = computed(() => {
      if (!Array.isArray(props.tools) || props.tools.length === 0) return [];
      return props.tools.map((tool) => {
        const fn = tool.function || tool;
        const name = fn.name || 'unknown';
        const content = typeof tool === 'string' ? tool : JSON.stringify(tool, null, 2);
        return { fnName: name, content };
      });
    });

    function isCollapsibleTool(idx, tool) {
      return tool.content.length > 0;
    }

    function isToolCollapsed(idx) {
      if (idx in toolCollapseState.value) return toolCollapseState.value[idx];
      if (toolBlocks.value[idx]?.content.length < 500) return false;
      return true;
    }

    function toggleToolCollapse(idx) {
      toolCollapseState.value = { ...toolCollapseState.value, [idx]: !isToolCollapsed(idx) };
    }

    // Reset tool collapse when tools change
    watch(() => props.tools, () => {
      toolCollapseState.value = {};
    });

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
              sections: msg._sections || null,
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
          sections: msg._sections || null,
        });
      }
      return blocks;
    }

    /**
     * Parse display blocks from [role] content text format (legacy fallback).
     */
    function parseFromText(text) {
      if (!text || typeof text !== 'string') return [];
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
      if (Array.isArray(activeMessages.value) && activeMessages.value.length > 0) {
        blocks = parseFromMessages(activeMessages.value);
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
      // Lazy-render markdown when expanding a long message
      if (current && msg && msg.content && !renderedHtmlMap.value[idx]) {
        renderMessageHtml(idx, msg);
      }
      if (current && msg && msg.sections) {
        renderSectionsHtml(idx, msg);
      }
    }

    async function renderMessageHtml(idx, msg) {
      if (!['assistant', 'ai', 'bot'].includes(msg.role)) return;
      try {
        const html = await renderMathMarkdown(msg.content);
        renderedHtmlMap.value = { ...renderedHtmlMap.value, [idx]: html };
      } catch { /* keep plain text */ }
    }

    async function renderSectionsHtml(idx, msg) {
      const parts = getSectionParts(msg);
      if (!parts) return;
      const newMap = { ...sectionHtmlMap.value };
      for (let pidx = 0; pidx < parts.length; pidx++) {
        const key = `${idx}-${parts[pidx].label}`;
        if (newMap[key]) continue;
        if (!['assistant', 'ai', 'bot'].includes(msg.role)) continue;
        try {
          newMap[key] = await renderMathMarkdown(parts[pidx].text);
        } catch {
          newMap[key] = parts[pidx].text;
        }
      }
      sectionHtmlMap.value = newMap;
    }

    const chatContainerRef = ref(null);

    // Reset collapse state and filter when content changes (new dialog opened)
    watch(
      () => [props.messages, props.text, props.conversations],
      () => {
        collapseState.value = {};
        filterText.value = '';
        activeConvIdx.value = 0;
        sectionHtmlMap.value = {};
        // Reset scroll to top when switching between conversations/tools
        nextTick(() => {
          if (chatContainerRef.value) chatContainerRef.value.scrollTop = 0;
        });
      },
    );

    // Render markdown for non-tool assistant messages into a separate reactive map.
    // Skip long collapsed messages (>500 chars) to avoid unnecessary work — they'll
    // render on-demand when expanded.
    watch(
      () => parsed.value,
      async (blocks) => {
        const newHtmlMap = {};
        const newSectionMap = {};
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          if (b.isToolBlock) continue;
          if (['assistant', 'ai', 'bot'].includes(b.role) && b.content) {
            // For messages with sections, render each section part separately
            if (b.sections && b.sections.length > 0) {
              if (b.content.length > 2000 && isCollapsed(i, b)) continue;
              const parts = getSectionParts(b);
              if (parts) {
                for (let pidx = 0; pidx < parts.length; pidx++) {
                  const key = `${i}-${parts[pidx].label}`;
                  try {
                    newSectionMap[key] = await renderMathMarkdown(parts[pidx].text);
                  } catch {
                    // fallback to plain text
                  }
                }
              }
              continue;
            }
            if (b.content.length > 2000 && isCollapsed(i, b)) continue;
            try {
              newHtmlMap[i] = await renderMathMarkdown(b.content);
            } catch {
              // fallback to plain text (no entry in map)
            }
          }
        }
        renderedHtmlMap.value = newHtmlMap;
        sectionHtmlMap.value = newSectionMap;
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

    const SECTION_DOT_COLORS = {
      Analysis: '#6366f1',
      Plan: '#10b981',
    };

    function escapeHtml(text) {
      const el = document.createElement('span');
      el.textContent = text;
      return el.innerHTML;
    }

    function getSectionParts(msg) {
      if (!msg.sections || !Array.isArray(msg.sections) || msg.sections.length === 0) return null;
      const parts = [];
      let offset = 0;
      for (const sec of msg.sections) {
        const label = sec.label;
        const color = SECTION_DOT_COLORS[label] || '#6b7280';
        const text = msg.content.slice(offset, offset + sec.length);
        parts.push({ label, color, text });
        offset += sec.length;
      }
      // Any remaining content after the last section
      if (offset < msg.content.length) {
        parts.push({ label: null, color: null, text: msg.content.slice(offset) });
      }
      return parts;
    }

    const copyContent = async () => {
      let content;
      if (viewMode.value === 'json') {
        content = messagesJson.value;
      } else if (viewMode.value === 'jsonl') {
        content = JSON.stringify(props.rawSpans, null, 2);
      } else if (viewMode.value === 'calls') {
        content = JSON.stringify(activeRawCalls.value, null, 2);
      } else {
        content = props.text;
        if (!content && Array.isArray(activeMessages.value) && activeMessages.value.length > 0) {
          content = JSON.stringify(activeMessages.value, null, 2);
        }
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

    return { chatContainerRef, parsed, blockCount, itemCountText, filteredBlocks, filterText, renderedHtmlMap, sectionHtmlMap, isCollapsible, isCollapsed, toggleCollapse, highlightJson, copyContent, copyText, toolBlocks, isCollapsibleTool, isToolCollapsed, toggleToolCollapse, activeConvIdx, conversationTabs, getSectionParts, escapeHtml, codeWrap, viewMode, messagesJson, rawCallsTab, activeRawCalls, finishReasonStats, spanCallIndexMap, showPipeline, showTimeline, showSpanTree, flatSpanTree, spanDepthMap, spanHasChildren, spanTypeMap, collapsedSpanIds, toggleSpanCollapse, isSpanHidden, isSpanEmpty, spanOutputType, spanFinishReason, pipelineStats, timelineBarClass, timelineTooltip, expandedSpanIdx, expandedJsonlIdx };
  },
};
</script>

<style scoped>
.conv-dialog :deep(.el-dialog__body) {
  padding-top: 0;
  min-height: 60vh;
}

.title-count {
  font-size: 12px;
  opacity: 0.5;
  font-weight: 400;
}

/* Multi-conversation tabs */
.conv-tabs {
  display: flex;
  gap: 4px;
  margin-top: 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 0;
}

.conv-tab {
  padding: 5px 14px;
  font-size: 12px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  color: var(--el-text-color-secondary);
  transition: all 0.15s;
  border-bottom: 2px solid transparent;
}

.conv-tab:hover {
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
}

.conv-tab-active {
  color: var(--el-color-primary);
  background: var(--el-fill-color);
  border-bottom-color: var(--el-color-primary);
  font-weight: 500;
}

/* Unified scroll wrapper for tools + chat */
.chat-scroll-wrapper {
  max-height: 72vh;
  min-height: 50vh;
  overflow: auto;
  padding: 4px 0;
}

.chat-container {
  /* no separate max-height, nested inside scroll wrapper */
}

.tools-section {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.tools-section-title {
  font-size: 11px;
  font-weight: 600;
  color: #6366f1;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  padding-left: 4px;
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

.jsonl-finish-reason {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 6px;
  font-weight: 500;
  letter-spacing: 0.3px;
}
.jsonl-finish-reason.finish-abort { background: rgba(245, 108, 108, 0.12); color: #e45656; }
.jsonl-finish-reason.finish-kvcache_no_enough { background: rgba(230, 162, 60, 0.12); color: #c48a20; }
.jsonl-finish-reason.finish-length { background: rgba(230, 162, 60, 0.12); color: #c48a20; }
.jsonl-finish-reason.finish-no_response { background: rgba(230, 162, 60, 0.12); color: #c48a20; }

.finish-reason-stats {
  margin-left: 8px;
}
.finish-stat-item {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  margin-left: 6px;
  font-weight: 500;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
}
.finish-stat-item.finish-abort { background: rgba(245, 108, 108, 0.12); color: #e45656; }
.finish-stat-item.finish-kvcache_no_enough { background: rgba(230, 162, 60, 0.12); color: #c48a20; }
.finish-stat-item.finish-length { background: rgba(230, 162, 60, 0.12); color: #c48a20; }
.finish-stat-item.finish-no_response { background: rgba(230, 162, 60, 0.12); color: #c48a20; }

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
  white-space: nowrap;
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

/* Section dividers with colored dots */
.chat-section {
  margin-bottom: 4px;
}

.chat-section:last-child {
  margin-bottom: 0;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  margin-top: 8px;
}

.section-label:first-child {
  margin-top: 0;
}

.section-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.section-label-text {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
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
  line-height: 1.3;
  max-height: 300px;
  overflow-y: auto;
}

.code-wrap .tool-code,
.code-wrap .jsonl-row-detail,
.code-wrap .raw-jsonl-code {
  white-space: pre-wrap;
  word-break: break-word;
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

/* Raw API Calls view */
.raw-calls-container {
  padding: 4px 0;
}

.raw-calls-summary {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
  padding-left: 4px;
}

.raw-call-card {
  margin-bottom: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter, #f5f7fa);
  border-left: 3px solid var(--el-border-color);
}

html.dark .raw-call-card {
  background: #2c2c2c;
}

.raw-call-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.raw-call-num {
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
  color: var(--el-text-color-primary);
}

.raw-call-result {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.raw-call-empty {
  border-left-color: #f56c6c;
  opacity: 0.7;
}

.raw-call-section {
  margin-top: 6px;
}

.raw-call-section-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--el-text-color-secondary);
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.raw-call-sub-label {
  font-size: 10px;
  color: var(--el-text-color-secondary);
  display: block;
  margin-bottom: 2px;
}

.raw-call-tool-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 2px;
}

.raw-call-tool-args {
  font-size: 11px;
  font-family: monospace;
  color: var(--el-text-color-secondary);
}

.raw-call-reasoning-len {
  font-size: 10px;
  color: var(--el-text-color-secondary);
  opacity: 0.6;
  margin-left: auto;
}

.raw-call-body {
  font-size: 12px;
}

.raw-call-reasoning pre {
  margin: 2px 0;
  font-size: 11px;
  max-height: 80px;
  overflow-y: auto;
}

.raw-call-content {
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.raw-call-tools {
  margin-top: 4px;
  display: flex;
  gap: 4px;
}

.raw-call-no-output {
  color: var(--el-text-color-secondary);
  font-style: italic;
}

.raw-calls-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 0;
}

.raw-call-inputs {
  margin-bottom: 6px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.raw-call-input-msg {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 2px;
  font-size: 11px;
}

.raw-input-role {
  font-weight: 600;
  font-size: 10px;
  opacity: 0.7;
  min-width: 40px;
}

.raw-input-content {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.raw-input-tool .raw-input-role { color: #1abc9c; }
.raw-input-user .raw-input-role { color: #409eff; }
.raw-input-system .raw-input-role { color: #e6a23c; }

.raw-jsonl-container {
  padding: 4px 0;
}

.raw-jsonl-code {
  font-size: 12px;
  line-height: 1.5;
  max-height: none;
}

.jsonl-row {
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.jsonl-row-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  font-family: monospace;
  font-size: 12px;
}

.jsonl-row-header:hover {
  background: var(--el-fill-color, #ebeef5);
}

html.dark .jsonl-row-header:hover {
  background: #3a3a3a;
}

.jsonl-row-idx {
  color: var(--el-text-color-secondary);
  min-width: 24px;
  text-align: right;
}

.jsonl-row-type {
  font-weight: 600;
  min-width: 55px;
}

.jsonl-type-START { color: #409eff; }
.jsonl-type-UPDATE { color: #67c23a; }
.jsonl-type-END { color: var(--el-text-color-secondary); }

.jsonl-row-name {
  color: var(--el-color-primary);
}

.jsonl-row-id {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.jsonl-row-parent {
  color: var(--el-text-color-secondary);
  font-size: 10px;
  opacity: 0.6;
}

.jsonl-call-idx {
  font-size: 10px;
  font-weight: 600;
  color: var(--el-color-primary);
  opacity: 0.7;
  margin-left: 2px;
}

.jsonl-collapse-toggle {
  cursor: pointer;
  width: 14px;
  font-size: 10px;
  text-align: center;
  user-select: none;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.jsonl-collapse-toggle:hover {
  color: var(--el-color-primary);
}

.jsonl-collapse-placeholder {
  width: 14px;
  flex-shrink: 0;
}

.jsonl-empty-tag {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #f56c6c;
  padding: 1px 6px;
  border-radius: 3px;
  letter-spacing: 0.5px;
}

.jsonl-reasoning-tag {
  background: #f56c6c;
}

.jsonl-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.3px;
}

.jsonl-tag-tool {
  color: #fff;
  background: #409eff;
}

.jsonl-tag-content {
  color: #fff;
  background: #67c23a;
}

.jsonl-row-detail {
  margin: 0;
  padding: 8px 12px 8px 36px;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre;
  overflow-x: auto;
  background: var(--el-fill-color-lighter, #f5f7fa);
  max-height: 400px;
  overflow-y: auto;
}

html.dark .jsonl-row-detail {
  background: #2c2c2c;
}

.raw-viz-toggles {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.raw-viz-btn {
  font-size: 11px;
  padding: 3px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  color: var(--el-text-color-regular);
}

.raw-viz-btn.active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.raw-pipeline {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter, #f5f7fa);
  border-radius: 6px;
  font-size: 12px;
  font-family: monospace;
}

html.dark .raw-pipeline {
  background: #2c2c2c;
}

.pipeline-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.pipeline-label {
  font-weight: 600;
  min-width: 100px;
}

.pipeline-count {
  color: var(--el-color-primary);
  font-weight: 700;
}

.pipeline-fields {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.pipeline-arrow {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  padding: 1px 0 1px 12px;
}

.raw-timeline {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter, #f5f7fa);
  border-radius: 6px;
}

html.dark .raw-timeline {
  background: #2c2c2c;
}

.timeline-bar-container {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.timeline-bar {
  width: 8px;
  height: 20px;
  border-radius: 2px;
}

.tl-tool { background: #409eff; }
.tl-content { background: #67c23a; }
.tl-empty { background: #f56c6c; }

.timeline-legend {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.timeline-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tl-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.timeline-stats {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.raw-span-tree {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter, #f5f7fa);
  border-radius: 6px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
}

html.dark .raw-span-tree {
  background: #2c2c2c;
}

.tree-root > .tree-name {
  font-weight: 700;
  color: var(--el-color-primary);
}

.tree-children {
  padding-left: 8px;
}

.tree-prefix {
  color: var(--el-text-color-secondary);
}

.tree-arrow {
  color: var(--el-text-color-secondary);
}

.tree-leaf.tree-tool_call .tree-result { color: #409eff; }
.tree-leaf.tree-content .tree-result { color: #67c23a; }
.tree-leaf.tree-empty .tree-result,
.tree-empty-tag {
  color: #f56c6c;
  font-weight: 700;
}

.tree-leaf-header {
  cursor: pointer;
  padding: 1px 0;
  border-radius: 3px;
}

.tree-leaf-header:hover {
  background: var(--el-fill-color, #ebeef5);
}

html.dark .tree-leaf-header:hover {
  background: #3a3a3a;
}

.tree-clickable {
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

.tree-expanded > .tree-leaf-header {
  background: var(--el-fill-color, #ebeef5);
}

.tree-detail {
  margin: 4px 0 8px 20px;
  padding: 8px 10px;
  border-left: 2px solid var(--el-border-color);
  font-size: 11px;
}

.tree-detail-section {
  margin-bottom: 6px;
}

.tree-detail-label {
  font-weight: 600;
  color: var(--el-text-color-secondary);
  display: block;
  margin-bottom: 2px;
}

.tree-detail-msg {
  display: flex;
  gap: 6px;
  padding: 1px 0;
}

.tree-detail-pre {
  margin: 2px 0;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--el-text-color-regular);
}
</style>
