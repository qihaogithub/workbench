---
covers:
  - packages/agent-service/src/backends/pi-tools/knowledge-report-tool.ts
  - packages/agent-service/src/backends/pi-tools/index.ts
  - packages/agent-service/tests/unit/knowledge-report-tool.test.ts
  - packages/knowledge-service/src/index.ts
---

# Agent 知识报告契约

## 一、工具定位

`knowledgeReport` 是 Agent Service 提供给 Pi Agent 的知识报告工具。它负责检索和压缩知识，不直接修改项目，也不替主 AI 做最终决策。

主 AI 使用报告后，仍需要结合用户任务读取必要原文并完成修改或解释。

## 二、访问上下文

创作端 AI 使用作者侧上下文，可引用系统硬约束、作者私有项目知识和模板参考。

使用端只读 AI 使用 viewer 上下文，只能引用公开可见或模板库允许的资料。

报告缓存和报告结果必须区分访问上下文，不能把高权限报告复用给低权限主体。

## 三、报告结构

报告固定包含：

- 结论摘要。
- 相关资料。
- 来源路径。
- 可信等级。
- 适用范围。
- 建议主 AI 继续读取的原文。
- 未找到的信息。
- 风险提示。

涉及配置、Schema、系统规则和业务规则时，风险提示应引导主 AI 继续读取原文确认。

## 四、上下文隔离

`knowledgeReport` 把检索、筛选和压缩过程留在工具内部。主 AI 只接收最终报告和必要来源，避免大量无关候选资料污染主对话上下文。

## 五、工具能力版本

Agent Service 的工具能力由 `createWorkbenchTools()` 统一注册。当前工作台工具版本为 8，包含 `knowledgeReport`、Figma MCP、钉钉、画布整理、页面删除和子 Agent 委派等工具。
