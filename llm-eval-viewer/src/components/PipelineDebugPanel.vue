<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <!-- Full-screen dialog mode (used from CustomViewerView) -->
  <el-dialog
    v-if="!embedded"
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    width="85%"
    top="3vh"
    destroy-on-close
    class="pipeline-debug-dialog"
  >
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span>{{ $t('custom.pipelineDebugTitle') }}</span>
        <el-button size="small" @click="doCopyMarkdown">
          {{ $t('common.copy') }} Markdown
        </el-button>
      </div>
    </template>
    <PipelineDebugContent :data="data" @copy-markdown="doCopyMarkdown" />
  </el-dialog>
  <!-- Embedded mode (used inside FieldConfigPanel debug dialog tab) -->
  <PipelineDebugContent v-else :data="data" @copy-markdown="doCopyMarkdown" />
</template>

<script>
import { useI18n } from 'vue-i18n';
import PipelineDebugContent from './PipelineDebugContent.vue';

export default {
  components: { PipelineDebugContent },

  props: {
    visible: Boolean,
    data: Object,
    embedded: { type: Boolean, default: false },
  },

  emits: ['update:visible'],

  setup(props, { emit }) {
    const { t } = useI18n();

    function doCopyMarkdown() {
      const d = props.data;
      if (!d) return;
      let md = `# Pipeline Debug\n\n`;
      md += `## Overview\n- Cache: ${d.cache?.status}\n- File ID: ${d.cache?.fileId}\n- Format: ${d.worker?.detectedFormat}\n- Rows: ${d.worker?.rowCount}\n\n`;
      const wt = d.worker?.timings || {};
      md += `## Worker Timings\n| Stage | Time (ms) |\n|-------|----------|\n`;
      md += `| formatDetect | ${(wt.formatDetect || 0).toFixed(1)} |\n| expand | ${(wt.expand || 0).toFixed(1)} |\n| collectKeys | ${(wt.collectKeys || 0).toFixed(1)} |\n| detectTypes | ${(wt.detectTypes || 0).toFixed(1)} |\n| buildFields | ${(wt.buildFields || 0).toFixed(1)} |\n| total | ${(wt.total || 0).toFixed(1)} |\n\n`;
      md += `## Field Scoring\n| Field | Score | Type | Empty% | Unique | Visible | Reason | DuplicateOf |\n|-------|-------|------|--------|--------|---------|--------|-----------|\n`;
      for (const f of d.scoring?.debugMeta || []) {
        const pctVal = f.emptyRate != null ? Math.round(f.emptyRate * 100) + '%' : '-';
        md += `| ${f.key} | ${f.score} | ${f.detectedType} | ${pctVal} | ${f.uniqueCount} | ${f.visible ? 'Y' : 'N'} | ${f.visibilityReason} | ${f.duplicateOf || '-'} |\n`;
      }
      md += '\n';
      if (d.plugins?.pluginDebug?.length) {
        md += `## Plugins\n`;
        for (const p of d.plugins.pluginDebug) {
          md += `### ${p.id}\n- Summary: ${p.summary}\n- Fields: ${p.fieldsBefore} → ${p.fieldsAfter}\n`;
          if (p.addedKeys.length) md += `- Added: ${p.addedKeys.join(', ')}\n`;
          if (p.removedKeys.length) md += `- Removed: ${p.removedKeys.join(', ')}\n\n`;
        }
      }
      navigator.clipboard.writeText(md).catch(() => {});
    }

    return { doCopyMarkdown };
  },
};
</script>

<style scoped>
.pipeline-debug-dialog :deep(.el-dialog__body) {
  max-height: calc(100vh - 15vh);
  overflow-y: auto;
}
</style>
