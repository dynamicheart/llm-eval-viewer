# LLM Eval Viewer

[English](README.md)

> 本项目完全由 AI 辅助生成（Claude Opus 4.6）。

**LLM Eval Viewer** 是一个用于 **大模型评测结果可视化** 的轻量网页工具，  
目前支持 **evalscope** 和 **MEval** 生成的评测结果格式。

**在线体验：**  
https://dynamicheart.github.io/llm-eval-viewer/

---

## 功能特性

- **多视图支持**：Predictions、Reviews 和 MEval 样本查看器
- **目录浏览**：选择目录自动扫描结构，快速切换不同实验和数据集（Chrome/Edge）
- **暗黑模式**：亮色 / 暗色 / 自动主题，支持跟随系统偏好
- **Token 分布**：直方图展示，含平均 Prompt/Completion Token 统计
- **结果分布**：可交互的分布图表，点击可快速筛选
- **数据集统计**：按数据集展示准确率、平均 Token、Finish Reason；点击可筛选主表格
- **悬浮预览**：鼠标悬停截断文本可预览内容，点击查看完整详情
- **表头冻结**：固定表头，方便浏览大量数据
- **Reasoning 支持**：展示推理内容，标记为 [R]，可分别查看 Text 和 Reasoning
- **cURL 导出**：从请求详情生成 cURL 命令，快速回放 API 调用
- **国际化**：支持中英文切换
- **样例数据**：首次使用可加载内置样例数据，快速体验功能

---

## 示例文件（evalscope）

你可以直接使用以下示例文件进行本地或在线体验：

- **Predictions**
  - [math_500_level_1_predictions.jsonl](https://raw.githubusercontent.com/dynamicheart/llm-eval-viewer/main/docs/examples/math_500_level_1_predictions.jsonl)
- **Reviews**
  - [math_500_level_1_reviews.jsonl](https://raw.githubusercontent.com/dynamicheart/llm-eval-viewer/main/docs/examples/math_500_level_1_reviews.jsonl)

- **Predictions（带 reasoning）**
  - [humaneval_predictions_with_reasoning.jsonl](https://raw.githubusercontent.com/dynamicheart/llm-eval-viewer/main/docs/examples/humaneval_predictions_with_reasoning.jsonl)
- **Reviews（带 reasoning）**
  - [humaneval_reviews_with_reasoning.jsonl](https://raw.githubusercontent.com/dynamicheart/llm-eval-viewer/main/docs/examples/humaneval_reviews_with_reasoning.jsonl)

---

## 效果预览

### Reviews View（暗黑模式）
![Reviews View - Dark Mode](docs/images/reviews_view.png)

### Predictions View（亮色模式）
![Predictions View - Light Mode](docs/images/predictions_view_light.png)

---

## 开发

```bash
cd llm-eval-viewer
npm install
npm run dev
```

## 构建

```bash
npm run build
```

---

## AI 构建

本项目完全通过 AI 辅助编程开发，使用
[Claude Opus 4.6](https://www.anthropic.com/claude)。从架构设计到功能实现，
所有代码均通过人机协作生成和迭代。

## 许可证

MIT
