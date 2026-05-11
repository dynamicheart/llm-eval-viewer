<!-- Copyright (c) 2026 dynamicheart. Licensed under the MIT License. -->

<template>
  <div class="heval-view">
    <div class="heval-toolbar">
      <el-button type="primary" @click="openDirectory">Select Directory</el-button>
      <el-upload
        :auto-upload="false"
        :on-change="handleFileChange"
        :show-file-list="false"
        accept=".jsonl,.jsonl.gz,.gz"
      >
        <el-button>Or single .jsonl.gz</el-button>
      </el-upload>
      <span v-if="fileName" class="file-name">{{ fileName }}</span>
      <div v-if="rows.length" class="stats">
        <el-tag type="info">Total: {{ rows.length }}</el-tag>
        <el-tag type="success">Pass: {{ passCount }}</el-tag>
        <el-tag type="danger">Fail: {{ failCount }}</el-tag>
        <el-tag v-if="trajectoryCount" type="warning">
          Trajectories: {{ trajectoryCount }}
        </el-tag>
      </div>
      <div class="toolbar-right">
        <el-input
          v-model="filters.questionId"
          clearable
          placeholder="Search ID"
          size="small"
          style="width: 130px"
        />
        <el-select
          v-if="filterOptions.agents.length > 1"
          v-model="filters.agent"
          clearable
          placeholder="Agent"
          size="small"
          style="width: 140px"
        >
          <el-option v-for="a in filterOptions.agents" :key="a" :label="a" :value="a" />
        </el-select>
        <el-select
          v-if="filterOptions.exitStatuses.length > 1"
          v-model="filters.exitStatus"
          clearable
          placeholder="Status"
          size="small"
          style="width: 140px"
        >
          <el-option v-for="s in filterOptions.exitStatuses" :key="s" :label="s" :value="s" />
        </el-select>
        <el-select
          v-model="filters.scoreFilter"
          size="small"
          style="width: 120px"
        >
          <el-option label="All" value="all" />
          <el-option label="Wrong" value="wrong" />
          <el-option label="Correct" value="correct" />
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
            :type="status === 'max_iterations' ? 'danger' : status === 'finished' ? '' : 'warning'"
            size="small"
            class="stats-dist-tag"
          >
            {{ status }}: {{ count }} ({{ ((count / rows.length) * 100).toFixed(1) }}%)
          </el-tag>
        </div>
        <div v-if="iterationStats" class="stats-section">
          <span class="stats-label">Iterations:</span>
          <el-tag size="small" type="info">avg: {{ iterationStats.avg }}</el-tag>
          <el-tag size="small" type="info">max: {{ iterationStats.max }}</el-tag>
          <el-tag size="small" type="info">min: {{ iterationStats.min }}</el-tag>
        </div>
      </div>
      <el-table
        :data="filteredRows"
        stripe
        highlight-current-row
        @row-click="selectRow"
        :row-class-name="rowClassName"
        max-height="45vh"
        style="width: 100%"
        :table-layout="'fixed'"
      >
        <el-table-column prop="question_id" label="ID" width="100" />
        <el-table-column label="Question" show-overflow-tooltip>
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
        <el-table-column v-if="hasAnswer" label="Answer" width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.answer">{{ truncate(row.answer, 40) }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="score" label="Score" width="90" sortable>
          <template #default="{ row }">
            <el-tag :type="row.score >= 1 ? '' : 'danger'" size="small">
              {{ row.score }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.score < 1" type="danger" size="small">FAIL</el-tag>
            <span v-else class="text-muted">PASS</span>
          </template>
        </el-table-column>
        <el-table-column v-if="hasAgentData" prop="exit_status" label="Exit" width="90" />
        <el-table-column v-if="trajectoryCount" label="Traj" width="50">
          <template #default="{ row }">
            <el-icon v-if="hasTrajectory(row)" color="var(--el-color-success)"><Check /></el-icon>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="selectedRow" class="detail-panel">
        <div class="detail-header">
          <span class="detail-title">
            #{{ selectedRow.question_id }}
            <el-tag :type="selectedRow.score >= 1 ? 'success' : 'danger'" size="small">
              Score: {{ selectedRow.score }}
            </el-tag>
          </span>
          <el-button size="small" @click.stop="selectedRow = null">Close</el-button>
        </div>

        <div class="detail-grid">
          <div class="detail-cell">
            <div class="detail-label">Question</div>
            <div class="detail-content scrollable">{{ selectedRow.question }}</div>
          </div>
          <div class="detail-cell">
            <div class="detail-label">Model Output (prediction)</div>
            <div class="detail-content scrollable prediction">{{ selectedRow.prediction || selectedRow.answer || '-' }}</div>
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
  </div>
</template>

<script>
import { readTextWithDecompression, isCompressedFile, decompressBuffer } from '@/utils/decompressFile';
import hyevalParse from '@/plugins/hyevalParse';
import trajectoryParse from '@/plugins/trajectoryParse';
import ConversationDialog from '@/components/ConversationDialog.vue';
import { Check } from '@element-plus/icons-vue';

export default {
  components: { ConversationDialog, Check },

  data() {
    return {
      fileName: '',
      rows: [],
      selectedRow: null,
      filters: { agent: '', scoreFilter: 'all', exitStatus: '', questionId: '' },
      trajectoryMessages: [],
      trajectoryConversations: [],
      showTrajectory: false,
      loadingTrajectory: false,
      trajectoryIndex: {},
      dirHandle: null,
      trajDirHandle: null,
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
      if (vals.length === 0) return null;
      const sum = vals.reduce((a, b) => a + b, 0);
      return {
        avg: (sum / vals.length).toFixed(1),
        max: Math.max(...vals),
        min: Math.min(...vals),
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
        if (this.filters.agent && r.agent_name !== this.filters.agent) return false;
        if (this.filters.exitStatus && r.exit_status !== this.filters.exitStatus) return false;
        if (this.filters.scoreFilter === 'wrong' && r.score >= 1) return false;
        if (this.filters.scoreFilter === 'correct' && r.score < 1) return false;
        return true;
      });
    },
  },

  async mounted() {
    await this.tryRestoreDirectory();
  },

  methods: {
    async tryRestoreDirectory() {
      const handle = await this.getStoredDirHandle();
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
      } catch { /* permission denied or handle invalid */ }
    },

    async storeDirHandle(handle) {
      const db = await this.openDB();
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'hyeval_dir');
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
      localStorage.setItem('hyeval_dir_handle', '1');
    },

    async getStoredDirHandle() {
      try {
        const db = await this.openDB();
        const tx = db.transaction('handles', 'readonly');
        const handle = await new Promise((resolve, reject) => {
          const req = tx.objectStore('handles').get('hyeval_dir');
          req.onsuccess = () => resolve(req.result);
          req.onerror = reject;
        });
        db.close();
        return handle || null;
      } catch { return null; }
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
      this.selectedRow = null;
      this.trajectoryMessages = [];

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
    },

    hasTrajectory(row) {
      if (!row) return false;
      return !!this.trajectoryIndex[String(row.question_id)];
    },

    async loadTrajectoryForRow(row) {
      const fileHandle = this.trajectoryIndex[String(row.question_id)];
      if (!fileHandle) return;

      this.loadingTrajectory = true;
      try {
        const file = await fileHandle.getFile();
        const text = await readTextWithDecompression(file);
        const result = trajectoryParse.process(text, {});
        if (result.rows.length > 0) {
          const traj = result.rows[0];
          if (traj.conversations) {
            this.trajectoryConversations = traj.conversations;
            this.trajectoryMessages = [];
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
    },

    selectRow(row) {
      this.selectedRow = row;
      this.trajectoryMessages = [];
      this.trajectoryConversations = [];
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
  },
};
</script>

<style scoped>
.heval-view {
  padding: 16px 24px;
  max-width: 1600px;
  margin: 0 auto;
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
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.stats {
  display: flex;
  gap: 6px;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
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

.test-results { display: flex; flex-direction: column; gap: 6px; }
.test-item { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
.test-name { font-size: 12px; font-family: monospace; }
.test-message { width: 100%; font-size: 11px; color: var(--el-color-danger); margin-left: 52px; }

.traj-info { display: flex; align-items: center; gap: 12px; }

:deep(.selected-row) {
  background-color: var(--el-color-primary-light-9) !important;
}
</style>
