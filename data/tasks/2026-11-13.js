(function () {
  "use strict";
  window.registerCTATask({
  "meta": {
    "date": "2026-11-13",
    "dayNumber": 66,
    "title": "考前最终模拟与状态校准",
    "subjects": [
      "税法一",
      "税法二"
    ],
    "estimatedMinutes": 150,
    "version": "2026-11-13.v1"
  },
  "sections": [
    {
      "id": "final",
      "title": "二选一完成最终模拟",
      "description": "选择较薄弱科目完成模拟预测卷（一）；另一科保留，不强制加量。完成后只做评测与状态整理。"
    }
  ],
  "sourceAssignments": [
    {
      "id": "paper-e556427835",
      "title": "税法一模拟预测卷（一）",
      "instruction": "从指定物理页开始完成模拟预测卷（一），连续计时150分钟；当天二选一完成，另一科作为考前备用卷。",
      "responseLabel": "逐题记录答案、计算过程及需要 GPT 评测的内容",
      "source": {
        "file": "2026考季《3年真题＋2套模拟预测卷》-税法（Ⅰ）_1.pdf",
        "path": "assets/pdfs/tax1-mock-2026.pdf",
        "pages": "56–94",
        "verified": true
      }
    },
    {
      "id": "paper-db23277389",
      "title": "税法二模拟预测卷（一）",
      "instruction": "从指定物理页开始完成模拟预测卷（一），连续计时150分钟；当天二选一完成，另一科作为考前备用卷。",
      "responseLabel": "逐题记录答案、计算过程及需要 GPT 评测的内容",
      "source": {
        "file": "2026考季《3年真题＋2套模拟预测卷》-税法（Ⅱ）_1.pdf",
        "path": "assets/pdfs/tax2-mock-2026.pdf",
        "pages": "51–87",
        "verified": true
      }
    }
  ],
  "choiceQuestions": [],
  "applicationQuestions": [],
  "exportMeta": {
    "materialVersion": "2026考季模拟预测卷",
    "generatedAt": "2026-10-02T12:00:00-04:00",
    "filenameBase": "2026-11-13-Day66-CTA最终模拟作答"
  }
});
}());
