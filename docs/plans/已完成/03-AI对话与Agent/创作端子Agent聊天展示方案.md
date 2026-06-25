# 创作端子 Agent 聊天展示方案

> 创建日期：2026-06-21
> 状态：已实施
> 实施日期：2026-06-21
> 类型：体验与实现方案
> 关联能力：Pi Agent `delegateTask` 子 Agent 委派工具

## 背景

创作端 AI 已具备 `delegateTask` 能力，主 Agent 可以把独立、可并行或重复性强的任务委派给短生命周期子 Agent。子 Agent 与主 Agent 共享当前工作区、模型、权限和文件工具，并将文件变更汇入主会话。

当前聊天界面如果只把 `delegateTask` 当作普通工具展示，用户很难判断：

- 主 Agent 是否真的启动了子 Agent
- 子 Agent 被分配了什么任务
- 子 Agent 是否成功完成
- 子 Agent 改动了哪些文件
- 子 Agent 失败或超时时，主 Agent 是否继续接管

因此需要为子 Agent 设计独立的聊天执行过程展示方式。

## 目标

1. 子 Agent 不作为普通“执行命令”或泛化“工具操作”混在工具列表中。
2. 主聊天流保持干净，只展示主 Agent 的最终答复。
3. 执行过程区域新增“委派子 Agent”任务块，默认折叠，可展开查看详情。
4. 用户能一眼看懂委派任务、执行状态、耗时、摘要和文件变更。
5. 首版不展示子 Agent 内部所有思考和工具调用，避免聊天流噪音。

## 展示方案

### 折叠态

折叠态作为执行过程中的一条任务摘要，建议格式：

```text
委派子 Agent：整理重复广场页面 · 已完成 · 23s · 修改 8 个文件
```

信息优先级：

| 信息 | 来源 | 说明 |
|---|---|---|
| 标题 | `delegateTask` 入参 `task` | 过长时截断，保留完整内容到展开态 |
| 状态 | 工具调用状态 + `details.success` | 区分运行中、已完成、失败、取消/超时 |
| 耗时 | `details.durationMs` | 转为 `23s`、`1m 12s` 等短格式 |
| 文件数 | `details.files.length` | 没有文件时显示“不涉及文件变更”或省略 |

### 展开态

展开后展示一张结构化任务卡：

```text
委派任务
检查并整理所有“广场页面”重复副本，保留可用页面，删除或合并重复项

状态
已完成 · 23s

子 Agent 结果
- 发现手机版副本 6 个、平板副本 7 个
- 保留 plaza-mobile_main 与 plaza-tablet_main
- 同步更新 workspace-tree.json

文件变更
- demos/plaza-mobile_main/index.tsx
- demos/plaza-tablet_main/index.tsx
- workspace/workspace-tree.json
```

如果子 Agent 失败，展开态展示失败原因：

```text
子 Agent 执行失败
原因：Subagent timed out

主 Agent 可继续接管当前任务，或向用户说明未完成部分。
```

### 不展示的内容

首版不默认展示以下内容：

- 子 Agent 内部思考
- 子 Agent 内部每一次 `readFile` / `writeFile` / `bash` 调用
- 子 Agent 的完整消息流

后续可预留“查看子 Agent 详情”入口，但不作为首版必要功能。

## 状态设计

| 状态 | 展示文案 | 视觉建议 |
|---|---|---|
| `running` | 子 Agent 正在处理：{任务标题} | loading 图标，弱强调 |
| `completed` | 委派子 Agent：{任务标题} · 已完成 · {耗时} · 修改 {文件数} 个文件 | Sparkles 图标，成功色点 |
| `error` | 子 Agent 执行失败，主 Agent 已继续处理 | 错误色点，展开显示原因 |
| `aborted` | 子 Agent 已取消 | 中性色点，展开显示取消原因 |
| `timeout` | 子 Agent 超时未完成 | 警告色点，展开显示超时信息 |

状态判定建议：

- 工具调用仍在进行时使用 `running`。
- `details.success === true` 时使用 `completed`。
- `details.success === false` 且 `content` 或 `details.error` 包含 `timed out` 时使用 `timeout`。
- `details.success === false` 且包含 `aborted` 时使用 `aborted`。
- 其他失败统一使用 `error`。

