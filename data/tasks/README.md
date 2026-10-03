# 当日日课文件

此目录保存2026年10月2日至11月14日的固定学习计划。每份脚本调用 `window.registerCTATask(task)` 注册一个日期；`../task-manifest.js` 登记全部任务。计划由 `../../tools/generate_schedule.py` 从本地题源生成并核验。

选择题可以包含已核验的 `answer` 与 `explanation`，仅在提交后由页面展示；应用题不得包含答案、评分标准或解析。

## 日课脚本模板

```js
(function () {
  "use strict";
  window.registerCTATask({
    meta: {
      date: "2026-10-02",
      dayNumber: 30,
      title: "Day30 学习任务",
      subjects: ["税法一", "税法二"],
      estimatedMinutes: 120,
      version: "2026-10-02.v1"
    },
    sections: [
      { id: "s1", subject: "税法一", title: "节点名称", description: "本节点学习范围" }
    ],
    sourceAssignments: [
      {
        id: "paper-2025-tax1",
        title: "税法一 · 2025年真题全真模拟",
        instruction: "按150分钟正式考试节奏闭卷完成。",
        responseLabel: "逐题记录答案、计算过程及需要GPT评测的内容",
        source: {
          file: "2025年税务师《税法一》真题及答案.pdf",
          path: "assets/pdfs/tax1-paper-2025.pdf",
          pages: "1–27",
          verified: true
        }
      }
    ],
    choiceQuestions: [
      {
        id: "c1",
        sectionId: "s1",
        type: "single",
        prompt: "题干",
        options: [{ id: "A", text: "选项A" }, { id: "B", text: "选项B" }],
        answer: ["A"],
        explanation: "仅答错后展示的已核验解析。",
        source: { file: "原题文件.pdf", page: 1, answerPage: 2, verified: true }
      }
    ],
    applicationQuestions: [
      {
        id: "a1",
        sectionId: "s1",
        prompt: "应用题题干",
        responseLabel: "写出分析与计算过程",
        source: { file: "原题文件.pdf", page: 3 }
      }
    ],
    exportMeta: {
      materialVersion: "2026考试口径",
      generatedAt: "2026-10-02T09:00:00-04:00",
      filenameBase: "2026-10-02-Day30-CTA学习作答"
    }
  });
}());
```

应用题对象禁止出现 `answer`、`standardAnswer`、`explanation` 或 `rubric` 字段。

`sourceAssignments` 用于整卷模拟：网页只链接已上传的原卷并记录作答，不复制客户端答案，也不自动评分。其 `source` 必须同时包含 `file`、相对网页入口的 `path`、物理页范围 `pages` 和 `verified: true`。公开发布时，`path` 指向的文件必须位于本仓库内。

## GPT评测JSON模板

```json
{
  "schemaVersion": "cta-evaluation.v1",
  "date": "2026-10-02",
  "taskVersion": "2026-10-02.v1",
  "questionEvaluations": [
    { "id": "a1", "status": "已评测", "score": 8, "comment": "评测结论" }
  ],
  "overall": { "score": 8, "maxScore": 10, "status": "已完成评测" },
  "completedLearning": ["已完成的学习内容"],
  "report": { "summary": "当日评测摘要" }
}
```
