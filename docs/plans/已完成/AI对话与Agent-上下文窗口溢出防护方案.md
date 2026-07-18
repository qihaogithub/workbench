# AI 对话上下文窗口溢出防护方案

> 跨模块方案文档：agent-service / shared / author-site / pi-agent 上下文管理。

## 当前状态

**未实施**。当前存在上下文无限增长、溢出后级联失败的问题（见 [对话记录-2026-7-18-session-](../对话记录-2026-7-18-session-.json) `session-1784365620916-eyvm7yajs`）。

pi-agent-core 内置了完善的 compaction 机制（结构化摘要压缩、token 估算、自动触发），但因本项目 harness 实例不跨 turn 持久化，内置机制未生效。

## 当前结论

### 根因

- deepseek-v4-flash 最大上下文 1,048,565 tokens，第2轮消息 + 全量历史 = 1,161,677 tokens → 400 错误
- 溢出后级联失败：每轮重试带全部历史（含失败的），token 数从 116万 → 173万 → 更大
- 前端只展示"AI 请求失败，请稍后重试"，用户不知道是上下文溢出

### 日志证据

```
运行1（成功）: msg-1784365643060, 883KB context, 67秒完成
运行2（失败）: msg-1784365893200, 883KB context, 3.8秒 → "400 maximum context length 1048565 tokens, requested 1161677"
运行3（失败）: msg-1784365914214, 883KB context, 3.4秒 → "400 maximum context length 1048565 tokens, requested 1731676"
```

### 上下文浪费分析

通过分析 `session-1784365620916-eyvm7yajs` 三轮对话的实际日志和 agent-service 代码，确认每轮上下文中有大量对后续轮次无用的冗余信息。按浪费程度排序：

| 优先级 | 冗余内容 | 来源机制 | 估算浪费 | 对后续轮次价值 |
|:---:|------|------|:---:|:---:|
| P0 | 工作区页面源码内嵌 | `scanWorkspaceContext()` 当页面数 ≤ 2 时嵌入每页完整源码 | ~50万字节（字符） | 低，Agent 可通过 readFile 按需读取 |
| P1 | 上一轮 thinking/reasoning tokens | pi-agent-core 保留全部 assistant message 事件，含 9 段 thinking 块 | ~10万+ tokens | 零，模型的内心独白 |
| P1 | 上一轮工具调用完整结果 | pi-agent-core 将工具 I/O 原样保留在历史中（557 行 CSS + 49KB base64 截图） | ~9万+ tokens | 零，模型已基于结果行动 |
| P2 | 系统提示词 | ~600 行 L2 行为约束 | ~1万 tokens | 必要，但非本轮主要矛盾 |

**关键机制缺陷**：

1. **L3 上下文每次全量发送**：`scanWorkspaceContext()` 在每轮用户消息前拼接页面源码，即使内容未发生变化，且 Agent 完全可以通过 readFile 工具按需读取。
2. **pi-agent-core 历史不分轮次**：harness 实例跨 turn 时，自动将全部 assistant message（含 thinking 块和工具结果）追加到历史。没有区分"本轮工具调用的临时结果"和"需要跨轮次保留的上下文"。
3. **contentLength 严重低估**：使用 `String.length`（字符数）而非 token 计数。第一轮 contentLength 88万字符，实际 API 请求 116万 tokens。图片 base64 的 token 消耗约为字符数的 3 倍。

### 误差分析

`contentLength` 使用 `String.length`（字符数），仅用于日志。实际 token 消耗远超字符数（中文字符约 1.5-3 token/char，代码约 1 token/char，图片 base64 约 1 token/3 char）。第一轮实际 API 请求 1,161,677 tokens，contentLength 仅显示 88万字符，低估约 30%。

## 方案

### 设计原则

