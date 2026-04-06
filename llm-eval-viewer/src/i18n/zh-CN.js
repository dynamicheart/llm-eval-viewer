/* Copyright (c) 2026 dynamicheart. Licensed under the MIT License. */

export default {
  // === Common ===
  common: {
    view: '查看',
    generate: '生成',
    copy: '复制',
    copied: '已复制',
    copiedToClipboard: '已复制到剪贴板',
    copyFailed: '复制失败',
    nothingToCopy: '没有内容可复制',
    reset: '重置',
    detail: '详情',
    unknown: '未知',
    cancel: '取消',
    continueLoad: '继续加载',
    loading: '正在解析数据...',
  },

  // === App ===
  app: {
    exampleFiles: '示例文件',
    pageTitle: 'LLM Eval Viewer - 轻量级大模型评测结果查看器',
    title: {
      meval: 'MEval - 样本查看器',
      reviews: 'Evalscope Review JSONL 查看器',
      predictions: 'Evalscope Predictions JSONL 查看器',
      default: 'Evalscope JSONL 查看器',
    },
    theme: {
      light: '浅色',
      dark: '深色',
      auto: '自动',
    },
  },

  // === File Toolbar ===
  fileToolbar: {
    selectJsonlFile: '选择 JSONL 单文件',
    selectCsvFile: '选择 CSV 文件',
    selectDirectory: '选择目录',
    dirBrowseNeedChrome: '目录浏览功能需要使用 Chrome 或 Edge 浏览器',
    dirBrowseChrome: '目录浏览（需 Chrome）',
    recentRecords: '最近记录',
    directory: '目录',
    singleFile: '单文件',
    noRecords: '暂无记录',
    clearFileRecords: '清空文件记录',
    cacheTotal: '缓存总量：{size}',
    currentDir: '目录：',
    currentFile: '当前文件：',
  },

  // === Sample Prompt ===
  sample: {
    prompt: '首次使用？点击加载样例数据，快速体验功能',
    loadSample: '加载样例数据',
    dismiss: '不再提醒',
    sampleName: {
      predictions: '📋 样例数据 (Predictions)',
      reviews: '📋 样例数据 (Reviews)',
      meval: '📋 样例数据 (MEval)',
    },
  },

  // === Stats & Distribution ===
  stats: {
    tokenDistribution: 'Token 分布统计',
    resultDistribution: '标注结果分布',
    finishReasonDistribution: 'Finish Reason 分布',
    stopReasonDistribution: 'Stop Reason 分布统计',
    datasetStats: '数据集统计',
    total: '总计：{count} 条数据',
    samples: '样本数：{count}',
    distributionSuffix: '分布统计',
  },

  // === Dataset Stats Card ===
  datasetStats: {
    title: '数据集统计',
    dataset: '数据集',
    questions: '题目数',
    correct: '正确',
    wrong: '错误',
    accuracy: '正确率',
  },

  // === Histogram Card ===
  histogram: {
    title: 'Token 分布统计',
  },

  // === Dir Browser ===
  dirBrowser: {
    title: '目录浏览',
    noData: '暂无目录数据',
    browserNotSupported: '当前浏览器不支持 File System Access API，请使用 Chrome/Edge',
    noCachedDir: '未找到缓存的目录',
    permissionDenied: '目录访问权限被拒绝',
    restoreFailed: '恢复目录失败',
  },

  // === Detail Dialog ===
  detailDialog: {
    noSolution: '未提供 solution',
    noSolutionDetail: '未提供 solution（sample_metadata 中也未找到可展示内容）',
    parseFailed: '解析失败，无法获取 solution',
  },

  // === Curl Dialog ===
  curlDialog: {
    title: '生成 Curl 命令',
    copyCurl: '复制 curl',
    curlCopied: 'curl 已复制',
    parameters: '参数',
    preview: '预览',
  },

  // === MEval View ===
  meval: {
    detectedModel: '检测到模型：',
    hintText: '请上传评测样本明细 CSV 文件',
    validateWarning: '该 CSV 不像是 MEval 评测样本文件（未找到 样本ID/标注结果/模型回答 等列），确定要加载吗？',
    sampleId: '样本ID',
    searchId: '搜索ID',
    searchTraceId: '搜索Trace ID',
    dataset: '数据集',
    result: '标注结果',
    question: '问题',
    referenceAnswer: '参考答案',
    modelAnswer: '模型回答',
    extractedAnswer: '提取答案',
    requestDetail: '请求详情',
    resultDetail: '标注详情',
    buildCurl: '构造CURL',
    content: '内容',
    answers: '答案',
    actions: '操作',
    fileFormatConfirm: '文件格式确认',
  },

  // === Predictions View ===
  predictions: {
    hintText: '⚠️ 请上传 predictions 目录下的 JSONL 文件',
    validateNotPredictions: '该文件不像是 Predictions JSONL，确定要加载吗？',
    validateNotJsonl: '该文件不是有效的 JSONL 格式，确定要加载吗？',
    reasoningBanner: '检测到 Reasoning 内容，标记为 [R]，点击「查看」可分别查看 Text 和 Reasoning；点击分布图可快速筛选',
    wrongDirType: '当前目录是 {type} 目录，无法查看 predictions 数据，请选择上一级目录',
    notFound: '未找到 predictions JSONL 文件',
  },

  // === Reviews View ===
  reviews: {
    hintText: '⚠️ 请上传 reviews 目录下的 JSONL 文件',
    validateNotReviews: '该文件不像是 Reviews JSONL，确定要加载吗？',
    validateNotJsonl: '该文件不是有效的 JSONL 格式，确定要加载吗？',
    wrongDirType: '当前目录是 {type} 目录，无法查看 reviews 数据，请选择上一级目录',
    notFound: '未找到 reviews JSONL 文件',
    buildCurl: '构造CURL',
  },

  // === File Handler ===
  fileHandler: {
    justNow: '刚刚',
    minutesAgo: '{n} 分钟前',
    hoursAgo: '{n} 小时前',
    daysAgo: '{n} 天前',
    recentFilesCleared: '已清空最近文件',
    fileNotFound: '文件不存在或已被清理',
    noSolution: '未提供 solution',
    fileFormatConfirm: '文件格式确认',
  },

  // === Config Parsers ===
  configParsers: {
    experimentFallback: '实验 {n}',
  },

  // === News Banner ===
  news: {
    items: [
      {
        date: '2026-04-06',
        items: [
          '1. 支持暗黑模式：点击右上角主题图标，可切换 浅色 / 深色 / 自动',
          '2. 目录浏览功能：支持选择目录，自动扫描目录结构，快速切换不同实验和数据集',
        ],
      },
    ],
  },
};
