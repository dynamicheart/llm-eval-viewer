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
    reasoningBanner: 'Reasoning content detected, marked as [R]. Click "View" to see Text and Reasoning separately; click distribution chart to filter quickly',
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

  // === News Banner ===
  news: {
    items: [
      {
        date: '2026-04-06',
        items: [
          '1. Dark mode support: click the theme icon in the top-right corner to switch between Light / Dark / Auto',
          '2. Directory browsing: select a directory to auto-scan its structure, quickly switch between experiments and datasets',
        ],
      },
    ],
  },
};