1. **不重复造轮子**：pi-agent-core 内置的 compaction 机制已经在 token 估算、摘要生成、自动触发上做得很好，我们的目标是让它生效，而不是在 agent-service 层重写一套。
2. **能局部解决的先局部解决**：L3 瘦身是一个独立改动，改动范围小、效果确定、无风险，不需要等其他层就位。
3. **每一层独立有效**：P0 不依赖 P1，P1 不依赖 P2。每层实现后都能独立改善问题。

### 三层防线架构

```
第1层（P0）: L3 上下文瘦身 + 错误分类与用户提示        ← 阻止最大的浪费 + 让用户知道发生了什么
第2层（P1）: harness 持久化 + pi-agent-core compaction  ← 根治多轮对话上下文膨胀
第3层（P2）: 子 Agent 隔离 + 外部记忆                   ← 处理极端长对话和大文件读取
```

### 第1层：L3 瘦身 + 错误分类（P0）

**目标**：消除当前已知的最大浪费源（页面源码内嵌），并让用户在溢出时看到明确指引而非困惑。

#### 1.1 L3 上下文瘦身（author-site）

**改动位置**：`packages/author-site/src/lib/agent/scan-workspace.ts` 中的 `scanWorkspaceContext()`

**当前行为**：页面数 ≤ 2 时（`MAX_INLINE_PAGES = 2`），调用 `readPageFiles()` 把每个页面的完整源码（`prototype.html`/`prototype.css`/`index.tsx`/`sketch.scene.json`）和 `config.schema.json` 嵌入 `PageInfo.sourceContents`/`schemaContent`，再由 `formatPageList()` 拼进 L3 上下文。**无截断保护**，两页项目可达数十万字节。

**问题**：author-site Agent 有 readFile 工具可以按需读取文件，预嵌入是重复提供信息，且每轮都发送，即使页面内容未变化。

**改动方案（彻底移除，不留 dead code）**：

- 删除 `MAX_INLINE_PAGES` 常量、`readPageFiles` 函数、`PageInfo.sourceContents`/`schemaContent` 字段
- 删除 `scanWorkspaceContext()` 中调用 `readPageFiles` 的 if 块
- 简化 `formatPageList()`，移除处理 `sourceContents`/`schemaContent` 的代码块；保留页面元数据（名称、id、routeKey、runtimeType、源码路径、schema 路径）
- `readMemoryContent()` 和 `scanKnowledgeIndex()` 不在 `scanWorkspaceContext()` 内部调用（由 `app/api/agent/workspace-context/route.ts` 分别调用），本次不动

**预期效果**：当前用例（两页项目）的 L3 上下文页面部分从数十万字节降至 ~1-2KB（仅元数据），节省约 99%。

**风险**：Agent 多一次 readFile 工具调用。但这本来就是正常的工作流程——先看文件再编辑——额外开销约 1 秒，远小于上下文溢出导致的全轮失败。

**范围边界（不动）**：`packages/agent-service/src/services/viewer-ai-context.ts` 也有 `MAX_INLINE_PAGES = 2` 和 `formatPageDetail()` 嵌入源码逻辑，但 **viewer 端 AI 是只读问答、不调用 readFile 工具**，必须依赖注入的上下文；且该路径有 `truncateText(..., 12000)` 截断保护，单页最多 12000 字符，不会引发上下文爆炸。本次不改。

#### 1.2 错误分类与用户提示（agent-service + shared）

