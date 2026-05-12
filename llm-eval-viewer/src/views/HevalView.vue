<!-- Copyright (c) 2026 dynamicheart. Licensed under the MIT License. -->

<template>
  <div class="heval-view" :style="{ marginLeft: showSidebar ? sidebarWidth + 'px' : '0' }">
    <DirBrowserDrawer
      :visible="showSidebar"
      :dir-tree="subDirs"
      :current-node-key="currentSubDir"
      @select-run="onSelectSubDir"
      @resize="w => sidebarWidth = w"
    />
    <div class="heval-toolbar">
      <el-button :type="browseMode !== 'directory' ? 'primary' : ''" @click="openDirectory">{{ $t('hyeval.selectDirectory') }}</el-button>
      <el-button :type="browseMode === 'directory' ? 'primary' : ''" @click="browseParentDirectory">{{ $t('hyeval.browseDirectory') }}</el-button>
      <el-dropdown v-if="recentDirs.length" trigger="click" @command="onRecentCommand">
        <el-button size="small" plain>{{ $t('hyeval.recent') }} <el-icon><ArrowDown /></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu class="recent-dropdown-menu">
            <el-dropdown-item v-for="d in recentDirs" :key="d.name" :command="d.name">
              <div class="recent-item-row">
                <div class="recent-item-info">
                  <div class="recent-item-name">
                    <el-icon style="margin-right: 4px; vertical-align: middle"><FolderOpened /></el-icon>
                    {{ d.name }}
                    <el-tag v-if="d.mode === 'directory'" size="small" type="info" style="margin-left: 6px">{{ $t('hyeval.browseDirectory') }}</el-tag>
                  </div>
                  <div class="recent-item-meta">
                    <template v-if="d.mode === 'directory'">{{ $t('hyeval.subDirCount', { count: d.records }) }}</template>
                    <template v-else>{{ d.records }} {{ $t('hyeval.records') }}</template>
                    · {{ formatTime(d.time) }}
                  </div>
                </div>
                <el-icon class="recent-delete" @click.stop="removeRecentDir(d.name)"><Close /></el-icon>
              </div>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <span v-if="fileName" class="file-name">{{ fileName }}</span>
      <el-button v-if="rows.length" size="small" plain @click="resetView">{{ $t('common.reset') }}</el-button>
      <el-divider v-if="rows.length" direction="vertical" />
      <span v-if="rows.length" class="stats-text">
        {{ rows.length }} {{ $t('hyeval.records') }}
        <template v-if="sortedRows.length !== rows.length"> · {{ sortedRows.length }} {{ $t('hyeval.shown') }}</template>
        · <span class="pass-text">{{ passCount }} {{ $t('hyeval.pass') }} ({{ ((passCount / rows.length) * 100).toFixed(1) }}%)</span>
        · <span class="fail-text">{{ failCount }} {{ $t('hyeval.fail') }} ({{ ((failCount / rows.length) * 100).toFixed(1) }}%)</span>
        <template v-if="trajectoryCount"> · {{ trajectoryCount }} {{ $t('hyeval.trajectories') }}</template>
      </span>
      <div class="toolbar-right">
        <el-select
          v-if="filterOptions.agents.length > 1"
          v-model="filters.agent"
          clearable
          placeholder="Agent"
          size="small"
          style="width: 130px"
        >
          <el-option v-for="a in filterOptions.agents" :key="a" :label="a" :value="a" />
        </el-select>
      </div>
    </div>

    <div v-if="!rows.length" class="empty-state">
      <p>{{ $t('hyeval.emptyPrompt') }}</p>
      <p class="hint">{{ $t('hyeval.emptyHint') }}</p>
    </div>

    <template v-else>
      <div v-if="hasAgentData" class="stats-panel">
        <div class="stats-section">
          <span class="stats-label">{{ $t('hyeval.exitStatus') }}:</span>
          <el-tag
            v-for="(count, status) in exitStatusDist"
            :key="status"
            :type="status === 'success' || status === 'finished' ? 'success' : status === 'max_iterations' ? 'warning' : 'danger'"
            size="small"
            class="stats-dist-tag"
          >
            {{ status }}: {{ count }} ({{ ((count / rows.length) * 100).toFixed(1) }}%)
          </el-tag>
        </div>
        <div v-if="iterationStats" class="stats-section">
          <span class="stats-label">{{ $t('hyeval.iterations') }}:</span>
          <el-tag v-if="iterationStats.limit" size="small" type="danger">limit: {{ iterationStats.limit }}</el-tag>
          <el-tag v-if="iterationStats.avg" size="small" type="info">avg: {{ iterationStats.avg }}</el-tag>
          <el-tag v-if="iterationStats.max" size="small" type="info">max: {{ iterationStats.max }}</el-tag>
          <el-tag v-if="iterationStats.min" size="small" type="info">min: {{ iterationStats.min }}</el-tag>
        </div>
        <div v-if="turnStats" class="stats-section">
          <span class="stats-label">{{ $t('hyeval.turns') }}:</span>
          <el-tag size="small" type="info">avg: {{ turnStats.effAvg }}/{{ turnStats.avg }}</el-tag>
          <el-tag size="small" type="info">max: {{ turnStats.max }}</el-tag>
          <el-tag size="small" type="info">min: {{ turnStats.min }}</el-tag>
        </div>
        <div v-if="toolCallStats" class="stats-section">
          <span class="stats-label">{{ $t('hyeval.toolCount') }}:</span>
          <el-tag size="small" type="info">avg: {{ toolCallStats.avg }}</el-tag>
          <el-tag size="small" type="info">max: {{ toolCallStats.max }}</el-tag>
          <el-tag size="small" type="info">min: {{ toolCallStats.min }}</el-tag>
        </div>
        <div v-if="diagStats" class="stats-section">
          <span class="stats-label">Diag:</span>
          <el-tag size="small" type="info">{{ diagStats.affected }}/{{ diagStats.total }} affected</el-tag>
          <el-tag v-for="(count, reason) in diagStats.totals" :key="reason" size="small" :type="reason === 'abort' || reason === 'server_error' ? 'danger' : 'warning'">{{ reason }}: {{ count }}{{ diagStats.totalTurns ? ` (${(count / diagStats.totalTurns * 100).toFixed(1)}%)` : '' }}</el-tag>
        </div>
      </div>
      <div v-if="evalLoading" class="eval-progress">
        <span class="eval-progress-text">{{ $t('hyeval.loadingJudge', { progress: evalLoadProgress, total: evalLoadTotal }) }}</span>
        <el-progress :percentage="Math.round((evalLoadProgress / evalLoadTotal) * 100)" :stroke-width="6" />
      </div>
      <el-table
        :data="paginatedRows"
        stripe
        highlight-current-row
        @row-click="selectRow"
        :row-class-name="rowClassName"
        @sort-change="onSortChange"
        @filter-change="onFilterChange"
        max-height="45vh"
        style="width: 100%"
        :table-layout="'fixed'"
      >
        <el-table-column prop="question_id" :label="$t('hyeval.id')" width="120">
          <template #header>
            <TableHeaderSearch :label="$t('hyeval.id')" v-model="filters.questionId" :placeholder="$t('hyeval.search')" />
          </template>
        </el-table-column>
        <el-table-column :label="$t('hyeval.question')" min-width="200" show-overflow-tooltip>
          <template #header>
            <TableHeaderSearch :label="$t('hyeval.question')" v-model="filters.questionText" :placeholder="$t('hyeval.search')" />
          </template>
          <template #default="{ row }">
            <span>{{ truncate(row.question, 160) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="hasRefAnswer" :label="$t('hyeval.refAnswer')" width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.ref_answer">{{ truncate(row.ref_answer, 40) }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column v-if="hasRefAnswer" :label="$t('hyeval.answer')" width="180" show-overflow-tooltip>
          <template #header>
            <TableHeaderSearch :label="$t('hyeval.answer')" v-model="filters.answerText" :placeholder="$t('hyeval.search')" />
          </template>
          <template #default="{ row }">
            <span v-if="getJudgeAnswer(row)">{{ truncate(getJudgeAnswer(row), 50) }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="score" :label="$t('hyeval.score')" width="90" column-key="score" :filters="scoreFilters" :filter-multiple="true">
          <template #default="{ row }">
            <el-tag :type="row.score >= 1 ? 'info' : 'danger'" size="small">
              {{ row.score }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('hyeval.status')"
          width="100"
          column-key="status"
          :filters="[{ text: 'PASS', value: 'pass' }, { text: 'FAIL', value: 'fail' }]"
          :filter-multiple="false"
        >
          <template #default="{ row }">
            <el-tag v-if="row.score < 1" type="danger" size="small">FAIL</el-tag>
            <span v-else class="text-muted">PASS</span>
          </template>
        </el-table-column>
        <el-table-column
          v-if="hasAgentData"
          prop="exit_status"
          :label="$t('hyeval.exit')"
          width="110"
          column-key="exit_status"
          :filters="exitStatusFilters"
          :filter-multiple="true"
        />
        <el-table-column v-if="Object.keys(msgCountMap).length" :label="$t('hyeval.turns')" width="80">
          <template #default="{ row }">
            <template v-if="msgCountMap[String(row.question_id)]">
              {{ msgCountMap[String(row.question_id)].effective }}/{{ msgCountMap[String(row.question_id)].total }}
            </template>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column v-if="Object.keys(toolCallMap).length" :label="$t('hyeval.toolCount')" width="90">
          <template #default="{ row }">
            <span v-if="toolCallMap[String(row.question_id)] != null">{{ toolCallMap[String(row.question_id)] }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column v-if="Object.keys(diagMap).length" label="Diag" width="180">
          <template #default="{ row }">
            <template v-if="diagMap[String(row.question_id)]">
              <span v-for="(count, reason) in diagMap[String(row.question_id)]" :key="reason" class="diag-tag" :class="'diag-' + reason">{{ reason }}: {{ count }}</span>
            </template>
          </template>
        </el-table-column>
        <el-table-column v-if="trajectoryCount" :label="$t('hyeval.traj')" width="50">
          <template #default="{ row }">
            <el-icon v-if="hasTrajectory(row)" color="var(--el-color-success)"><Check /></el-icon>
          </template>
        </el-table-column>
        <el-table-column v-if="hasTrajectoryPaths" label="Trajectory Info" width="200">
          <template #default="{ row }">
            <div v-if="row.trajectory_path || row.trajectory_chat_path || row.masked_content_path" class="traj-paths">
              <span v-if="row.trajectory_path" class="path-link" @click.stop="copyPath(row.trajectory_path)">traj</span>
              <span v-if="row.trajectory_chat_path" class="path-link" @click.stop="copyPath(row.trajectory_chat_path)">chat</span>
              <span v-if="row.masked_content_path" class="path-link" @click.stop="copyPath(row.masked_content_path)">masked</span>
            </div>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-if="sortedRows.length > pageSize"
        :current-page="currentPage"
        :page-size="pageSize"
        :page-sizes="[50, 100, 200]"
        :total="sortedRows.length"
        layout="total, sizes, prev, pager, next"
        class="heval-pagination"
        @current-change="currentPage = $event"
        @size-change="v => { pageSize = v; currentPage = 1; }"
      />

      <div v-if="selectedRow" class="detail-panel">
        <div class="detail-header">
          <span class="detail-title">
            #{{ selectedRow.question_id }}
            <el-tag :type="selectedRow.score >= 1 ? 'success' : 'danger'" size="small">
              Score: {{ selectedRow.score }}
            </el-tag>
          </span>
          <div style="display: flex; gap: 8px">
            <el-button size="small" @click.stop="showRawJson = true">{{ $t('hyeval.rawJson') }}</el-button>
            <el-button size="small" @click.stop="selectedRow = null">{{ $t('hyeval.close') }}</el-button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-cell">
            <div class="detail-label">{{ $t('hyeval.question') }}</div>
            <div class="detail-content scrollable">{{ selectedRow.question }}</div>
          </div>
          <div class="detail-cell">
            <div class="detail-label">{{ $t('hyeval.modelOutput') }}</div>
            <div class="detail-content scrollable prediction">{{ selectedRow.final_answer || selectedRow.prediction || selectedRow.answer || '-' }}</div>
          </div>
          <div class="detail-cell">
            <div class="detail-label">
              <template v-if="selectedRow.ref_answer">{{ $t('hyeval.referenceAnswer') }}</template>
              <template v-else-if="selectedRow.test_results">{{ $t('hyeval.testResults') }}</template>
              <template v-else>{{ $t('hyeval.info') }}</template>
            </div>
            <div class="detail-content scrollable">
              <template v-if="selectedRow.ref_answer">
                <div class="ref-answer">{{ selectedRow.ref_answer }}</div>
                <div v-if="getJudgeAnswer(selectedRow)" class="model-answer" :class="selectedRow.score >= 1 ? 'pass' : 'fail'">
                  <span class="answer-label">{{ $t('hyeval.modelAnswer') }}</span> {{ getJudgeAnswer(selectedRow) }}
                </div>
              </template>
              <template v-if="selectedRow.test_results">
                <div class="test-results">
                  <div
                    v-for="(t, idx) in parseTestResults(selectedRow.test_results)"
                    :key="idx"
                    class="test-item"
                  >
                    <el-tag :type="t.status === 'passed' ? 'success' : 'danger'" size="small">
                      {{ t.status }}
                    </el-tag>
                    <span class="test-name">{{ t.name }}</span>
                    <div v-if="t.message" class="test-message">{{ t.message }}</div>
                  </div>
                </div>
              </template>
              <template v-if="!selectedRow.ref_answer && !selectedRow.test_results">
                <span class="text-muted">{{ $t('hyeval.noRefAnswer') }}</span>
              </template>
            </div>
          </div>
          <div class="detail-cell">
            <div class="detail-label">
              Trajectory
              <template v-if="!hasTrajectory(selectedRow)">
                <el-upload
                  :auto-upload="false"
                  :on-change="handleTrajectoryFile"
                  :show-file-list="false"
                  accept=".jsonl.zst,.zst,.jsonl"
                  style="display: inline-block; margin-left: 8px"
                >
                  <el-button size="small">{{ $t('hyeval.loadFile') }}</el-button>
                </el-upload>
              </template>
            </div>
            <div class="detail-content scrollable">
              <div v-if="loadingTrajectory" class="text-muted">{{ $t('hyeval.loadingTrajectory') }}</div>
              <div v-else-if="trajectoryMessages.length || trajectoryConversations.length" class="traj-info">
                <span v-if="trajectoryConversations.length">{{ $t('hyeval.conversations', { count: trajectoryConversations.length }) }}</span>
                <span v-else>{{ $t('hyeval.messages', { count: trajectoryMessages.length }) }}</span>
                <el-button size="small" type="primary" plain @click="showTrajectory = true">
                  {{ $t('hyeval.viewConversation') }}
                </el-button>
              </div>
              <div v-else-if="hasTrajectory(selectedRow)">
                <el-button size="small" type="primary" plain @click="loadTrajectoryForRow(selectedRow)">
                  {{ $t('hyeval.loadTrajectory') }}
                </el-button>
              </div>
              <span v-else class="text-muted">{{ $t('hyeval.noTrajectory') }}</span>
              <div v-if="judgeEval" class="judge-eval">
                <div class="judge-eval-title">{{ $t('hyeval.judgeEvaluation') }}</div>
                <div v-for="(val, key) in judgeEval" :key="key" class="judge-eval-item">
                  <span class="judge-eval-key">{{ key }}:</span>
                  <span class="judge-eval-val" :class="{ 'judge-fail': val === 0, 'judge-pass': val === 1 }">{{ val }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <ConversationDialog
      :visible="showTrajectory"
      @update:visible="showTrajectory = $event"
      :messages="trajectoryMessages"
      :conversations="trajectoryConversations"
      :raw-calls="trajectoryRawCalls"
      :raw-spans="trajectoryRawSpans"
      :span-tree="trajectorySpanTree"
      :show-filter="true"
    />

    <el-dialog
      v-model="showRawJson"
      :title="$t('hyeval.rawJson')"
      width="60%"
      top="6vh"
    >
      <div class="raw-json-content">
        <JsonViewer :data="selectedRowRaw" />
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { readTextWithDecompression, isCompressedFile, decompressBuffer } from '@/utils/decompressFile';
import hyevalParse from '@/plugins/hyevalParse';
import trajectoryParse from '@/plugins/trajectoryParse';
import ConversationDialog from '@/components/ConversationDialog.vue';
import JsonViewer from '@/components/JsonViewer.vue';
import TableHeaderSearch from '@/components/TableHeaderSearch.vue';
import DirBrowserDrawer from '@/components/DirBrowserDrawer.vue';
import { Check, ArrowDown, Close } from '@element-plus/icons-vue';
import { FolderOpened } from '@element-plus/icons-vue';
import hljs from 'highlight.js/lib/core';
import jsonLang from 'highlight.js/lib/languages/json';

hljs.registerLanguage('json', jsonLang);

const CACHE_VERSION = 4;

export default {
  components: { ConversationDialog, JsonViewer, TableHeaderSearch, DirBrowserDrawer, Check, ArrowDown, Close, FolderOpened },

  data() {
    return {
      fileName: '',
      rows: [],
      selectedRow: null,
      filters: { agent: '', questionId: '', questionText: '', answerText: '' },
      trajectoryMessages: [],
      trajectoryConversations: [],
      trajectoryRawCalls: [],
      trajectoryRawSpans: [],
      trajectorySpanTree: [],
      showTrajectory: false,
      loadingTrajectory: false,
      trajectoryIndex: {},
      dirHandle: null,
      trajDirHandle: null,
      showRawJson: false,
      rawRows: [],
      judgeEval: null,
      judgeEvalMap: {},
      msgCountMap: {},
      diagMap: {},
      toolCallMap: {},
      evalLoadProgress: 0,
      evalLoadTotal: 0,
      evalLoading: false,
      sortState: { prop: null, order: null },
      columnFilters: {},
      currentPage: 1,
      pageSize: 50,
      recentDirs: JSON.parse(localStorage.getItem('hyeval_recent_dirs') || '[]'),
      parentDirHandle: null,
      subDirs: [],
      browseMode: localStorage.getItem('hyeval_browse_mode') || 'file',
      currentSubDir: localStorage.getItem('hyeval_current_subdir') || '',
      sidebarWidth: 0,
      loadGeneration: 0,
    };
  },

  computed: {
    showSidebar() { return this.browseMode === 'directory' && this.subDirs.length > 0; },
    passCount() { return this.rows.filter(r => r.score >= 1).length; },
    failCount() { return this.rows.filter(r => r.score < 1).length; },
    hasAgentData() { return this.rows.some(r => r.agent_name); },
    hasRefAnswer() { return this.rows.some(r => r.ref_answer); },
    hasAnswer() { return this.rows.some(r => r.answer); },
    hasPrediction() { return this.rows.some(r => r.prediction); },
    hasTrajectoryPaths() { return this.rows.some(r => r.trajectory_path || r.trajectory_chat_path || r.masked_content_path); },
    trajectoryCount() { return Object.keys(this.trajectoryIndex).length; },
    selectedRowRaw() {
      if (!this.selectedRow) return null;
      const qid = String(this.selectedRow.question_id);
      const raw = this.rawRows.find(r => String(r.questionId) === qid);
      return raw || this.selectedRow;
    },
    exitStatusDist() {
      const dist = {};
      for (const r of this.rows) {
        const s = r.exit_status || 'unknown';
        dist[s] = (dist[s] || 0) + 1;
      }
      return dist;
    },
    iterationStats() {
      const vals = this.rows.map(r => r.n_iterations).filter(v => v != null);
      const configLimit = this.rows.find(r => r.max_iterations != null);
      const limit = configLimit ? configLimit.max_iterations : null;
      if (vals.length === 0 && !limit) return null;
      if (vals.length === 0) return { avg: null, max: null, min: null, limit };
      const sum = vals.reduce((a, b) => a + b, 0);
      const maxVal = vals.reduce((a, b) => a > b ? a : b, vals[0]);
      const minVal = vals.reduce((a, b) => a < b ? a : b, vals[0]);
      return {
        avg: (sum / vals.length).toFixed(1),
        max: maxVal,
        min: minVal,
        limit,
      };
    },
    filterOptions() {
      const agents = [...new Set(this.rows.map(r => r.agent_name).filter(Boolean))];
      const exitStatuses = [...new Set(this.rows.map(r => r.exit_status).filter(Boolean))];
      return { agents, exitStatuses };
    },
    filteredRows() {
      return this.rows.filter(r => {
        if (this.filters.questionId && !String(r.question_id).includes(this.filters.questionId)) return false;
        if (this.filters.questionText && !(r.question || '').toLowerCase().includes(this.filters.questionText.toLowerCase())) return false;
        if (this.filters.answerText) {
          const answer = String(this.getJudgeAnswer(r) || '');
          if (!answer.toLowerCase().includes(this.filters.answerText.toLowerCase())) return false;
        }
        if (this.filters.agent && r.agent_name !== this.filters.agent) return false;
        const statusFilter = this.columnFilters.status;
        if (statusFilter && statusFilter.length) {
          const isPass = r.score >= 1;
          if (!statusFilter.includes(isPass ? 'pass' : 'fail')) return false;
        }
        const exitFilter = this.columnFilters.exit_status;
        if (exitFilter && exitFilter.length) {
          if (!exitFilter.includes(r.exit_status)) return false;
        }
        const scoreFilter = this.columnFilters.score;
        if (scoreFilter && scoreFilter.length) {
          if (!scoreFilter.includes(r.score)) return false;
        }
        return true;
      });
    },
    exitStatusFilters() {
      const statuses = [...new Set(this.rows.map(r => r.exit_status).filter(Boolean))];
      return statuses.map(s => ({ text: s, value: s }));
    },
    scoreFilters() {
      const scores = [...new Set(this.rows.map(r => r.score))].sort((a, b) => a - b);
      return scores.map(s => ({ text: String(s), value: s }));
    },
    sortedRows() {
      const rows = this.filteredRows;
      const { prop, order } = this.sortState;
      if (!prop || !order) return rows;
      const sorted = [...rows];
      const dir = order === 'ascending' ? 1 : -1;
      sorted.sort((a, b) => {
        const va = a[prop] ?? '';
        const vb = b[prop] ?? '';
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb)) * dir;
      });
      return sorted;
    },
    paginatedRows() {
      const start = (this.currentPage - 1) * this.pageSize;
      return this.sortedRows.slice(start, start + this.pageSize);
    },
    turnStats() {
      const vals = Object.values(this.msgCountMap).filter(v => v != null);
      if (vals.length === 0) return null;
      const totals = vals.map(v => typeof v === 'object' ? v.total : v);
      const effectives = vals.map(v => typeof v === 'object' ? v.effective : v);
      const sum = totals.reduce((a, b) => a + b, 0);
      const effSum = effectives.reduce((a, b) => a + b, 0);
      return {
        avg: (sum / vals.length).toFixed(1),
        max: Math.max(...totals),
        min: Math.min(...totals),
        effAvg: (effSum / vals.length).toFixed(1),
      };
    },
    toolCallStats() {
      const vals = Object.values(this.toolCallMap).filter(v => v != null);
      if (vals.length === 0) return null;
      const sum = vals.reduce((a, b) => a + b, 0);
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      return { avg: (sum / vals.length).toFixed(1), max, min, total: sum };
    },
    diagStats() {
      const entries = Object.values(this.diagMap);
      if (entries.length === 0) return null;
      const totals = {};
      let affectedCount = 0;
      for (const diag of entries) {
        affectedCount++;
        for (const [reason, count] of Object.entries(diag)) {
          totals[reason] = (totals[reason] || 0) + count;
        }
      }
      const totalTurns = Object.values(this.msgCountMap).reduce((a, b) => {
        const v = typeof b === 'object' ? b.total : (b || 0);
        return a + v;
      }, 0);
      return { totals, affected: affectedCount, total: Object.keys(this.trajectoryIndex).length, totalTurns };
    },
  },

  watch: {
    'filters': {
      deep: true,
      handler() { this.currentPage = 1; },
    },
  },

  async mounted() {
    await this.tryRestoreDirectory();
  },

  methods: {
    onSortChange({ prop, order }) {
      this.sortState = { prop, order };
      this.currentPage = 1;
    },
    onFilterChange(filters) {
      const updated = { ...this.columnFilters };
      for (const [key, val] of Object.entries(filters)) {
        if (val && val.length > 0) {
          updated[key] = val;
        } else {
          delete updated[key];
        }
      }
      this.columnFilters = updated;
      this.currentPage = 1;
    },
    onRecentCommand(name) {
      const item = this.recentDirs.find(d => d.name === name);
      if (item) this.loadRecentDir(item);
    },
    async tryRestoreDirectory() {
      if (this.recentDirs.length === 0) return;
      if (sessionStorage.getItem('hyeval_reset')) {
        sessionStorage.removeItem('hyeval_reset');
        return;
      }

      if (this.browseMode === 'directory') {
        const parentName = localStorage.getItem('hyeval_parent_dir');
        if (parentName) {
          const handle = await this.loadDirHandle(parentName);
          if (!handle) return;
          try {
            let perm = await handle.queryPermission({ mode: 'read' });
            if (perm === 'prompt') perm = await handle.requestPermission({ mode: 'read' });
            if (perm !== 'granted') return;
            this.parentDirHandle = handle;
            await this.scanSubDirs(handle);
            if (this.currentSubDir && this.subDirs.length > 0) {
              const children = this.subDirs[0]?.children || [];
              const target = children.find(d => d.id === this.currentSubDir);
              if (target) await this.onSelectSubDir(target);
            }
          } catch { /* ignore */ }
        }
        return;
      }

      const last = this.recentDirs[0];
      const handle = await this.loadDirHandle(last.name);
      if (!handle) return;
      try {
        let perm = await handle.queryPermission({ mode: 'read' });
        if (perm === 'prompt') perm = await handle.requestPermission({ mode: 'read' });
        if (perm !== 'granted') return;
        this.dirHandle = handle;
        this.fileName = handle.name;
        await this.loadDirectory(handle);
      } catch (e) { /* permission denied or handle invalid */ }
    },

    updateRecentDirs(name, recordCount, mode) {
      const MAX = 40;
      const list = this.recentDirs.filter(d => d.name !== name);
      list.unshift({ name, time: Date.now(), records: recordCount || 0, mode: mode || 'file' });
      if (list.length > MAX) list.length = MAX;
      this.recentDirs = list;
      localStorage.setItem('hyeval_recent_dirs', JSON.stringify(list));
    },

    copyPath(path) {
      navigator.clipboard.writeText(path).then(() => {
        this.$message.success(this.$t('hyeval.copied'));
      });
    },
    async removeRecentDir(name) {
      const item = this.recentDirs.find(d => d.name === name);
      this.recentDirs = this.recentDirs.filter(d => d.name !== name);
      localStorage.setItem('hyeval_recent_dirs', JSON.stringify(this.recentDirs));
      try {
        const db = await this.openDB();
        const tx = db.transaction('handles', 'readwrite');
        const store = tx.objectStore('handles');
        store.delete(`dir_${name}`);
        store.delete(`hyeval_judge_${name}`);
        store.delete(`hyeval_msgcount_${name}`);
        store.delete(`hyeval_diag_${name}`);
        store.delete(`hyeval_diag2_${name}`);
        if (item && item.mode === 'directory') {
          const allKeys = await new Promise((r, j) => {
            const req = store.getAllKeys();
            req.onsuccess = () => r(req.result);
            req.onerror = j;
          });
          const prefixes = ['hyeval_judge_', 'hyeval_msgcount_', 'hyeval_diag_', 'hyeval_diag2_'];
          for (const key of allKeys) {
            if (prefixes.some(p => typeof key === 'string' && key.startsWith(p))) {
              store.delete(key);
            }
          }
        }
        await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
        db.close();
      } catch (e) { /* ignore */ }
    },

    async loadRecentDir(item) {
      const handle = await this.loadDirHandle(item.name);
      if (!handle) {
        this.$message.warning(this.$t('hyeval.dirExpired'));
        this.removeRecentDir(item.name);
        return;
      }
      try {
        const permission = await handle.requestPermission({ mode: 'read' });
        if (permission !== 'granted') return;
        if (item.mode === 'directory') {
          this.parentDirHandle = handle;
          await this.scanSubDirs(handle);
        } else {
          this.dirHandle = handle;
          this.fileName = handle.name;
          this.browseMode = 'file';
          this.subDirs = [];
          this.currentSubDir = '';
          localStorage.setItem('hyeval_browse_mode', 'file');
          await this.loadDirectory(handle);
        }
      } catch (e) {
        this.$message.error('Failed to access directory');
      }
    },

    async storeDirHandle(handle) {
      const db = await this.openDB();
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, `dir_${handle.name}`);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
    },

    async loadDirHandle(name) {
      try {
        const db = await this.openDB();
        const tx = db.transaction('handles', 'readonly');
        const handle = await new Promise((resolve, reject) => {
          const req = tx.objectStore('handles').get(`dir_${name}`);
          req.onsuccess = () => resolve(req.result);
          req.onerror = reject;
        });
        db.close();
        return handle || null;
      } catch (e) { return null; }
    },

    openDB() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('hyeval_store', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('handles');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
      });
    },

    resetView() {
      this.rows = [];
      this.rawRows = [];
      this.fileName = '';
      this.dirHandle = null;
      this.trajDirHandle = null;
      this.trajectoryIndex = {};
      this.judgeEvalMap = {};
      this.msgCountMap = {};
      this.diagMap = {};
      this.toolCallMap = {};
      this.selectedRow = null;
      this.trajectoryMessages = [];
      this.trajectoryConversations = [];
      this.trajectoryRawCalls = [];
      this.trajectoryRawSpans = [];
      this.trajectorySpanTree = [];
      this.showTrajectory = false;
      this.judgeEval = null;
      this.columnFilters = {};
      this.sortState = { prop: null, order: null };
      this.currentPage = 1;
      this.parentDirHandle = null;
      this.subDirs = [];
      this.browseMode = 'file';
      this.currentSubDir = '';
      localStorage.setItem('hyeval_browse_mode', 'file');
      localStorage.removeItem('hyeval_current_subdir');
      localStorage.removeItem('hyeval_parent_dir');
      sessionStorage.setItem('hyeval_reset', '1');
    },

    async browseParentDirectory() {
      if (!window.showDirectoryPicker) {
        alert('Directory picker not supported. Use Chrome/Edge.');
        return;
      }
      try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        this.parentDirHandle = handle;
        await this.scanSubDirs(handle);
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
      }
    },

    async scanSubDirs(parentHandle) {
      const dirs = [];
      for await (const entry of parentHandle.values()) {
        if (entry.kind !== 'directory') continue;
        if (entry.name.startsWith('.')) continue;
        let hasJsonlGz = false;
        try {
          for await (const child of entry.values()) {
            if (child.kind === 'file' && child.name.endsWith('.jsonl.gz')) {
              hasJsonlGz = true;
              break;
            }
          }
        } catch { /* skip inaccessible */ }
        if (hasJsonlGz) {
          dirs.push({ id: entry.name, label: entry.name, handle: entry, isLeaf: true });
        }
      }
      if (dirs.length === 0) {
        this.$message.warning(this.$t('hyeval.noValidSubDirs'));
        return;
      }
      dirs.sort((a, b) => b.label.localeCompare(a.label));
      this.subDirs = [{
        id: `parent_${parentHandle.name}`,
        label: parentHandle.name,
        children: dirs,
      }];
      this.browseMode = 'directory';
      localStorage.setItem('hyeval_browse_mode', 'directory');
      localStorage.setItem('hyeval_parent_dir', parentHandle.name);
      await this.storeDirHandle(parentHandle);
      this.updateRecentDirs(parentHandle.name, dirs.length, 'directory');
    },

    async onSelectSubDir(node) {
      this.loadGeneration++;
      this.currentSubDir = node.id;
      localStorage.setItem('hyeval_current_subdir', node.id);
      this.dirHandle = node.handle;
      this.fileName = node.label;
      this.rows = [];
      this.rawRows = [];
      this.judgeEvalMap = {};
      this.msgCountMap = {};
      this.diagMap = {};
      this.toolCallMap = {};
      this.trajectoryIndex = {};
      this.selectedRow = null;
      await this.loadDirectory(node.handle);
    },

    formatTime(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    async openDirectory() {
      if (!window.showDirectoryPicker) {
        alert('Directory picker not supported. Use Chrome/Edge.');
        return;
      }
      try {
        const dirHandle = await window.showDirectoryPicker();
        this.dirHandle = dirHandle;
        this.fileName = dirHandle.name;
        this.browseMode = 'file';
        this.subDirs = [];
        this.currentSubDir = '';
        localStorage.setItem('hyeval_browse_mode', 'file');
        await this.storeDirHandle(dirHandle);
        await this.loadDirectory(dirHandle);
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
      }
    },

    async loadDirectory(dirHandle) {
      const gen = this.loadGeneration;
      let mainFile = null;
      let trajDir = null;

      for await (const entry of dirHandle.values()) {
        if (gen !== this.loadGeneration) return;
        if (entry.kind === 'file' && entry.name.endsWith('.jsonl.gz')) {
          mainFile = entry;
        }
        if (entry.kind === 'directory' && entry.name === 'trajectory') {
          trajDir = entry;
        }
      }
      if (gen !== this.loadGeneration) return;

      if (!mainFile) {
        this.$message.warning(this.$t('hyeval.noJsonlGz'));
        return;
      }

      const file = await mainFile.getFile();
      const text = await readTextWithDecompression(file);
      if (gen !== this.loadGeneration) return;

      const result = hyevalParse.process(text, {}, {});

      if (result.rows.length === 0) {
        this.$message.warning(this.$t('hyeval.parseEmpty'));
        return;
      }

      this.trajDirHandle = trajDir;
      this.trajectoryIndex = {};
      this.rows = result.rows;
      this.rawRows = this.parseRawRows(text);
      this.selectedRow = null;
      this.trajectoryMessages = [];
      if (this.browseMode !== 'directory') {
        this.updateRecentDirs(dirHandle.name, result.rows.length);
      }

      if (this.trajDirHandle) {
        await this.indexTrajectories(gen);
      } else {
        this.$message.info(this.$t('hyeval.loaded', { count: result.rows.length }));
      }
    },

    async indexTrajectories(gen) {
      if (gen == null) gen = this.loadGeneration;
      const index = {};
      for await (const entry of this.trajDirHandle.values()) {
        if (gen !== this.loadGeneration) return;
        if (entry.kind !== 'file') continue;
        const match = entry.name.match(/_(\d+)_[0-9a-f-]+\.jsonl\.zst$/);
        if (match) {
          index[match[1]] = entry;
        }
      }
      if (gen !== this.loadGeneration) return;
      this.trajectoryIndex = index;
      this.loadJudgeEvalsAsync();
    },

    hasTrajectory(row) {
      if (!row) return false;
      return !!this.trajectoryIndex[String(row.question_id)];
    },

    async loadTrajectoryForRow(row) {
      const fileHandle = this.trajectoryIndex[String(row.question_id)];
      if (!fileHandle) return;

      this.loadingTrajectory = true;
      this.judgeEval = null;
      try {
        const file = await fileHandle.getFile();
        const text = await readTextWithDecompression(file);
        const result = trajectoryParse.process(text, {});
        if (result.rows.length > 0) {
          const traj = result.rows[0];
          if (traj.conversations) {
            this.trajectoryConversations = traj.conversations;
            this.trajectoryMessages = [];
            this.judgeEval = this.extractJudgeEval(traj.conversations);
          } else if (traj.conversation) {
            this.trajectoryMessages = traj.conversation;
            this.trajectoryConversations = [];
          }
          this.trajectoryRawCalls = traj.rawCallsList || [traj.rawCalls || []];
          this.trajectoryRawSpans = traj.rawSpans || [];
          this.trajectorySpanTree = traj.spanTree || [];
        }
      } catch (e) {
        console.error('Failed to load trajectory:', e);
      } finally {
        this.loadingTrajectory = false;
      }
    },

    async handleFileChange(uploadFile) {
      const file = uploadFile.raw;
      this.fileName = file.name;
      this.selectedRow = null;
      this.trajectoryMessages = [];
      this.trajectoryIndex = new Map();

      const text = await readTextWithDecompression(file);
      const result = hyevalParse.process(text, {}, {});
      this.rows = result.rows;
      this.rawRows = this.parseRawRows(text);
    },

    selectRow(row) {
      this.selectedRow = row;
      this.trajectoryMessages = [];
      this.trajectoryConversations = [];
      this.judgeEval = null;
    },

    rowClassName({ row }) {
      if (this.selectedRow && row.question_id === this.selectedRow.question_id) {
        return 'selected-row';
      }
      return '';
    },

    async handleTrajectoryFile(uploadFile) {
      const file = uploadFile.raw;
      this.loadingTrajectory = true;
      try {
        const text = await readTextWithDecompression(file);
        const result = trajectoryParse.process(text, {});
        if (result.rows.length > 0 && result.rows[0].conversation) {
          this.trajectoryMessages = result.rows[0].conversation;
        }
      } finally {
        this.loadingTrajectory = false;
      }
    },

    parseTestResults(testResults) {
      if (!testResults) return [];
      const results = testResults?.results?.tests || testResults?.tests || [];
      return results.map(t => ({
        name: t.name || t.file_path || 'test',
        status: t.status || 'unknown',
        message: t.message || '',
      }));
    },

    truncate(str, len) {
      if (!str) return '';
      return str.length > len ? str.slice(0, len) + '...' : str;
    },

    parseRawRows(text) {
      const rows = [];
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try { rows.push(JSON.parse(line)); } catch (e) { /* skip */ }
      }
      return rows;
    },

    extractJudgeEval(conversations) {
      if (!Array.isArray(conversations) || conversations.length < 2) return null;
      const judgeConv = conversations[1];
      if (!Array.isArray(judgeConv)) return null;
      for (let i = judgeConv.length - 1; i >= 0; i--) {
        const msg = judgeConv[i];
        if (msg.role !== 'assistant' || !msg.content) continue;
        try {
          const parsed = JSON.parse(msg.content.trim());
          if (typeof parsed === 'object' && parsed !== null) return parsed;
        } catch (e) {
          const match = msg.content.match(/\{[^{}]*\}/);
          if (match) {
            try { return JSON.parse(match[0]); } catch (e) { /* skip */ }
          }
        }
      }
      return null;
    },

    getJudgeAnswer(row) {
      const evalObj = this.judgeEvalMap[String(row.question_id)];
      if (!evalObj) return null;
      return evalObj['模型回复的答案总结'] || evalObj['answer'] || evalObj['model_answer'] || null;
    },

    async loadJudgeEvalsAsync() {
      const gen = this.loadGeneration;
      const fn = this.fileName;
      const cacheKey = `hyeval_v${CACHE_VERSION}_judge_${fn}`;
      const msgCacheKey = `hyeval_v${CACHE_VERSION}_msgcount_${fn}`;
      const diagCacheKey = `hyeval_v${CACHE_VERSION}_diag_${fn}`;
      const toolCacheKey = `hyeval_v${CACHE_VERSION}_toolcalls_${fn}`;

      // Try versioned cache first, fallback to legacy keys
      let cached = await this.getJudgeCache(cacheKey);
      let cachedMsg = await this.getJudgeCache(msgCacheKey);
      let cachedDiag = await this.getJudgeCache(diagCacheKey);
      let cachedTool = await this.getJudgeCache(toolCacheKey);
      if (!cached) cached = await this.getJudgeCache(`hyeval_judge_${fn}`);
      if (!cachedMsg) cachedMsg = await this.getJudgeCache(`hyeval_msgcount_${fn}`);
      if (!cachedDiag) cachedDiag = await this.getJudgeCache(`hyeval_diag2_${fn}`);

      if (gen !== this.loadGeneration) return;
      if (cached && cachedMsg && cachedDiag && cachedTool) {
        this.judgeEvalMap = cached;
        this.msgCountMap = cachedMsg;
        this.diagMap = cachedDiag;
        this.toolCallMap = cachedTool;
        return;
      }

      const entries = Object.entries(this.trajectoryIndex);
      if (entries.length === 0) return;

      this.evalLoading = true;
      this.evalLoadTotal = entries.length;
      this.evalLoadProgress = 0;
      const map = {};
      const msgMap = {};
      const diagMapLocal = {};
      const toolMap = {};

      const BATCH_SIZE = 5;
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        if (gen !== this.loadGeneration) { this.evalLoading = false; return; }
        const batch = entries.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async ([qid, fileHandle]) => {
          try {
            const file = await fileHandle.getFile();
            const text = await readTextWithDecompression(file);
            const result = trajectoryParse.process(text, {});
            if (result.rows.length > 0) {
              const traj = result.rows[0];
              const agentConv = traj.conversations ? traj.conversations[0] : traj.conversation;
              if (traj.conversations) {
                const evalObj = this.extractJudgeEval(traj.conversations);
                if (evalObj) map[qid] = evalObj;
              }
              const rawCalls = traj.rawCallsList ? traj.rawCallsList[0] : (traj.rawCalls || []);
              if (rawCalls.length > 0) {
                const total = rawCalls.length;
                const effective = rawCalls.filter(c => {
                  const reason = c.native_finish_reason || c.finish_reason;
                  return !reason || reason === 'stop' || reason === 'tool_calls';
                }).length;
                msgMap[qid] = { effective, total };
              } else if (Array.isArray(agentConv)) {
                const total = agentConv.filter(m => m.role === 'assistant').length;
                msgMap[qid] = { effective: total, total };
              }
              if (traj.rawSpans) {
                const toolSpans = traj.rawSpans.filter(s => s.type === 'START' && s.attributes && s.attributes.type === 'tool');
                toolMap[qid] = toolSpans.length;
              }
              if (traj.diagnostics) diagMapLocal[qid] = traj.diagnostics;
            }
          } catch (e) { /* skip failed */ }
        }));
        if (gen !== this.loadGeneration) { this.evalLoading = false; return; }
        this.evalLoadProgress = Math.min(i + BATCH_SIZE, entries.length);
        this.judgeEvalMap = { ...map };
        this.msgCountMap = { ...msgMap };
        this.diagMap = { ...diagMapLocal };
        this.toolCallMap = { ...toolMap };
      }

      this.evalLoading = false;
      await this.setJudgeCache(cacheKey, map);
      await this.setJudgeCache(msgCacheKey, msgMap);
      await this.setJudgeCache(diagCacheKey, diagMapLocal);
      await this.setJudgeCache(toolCacheKey, toolMap);
    },

    async getJudgeCache(key) {
      try {
        const db = await this.openDB();
        const tx = db.transaction('handles', 'readonly');
        const val = await new Promise((resolve, reject) => {
          const req = tx.objectStore('handles').get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = reject;
        });
        db.close();
        return val || null;
      } catch (e) { return null; }
    },

    async setJudgeCache(key, data) {
      try {
        const db = await this.openDB();
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(data, key);
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = reject;
        });
        db.close();
      } catch (e) { /* ignore */ }
    },
  },
};
</script>

