# AI 对话与 Agent：运行时基座选型评估

> 状态：远期规划  
> 更新日期：2026-08-20  
> 范围：在不计重构成本的前提下，比较继续深度定制 Pi Agent 与以 DeepSeek Harness（DSH）替换 Agent Runtime 基座。

## 结论

若以长期架构能力为首要目标，选择 **DeepSeek Harness 作为 Agent Runtime 基座**。Workbench 不应直接修改或 fork Harness core；现有项目、协同、预览、知识库和安全能力应作为领域插件接入。

该结论不等同于“立即迁移”。DeepSeek Harness 当前仍处于 developer preview，官方明确声明可能发生破坏性兼容变更。在需要近期稳定交付时，现有 Pi Agent 实现仍是更稳妥的运行时。

## 现状与判断依据

当前 `@workbench/agent-service` 已不是 Pi Agent 的轻量封装，而是产品级编排层：

- `PiAgentBackend` 负责模型配置、动态系统提示词、预装 Skill、工具集装配、Harness hook、上下文压缩与单次安全恢复。
- WebSocket 层将底层事件映射为前端稳定消费的流式文本、思考、工具、计划、审批、文件变更和终态事件。
- live Workspace 通过 `WorkspaceMutationAuthority` 作为唯一持久写者，提供串行队列、expected hash、journal、receipt、启动恢复和 drift fail-closed。
- 工具、计划审批、敏感操作确认、图片/预览/知识库/页面等能力均为 Workbench 的领域实现。

因此，选型对象不应只是“哪个模型循环更强”，而是“哪个 Runtime 更适合承载可替换能力、会话事实、权限策略和多运行面”。

## 对比

| 维度 | Pi Agent + Workbench 定制 | DeepSeek Harness |
| --- | --- | --- |
| Agent loop 与工具调用 | 简洁，当前已充分接入 | `agent` / `agent-loop` / `tools` 独立插件，替换边界更清晰 |
| 会话与回放 | Pi session 是进程内状态；Workbench 以 checkpoint 与 run log 补偿 | append-only durable session event log，回放、fork、resume、转录与 telemetry 同源 |
| 能力扩展 | 工具、hook、skill 和服务层自行组合 | 模型、工具、FS、shell、sandbox、subagent 等为可替换 capability seam |
| 权限与后台工作 | 主要是 Workbench 业务层负责 | policy / approval / sandbox / jobs 是一等扩展面 |
| 多运行面 | Workbench 的 Fastify、WebSocket、HTTP fallback | Web、headless、ACP、Python SDK 等原生运行面 |
| 当前稳定性 | 已经针对 Workbench 行为验证 | developer preview；API、配置和磁盘格式没有稳定承诺 |
| 长期平台化上限 | 继续增加自定义运行时治理 | 配置化组合与插件生命周期更契合平台化需求 |

## 推荐目标形态

```text
Workbench 领域插件
├── Workspace Mutation Authority（唯一持久写者）
├── 项目、协同、预览、知识库、图片与页面能力
├── 业务审批、前端 WebSocket 事件适配与终态语义
└── 诊断、checkpoint、审计与产品级恢复策略
          ↓
DeepSeek Harness Runtime
├── durable session event log 与 agent loop
├── model、tool、FS、shell、sandbox providers
├── policy、subagent、jobs
└── profile、bundle、patch 组合
```

## 不可替代的 Workbench 契约

迁移到任何 Runtime 都不得弱化以下约束：

1. live Workspace 的文件持久化只能通过 `WorkspaceMutationAuthority`；Agent 工具不能绕过 receipt 和 mutation queue 直接写入。
2. 前端协议保持领域稳定：底层 Runtime 事件必须适配为现有的工具、计划、审批、文件变更、取消与终态语义。
3. 有副作用的工具执行后不得盲目重放整轮请求；取消完成前不得把 Agent 提前标记为可复用。
4. 模型、外部授权、动态上下文、预装 Skill 与页面/项目范围权限必须继续按会话隔离。
5. 领域工具（预览、图片、知识库、协同、项目页面）由 Workbench 插件维护，不以 Runtime 默认工具替换业务规则。

## 采用 Harness 的准入条件

在实际启动迁移前，应确认：

- Harness 发布稳定版本或提供可接受的升级与兼容策略。
- 可用插件实现受管文件写入，且能把 Authority receipt 作为唯一文件变更事实。
- 工具审批支持异步挂起、恢复、超时拒绝及不可绕过的最终拒绝策略。
- durable session log 可容纳 Workbench 的消息、工具、审批、计划、附件与前端回放需求。
- 能将所有运行时事件无损适配到 Workbench WebSocket 事件契约。
- 对 profile、bundle、patch 与插件版本建立锁定、升级验证和回滚机制。

## 已知风险

- DSH 目前为 developer preview，不能将 session 格式、Cordis 配置或 SDK 行为作为稳定外部契约。
- 全插件化带来更高的架构弹性，也要求团队掌握 Cordis 生命周期、配置层覆盖和 provider 隔离。
- 当前子 Agent 文档与实现存在漂移：文档仍描述子 Agent 可写工作区，但 live Workspace 已禁止裸 `delegateTask` 写入，直到接入受管写工具、actor identity 与 receipt 汇总。后续应以实现约束为准并修正文档。

## 关键证据

- 当前 Pi Agent 装配与 hook：`packages/agent-service/src/backends/pi-agent.ts`
- 运行时 WS 协议适配：`packages/agent-service/src/routes/websocket.ts`、`packages/agent-service/src/routes/ws-event-router.ts`
- 受管写入与恢复：`packages/agent-service/src/workspace/workspace-mutation-authority.ts`
- 当前 Agent 架构：`docs/项目文档/独立Agent服务层/01-架构设计.md`
- DeepSeek Harness 架构与稳定性声明：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>、<https://github.com/deepseek-ai/deepseek-harness#developer-preview>