**改动位置**：
- `packages/agent-service/src/core/types.ts`：`ErrorCode` 新增 `"CONTEXT_OVERFLOW"`
- `packages/agent-service/src/core/backend-agent.ts`：新增 `isContextOverflowError(error)` 辅助函数（识别 400 + `"maximum context length"` 等关键字）；在 `sendMessage` catch 块（L284-L326）中**优先于** `isRateLimitError` 判断，返回 `{ code: "CONTEXT_OVERFLOW", retryable: false }`
- `packages/agent-service/src/routes/websocket.ts`：对 `CONTEXT_OVERFLOW` 错误也执行销毁 agent 逻辑（与 `RATE_LIMIT_EXCEEDED` 同处理，L511-L526），清空膨胀的对话历史，避免下一轮继续溢出
- `packages/shared/src/ai-error-normalizer.ts`：`AiErrorCategory` 新增 `"context_overflow"`；`classifyAiError` 优先匹配 `code === "CONTEXT_OVERFLOW"`，再用文本兜底 `"maximum context length"`/`"context length"`；`userMessageForCategory` 新增对应文案
- 前端展示文案（在 `ai-error-normalizer.ts` 中）：`"对话内容过长，已超出模型上下文上限。请新建对话继续；当前对话的历史和结果已保留。"`（shared 包不应假设调用方 UI 布局，故不提"右侧页面"）

**错误传播路径**：LLM API 失败 → `pi-agent.ts:sendMessage` catch 块 `throw error` → `backend-agent.ts:sendMessage` catch 块构造 `AgentError.code` → `websocket.ts` 发送 `{ type: "error", error }` → 前端 `use-chat-stream.ts` 调用 `normalizeAiError(error).userMessage` 展示。因此 code 标签的注入点是 `backend-agent.ts`，不是 `pi-agent.ts`。

**注意**：1.2 与 1.1 独立，可以并行实施。P0-3 的 code 匹配依赖 P0-2 打的 code，但 P0-3 还有文本兜底，即使 P0-2 未生效也能识别。

---

### 第2层：harness 持久化 + compaction（P1）

**目标**：多轮对话不因上下文增长而崩溃。利用 pi-agent-core 内置的 compaction 机制，而非在 agent-service 层重新实现。

**为什么选择 harness.compact() 而不是自己写压缩逻辑**：

| | pi-agent-core compaction | 自己实现 |
|---|---|---|
| token 估算 | 内置 estimateContextTokens，有 API usage 精确值兜底 | 需要自己写估算 + 校准 |
| 摘要质量 | 对齐 Claude 的 SUMMARIZATION_SYSTEM_PROMPT，结构化输出 | 需要自己设计 prompt + 调优 |
| 自动触发 | 在接近 contextWindow 时自动触发 | 需要自己实现触发判断 |
| 维护成本 | 跟随 pi-agent-core 更新 | 独立维护 |

**核心改动**：让 `AgentHarness` 实例跨 turn 持久化，而非每个 turn 销毁重建。

当前行为（推断）：每个 turn 创建新 harness → 发送完整历史 → turn 结束销毁。这意味着 harness 内部的消息历史每次都从零构建，compaction 没有积累的上下文可以压缩。

目标行为：首次 turn 创建 harness → 后续 turn 复用同一实例 → harness 内部维护完整消息历史 → 接近 contextWindow 时自动触发 compaction → 旧消息被压缩为 CompactionSummary 而非全量保留。

**需要调研的问题**：

1. harness 跨 turn 保持的可行性：当前 turn 之间 harness 是否会因为 WebSocket 断连、Agent 重建等原因被销毁？
2. 消息注入方式：当前如何把历史消息注入 harness？是否有不重建 harness 就能追加新 turn 消息的 API？
3. compaction 触发时机：pi-agent-core 是在 `harness.prompt()` 调用前检查 token 预算并自动压缩，还是需要显式调用 `harness.compact()`？
4. CompactionSummary 格式兼容性：pi-agent-core 生成的 CompactionSummary 消息格式是否与我们当前的消息结构兼容？

**如果 harness 跨 turn 保持不可行**：退而求其次，在 `BackendAgent` 层实现简化版 compaction——但这意味着需要自己管理 token 估算和触发逻辑。此时应优先考虑手动调用 `harness.compact(messages)` 生成摘要（即使 harness 不保持），用摘要替代旧历史再传入新 harness。

**摘要格式**（对齐 pi-agent 官方）：