实现校正：

- 当前 `MessagePart.status` 仍只包含 `running`、`completed`、`error`、`awaiting-approval`，不新增 `timeout` 或 `aborted` 协议状态。
- `timeout` / `aborted` 作为展示状态，从 `details.success`、`details.error`、`content` 和工具调用状态共同推断。

## 前端实现建议

### 识别方式

在现有执行过程组件中通过工具名识别：

```text
toolName === "delegateTask"
```

识别后进入子 Agent 专用展示分支，不再走普通工具的“执行命令”或“工具操作”标签。

### 数据来源

优先读取 `MessagePart.result.details`；如果事件流已经把 details 展平，也兼容直接从 `MessagePart.result` 读取：

| 字段 | 类型 | 用途 |
|---|---|---|
| `success` | `boolean` | 判断最终状态 |
| `content` | `string` | 展开态摘要 |
| `files` | `FileChange[]` | 展示文件变更列表和文件数 |
| `durationMs` | `number` | 展示耗时 |

入参使用 `parameters.task` 和 `parameters.context`：

| 字段 | 用途 |
|---|---|
| `task` | 折叠态标题、展开态“委派任务” |
| `context` | 展开态补充说明，可为空 |

当 `details` 缺失时，退化策略：

- 标题仍显示“委派子 Agent”
- 展开态显示原始入参和原始结果
- 不展示文件数和耗时

### 组件建议

首版可以在现有组件内做轻量分支：

- `assistant-message.tsx`：将 `delegateTask` 识别为独立工具类型，执行过程标题显示“子 Agent”
- `tool.tsx`：备用路径中继续显示“委派子 Agent”和 Sparkles 图标
- 后续若展示逻辑变复杂，再抽出 `SubagentTaskCard` 组件

## 交互文案示例

### 折叠态

```text
委派子 Agent：整理重复广场页面 · 已完成 · 23s · 修改 8 个文件
```

### 运行中

```text
子 Agent 正在处理：检查重复页面
```

### 成功展开态

```text
子 Agent 已完成

任务：检查所有广场页面副本并整理重复项
耗时：23s

结果：
发现 13 个重复页面，已保留 2 个主版本并更新页面清单。
```

### 失败展开态

```text
子 Agent 执行失败

任务：检查所有广场页面副本并整理重复项
原因：Subagent timed out

主 Agent 已继续接管当前任务。
```

## 数据与协议假设

1. 复用现有 `delegateTask` 工具结果结构：
   - `success: boolean`
   - `content: string`
   - `files?: FileChange[]`
   - `durationMs: number`
2. 前端兼容 `result.details` 与直接 details 两种包装形态。
3. 不新增 WebSocket 协议。
4. 不新增外部 HTTP API。
5. 文件变更继续合并到现有 `files` 结果流。
6. 首版不要求展示子 Agent 内部思考或每个子工具调用。

## 测试计划

后续实现 UI 时建议补充以下测试：

1. `delegateTask` 运行中展示为“委派子 Agent”，并显示任务标题。
2. 成功结果展示摘要、耗时和文件变更数量。
3. 失败结果展示错误状态和失败原因。
4. 超时结果展示“超时未完成”。
5. `details` 缺失时退化为可读的普通结果展示。
6. 普通工具展示不受影响，仍按读取文件、编辑文件、执行命令等原逻辑渲染。

## 实施边界

本方案只定义聊天界面展示方式，不改变以下内容：

- `delegateTask` 后端执行逻辑
- 子 Agent 工具集与权限边界
- WebSocket / HTTP 协议
- 文件变更汇总机制
- 主 Agent 最终回复策略

## 后续扩展

如果后续需要更强可观测性，可在不改变主聊天流的前提下增加“查看子 Agent 详情”：

- 展示子 Agent 内部工具调用时间线
- 展示子 Agent 内部文件读写列表
- 展示子 Agent 日志摘要
- 支持多个子 Agent 并行任务的分组展示

这些能力应作为增强项逐步引入，不影响首版“任务块 + 摘要 + 文件变更”的核心体验。
