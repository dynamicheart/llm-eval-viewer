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
        <div
          v-html="tab.content"
          class="markdown-body"
          style="max-height: 60vh; overflow: auto"
        />
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script>
import { ref, watch } from 'vue';
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
    const dialogTab = ref(props.tabs.length > 0 ? props.tabs[0].name : '');

    watch(
      () => props.tabs,
      (newTabs) => {
        dialogTab.value = newTabs.length > 0 ? newTabs[0].name : '';
      },
      { immediate: true }
    );

    const copyDialogContent = async () => {
      try {
        let textToCopy = '';

        if (props.hasTabs) {
          const currentTab = props.tabs.find(
            (tab) => tab.name === dialogTab.value
          );
          // 假设 tabs 里面每个对象有 rawText 字段
          textToCopy = currentTab ? currentTab.rawText || '' : '';
        } else {
          textToCopy = props.rawText || '';
        }

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
      copyDialogContent,
    };
  },
};
</script>