```
## 目标
[用户想要完成什么？]

## 约束与偏好
- [用户提到的约束、偏好]

## 进度
### 已完成
- [x] 已完成的子任务
### 进行中
- [ ] 进行中的工作

## 关键决策
- **决策**: 理由

## 下一步
1. 下一步行动
```

---

### 第3层：子 Agent 隔离 + 外部记忆（P2）

**目标**：处理极端场景（超长对话、大文件读取、多项目上下文）。

- 大文件读取委托子 agent，主窗口只保留分析结论
- 用户长期偏好、项目约定存入外部存储，检索注入（已有 `memory.md` 机制，可扩展）

**状态**：远期规划，暂不展开。

## 待办

### P0

- [x] **P0-1**：L3 上下文瘦身——彻底移除 `scan-workspace.ts` 中 `readPageFiles`/`sourceContents`/`schemaContent`/`MAX_INLINE_PAGES`；同步更新 `scan-workspace.test.ts` 中 4 个断言"嵌入源码"的用例
- [x] **P0-2**：`types.ts` 新增 `CONTEXT_OVERFLOW` 错误码；`backend-agent.ts` 新增 `isContextOverflowError` 并在 catch 块优先判断；`websocket.ts` 对 `CONTEXT_OVERFLOW` 执行销毁 agent 联动
- [x] **P0-3**：`ai-error-normalizer.ts` 新增 `context_overflow` 分类（code 优先 + 文本兜底）和用户文案；`ai-error-normalizer.test.ts` 新增测试用例
- [ ] **P0-4**：用真实对话复验——确认两页项目不再在第2轮溢出；触发溢出时前端展示新文案且 agent 被销毁

### P1

- [ ] **P1-1**：调研 harness 跨 turn 持久化的可行性（消息注入 API、生命周期、compaction 触发机制）
- [ ] **P1-2**：根据调研结论，实现 compaction（优先 harness.compact()，不可行则在 BackendAgent 层简化实现）
- [ ] **P1-3**：验证多轮对话（5+ 轮含文件读写工具调用）不崩溃

## 验证状态

- [x] 已完成根因定位：`session-1784365620916-eyvm7yajs` 的 3 轮 run log 确认上下文溢出
  - 第2轮请求 1,161,677 tokens，超出 deepseek-v4-flash 上限（1,048,565）
  - 第3轮请求 1,731,676 tokens，继续膨胀（含失败轮次的历史）
  - 两轮均在 3-4 秒内返回 400 错误（模型层面直接拒绝）
- [x] 已完成上下文浪费分析：确认 L3 页面源码、thinking tokens、工具结果三类为主要冗余
- [x] 已确认 pi-agent-core 内置 compaction API 可用
- [x] 已确认前端错误归一化流程和展示组件
- [x] P0-1/P0-2/P0-3 代码已实现，typecheck 通过（author/agent/viewer/screenshot 四端）
- [x] P0-1/P0-3 单元测试通过（`scan-workspace.test.ts` 22 项、`ai-error-normalizer.test.ts` 新增 2 项）
- [ ] P0-4 待真实对话复验：两页项目不再在第2轮溢出；触发溢出时前端展示新文案且 agent 被销毁

## 风险

- **L3 瘦身风险**：Agent 多一次 readFile 调用，增加 1-2 秒延迟。接受此代价——远小于上下文溢出导致的全轮失败。
- **compaction 接入风险**：pi-agent-core 的 compaction API 和消息格式可能与当前项目不完全兼容。P1-1 调研任务需要先确认可行性，避免投入后发现不可行。
- **compaction 的 LLM 调用成本**：每次压缩需额外一次 API 调用。但对于会溢出的多轮对话，这比不断重试失败的成本低。
- **harness 持久化风险**：如果 harness 跨 turn 保持会引入状态泄漏（上一轮的临时状态影响下一轮），需要确保 turn 边界清理干净。
