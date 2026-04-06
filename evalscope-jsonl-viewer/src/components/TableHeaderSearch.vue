<!--
  Copyright (c) 2026 dynamicheart
  Licensed under the MIT License.
-->

<template>
  <div class="th-search">
    <span class="label">{{ label }}</span>
    <el-input
      v-model="localValue"
      size="small"
      clearable
      :placeholder="placeholder"
      @input="emitChange"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Search' },
});

const emit = defineEmits(['update:modelValue', 'change']);

const localValue = ref(props.modelValue);

watch(
  () => props.modelValue,
  (v) => (localValue.value = v)
);

function emitChange(val) {
  emit('update:modelValue', val);
  emit('change', val);
}
</script>

<style scoped>
.th-search {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-weight: 500;
}
</style>
