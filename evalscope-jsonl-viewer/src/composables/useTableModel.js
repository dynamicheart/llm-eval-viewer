/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { ref, computed, watch } from 'vue';

export function useTableModel(options = {}) {
  const { pageSize: defaultPageSize = 10 } = options;

  // ===== 基础状态 =====
  const tableData = ref([]);

  const activeFilters = ref({}); // el-table filter
  const keywordFilters = ref({}); // header search

  const sortProp = ref('');
  const sortOrder = ref(''); // 'ascending' | 'descending' | ''

  const currentPage = ref(1);
  const pageSize = ref(defaultPageSize);

  watch(pageSize, () => {
    currentPage.value = 1;
  });

  // ===== filter =====
  function createColumnFilter(key, formatter) {
    const filters = computed(() =>
      [...new Set(tableData.value.map((d) => d[key]))]
        .filter((v) => v != null)
        .map((v) => ({
          text: formatter ? formatter(v) : String(v),
          value: v,
        }))
    );

    return { filters };
  }

  function onTableFilterChange(filters) {
    const updated = { ...activeFilters.value };
    Object.entries(filters).forEach(([key, values]) => {
      if (values && values.length > 0) {
        updated[key] = values;
      } else {
        delete updated[key];
      }
    });
    activeFilters.value = updated;
    currentPage.value = 1;
  }

  function setKeywordFilter(key, keyword) {
    if (!keyword) {
      delete keywordFilters.value[key];
    } else {
      keywordFilters.value[key] = keyword;
    }
    currentPage.value = 1;
  }

  function setColumnFilter(key, values) {
    const updated = { ...activeFilters.value };
    if (!values || values.length === 0) {
      delete updated[key];
    } else {
      updated[key] = values;
    }
    activeFilters.value = updated;
    currentPage.value = 1;
  }

  // ===== sort =====
  function onTableSortChange({ prop, order }) {
    sortProp.value = prop || '';
    sortOrder.value = order || '';
    currentPage.value = 1;
  }

  // ===== 数据流水线 =====
  const filteredData = computed(() => {
    return tableData.value.filter((row) => {
      // enum filter
      const enumOk = Object.entries(activeFilters.value).every(
        ([key, values]) => values.includes(row[key])
      );
      if (!enumOk) return false;

      // keyword filter
      const keywordOk = Object.entries(keywordFilters.value).every(
        ([key, keyword]) =>
          String(row[key] ?? '')
            .toLowerCase()
            .includes(keyword.toLowerCase())
      );

      return keywordOk;
    });
  });

  const sortedData = computed(() => {
    if (!sortProp.value || !sortOrder.value) {
      return filteredData.value;
    }

    const data = [...filteredData.value];
    const factor = sortOrder.value === 'ascending' ? 1 : -1;

    data.sort((a, b) => {
      const va = a[sortProp.value];
      const vb = b[sortProp.value];

      if (va == null && vb == null) return 0;
      if (va == null) return -1 * factor;
      if (vb == null) return 1 * factor;

      if (va > vb) return factor;
      if (va < vb) return -factor;
      return 0;
    });

    return data;
  });

  const paginatedData = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return sortedData.value.slice(start, start + pageSize.value);
  });

  // ===== 统计 =====
  const totalItems = computed(() => tableData.value.length);
  const totalVisibleItems = computed(() => filteredData.value.length);

  // ===== reset =====
  function reset() {
    activeFilters.value = {};
    keywordFilters.value = {};
    sortProp.value = '';
    sortOrder.value = '';
    currentPage.value = 1;
  }

  // ===== state snapshot (用于目录浏览器的文件切换) =====
  function saveState() {
    return {
      activeFilters: JSON.parse(JSON.stringify(activeFilters.value)),
      keywordFilters: JSON.parse(JSON.stringify(keywordFilters.value)),
      sortProp: sortProp.value,
      sortOrder: sortOrder.value,
      currentPage: currentPage.value,
      pageSize: pageSize.value,
    };
  }

  function restoreState(snapshot) {
    if (!snapshot) {
      reset();
      return;
    }
    activeFilters.value = snapshot.activeFilters || {};
    keywordFilters.value = snapshot.keywordFilters || {};
    sortProp.value = snapshot.sortProp || '';
    sortOrder.value = snapshot.sortOrder || '';
    currentPage.value = snapshot.currentPage || 1;
    pageSize.value = snapshot.pageSize || defaultPageSize;
  }

  return {
    // data
    tableData,
    filteredData,
    paginatedData,

    // page
    currentPage,
    pageSize,

    // stats
    totalItems,
    totalVisibleItems,

    // filter / sort
    activeFilters,
    createColumnFilter,
    onTableFilterChange,
    setKeywordFilter,
    setColumnFilter,
    onTableSortChange,

    // control
    reset,
    saveState,
    restoreState,
  };
}
