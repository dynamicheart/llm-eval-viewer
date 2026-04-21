/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

export default {
  // === Common ===
  common: {
    view: 'View',
    generate: 'Generate',
    copy: 'Copy',
    copied: 'Copied',
    copiedToClipboard: 'Copied to clipboard',
    copyFailed: 'Copy failed',
    nothingToCopy: 'Nothing to copy',
    reset: 'Reset',
    resetSuccess: 'Reset to defaults',
    detail: 'Detail',
    unknown: 'Unknown',
    cancel: 'Cancel',
    continueLoad: 'Continue Loading',
    loading: 'Parsing data...',
  },

  // === App ===
  app: {
    exampleFiles: 'Example Files',
    pageTitle: 'LLM Eval Viewer - Lightweight LLM Evaluation Result Viewer',
    title: {
      meval: 'MEval - Sample Viewer',
      reviews: 'Evalscope Review JSONL Viewer',
      predictions: 'Evalscope Predictions JSONL Viewer',
      custom: 'Custom Viewer - JSON/CSV/TSV Viewer',
      default: 'Evalscope JSONL Viewer',
    },
    theme: {
      light: 'Light',
      dark: 'Dark',
      auto: 'Auto',
    },
  },

  // === File Toolbar ===
  fileToolbar: {
    selectJsonlFile: 'Select JSONL File',
    selectFile: 'Select File',
    selectCsvFile: 'Select CSV File',
    selectDirectory: 'Select Directory',
    dirBrowseNeedChrome: 'Directory browsing requires Chrome or Edge browser',
    dirBrowseChrome: 'Dir Browse (Chrome)',
    recentRecords: 'Recent',
    directory: 'Directory',
    singleFile: 'Single File',
    fileCount: 'files',
    noRecords: 'No records',
    clearFileRecords: 'Clear File Records',
    cacheTotal: 'Cache: {size}',
    currentDir: 'Directory: ',
    currentFile: 'Current File: ',
  },

  // === Sample Prompt ===
  sample: {
    prompt: 'First time? Load sample data to quickly explore features',
    loadSample: 'Load Sample',
    dismiss: "Don't remind again",
    sampleName: {
      predictions: '📋 Sample Data (Predictions)',
      reviews: '📋 Sample Data (Reviews)',
      meval: '📋 Sample Data (MEval)',
      custom: '📋 Sample Data (Custom)',
    },
  },

  // === Stats & Distribution ===
  stats: {
    tokenDistribution: 'Token Distribution',
    resultDistribution: 'Result Distribution',
    finishReasonDistribution: 'Finish Reason Distribution',
    stopReasonDistribution: 'Stop Reason Distribution',
    datasetStats: 'Dataset Statistics',
    total: 'Total: {count} records',
    samples: 'Samples: {count}',
    distributionSuffix: 'Distribution',
  },

  // === Dataset Stats Card ===
  datasetStats: {
    title: 'Dataset Statistics',
    dataset: 'Dataset',
    questions: 'Questions',
    correct: 'Correct',
    wrong: 'Wrong',
    accuracy: 'Accuracy',
  },

  // === Histogram Card ===
  histogram: {
    title: 'Token Distribution',
  },

  // === Dir Browser ===
  dirBrowser: {
    title: 'Directory Browser',
    noData: 'No directory data',
    browserNotSupported: 'Current browser does not support File System Access API, please use Chrome/Edge',
    noCachedDir: 'No cached directory found',
    permissionDenied: 'Directory access permission denied',
    restoreFailed: 'Failed to restore directory',
    noMatchingFiles: 'No supported files found in directory (json/jsonl/csv/ndjson/tsv)',
    scanDepthHint: 'Only scans one level of subdirectories for supported files',
  },

  // === Detail Dialog ===
  detailDialog: {
    noSolution: 'No solution provided',
    noSolutionDetail: 'No solution provided (no displayable content found in sample_metadata)',
    parseFailed: 'Parse failed, unable to get solution',
  },

  // === Curl Dialog ===
  curlDialog: {
    title: 'Generate Curl Command',
    copyCurl: 'Copy curl',
    curlCopied: 'curl copied',
    parameters: 'Parameters',
    preview: 'Preview',
  },

  // === MEval View ===
  meval: {
    detectedModel: 'Detected Model: ',
    hintText: 'Please upload an evaluation sample detail CSV file',
    validateWarning: 'This CSV does not appear to be an MEval evaluation sample file (columns like Sample ID/Result/Model Answer not found). Continue loading?',
    sampleId: 'Sample ID',
    searchId: 'Search ID',
    searchTraceId: 'Search Trace ID',
    dataset: 'Dataset',
    result: 'Result',
    question: 'Question',
    referenceAnswer: 'Reference',
    modelAnswer: 'Model Answer',
    extractedAnswer: 'Extracted',
    requestDetail: 'Request Detail',
    resultDetail: 'Result Detail',
    buildCurl: 'Build CURL',
    content: 'Content',
    answers: 'Answers',
    actions: 'Actions',
    fileFormatConfirm: 'File Format Confirm',
  },

  // === Predictions View ===
  predictions: {
    hintText: '⚠️ Please upload a JSONL file from the predictions directory',
    validateNotPredictions: 'This file does not appear to be a Predictions JSONL file. Continue loading?',
    validateNotJsonl: 'This file is not a valid JSONL format. Continue loading?',
    reasoningBanner: 'Reasoning content detected, marked as [R]. Click "View" to see Text and Reasoning separately',
    reasoningEmpty: 'Reasoning mode is enabled, but reasoning content is empty.',
    wrongDirType: 'Current directory is a {type} directory, cannot view predictions data. Please select the parent directory',
    notFound: 'Predictions JSONL file not found',
  },

  // === Reviews View ===
  reviews: {
    hintText: '⚠️ Please upload a JSONL file from the reviews directory',
    validateNotReviews: 'This file does not appear to be a Reviews JSONL file. Continue loading?',
    validateNotJsonl: 'This file is not a valid JSONL format. Continue loading?',
    wrongDirType: 'Current directory is a {type} directory, cannot view reviews data. Please select the parent directory',
    notFound: 'Reviews JSONL file not found',
    buildCurl: 'Build CURL',
  },

  // === File Handler ===
  fileHandler: {
    justNow: 'just now',
    minutesAgo: '{n} min ago',
    hoursAgo: '{n} hr ago',
    daysAgo: '{n} days ago',
    recentFilesCleared: 'Recent files cleared',
    cacheResetNotice: 'Cache has been reset due to a version upgrade. Recent files list has been cleared.',
    fileNotFound: 'File not found or has been cleaned up',
    noSolution: 'No solution provided',
    fileFormatConfirm: 'File Format Confirm',
  },

  // === Config Parsers ===
  configParsers: {
    experimentFallback: 'Experiment {n}',
  },

  // === Custom Viewer ===
  custom: {
    hintText: 'Upload any JSON, NDJSON, CSV, or TSV file to visualize',
    fieldConfig: 'Field Config',
    statsConfig: 'Statistics Config',
    columnConfig: 'Column Config',
    fieldDistribution: 'Field Distribution',
    numericDistribution: 'Numeric Distribution',
    distributionFields: 'Distribution (Pie Chart)',
    histogramFields: 'Histogram',
    searchable: 'Searchable (S)',
    filterable: 'Filterable (F)',
    previewable: 'Previewable (P)',
    searchPrefix: 'Search ',
    autoExpanded: 'Auto-expanded JSON string fields:',
    resetDefaults: 'Reset Defaults',
    conversationTitle: 'Conversation',
    toolsTitle: 'Tool Definitions',
    preset: 'Preset',
    savePreset: 'Save Preset',
    deletePreset: 'Delete',
    noPreset: 'No Preset',
    schemaPreview: 'Data Structure Preview',
    searchFields: 'Search fields...',
    showAll: 'Show All',
    showOnlyVisible: 'Visible Only',
    topLevelFields: 'Top-level Fields',
    noFieldsMatch: 'No fields match the search',
    expandToolContent: 'Expand',
    collapseToolContent: 'Collapse',
    filterConversation: 'Filter...',
    filterTools: 'Filter tools...',
    messageCount: '{count} messages',
    toolCount: '{count} tools',
    empty: 'empty',
    visibilityReason: {
      conversation: 'Auto: chat',
      toolList: 'Auto: tool',
      highPriority: 'Auto: important',
      default: 'Auto: shown',
      lowPriority: 'Auto: metadata',
      duplicate: 'Auto: duplicate',
      maxVisible: 'Auto: limit',
      mostlyEmpty: 'Auto: mostly empty',
      expandedNonChat: 'Auto: expanded',
      constant: 'Auto: constant',
    },
    visibilityReasonDesc: {
      conversation: 'Detected as conversation format (role/content), always shown',
      toolList: 'Detected as tool definitions array, always shown',
      highPriority: 'Matches important field patterns (token, error, model, result, etc.)',
      default: 'Default priority field, shown within quota',
      lowPriority: 'Matches metadata/auxiliary patterns (*_id, timestamp, etc.)',
      duplicate: 'Duplicate meaning with another field (e.g. key and key.name)',
      maxVisible: 'Field count reached display limit (20 fields)',
      mostlyEmpty: 'Over 95% of records have empty value for this field',
      expandedNonChat: 'Expanded nested sub-field, only important ones shown',
      constant: 'Same value across all records (constant), auto-hidden',
    },
    visibilityRulesTitle: 'Smart Visibility Rules',
    visibilityRulesDesc: 'Fields are automatically shown/hidden based on type, content, and importance:\n• Conversation/tool fields are always shown\n• Important fields (token, error, model) shown first\n• Metadata fields (*_id, timestamp) deprioritized\n• Constant fields (same value everywhere) auto-hidden\n• Fields with >95% empty rate auto-hidden\n• Max 20 fields shown by default',
    smartTag: {
      stopReason: 'Suggested',
      model: 'Suggested',
      errorCode: 'Suggested',
      tokenUsage: 'Suggested',
      latency: 'Suggested',
      cost: 'Suggested',
      result: 'Suggested',
    },
    debug: 'Debug',
    debugTitle: 'Field Priority Debug',
    debugStatsSelection: 'Stats Smart Selection',
    debugFieldScoring: 'Field Scoring',
    debugPriorityRules: 'Priority Rules',
    recalculateScores: 'Recalculate',
    recalculateSuccess: 'Scores recalculated',
    highPriorityPatterns: 'High Priority Patterns',
    lowPriorityPatterns: 'Low Priority Patterns',
    scoringAlgorithm: 'Scoring Algorithm',
    scoringStepConversationName: 'Conversation / toolList bypass',
    scoringStepConversationDesc: 'Conversation and tool definition fields always get highest priority, bypassing all other rules.',
    scoringStepPatternName: 'Pattern matching',
    scoringStepPatternDesc: 'Field name is tested against HIGH/LOW pattern lists. High-priority patterns lower the score (good), low-priority patterns raise it (bad). Each pattern is tested against both the full key and its last dot-segment.',
    scoringStepEmptyName: 'Empty-rate penalty',
    scoringStepEmptyDesc: 'Fields that are mostly empty are penalized. The near-all-empty penalty (+80) is strong enough to override high-priority status.',
    scoringStepConstantName: 'Constant-rate penalty',
    scoringStepConstantDesc: 'Fields where all non-empty values are identical carry no discriminative information and are penalized.',
    scoringStepUniqueName: 'Unique count bonus',
    scoringStepUniqueDesc: 'Fields with many unique values are more informative and receive a small bonus.',
    scoringStepContentName: 'Content length bonus',
    scoringStepContentDesc: 'Fields with longer average content values are likely more informative and receive a small bonus.',
    scoringStepTypeName: 'Type weight',
    scoringStepTypeDesc: 'Enum fields (good for filtering) and number fields (good for sorting) get a bonus. Boolean fields get a penalty as they carry little information.',
    patternMatchCount: '{count} patterns',
    scoringStep: '#',
    scoringFactor: 'Factor',
    scoringCondition: 'Condition',
    scoringDelta: 'Delta',
    scoringDescription: 'Description',
    bonus: 'Bonus',
    penalty: 'Penalty',
    matchCount: 'Matches',
  },

  // === News Banner ===
  news: {
    items: [
      {
        date: '2026-04-16',
        items: [
          '1. [Beta] Custom Viewer: upload any JSON/NDJSON/CSV/TSV file to visualize, with auto field detection, tree-structured field config, data structure preview, and preset management',
          '2. Conversation Dialog: supports tool calls / function calls rendering with syntax-highlighted JSON, collapsible blocks, and markdown in assistant messages',
        ],
      },
    ],
  },
};