<style scoped>
.heval-view {
  padding: 16px 24px;
  overflow-x: hidden;
  transition: margin-left 0.25s ease;
}

.heval-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.heval-toolbar :deep(.el-button + .el-button) {
  margin-left: 0;
}

.file-name {
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.diag-tag {
  display: inline-block;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  margin: 1px 2px;
  font-weight: 500;
}
.diag-abort, .diag-server_error { background: rgba(245, 108, 108, 0.12); color: #e45656; }
.diag-kvcache_no_enough, .diag-length, .diag-no_response { background: rgba(230, 162, 60, 0.12); color: #c48a20; }

.recent-dropdown-menu {
  max-height: 400px;
  overflow-y: auto;
}

.recent-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.recent-item-info {
  flex: 1;
  min-width: 0;
}

.recent-item-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-item-meta {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 2px;
}

.recent-delete {
  color: var(--el-text-color-placeholder);
  cursor: pointer;
  font-size: 14px;
  flex-shrink: 0;
}
.recent-delete:hover {
  color: var(--el-color-danger);
}

.stats {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.stats-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.pass-text { color: var(--el-color-success); }
.fail-text { color: var(--el-color-danger); }

.heval-pagination {
  margin-top: 10px;
  justify-content: flex-end;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: var(--el-text-color-secondary);
}
.empty-state .hint { font-size: 12px; margin-top: 8px; }

.stats-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  font-size: 13px;
}

.stats-section {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.stats-label {
  font-weight: 600;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.stats-dist-tag {
  cursor: default;
}

.eval-progress {
  margin-bottom: 10px;
}

.eval-progress-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
  display: block;
}

.cell-truncate {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.text-muted { color: var(--el-text-color-placeholder); }

.detail-panel {
  margin-top: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 16px;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from { opacity: 0; max-height: 0; transform: translateY(-8px); }
  to { opacity: 1; max-height: 1000px; transform: translateY(0); }
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.detail-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto;
  gap: 12px;
}

.detail-cell {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
}

.detail-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
}

.detail-content.scrollable {
  max-height: 200px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.prediction {
  font-family: var(--el-font-family);
}

.ref-answer {
  background: var(--el-color-success-light-9);
  padding: 8px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.model-answer {
  padding: 8px;
  border-radius: 4px;
}
.model-answer.pass {
  background: var(--el-color-success-light-9);
}
.model-answer.fail {
  background: var(--el-color-danger-light-9);
}
.model-answer .answer-label {
  font-weight: 600;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.test-results { display: flex; flex-direction: column; gap: 6px; }
.test-item { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
.test-name { font-size: 12px; font-family: monospace; }
.test-message { width: 100%; font-size: 11px; color: var(--el-color-danger); margin-left: 52px; }

.traj-info { display: flex; align-items: center; gap: 12px; }

.judge-eval {
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  font-size: 12px;
}

.judge-eval-title {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.judge-eval-item {
  margin-bottom: 3px;
}

.judge-eval-key {
  color: var(--el-text-color-secondary);
  margin-right: 6px;
}

.judge-eval-val.judge-fail { color: var(--el-color-danger); font-weight: 600; }
.judge-eval-val.judge-pass { color: var(--el-color-success); font-weight: 600; }

:deep(.selected-row) {
  background-color: var(--el-color-primary-light-9) !important;
}

.raw-json-content {
  max-height: 70vh;
  overflow: auto;
}

.raw-text-pre {
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
  user-select: text;
}

.traj-paths {
  display: flex;
  gap: 10px;
}

.path-link {
  color: var(--el-color-primary);
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline;
}
.path-link:hover {
  color: var(--el-color-primary-dark-2);
}
</style>
