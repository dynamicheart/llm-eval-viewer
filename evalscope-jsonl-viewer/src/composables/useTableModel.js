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

  const paginatedData = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return filteredData.value.slice(start, start + pageSize.value);
  });

  const totalItems = computed(() => tableData.value.length);
  const totalVisibleItems = computed(() => filteredData.value.length);

  function reset() {
    activeFilters.value = {};
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
    reset,
  };
}
