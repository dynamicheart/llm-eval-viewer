<!--
  Copyright (c) 2025 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <el-dialog
    :model-value="dialogVisible"
    @update:model-value="$emit('update:dialogVisible', $event)"
    width="70%"
  >
    <template #header>
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
        "
      >
        <span>{{ title }}</span>
        <el-button size="small" type="primary" plain @click="copyDialogContent"
          >复制</el-button
        >
      </div>
    </template>

    <el-tabs v-if="!hasTabs" type="card">
      <div
        v-html="content"
        class="markdown-body"
        style="max-height: 60vh; overflow: auto"
      />
    </el-tabs>
    <el-tabs v-else v-model="dialogTab" type="card">
      <el-tab-pane
        v-for="tab in tabs"
        :key="tab.name"
        :label="tab.label"
        :name="tab.name"
      >
        <!-- 第一层：Text（有 views） -->
        <template v-if="tab.views">
          <el-radio-group v-model="contentView" size="small">
            <el-radio-button
              v-for="v in tab.views"
              :key="v.name"
              :label="v.name"
            >
              {{ v.label }}
            </el-radio-button>
          </el-radio-group>

          <div
            v-if="currentView && currentView.content"
            v-html="currentView.content"
            class="markdown-body"
            style="max-height: 60vh; overflow: auto"
          />
        </template>

        <!-- Reasoning -->
        <template v-else>
          <div
            v-html="tab.content"
            class="markdown-body"
            style="max-height: 60vh; overflow: auto; opacity: 0.85"
          />
        </template>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script>
import { ref, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';

export default {
  props: {
    dialogVisible: Boolean,
    title: {
      type: String,
      default: '详情',
    },
    hasTabs: {
      type: Boolean,
      default: false,
    },
    content: {
      type: String,
      default: '',
    },
    rawText: {
      type: String,
      default: '',
    },
    tabs: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['update:dialogVisible'],
  setup(props, { emit }) {
    const dialogTab = ref('');
    const contentView = ref('');
    const syncContentView = () => {
      const tab = props.tabs.find((t) => t.name === dialogTab.value);
      if (tab?.views?.length) {
        contentView.value ||= tab.views[0].name;
      } else {
        contentView.value = '';
      }
    };

    const currentView = computed(() => {
      const tab = props.tabs.find((t) => t.name === dialogTab.value);
      if (!tab?.views?.length) return null;

      return (
        tab.views.find((v) => v.name === contentView.value) || tab.views[0]
      );
    });

    watch(
      () => props.tabs,
      (tabs) => {
        dialogTab.value = tabs?.[0]?.name || '';
        syncContentView();
      },
      { immediate: true }
    );

    watch(
      () => dialogTab.value,
      () => {
        syncContentView();
      }
    );

    const getCurrentRawText = () => {
      if (!props.hasTabs) {
        return props.rawText || '';
      }

      const tab = props.tabs.find((t) => t.name === dialogTab.value);
      if (!tab) return '';

      if (tab.views?.length) {
        const view = tab.views.find((v) => v.name === contentView.value);
        return view?.rawText || '';
      }

      return tab.rawText || '';
    };

    const copyDialogContent = async () => {
      try {
        const textToCopy = getCurrentRawText();

        if (!textToCopy) {
          ElMessage.warning('没有内容可复制');
          return;
        }

        await navigator.clipboard.writeText(textToCopy);
        ElMessage.success('已复制到剪贴板');
      } catch (e) {
        ElMessage.error('复制失败');
        console.error('复制失败', e);
      }
    };

    return {
      dialogTab,
      contentView,
      currentView,
      copyDialogContent,
    };
  },
};
</script>
