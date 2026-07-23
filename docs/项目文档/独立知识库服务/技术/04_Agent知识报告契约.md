---
covers:
  - packages/agent-service/src/backends/pi-tools/knowledge-report-tool.ts
  - packages/agent-service/src/backends/pi-tools/read-knowledge-source-tool.ts
  - packages/agent-service/src/backends/pi-tools/index.ts
  - packages/agent-service/tests/unit/knowledge-report-tool.test.ts
  - packages/knowledge-service/src/client.ts
---

# Agent 知识报告契约

## 一、工具定位

`knowledgeReport` 是 Agent Service 提供给 Pi Agent 的知识报告工具。它负责检索和压缩知识，不直接修改项目，也不替主 AI 做最终决策。

主 AI 使用报告后，仍需要结合用户任务读取必要原文并完成修改或解释。

## 二、访问上下文

创作端 AI 使用作者侧上下文，先引用系统硬约束和当前项目知识，再按问题查询其他模板项目。跨模板检索显式排除当前项目，模板结果的可信等级固定为参考样本。

使用端只读 AI 使用 viewer 上下文，只引用当前公开项目资料，当前不接入跨模板服务。

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
- 其他模板项目参考，包括模板名称、来源路径、摘要和不透明 `knowledge://` 引用。

涉及配置、Schema、系统规则和业务规则时，风险提示应引导主 AI 继续读取原文确认。

当前项目事实与其他模板冲突时，以当前项目事实为准；Agent 不得把其他模板内容表述为当前项目已经存在的配置或规则。

## 四、上下文隔离

`knowledgeReport` 把检索、筛选和压缩过程留在工具内部。主 AI 只接收最终报告和必要来源，避免大量无关候选资料污染主对话上下文。

## 五、原文读取

`readKnowledgeSource` 只接受 `knowledgeReport` 返回的 `knowledge://` 引用。服务解析引用并返回该索引修订对应的完整文档，同时携带模板项目 id、revision 和 rootHash。

工具不接受项目路径参数，也不允许 Agent 直接读取其他项目工作空间，从而把跨项目访问控制留在知识服务边界内。引用失效或服务不可用时必须返回明确错误，不能回退为任意文件读取。

## 六、故障降级

独立服务不可用时，`knowledgeReport` 仍返回系统规则和当前项目知识报告，只省略其他模板项目参考。模板检索故障不能中断当前项目的 AI 编辑流程。

## 七、工具能力版本

Agent Service 的工具能力由 `createWorkbenchTools()` 统一注册。当前工作台工具版本为 23；工作台模式同时注册 `knowledgeReport` 和 `readKnowledgeSource`，viewer 只读模式不注册跨模板原文读取工具。
