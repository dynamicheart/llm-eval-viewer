/*
 * Copyright (c) 2026 dynamicheart
 * Licensed under the MIT License.
 */

import { ref, computed, watch } from 'vue';

export function useTableModel(options = {}) {
  const { pageSize: defaultPageSize = 10 } = options;

  const tableData = ref([]);
  const activeFilters = ref({});
  const currentPage = ref(1);
  const pageSize = ref(defaultPageSize);

  watch(pageSize, () => {
    currentPage.value = 1;
  });

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
    console.log('[filters]', filters);

    activeFilters.value = {};

    Object.entries(filters).forEach(([key, values]) => {
      if (values && values.length > 0) {
        activeFilters.value[key] = values;
      }
    });

    currentPage.value = 1;
  }

  const filteredData = computed(() => {
    return tableData.value.filter((row) =>
      Object.entries(activeFilters.value).every(
        ([key, values]) =>
          !values || values.length === 0 || values.includes(row[key])
      )
    );
  });

  const sortProp = ref('');
  const sortOrder = ref(''); // 'ascending' | 'descending' | ''

  function onTableSortChange({ prop, order }) {
    sortProp.value = prop || '';
    sortOrder.value = order || '';
    currentPage.value = 1;
  }

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

  const totalItems = computed(() => tableData.value.length);
  const totalVisibleItems = computed(() => filteredData.value.length);

  function reset() {
    activeFilters.value = {};
    sortProp.value = '';
    sortOrder.value = '';
    currentPage.value = 1;
  }

  return {
    tableData,
    currentPage,
    pageSize,
    filteredData,
    paginatedData,
    totalItems,
    totalVisibleItems,
    createColumnFilter,
    onTableFilterChange,
    onTableSortChange,
    reset,
  };
}
