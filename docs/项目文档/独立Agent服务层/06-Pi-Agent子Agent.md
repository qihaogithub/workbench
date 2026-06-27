---
covers:
  - packages/agent-service/src/backends/pi-agent.ts
  - packages/agent-service/src/backends/pi-tools/index.ts
  - packages/agent-service/src/backends/pi-tools/subagent-tool.ts
  - packages/agent-service/src/core/types.ts
  - packages/agent-service/src/utils/config.ts
---

# Pi Agent 子 Agent

> 更新日期：2026-06-27

## 一、定位

Pi Agent 子 Agent 是主 Agent 的内部委派能力。它不新增 HTTP 或 WebSocket 接口，而是作为 `delegateTask` 工具出现在主 Agent 的工具集中。主 Agent 遇到可以拆分的独立任务时，可以把任务交给一个短生命周期的子 Agent，子 Agent 完成后只把结果、耗时和文件变更汇总回主 Agent。

## 二、协作关系

主 Agent 和子 Agent 共享同一个工作空间、模型配置、API Key 解析方式、工具权限和预装 Skills。差异在于子 Agent 创建工具集时会禁用 `delegateTask`，避免子 Agent 继续创建新的子 Agent。

运行时协作流程如下：

1. 主 Agent 调用一个或多个 `delegateTask`，传入任务说明和可选上下文。
2. `delegateTask` 按并行工具执行模式交给 `PiAgentBackend`，每个委派任务都会创建独立的 `AgentHarness`、执行环境和内存会话。
3. 子 Agent 使用与主 Agent 相同的 Workbench 工具执行任务，但没有委派工具。
4. 子 Agent 结束后，backend 提取文本结果，并把该子 Agent 本次新增的文件变更写回父会话的 `files` 列表。
5. 前端按工具调用展示 `delegateTask`。单个子 Agent 完成只表示委派任务已返回；整轮 AI 回复仍需等待主 Agent 汇总和验收。

## 三、权限与变更边界

子 Agent 可以读写允许范围内的工作空间文件，但仍受现有权限系统约束：

- 路径访问继续走工作空间白名单、黑名单和越界检查。
- 知识库文件只允许读取，不允许由 Agent 写入。
- 修改 `config.schema.json` 仍受工作空间路径权限和 L2 配置规则约束。
- `deletePage` 和 `deletePages` 继续复用现有权限确认流程。
- 预装 Skill 只能通过 `readPreinstalledSkill` 读取，不写入工作空间，也不扩大文件工具白名单。

文件变更收集由 `PiAgentBackend` 统一处理。主 Agent 和子 Agent 的 `writeFile`、`editFile`、`deletePage`、`deletePages` 工具结果都会进入同一套变更汇总逻辑，因此 `/files` 查询和消息完成结果可以看到子 Agent 产生的变更。

多个子 Agent 并行运行时，每个子 Agent 会本地记录自己的文件变更，再合并进父会话。任务拆分仍应避免多个子 Agent 同时写同一个文件；如果确实需要修改统一索引或排序，建议由主 Agent 在所有子 Agent 返回后集中收尾。

## 四、生命周期

子 Agent 是一次性资源。每次委派都会创建独立 harness 和内存 session，执行完成、超时、取消或失败后立即清理。多个委派任务可以在同一轮中并行存在；主请求取消或 backend 销毁时，所有仍在运行的子 Agent 会被中止。

可配置项：

| 配置 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PI_AGENT_SUBAGENTS_ENABLED` | `true` | 是否向主 Agent 注册 `delegateTask` 工具 |
| `PI_AGENT_SUBAGENT_TIMEOUT` | `120000` | 单次子 Agent 任务超时时间，单位毫秒 |

前端状态展示区分两个层级：“待主 Agent 汇总”表示某个子 Agent 已返回但主 Agent 仍在继续处理；“已完成”表示整轮消息已经结束后，该委派任务随消息一起归档。
