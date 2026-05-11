<!-- Copyright (c) 2026 dynamicheart. Licensed under the MIT License. -->

<template>
  <div class="heval-view">
    <div class="heval-toolbar">
      <el-button type="primary" @click="openDirectory">Select Directory</el-button>
      <el-dropdown v-if="recentDirs.length" trigger="click" @command="onRecentCommand">
        <el-button>Recent <el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="d in recentDirs" :key="d.name" :command="d.name">
              {{ d.name }} <span class="recent-meta">{{ d.records }} records</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-upload
        :auto-upload="false"
        :on-change="handleFileChange"
        :show-file-list="false"
        accept=".jsonl,.jsonl.gz,.gz"
      >
        <el-button>Or single .jsonl.gz</el-button>
      </el-upload>
      <span v-if="fileName" class="file-name">{{ fileName }}</span>
      <el-divider v-if="rows.length" direction="vertical" />
      <span v-if="rows.length" class="stats-text">
        {{ rows.length }} records
        <template v-if="sortedRows.length !== rows.length"> · {{ sortedRows.length }} shown</template>
        · <span class="pass-text">{{ passCount }} pass ({{ ((passCount / rows.length) * 100).toFixed(1) }}%)</span>
        · <span class="fail-text">{{ failCount }} fail ({{ ((failCount / rows.length) * 100).toFixed(1) }}%)</span>
        <template v-if="trajectoryCount"> · {{ trajectoryCount }} trajectories</template>
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
      <p>Select a hyeval export directory to start analysis</p>
      <p class="hint">Directory should contain a .jsonl.gz and a trajectory/ folder</p>
    </div>

    <template v-else>
      <div v-if="hasAgentData" class="stats-panel">
        <div class="stats-section">
          <span class="stats-label">Exit Status:</span>
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
          <span class="stats-label">Iterations:</span>
          <el-tag v-if="iterationStats.limit" size="small" type="danger">limit: {{ iterationStats.limit }}</el-tag>
          <el-tag v-if="iterationStats.avg" size="small" type="info">avg: {{ iterationStats.avg }}</el-tag>
          <el-tag v-if="iterationStats.max" size="small" type="info">max: {{ iterationStats.max }}</el-tag>
          <el-tag v-if="iterationStats.min" size="small" type="info">min: {{ iterationStats.min }}</el-tag>
        </div>
      </div>
      <div v-if="evalLoading" class="eval-progress">
        <span class="eval-progress-text">Loading judge evaluations: {{ evalLoadProgress }}/{{ evalLoadTotal }}</span>
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
        <el-table-column prop="question_id" label="ID" width="120">
          <template #header>
            <TableHeaderSearch label="ID" v-model="filters.questionId" placeholder="Search" />
          </template>
        </el-table-column>
        <el-table-column label="Question" show-overflow-tooltip>
          <template #header>
            <TableHeaderSearch label="Question" v-model="filters.questionText" placeholder="Search" />
          </template>
          <template #default="{ row }">
            <span>{{ truncate(row.question, 80) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="hasRefAnswer" label="Ref Answer" width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.ref_answer">{{ truncate(row.ref_answer, 40) }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column v-if="hasRefAnswer" label="Answer" width="180" show-overflow-tooltip>
          <template #header>
            <TableHeaderSearch label="Answer" v-model="filters.answerText" placeholder="Search" />
          </template>
          <template #default="{ row }">
            <span v-if="getJudgeAnswer(row)">{{ truncate(getJudgeAnswer(row), 50) }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="score" label="Score" width="90" column-key="score" :filters="scoreFilters" :filter-multiple="true">
          <template #default="{ row }">
            <el-tag :type="row.score >= 1 ? 'info' : 'danger'" size="small">
              {{ row.score }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="Status"
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
          label="Exit"
          width="110"
          column-key="exit_status"
          :filters="exitStatusFilters"
          :filter-multiple="true"
        />
        <el-table-column v-if="trajectoryCount" label="Traj" width="50">
          <template #default="{ row }">
            <el-icon v-if="hasTrajectory(row)" color="var(--el-color-success)"><Check /></el-icon>
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
            <el-button size="small" @click.stop="showRawJson = true">Raw JSON</el-button>
            <el-button size="small" @click.stop="selectedRow = null">Close</el-button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-cell">
            <div class="detail-label">Question</div>
            <div class="detail-content scrollable">{{ selectedRow.question }}</div>
          </div>
          <div class="detail-cell">
            <div class="detail-label">Model Output</div>
            <div class="detail-content scrollable prediction">{{ selectedRow.final_answer || selectedRow.prediction || selectedRow.answer || '-' }}</div>
          </div>
          <div class="detail-cell">
            <div class="detail-label">
              <template v-if="selectedRow.ref_answer">Reference Answer</template>
              <template v-else-if="selectedRow.test_results">Test Results</template>
              <template v-else>Info</template>
            </div>
            <div class="detail-content scrollable">
              <template v-if="selectedRow.ref_answer">
                <div class="ref-answer">{{ selectedRow.ref_answer }}</div>
                <div v-if="getJudgeAnswer(selectedRow)" class="model-answer" :class="selectedRow.score >= 1 ? 'pass' : 'fail'">
                  <span class="answer-label">Model Answer:</span> {{ getJudgeAnswer(selectedRow) }}
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
                <span class="text-muted">No reference answer or test results</span>
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
                  <el-button size="small">Load .jsonl.zst</el-button>
                </el-upload>
              </template>
            </div>
            <div class="detail-content scrollable">
              <div v-if="loadingTrajectory" class="text-muted">Loading trajectory...</div>
              <div v-else-if="trajectoryMessages.length || trajectoryConversations.length" class="traj-info">
                <span v-if="trajectoryConversations.length">{{ trajectoryConversations.length }} conversations</span>
                <span v-else>{{ trajectoryMessages.length }} messages</span>
                <el-button size="small" type="primary" plain @click="showTrajectory = true">
                  View Conversation
                </el-button>
              </div>
              <div v-else-if="hasTrajectory(selectedRow)">
                <el-button size="small" type="primary" plain @click="loadTrajectoryForRow(selectedRow)">
                  Load Trajectory
                </el-button>
              </div>
              <span v-else class="text-muted">No trajectory available</span>
              <div v-if="judgeEval" class="judge-eval">
                <div class="judge-eval-title">Judge Evaluation</div>
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
      :show-filter="true"
    />

    <el-dialog
      v-model="showRawJson"
      title="Raw JSON"
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
import { Check, ArrowDown } from '@element-plus/icons-vue';

export default {
  components: { ConversationDialog, JsonViewer, TableHeaderSearch, Check, ArrowDown },

  data() {
    return {
      fileName: '',
      rows: [],
      selectedRow: null,
      filters: { agent: '', questionId: '', questionText: '', answerText: '' },
      trajectoryMessages: [],
      trajectoryConversations: [],
      showTrajectory: false,
      loadingTrajectory: false,
      trajectoryIndex: {},
      dirHandle: null,
      trajDirHandle: null,
      showRawJson: false,
      rawRows: [],
      judgeEval: null,
      judgeEvalMap: {},
      evalLoadProgress: 0,
      evalLoadTotal: 0,
      evalLoading: false,
      sortState: { prop: null, order: null },
      columnFilters: {},
      currentPage: 1,
      pageSize: 50,
      recentDirs: JSON.parse(localStorage.getItem('hyeval_recent_dirs') || '[]'),
    };
  },

  computed: {
    passCount() { return this.rows.filter(r => r.score >= 1).length; },
    failCount() { return this.rows.filter(r => r.score < 1).length; },
    hasAgentData() { return this.rows.some(r => r.agent_name); },
    hasRefAnswer() { return this.rows.some(r => r.ref_answer); },
    hasAnswer() { return this.rows.some(r => r.answer); },
    hasPrediction() { return this.rows.some(r => r.prediction); },
    trajectoryCount() { return Object.keys(this.trajectoryIndex).length; },
    selectedRowRaw() {
      if (!this.selectedRow) return null;
      const raw = this.rawRows.find(r => r.questionId === this.selectedRow.question_id);
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
      for (const [key, val] of Object.entries(filters)) {
        this.columnFilters = { ...this.columnFilters, [key]: val };
      }
      this.currentPage = 1;
    },
    onRecentCommand(name) {
      const item = this.recentDirs.find(d => d.name === name);
      if (item) this.loadRecentDir(item);
    },
    async tryRestoreDirectory() {
      if (this.recentDirs.length === 0) return;
      const last = this.recentDirs[0];
      const handle = await this.loadDirHandle(last.name);
      if (!handle) return;
      try {
        const permission = await handle.queryPermission({ mode: 'read' });
        if (permission === 'granted') {
          this.dirHandle = handle;
          this.fileName = handle.name;
          await this.loadDirectory(handle);
        } else if (permission === 'prompt') {
          const granted = await handle.requestPermission({ mode: 'read' });
          if (granted === 'granted') {
            this.dirHandle = handle;
            this.fileName = handle.name;
            await this.loadDirectory(handle);
          }
        }
      } catch (e) { /* permission denied or handle invalid */ }
    },

    updateRecentDirs(name, recordCount) {
      const MAX = 10;
      const list = this.recentDirs.filter(d => d.name !== name);
      list.unshift({ name, time: Date.now(), records: recordCount || 0 });
      if (list.length > MAX) list.length = MAX;
      this.recentDirs = list;
      localStorage.setItem('hyeval_recent_dirs', JSON.stringify(list));
    },

    async removeRecentDir(name) {
      this.recentDirs = this.recentDirs.filter(d => d.name !== name);
      localStorage.setItem('hyeval_recent_dirs', JSON.stringify(this.recentDirs));
      try {
        const db = await this.openDB();
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').delete(`dir_${name}`);
        await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
        db.close();
      } catch (e) { /* ignore */ }
    },

    async loadRecentDir(item) {
      const handle = await this.loadDirHandle(item.name);
      if (!handle) {
        this.$message.warning('Directory handle expired, please re-select');
        this.removeRecentDir(item.name);
        return;
      }
      try {
        const permission = await handle.requestPermission({ mode: 'read' });
        if (permission !== 'granted') return;
        this.dirHandle = handle;
        this.fileName = handle.name;
        await this.loadDirectory(handle);
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

    async openDirectory() {
      if (!window.showDirectoryPicker) {
        alert('Directory picker not supported. Use Chrome/Edge.');
        return;
      }
      try {
        const dirHandle = await window.showDirectoryPicker();
        this.dirHandle = dirHandle;
        this.fileName = dirHandle.name;
        await this.storeDirHandle(dirHandle);
        await this.loadDirectory(dirHandle);
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
      }
    },

    async loadDirectory(dirHandle) {
      let mainFile = null;
      this.trajDirHandle = null;
      this.trajectoryIndex = new Map();

      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.jsonl.gz')) {
          mainFile = entry;
        }
        if (entry.kind === 'directory' && entry.name === 'trajectory') {
          this.trajDirHandle = entry;
        }
      }

      if (!mainFile) {
        this.$message.warning('未找到 .jsonl.gz 文件。请选择包含 hyeval 导出数据的目录（应含 .jsonl.gz 文件和 trajectory/ 子目录）');
        return;
      }

      const file = await mainFile.getFile();
      const text = await readTextWithDecompression(file);
      const result = hyevalParse.process(text, {}, {});

      if (result.rows.length === 0) {
        this.$message.warning('文件解析为空，可能不是 hyeval 导出格式');
        return;
      }

      this.rows = result.rows;
      this.rawRows = this.parseRawRows(text);
      this.selectedRow = null;
      this.trajectoryMessages = [];
      this.updateRecentDirs(dirHandle.name, result.rows.length);

      if (this.trajDirHandle) {
        await this.indexTrajectories();
      } else {
        this.$message.info(`已加载 ${result.rows.length} 条记录。未找到 trajectory/ 目录，Trajectory 功能不可用`);
      }
    },

    async indexTrajectories() {
      const index = {};
      for await (const entry of this.trajDirHandle.values()) {
        if (entry.kind !== 'file') continue;
        const match = entry.name.match(/_(\d+)_[0-9a-f-]+\.jsonl\.zst$/);
        if (match) {
          index[match[1]] = entry;
        }
      }
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
      const cacheKey = `hyeval_judge_${this.fileName}`;
      const cached = await this.getJudgeCache(cacheKey);
      if (cached) {
        this.judgeEvalMap = cached;
        return;
      }

      const entries = Object.entries(this.trajectoryIndex);
      if (entries.length === 0) return;

      this.evalLoading = true;
      this.evalLoadTotal = entries.length;
      this.evalLoadProgress = 0;
      const map = {};

      const BATCH_SIZE = 5;
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async ([qid, fileHandle]) => {
          try {
            const file = await fileHandle.getFile();
            const text = await readTextWithDecompression(file);
            const result = trajectoryParse.process(text, {});
            if (result.rows.length > 0 && result.rows[0].conversations) {
              const evalObj = this.extractJudgeEval(result.rows[0].conversations);
              if (evalObj) map[qid] = evalObj;
            }
          } catch (e) { /* skip failed */ }
        }));
        this.evalLoadProgress = Math.min(i + BATCH_SIZE, entries.length);
        this.judgeEvalMap = { ...map };
      }

      this.evalLoading = false;
      await this.setJudgeCache(cacheKey, map);
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
}

.heval-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.file-name {
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.recent-meta {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  margin-left: 8px;
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
</style>
