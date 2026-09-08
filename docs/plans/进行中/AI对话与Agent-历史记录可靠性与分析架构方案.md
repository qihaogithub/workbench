# AI 对话与 Agent：历史记录可靠性与分析架构方案

> 状态：代码、治理与聚合看板实施完成，待用户端到端验收与旧测试数据处置决策
> 创建日期：2026-09-07
> 决策日期：2026-09-07
> 适用范围：创作端 AI 对话、Agent Service 会话恢复、运行日志、诊断事件与产品分析
> 本文性质：架构、实施与验收跟踪

## 一、执行摘要

当前历史记录架构存在明确缺陷，不建议按现状上线。

“测试环境偶发历史没有正确保存”的可靠根因是：**系统没有服务端权威的、可确认的、幂等的消息提交协议**。具体表现为：

1. 客户端从多个时机异步提交整份消息数组，服务端无 revision/CAS 直接覆盖文件，旧快照晚到时可以覆盖新快照。
2. 客户端不检查 `response.ok`，401、403、404、413、500 等响应会被当作保存成功。
3. 页面隐藏、卸载、会话切换、错误和取消等路径依赖 fire-and-forget 的普通 `fetch`，无持久待同步队列、有界重试和用户可见的失败状态。

代码足以证明上述失效机制存在，本地样本也证明了运行账本与 UI 消息文件已经分叉；但当前没有消息保存 request/revision/ACK 诊断，因此不能追溯该样本究竟是请求未发送、被中止、非 2xx 被吞掉，还是发生了旧快照覆盖。本文不把这些可能性中的某一个写成“已证实的单一直接触发点”。

推荐目标架构是：

> **author-site 单一归属的 SQLite 关系消息账本 + 单条幂等命令 + Agent 可重建上下文 + transactional outbox + 独立脱敏分析投影。**

该方案符合当前单实例、局域网、低并发部署边界；暂不引入 PostgreSQL、Kafka、ClickHouse 或完整 Event Sourcing。通过 repository 边界保留未来迁移 PostgreSQL 的能力，但不为尚未出现的规模付出当前复杂度。

## 二、背景与目标

### 2.1 背景

当前同一次 AI 对话的信息分散在四个不同边界：

- author-site 中的 `.messages.json`，用于 UI 历史显示；
- agent-service 中 Pi Agent 的进程内 session repo，用于当前 Agent 上下文；
- agent-service 的进程内 canonical checkpoint `Map`，用于有限的重建；
- run log 与 editor diagnostics，用于短期故障排查。

这四者没有共享一个可持久、有顺序、可校验的业务真值。结果是：

- UI 能看到的历史可能少于实际运行过的轮次；
- agent-service 重启或 Harness 重建后，即使 UI 历史存在，Agent 也可能“不记得”；
- 诊断日志和产品分析缺少可信的消息、run 与持久化关联键；
- 未来若直接基于原始消息文件做分析，会将业务存储、诊断和隐私授权混在一起。

### 2.2 目标

1. 服务端已 ACK 的消息在刷新、断线重连和 Agent 重启后均可恢复。
2. 同一消息重试不产生重复记录，乱序请求不能覆盖更新状态。
3. 每个 run 都有明确终态：`completed`、`failed`、`cancelled` 或 `interrupted`。
4. 对话账本成为 UI 恢复、用户导出/删除和 Agent 上下文重建的唯一权威来源。
5. 诊断、产品分析与原始对话分层，分析默认不保存完整 prompt/reply。
6. 保持当前小规模部署的运维简单度，并为未来多实例存储预留清晰替换边界。

### 2.3 非目标

- 不把每个 token delta 或模型思考过程长期保存为业务事件。
- 不用 run log 或 diagnostics 取代用户历史账本。
- 不尝试对 author-site、agent-service 和模型供应商做分布式事务。
- 不在未授权的情况下把原始对话正文用于质量抽样或人工审阅。
- 不为测试环境旧格式长期保留双读、双写兼容层。

## 三、复查方法与证据分级

### 3.1 复查方法

本次复查同时检查了：

- 客户端消息状态、各保存触发点和 HTTP 处理；
- author-site 消息 API、Session 归属验证、保留期和会话数量限制；
- agent-service 的 session store、checkpoint、WebSocket 重建和 run log；
- AI 对话、运行日志、诊断事件和部署项目文档；
- `data/sessions` 中的现存消息文件和对应 run log；
- 结构化诊断 CLI 的完整性状态；
- 现有定向单元测试的覆盖边界。

本次未完成真实浏览器强制关闭、网络中断、乱序响应和进程中途 kill 的故障注入；这些已列入实施验收矩阵。

### 3.2 证据级别

| 级别 | 含义 | 本文用法 |
| :--- | :--- | :--- |
| A：已证实 | 源码或实际数据能直接证明 | 可作为整改依据 |
| B：高置信机制 | 源码证明失效窗口存在，但无样本级关联证据 | 要求修复并补故障注入测试，不声称已在样本中发生 |
| C：理论风险 | 架构上可能，现有样本不支持已发生 | 作为韧性工作，不归因当前故障 |
| D：已排除 | 与当前主路径代码不符 | 从根因列表中删除 |

## 四、当前架构和事实源

```text
创作端 React 消息数组
  └─ 多个触发点提交整份快照
       └─ author-site POST /api/sessions/:id/messages
            └─ 直接覆盖 .messages.json       ← UI 历史

浏览器 WebSocket
  └─ agent-service / Pi Agent
       ├─ InMemorySessionRepo                  ← 当前轮上下文
       ├─ ConversationCheckpointStore(Map)    ← 可选内存 checkpoint
       └─ agent-run-logs/*.jsonl              ← 短期运行诊断

editor-diagnostics SQLite / JSONL fallback              ← 短期诊断，非业务真值
viewer-site localStorage                                ← 使用端本地问答，不跨设备
```

关键问题不是“有几份历史”，而是没有一份能同时回答以下问题的权威账本：

- 这条消息是否已由服务端确认？
- 它在会话中的稳定顺序是什么？
- 它属于哪个用户、项目和 run？
- assistant 轮次是完成、失败、取消还是中断？
- Agent 重启后应该恢复哪些内容？
- 哪些信息可以进入诊断或分析？

## 五、根因与缺陷复查

### 5.1 总体判定

| 问题 | 证据级别 | 与历史异常的关系 | 结论 |
| :--- | :--- | :--- | :--- |
| 缺少可靠消息提交协议 | A | 根因 | 没有单条幂等写、服务端顺序、ACK、失败状态和恢复队列 |
| 全量快照并发覆盖 | B | 可直接导致新消息被旧快照覆盖 | 失效窗口已证实，尚无样本级乱序请求证据 |
| 非 2xx 被当作成功 | A | 可造成静默丢失 | `fetch` 后未检查 `response.ok` |
| 页面生命周期 fire-and-forget | B | 可造成隐藏/卸载/切换路径未提交 | 普通 `fetch` 不是持久化保证 |
| 直接 `writeFileSync` 非崩溃原子 | C | 可留下截断 JSON | 现有抽样文件均可解析，未证明已发生 |
| 每次保存重写 timestamp | A | 破坏顺序、活动时间和分析语义 | 时间戳不是消息的原始创建时间 |
| 长期保存巨大 `parts/tools/result` | A | 放大请求体、代理限制、写入和竞态窗口 | 样本单份历史已达 2,334,486 字节 |
| Agent session/checkpoint 只在内存 | A | 导致“UI 有历史但 Agent 不记得” | 独立于 `.messages.json` 保存失败 |
| messages API 缺少 owner 校验 | A | 不是丢失根因，但是上线阻断级安全问题 | 仅验证登录和 session 存在，未校验 `meta.userId` |
| 项目默认最多 5 个 Session，超限删最旧项 | A | 可被用户理解为历史丢失 | 与“当前项目下所有对话历史”的产品表述存在冲突 |
| 结构化诊断 SQLite 损坏 | A | 不证明消息丢失，但降低根因可追溯性 | CLI 报告 `database disk image is malformed`，并降级 JSONL |
| 受控模式 `messagesRef` 滞后 | D | 不是当前创作端主路径根因 | `setMessages` 会同步更新 ref |
| 2 小时编辑租约导致 7 天历史清理 | D | 不是根因 | 代码已将租约与历史保留期分离 |

### 5.2 现存数据样本

抽查会话 `session-1788510391654-9asf6us4u`，不读取或记录其对话正文，仅比较结构元数据：

- run log 中存在 3 次 run：前两次为 finish，第三次为 cancel 后 finish；
- `.messages.json` 只有 4 条消息，即 2 组 user/assistant；
- 第三次取消运行没有在消息文件中留下 user 消息或 assistant 取消终态；
- 消息文件大小为 2,334,486 字节，两条 assistant 的 `parts` 序列化后分别约 1.16 MB 和 1.14 MB；
- 文件可正常解析，因此不能用该样本证明非原子写已经造成截断；
- 诊断事件没有持久化请求开始、成功、失败、revision 和最终文件版本，因此不能对第三次 run 的直接失效路径作唯一归因。

样本结论：**运行账本与 UI 历史已分叉，且当前诊断无法解释分叉发生在哪个提交步骤。**

### 5.3 对旧结论的明确纠偏

以下表述不应再作为当前根因结论：

- “创作端 `setMessages` 后立即读取了旧 `messagesRef`”：当前受控模式实现会先同步赋值 `messagesRef.current`，再通知外部状态。
- “样本中第三次运行确定被并发旧快照覆盖”：现有数据只能证明没有进入消息文件，不能区分未发送、中止、非 2xx 或乱序覆盖。
- “直接文件写已经导致样本 JSON 损坏”：现有抽样文件均可解析，它是结构性风险，不是已观察事实。

## 六、数据分层与责任边界

用户历史、Agent 运行、诊断和分析必须分层：

| 数据层 | 主要用途 | 是否业务真值 | 默认内容 | 建议保留策略 |
| :--- | :--- | :--- | :--- | :--- |
| Conversation ledger | UI 恢复、导出、删除、Agent 上下文重建 | 是 | 用户消息、assistant 终态、有界显示 parts、附件引用 | 按产品历史策略；当前文档基线为 7 天 |
| Run ledger | 记录每轮状态、模型、错误和用量 | 是，但不存 token 流 | run 终态、时间、错误码、摘要 | 与用户历史和审计要求协同 |
| Run artifacts/logs | 工具过程和故障深排 | 否 | 剪裁、脱敏的过程事件或大结果引用 | 短期；当前基线为 3 天 |
| Editor diagnostics | 跨编辑、协同、预览和 AI 故障时间线 | 否 | 状态、耗时、错误、revision、gap | 当前基线为 3 天 |
| Product analytics | 长期产品优化 | 否，可重建投影 | 脱敏结构化事件和聚合指标 | 可长于 7 天，需单独确定 |

关键边界：

- 服务为恢复和导出保存对话正文，不等于用户授权将正文用于产品分析。
- 分析库默认禁止写入完整 prompt、完整 reply、system prompt、密钥、token、cookie、上传文件正文和可逆的直接用户标识。
- 若未来需要原文质量抽样，必须另立显式授权、脱敏、访问审计、短期保留和删除传播流程。

## 七、目标架构决策

### 7.1 推荐方案

```text
Browser
  ├─ Conversation Command API ────────────┐
  │   先提交 user message 并获得 ACK    │
  └─ WebSocket 携带 conversation/run/message id │
                                               ▼
author-site（唯一 Conversation Store owner）
  ├─ Conversation domain service
  ├─ ConversationRepository interface
  ├─ SQLite conversation.db
  │   ├─ conversations / messages / runs / attachments
  │   └─ outbox
  ├─ Internal Run Command API ◄── agent-service
  └─ Outbox projector ─────────────────┐
                                             ▼
                            脱敏 analytics.db / 未来外部仓库

agent-service
  ├─ Pi Agent 进程内对象（缓存）
  ├─ 从权威账本读取有界上下文投影
  ├─ 幂等提交 run 终态和 assistant 消息
  └─ 短期剪裁 run log
```

### 7.2 存储选型

| 方案 | 结论 | 原因 |
| :--- | :--- | :--- |
| 文件 + CAS | 仅可作为极短期止损 | 仍需实现序列化写、revision、幂等、索引、权限、备份和分析，长期性价比低 |
| SQLite 关系账本 | **当前推荐** | 符合单实例部署；项目已有 WAL、busy timeout、事务、完整性检查和备份实践 |
| PostgreSQL | 多实例/云托管时迁移 | 当前引入会增加部署与运维成本 |
| 完整 Event Sourcing | 不推荐 | 会把 token 流、工具过程、业务消息、诊断和隐私删除绑成高复杂度重放模型 |
| Kafka/ClickHouse | 当前不引入 | 尚无吞吐、延迟或查询规模证据支持 |

SQLite 建议设置：

- 独立业务库 `data/conversations/conversation.db`，不与已可损坏的 diagnostics DB 共库；
- `journal_mode=WAL`、`foreign_keys=ON`、合理 `busy_timeout`；
- 对已 ACK 的业务数据优先保证持久性，建议 `synchronous=FULL`；
- 启动时 quick check，定期 integrity check 和在线备份；
- 数据库不健康时对新消息提交 fail closed，不用 JSONL fallback 假装业务写入成功；
- 诊断和分析可降级，业务账本不可静默降级。

### 7.3 模块边界

建议先在 author-site 建立内聚的 `conversation` domain 模块，不立即新增一个独立微服务：

```text
packages/author-site/src/lib/conversation/
  domain.ts
  repository.ts
  sqlite-repository.ts
  service.ts
  retention.ts
  context-projection.ts
  analytics-outbox.ts
```

约束：

- API route 只做身份验证、输入校验和错误映射，不直接写 SQL；
- domain service 定义幂等、状态机、保留和删除语义；
- repository 封装事务与数据库，上层不依赖 SQLite 特殊 SQL；
- author-site 是 conversation DB 的唯一 owner；agent-service 通过带服务身份的内部命令 API 读取上下文、提交 run 状态；
- 只在出现第二个真实的进程内复用方时，再评估抽取 `@workbench/conversation-core`，避免提前拆包。

## 八、领域模型与事务边界

### 8.1 建议最小表模型

#### `conversations`

- `id`
- `user_id`
- `project_id`
- `workspace_id`
- `title`
- `status`：`active | archived | deleted`
- `revision`
- `last_sequence`
- `created_at`
- `updated_at`
- `expires_at`
- `deleted_at`

#### `messages`

- `id`
- `conversation_id`
- `client_message_id`
- `sequence`
- `role`：`user | assistant`
- `kind`
- `status`：`accepted | completed | failed | cancelled | interrupted`
- `content_text`
- `display_parts_json`：仅保存有界、可向用户重现的显示摘要
- `created_at`
- `completed_at`
- `metadata_json`：版本、摘要和引用，不保存密钥/原始大工具输出

#### `runs`

- `id`
- `conversation_id`
- `user_message_id`
- `assistant_message_id`
- `status`：`queued | running | completed | failed | cancelled | interrupted`
- `model_provider`
- `model_id`
- `started_at`
- `finished_at`
- `error_code`
- `usage_json`
- `summary_json`
- `trace_id`

#### `attachments`

- `id`
- `conversation_id`
- `message_id`
- `owner_user_id`
- `storage_ref`
- `sha256`
- `mime_type`
- `size_bytes`
- `created_at`
- `deleted_at`

附件正文使用现有用户隔离文件存储或未来对象存储；数据库只保存引用、hash、大小、MIME 和 owner。

#### `run_steps`（可选，当历史 UI 必须重现工具卡片时启用）

- `id`
- `run_id`
- `ordinal`
- `tool_name`
- `tool_call_id`
- `status`
- `duration_ms`
- `error_code`
- `display_summary`
- `artifact_ref`
- `mutation_id`
- `receipt_id`

不默认保存完整工具参数和大结果；大内容放入有大小上限、权限与 TTL 的 run artifact。

#### `outbox`

- `id`
- `aggregate_type`
- `aggregate_id`
- `event_type`
- `schema_version`
- `payload_json`
- `created_at`
- `published_at`
- `attempts`
- `last_error`

### 8.2 必要约束

- `messages(id)` 主键；
- `UNIQUE(conversation_id, sequence)`；
- `UNIQUE(conversation_id, client_message_id)`；
- `runs(id)` 主键；
- `outbox(id)` 主键；
- 所有查询默认以 `conversation_id + user_id`（或未来明确的项目 ACL）作为归属边界；
- 状态机禁止终态回退到 `running`；
- 服务端创建时间只写一次，禁止全量重写时重算 timestamp。

### 8.3 用户消息事务

```text
BEGIN
  assert conversation belongs to current user / allowed member
  INSERT OR RETURN EXISTING message by client_message_id
  allocate sequence on server
  INSERT OR RETURN EXISTING run(status = queued)
  UPDATE conversation revision / last_sequence / updated_at
  INSERT outbox(message.accepted)
COMMIT

return messageId, runId, sequence, serverCreatedAt, conversationRevision
```

客户端在收到该 ACK 前将消息显示为 `pending`；收到后显示为 `synced`。Agent 运行必须携带已 ACK 的 `messageId/runId`，不用未持久的纯客户端数组作为运行起点。

### 8.4 Agent 终态事务

```text
BEGIN
  assert run is queued/running and ids match
  UPSERT assistant message by stable assistantMessageId
  UPDATE run to completed/failed/cancelled/interrupted
  UPDATE conversation revision / updated_at
  INSERT outbox(run.terminal)
COMMIT
```

约束：

- agent-service 提交终态必须幂等；
- 只有收到服务端终态提交 ACK 后，UI 才把该轮标记为已可恢复的完成状态；
- 提交失败时保持明确的“同步中/同步失败”状态并有界重试，不得吞掉；
- 进程在终态 ACK 前崩溃时，重启协调器将该 run 收敛为 `interrupted`，不伪装成功；
- token 增量只在 WebSocket/UI 和短期 run log 中流转，不按 token 写入主账本。

### 8.5 取消、失败、编辑和重发

- 取消：保留已 ACK 的 user message，run 落 `cancelled`；是否生成可见 assistant 取消占位由产品确定。
- 失败：保留 user message，run 落 `failed + error_code`；用户重试创建新 run，不覆盖旧失败记录。
- 中断：服务重启时把长期 `queued/running` 收敛为 `interrupted`，允许用户显式重试。
- 编辑/重发：不在客户端全量替换数组。服务端通过一个事务将锚点后的消息标记为 `superseded`或建立新 branch，再创建新 run。在当前 UI 只表达线性历史时，优先用 `superseded` 投影，不提前引入通用分支图。

## 九、API 与客户端协议

### 9.1 命令式 API

将现有“POST 整份 messages 数组”替换为：

- `POST /api/conversations`
- `GET /api/conversations/:id`
- `GET /api/conversations/:id/messages?afterSequence=...`
- `POST /api/conversations/:id/messages`
- `POST /api/conversations/:id/runs/:runId/cancel`
- `POST /api/conversations/:id/retry`
- `POST /api/conversations/:id/supersede`
- `PATCH /api/conversations/:id/title`
- `DELETE /api/conversations/:id`
- `GET /api/conversations/:id/export`

`POST .../messages` 最小请求：

```json
{
  "clientMessageId": "stable-client-id",
  "content": "user content",
  "attachmentIds": [],
  "expectedRevision": 12
}
```

成功响应必须包含：

```json
{
  "messageId": "server-message-id",
  "runId": "server-run-id",
  "sequence": 21,
  "serverCreatedAt": 1788750000000,
  "conversationRevision": 13
}
```

`expectedRevision` 主要用于编辑/删除/截断等会改变历史结构的命令；简单追加由 `clientMessageId` 幂等和服务端 sequence 保证，避免不必要的并发拒绝。

### 9.2 客户端状态

消息显示状态建议为：

```text
local_pending → accepted → running → completed
      └─ sync_failed             ├─ failed
                                  ├─ cancelled
                                  └─ interrupted
```

建议使用小型 IndexedDB outbox 保存尚未收到 ACK 的用户命令，支持刷新后重试。这只是“未 ACK 命令”的输送缓冲，不是历史真值。`keepalive`、`sendBeacon` 或 `visibilitychange` 可以作为最后一程优化，但不得成为正确性边界。

### 9.3 身份与权限

- 每个外部 API 必须在查询条件中验证 owner，不先全局查 conversation/session 再遗漏归属判断；
- agent-service 内部命令需服务身份、最小权限和稳定 run/message id，不信任浏览器直接传入的 userId；
- 当前系统只有全局管理员/编辑者角色，没有完整的项目成员 ACL。在协作可见性决策前，历史默认按 owner 隔离，不把共享 live workspace 解释成共享个人对话。
- 管理员默认只看聚合指标和脱敏诊断；原文支持访问建议使用 break-glass，要求理由、授权、审计和自动过期。

## 十、Agent 上下文恢复

Agent 进程内对象只视为可丢弃缓存。新建、重连或重启 Agent 时：

1. 从 conversation store 读取按 sequence 排序的最近已确认消息；
2. 读取最近一次有效上下文压缩摘要，如果不存在则按预算现场生成；
3. 只投影模型所需的用户/assistant 内容、稳定附件引用和必要 mutation receipt；
4. 按 sequence 重建 Pi Agent history；
5. 记录 `agent.context_restore_started/succeeded/failed`，包含 conversation revision、message count、summary version 和耗时，不包含正文；
6. 将遗留 `queued/running` run 收敛为 `interrupted`。

现有 canonical checkpoint 可以保留为可重建的性能缓存，但不再作为第二个历史真值。其内容必须标记来自哪个 conversation revision，版本不匹配时直接丢弃并重建。

## 十一、分析架构与隐私设计

### 11.1 Transactional outbox

业务状态变更与 outbox 事件在同一 SQLite 事务中写入。投影 worker 异步、至少一次地消费 outbox，以 `event_id` 幂等写入独立的派生 `analytics.db` 或未来外部仓库。

这个边界解决两个问题：

- 业务消息成功但分析事件丢失：outbox 可重试；
- 分析系统故障影响用户对话：投影异步，分析可降级，主账本不降级。

### 11.2 建议产品事件

- `conversation.created/archived/deleted`
- `message.accepted`
- `run.started/completed/failed/cancelled/interrupted`
- `history.load_succeeded/failed`
- `agent.context_restore_succeeded/failed`
- `message.sync_retried/exhausted`
- `tool.completed/failed`（仅工具类别、耗时和错误码）
- `mutation.committed/conflicted/rolled_back`
- `preview.applied/failed`
- `retention.deleted`
- `export.completed`

### 11.3 建议核心指标

- 用户消息 ACK 成功率和 P50/P95/P99 延迟；
- 已 ACK 消息重载恢复成功率；
- run 终态完整率与超时未收敛数；
- Agent 上下文恢复成功率、恢复消息数和耗时；
- 非 2xx、网络错误、幂等重放和 revision 冲突比率；
- completed/failed/cancelled/interrupted 分布；
- 模型、能力集版本、context overflow 和工具类别失败率；
- mutation commit/conflict/rollback 与 preview apply/fail 比率；
- 导出、删除和保留清理成功率；
- 诊断 completeness：SQLite 可用性、JSONL fallback、event gap 和 warning。

### 11.4 原文质量分析

默认方案不依赖完整对话正文，因此用户历史 7 天保留与长期产品趋势分析不冲突。

若要分析“回答质量”而不仅是成功率/耗时，应将其设计为独立的授权抽样产品，至少包含：

- 默认关闭或明确的选择加入策略；
- 上传前 PII/密钥/路径/文件内容脱敏；
- 独立短保留期；
- 访问理由、授权审批和完整审计；
- 用户删除的传播和备份延迟说明；
- 不与默认产品分析表混存。

## 十二、迁移与实施阶段

项目尚未上线，不建立长期兼容层或双写。优先直接切换到新账本；只有当实施必须跨多个暂时可部署版本时，才做文件止损。

### 阶段 0：上线阻断项止损

- [x] messages/meta/files/assets 等 Session 子资源 API 统一严格 owner 校验，owner 缺失时 fail closed，并补用户 A/B 隔离测试。
- [x] 移除 `persistMessages` 旧全量快照写入；新命令客户端严格检查 HTTP/响应包并区分可重试错误。
- [x] 为新单条命令持久化增加 request/operation ID、conversation/session ID、client/server revision、HTTP status、payload bytes 和耗时的脱敏诊断。
- [x] 停止每次保存重算消息 timestamp，改由服务端生成序号、revision 和时间。
- [x] 定义取消/失败轮次的用户可见历史语义：已 ACK user 消息保留，cancelled run 不新增 assistant 占位。
- [x] 修复 diagnostics SQLite 损坏处理：隔离原库/WAL/SHM 证据后重建，并持续报告 gap/warning；不把 fallback 当作消息业务存储。

如果阶段 1 不能在下一个可部署版本完成，临时再增加：服务端按 session 串行、revision/CAS、临时文件 + fsync + rename、消息体积上限和失败显示。该过渡层必须在数据库切换后删除。

### 阶段 1：权威 Conversation Ledger

- [x] 建立 conversation domain service、repository interface 和 SQLite schema。
- [x] 实现 conversations/messages/runs/attachments/outbox 事务。
- [x] 附件上传绑定 Session 服务端授权与 owner/conversation，`attachmentIds` 随浏览器 outbox 持久化；消息接收先校验物理 manifest 归属，再与 message/run/outbox 原子提交。
- [x] 拆分实时附件展示 part 与账本 part；图片 base64/data URL 只存在当前内存气泡和 Agent 本轮传输，不进入 IndexedDB outbox、Conversation Command POST、SQLite 账本或导出。
- [x] 实现单条消息命令、幂等键、服务端 sequence 和 revision。
- [x] 实现列表、增量读取、标题、删除和导出。
- [x] 将巨大工具输出从 `display_parts_json` 外置到有界 run artifact。
- [x] 客户端以 accepted ACK 为 Agent 执行门禁，并删除全量快照写入。
- [x] 建立未 ACK 命令 IndexedDB outbox，等待事务提交后再投递，按对话有序重放，对可重试错误做三次有界退避并在耗尽后保留命令；恢复重放补记 user 后立即取消未启动 queued run，避免静默执行过期指令。

### 阶段 2：Agent 恢复与终态收敛

- [x] WebSocket 运行携带已持久的 conversationId/messageId/runId/assistantMessageId。
- [x] agent-service 通过共享内部 token 读取有界上下文投影，不信任浏览器提供的 owner/project。
- [x] 完成/失败/取消在向 UI 发送最终确认前幂等提交终态。
- [x] 启动协调器将遗留 running 收敛为 interrupted；有持久取消意图时收敛为 cancelled。
- [x] checkpoint 改为带 conversation revision 的可重建缓存。
- [x] 增加上下文压缩摘要的版本化与重建测试。
- [x] 删除浏览器消息数组 `resync_history` 协议；编辑重发、重新生成和回滚统一通过账本 `supersede/retry` 与 revision 驱动。

### 阶段 3：分析投影与数据治理

- [x] 实现 outbox worker，按 eventId 幂等投影到独立 analytics store。
- [x] 建立指标 schema/version，不将原始正文加入默认事件。
- [x] 建立 allowlist 投影、HMAC 去标识和禁止原文的测试。
- [x] 建立删除 tombstone、投影去标识化和导出一致性测试。
- [x] 建立持久化成功率、终态完整率、恢复成功率和诊断 gap 看板。

### 阶段 4：一次性迁移和旧路径删除

- [x] 对现有 `.session.json/.messages.json` 与 `.ai-attachments` 生成只读盘点报告，标记无效 JSON、重复 ID、无效 timestamp、大记录，以及附件 manifest 的 owner/conversation 归属缺口。
- [ ] 由业务决定测试数据是导入、归档还是清空；不默认把不可信时间戳包装成精确时间。
- [x] 提供默认 dry-run 的可恢复归档工具；只有显式 `--apply` 才复制旧对话/附件，逐文件校验 SHA-256 并写入归档 manifest，不删除源数据。
- [x] 提供只读归档验证器，独立复核 manifest schema、目录边界、普通文件类型、文件集合、大小和 SHA-256；篡改或未声明文件必须使验证失败。
- [ ] 如需导入，对时间来源标记 `legacy_stored | run_log_derived | estimated`。
- [x] 切换读写后删除 `.messages.json` 快照函数及全部调用，不长期双写；旧 POST 端点固定返回 410。
- [ ] 通过验收窗口后删除旧运行时读路径和临时 CAS 过渡层。
- [x] 更新 `docs/项目文档/` 中 AI 对话需求、对话账本/恢复技术文档、运行日志和模块索引。

当前旧 `.messages.json` 只在 Session/Workspace 保留期清理中作为存量数据的最后活动时间兼容输入；UI 列表、切换、导出、删除和 Agent 恢复均已切换到账本。旧附件 manifest 没有 owner/conversation 归属时也会 fail closed，不会被新「聊天文件」接口默认暴露。当前 18 个旧附件在 34 条存量消息中没有可检测的 `attachmentId` 引用，无法从当前业务记录安全推导对话归属；因此不建议自动导入，优先选择可恢复归档或确认后清空。在业务作出选择后，再删除两处 `.messages.json` 存量兼容读取，并对旧附件做同步处置。

## 十三、验证矩阵与验收标准

### 13.1 故障注入矩阵

| 场景 | 注入条件 | 必须断言 |
| :--- | :--- | :--- |
| 受控 ref 回归 | `setMessages(next)` 后立即读 ref | ref 等于 next，防止已排除假设未来真的回归 |
| 非 2xx | 返回 401/403/404/413/500 | 命令进入失败/待重试，诊断含 status，不标记 ACK |
| 网络异常 | fetch reject/断网 | 有界重试或留在 IndexedDB outbox，不静默成功 |
| 乱序响应 | 旧命令延迟，新命令先完成 | 单条追加不被覆盖；结构命令被 revision 拒绝或重基 |
| 多入口并发 | 首次保存、throttle、finish 同时触发 | 无全量快照覆盖，最终账本完整 |
| 页面隐藏/卸载 | 命令未完成即隐藏或关闭 | 未 ACK 命令可重试；已 ACK 数据可恢复 |
| 取消 | user 已 ACK 后 Agent 取消 | user 保留，run 终态为 cancelled，符合产品语义 |
| 业务 DB 不可用 | 锁超时/损坏/盘满 | 新消息 fail closed 且用户可见，不写入假 fallback |
| Agent 进程崩溃 | 终态 ACK 前 kill | run 最终收敛为 interrupted，已 ACK user 消息不丢 |
| Agent 重启恢复 | 重启后继续对话 | 从权威账本重建，不依赖内存 Map |
| 幂等重放 | 同 `clientMessageId` 重试 N 次 | 只有一条 message 和一个初始 run，返回相同 ACK |
| 权限隔离 | 用户 A 读写用户 B conversation | GET/POST/PATCH/DELETE/export 均拒绝 |
| 导出与删除 | 导出后删除 | 导出与 UI 一致；删除后 API、附件、索引不可取正文 |
| 保留清理 | 边界时间和活跃更新 | 只删过期项，不误删保留期内对话 |
| Outbox 重试 | projector 中断或重复消费 | 业务账本不受影响，分析投影幂等 |
| 分析隐私 | 各类消息/附件/工具输入 | 事件不含完整正文、密钥、token、cookie 和上传文件正文 |

### 13.2 可量化验收

- [ ] 已获得服务端 ACK 的用户消息，在重载、断线重连和 Agent 重启测试中 100% 可恢复。
- [x] 同一 `clientMessageId` 在 repository 重放测试中不产生重复记录。
- [ ] 所有 run 在完成、失败、取消或重启协调后进入明确终态，没有超出阈值的长期 running。
- [ ] 乱序、多标签页和多触发点压测不能使新 sequence 消息消失。
- [ ] 导出与 UI 投影一致，删除后正文和附件不可通过外部 API 重新获取。
- [ ] 诊断查询明确返回 SQLite/fallback/gap/warning 完整性，不把“无记录”解释成“未发生”。
- [x] 默认产品分析负载通过 allowlist、去标识和幂等投影测试。

## 十四、产品、隐私与运维决策

| 决策项 | 已批准结论 | 实施边界 |
| :--- | :--- | :--- |
| 7 天历史与删除 | 按最后活动时间保留 7 天，到期或手动删除后从活跃存储硬删除 | 正文、附件、索引和待投影 outbox 同步清理；live Workspace 不随对话删除；备份只保留有界轮换窗口 |
| 项目默认 5 个 Session 上限 | 取消超限硬删 | 7 天保留期内的第 6 个及以后对话仍可列出、切换、导出和删除 |
| 取消轮次的 UI 表达 | 保留已 ACK 的 user 消息和 `cancelled` run，不新增 assistant 取消占位 | 未来新增可见占位需另行产品/体验决策 |
| 脱敏产品分析 | 建设 transactional outbox 与去标识化投影能力，默认不启用长期采集 | 启用前必须另行批准保留期、访问角色和治理规则；投影中禁止原文和可逆用户标识 |
| 原始 prompt/reply 质量抽样 | 不授权 | 不实现、不采集；如需则另立选择加入与访问审计方案 |
| 协作成员的对话可见性 | 仅 conversation owner 可见 | Workspace 共享不推导对话共享；他人不得列出、读取、导出或删除 |
| 管理员原文访问 | 不授权 | 不新增原文管理入口或 break-glass；如需则另立项决策 |
| 未来切换 PostgreSQL | 当前不实施 | 仅保留 repository 替换边界；出现多 author-site 写实例、独立存储服务、云高可用或 SQLite 竞争/容量指标达阈值时重新决策 |

## 十五、不应采用的方案

- 继续把客户端整份消息数组当成唯一真值并定时覆盖。
- 用 `keepalive`、`sendBeacon` 或更频繁的自动保存代替幂等 ACK 协议。
- 让 author-site 和 agent-service 各自保持一份可写的“真历史”。
- 把已损坏过的 diagnostics DB 扩展成用户消息业务库。
- 把日志、checkpoint 或 localStorage 当成权威恢复源。
- 按 token 或每个工具更新长期落库，然后用事件重放生成基本聊天界面。
- 为“以后也许需要”提前部署 Kafka、ClickHouse 或新微服务。
- 长期维护 `.messages.json` 和数据库双写/双读兼容。
- 默认将完整对话正文发送到分析库。

## 十六、本次复查进度与证据

### 16.1 已完成

- [x] 复查客户端保存入口、状态 ref 与错误处理。
- [x] 复查 messages API 写入语义和与 Session API 的归属校验差异。
- [x] 复查 Agent session/checkpoint 生命周期和 WebSocket 重建语义。
- [x] 检查现存 `.messages.json` 的 JSON 可解析性与样本大小。
- [x] 对比指定会话的消息数与 run 数，确认账本分叉。
- [x] 运行结构化诊断 CLI，确认 SQLite 损坏、JSONL fallback 和 event gap。
- [x] 执行现有 message-service 与 checkpoint 定向单元测试。
- [x] 完成产品边界、反证审计和工程架构二次复查。
- [x] 纠正 `messagesRef` 和“样本确定由并发覆盖”的过强归因。
- [x] 形成本实施方案、决策项和故障注入矩阵。

### 16.2 尚未完成

- [x] 产品/隐私/运维对第十四节决策项给出结论（2026-09-07，批准默认组合）。
- [x] 实施账本、命令 ACK、Agent 恢复/终态、分析投影、保留与备份代码。
- [x] 实施版本化上下文摘要、owner-scoped run artifact、删除/导出治理测试和管理员可靠性看板。
- [x] 删除残留快照 no-op 与浏览器历史回灌协议，编辑/重新生成切换到账本 revision 命令；补 IndexedDB 事务提交、有界重试、HTTP 失败分类、数据库 fail-closed 和备份恢复数据校验。
- [ ] 根据业务选择导入、归档或清空旧测试数据。
- [ ] 完成真实浏览器、网络、乱序、崩溃、数据库故障注入。
- [x] 按实施结果更新长期项目文档与模块索引。

### 16.3 关键源码证据

- `packages/author-site/src/lib/conversation/`：领域模型、repository、SQLite 事务账本、outbox projector、保留与在线备份。
- `packages/author-site/src/app/api/conversations/`：owner-scoped 的列表、读取、单条追加、标题、重试、取消、分叉、导出与删除。
- `packages/author-site/src/app/api/internal/conversations/`：内部 run start/terminal/reconcile 接口和共享 token 校验。
- `packages/ai-chat-shared/src/chat/services/conversation-outbox.ts`：浏览器未 ACK 命令的 IndexedDB 有序队列。
- `packages/ai-chat-shared/src/chat/hooks/use-chat-stream.ts`：先 outbox/ACK、后 WebSocket 执行，不再注入浏览器历史或回退旧 HTTP Agent 路径。
- `packages/ai-chat-shared/src/chat/services/message-service.ts`：仅保留标题和 Session 文件读取能力，旧全量消息快照接口已删除。
- `packages/agent-service/src/services/conversation-ledger-client.ts`：Agent Service 内部账本客户端、超时与终态有界重试。
- `packages/agent-service/src/routes/websocket.ts`：稳定运行 ID、账本恢复、先终态 ACK 后 UI finish/error。
- `packages/agent-service/src/session/conversation-checkpoint-store.ts`：携带 conversation revision 的可丢弃缓存。
- `packages/author-site/src/app/admin/conversation-reliability/`：不含对话正文的消息持久化、run 终态、上下文恢复和诊断 gap 管理看板。
- `packages/author-site/src/lib/ai-attachments.ts` 与 `packages/agent-service/src/routes/attachments.ts`：附件 owner/conversation 归属、上传授权、活跃对话投影与删除后 fail-closed。

### 16.4 已运行验证

```bash
corepack pnpm diagnostics:recent -- --since 7d --limit 200 --format json
corepack pnpm --filter @workbench/author-site test -- --runInBand src/components/ai-elements/__tests__/message-service.test.ts
corepack pnpm --filter @workbench/agent-service test -- tests/unit/conversation-checkpoint-store.test.ts
corepack pnpm --filter @workbench/author-site test -- --runInBand packages/author-site/src/lib/conversation/sqlite-repository.test.ts packages/author-site/src/lib/conversation/analytics-outbox.test.ts packages/author-site/src/lib/conversation/maintenance.test.ts
corepack pnpm --filter @workbench/author-site test -- --runInBand packages/author-site/src/components/ai-elements/__tests__/stream-service-plan.test.ts packages/author-site/src/components/ai-elements/__tests__/message-service.test.ts packages/author-site/src/components/ai-elements/__tests__/use-chat-stream-auto-repair.test.tsx
corepack pnpm --filter @workbench/agent-service test -- tests/unit/conversation-ledger-client.test.ts tests/unit/websocket-timeout.test.ts tests/unit/ws-event-router.test.ts
corepack pnpm --filter @workbench/author-site typecheck
corepack pnpm --filter @workbench/ai-chat-shared typecheck
corepack pnpm --filter @workbench/agent-client typecheck
corepack pnpm --filter @workbench/agent-service typecheck
corepack pnpm --filter @workbench/author-site test -- --runInBand --runTestsByPath src/lib/conversation/sqlite-repository.test.ts src/lib/conversation/maintenance.test.ts src/lib/__tests__/ai-attachments.test.ts 'src/app/api/conversations/[conversationId]/messages/route.test.ts' 'src/app/api/sessions/[sessionId]/attachments/route.test.ts' src/components/ai-elements/__tests__/conversation-client.test.ts src/components/ai-elements/__tests__/conversation-outbox.test.ts src/components/ai-elements/__tests__/use-chat-stream-auto-repair.test.tsx src/components/ai-elements/__tests__/use-chat-stream-attachments.test.ts src/components/ai-elements/__tests__/message-service.test.ts src/components/ai-elements/__tests__/message.test.tsx
corepack pnpm --dir packages/author-site exec jest --runInBand --runTestsByPath src/lib/conversation/sqlite-repository.test.ts 'src/app/api/conversations/[conversationId]/messages/route.test.ts' 'src/app/api/conversations/[conversationId]/export/route.test.ts' src/components/ai-elements/__tests__/use-chat-stream-attachments.test.ts src/components/ai-elements/__tests__/use-chat-stream-auto-repair.test.tsx
docker compose config --quiet
corepack pnpm check:workspace-deploy-compose
corepack pnpm inventory:legacy-conversations
node --test scripts/inventory-legacy-conversations.test.mjs
corepack pnpm test:legacy-conversation-data
corepack pnpm archive:legacy-conversations -- --data-dir data --archive-id proposed-2026-09-07
corepack pnpm verify:legacy-conversation-archive -- --data-dir data --archive-id <applied-archive-id>
```

结果：

- diagnostics：`sqliteUsed=false`、`jsonlFallbackUsed=true`、`dbUnavailable=true`、`eventGapDetected=true`，并报告 `database disk image is malformed`；
- message-service 定向测试：1 条通过，仅覆盖附件 part 进入 POST body，未覆盖非 2xx、并发、卸载、重试或体积上限；
- checkpoint 定向测试：3 条通过，只验证进程内纯函数行为，未验证进程重启持久化。
- Conversation ledger/analytics/maintenance/诊断/管理 API：10 个定向套件、42 条通过，包含 schema v2→v3 迁移、摘要重建、artifact owner 隔离、删除 tombstone、导出和看板投影。
- 旧 Session 子资源 owner 隔离：5 个套件、25 条通过。
- 客户端流、旧快照禁写与 ACK 门禁：3 个套件、24 条通过。
- Agent ledger client/checkpoint/WebSocket timeout/event router：4 个文件、20 条通过；Pi Agent 压缩摘要 3 条定向测试通过。
- 最新 Git 拉取后复验：Agent ledger client/checkpoint/WebSocket event router/附件路由 4 个文件、18 条通过，Pi Agent 压缩摘要定向用例通过。`pi-agent.test.ts` 全量仍有 4 条与本方案无关的图片预描述旧断言失败，账本、附件归属、终态和摘要链路未失败。
- 客户端协议、IndexedDB outbox、附件归属/事务、同步状态 UI、编辑/重新生成、SQLite fail-closed 与备份恢复新增回归：author-site 12 个套件、87 条通过；覆盖 401/403/404/413/429/500、网络异常、附件 ID 随 outbox 保留、图片 base64 不进入 outbox/账本、消息/附件事务回滚、附件 API 的 owner/活跃对话过滤与跨对话删除标记、重试耗尽保留、顺序重放、恢复命令的 queued run 取消、ACK 后交付失败取消、服务端 ID 对齐、导出 canonical projection 和 `supersede/retry`。agent-service 附件上传/删除权限与去重回归 2 个文件、9 条通过。
- 附件元数据闭环回归：5 个套件、50 条通过；其中命令路由保留 `attachmentId/name/mimeType/size/textExtracted`，SQLite 关闭重开后仍可完整投影，导出复用同一 canonical projection，且序列化结果不含图片 data URL/base64 原文。
- author-site、shared、ai-chat-shared、agent-client 和 agent-service TypeScript 检查通过；先前 `workspace-mutation-authority.ts:1531-1532` 的无关联类型阻断已由后续 Git 更新消除。
- `check:author` 全量单测中 192/229 个套件通过；剩余 37 个为当前工作树无关失败，主要是 `project-core` 缺失 `document-proposal.js` 模块映射，另有配置/画布交互断言变化和图片优化超时。
- Compose 展开与部署配置检查通过；analytics 仍默认关闭。
- 旧数据盘点（2026-09-07 当前 `data/` 重跑）：40 个 session metadata、40 个 message 文件、34 条消息；0 个无效 JSON、0 个重复 ID、0 个无效时间戳；2 个文件超过 1 MiB，最大 2,334,486 bytes。附件共 18 个目录/manifest，无损坏 JSON、无 ID 不匹配，但 18 个全部缺失 owner/conversation 归属，总大小 1,639,824 bytes，最大单附件 835,576 bytes；旧消息中 0 个可检测附件 ID 引用，因而 18 个物理附件均无可证明的消息引用，0 个可唯一映射到 owner/conversation。盘点脚本回归 1 条通过，并断言输出不泄露 ID、消息或附件正文。
- 归档工具：盘点与归档 2 条 Node 回归通过；归档 apply 在临时目录验证了源文件保留、Session workspace 排除、逐文件哈希一致和 manifest 哈希。对当前 `data/` 只执行 dry-run：计划归档 134 个旧对话/附件文件、6,951,034 bytes，并确认目标目录未被创建。
- 归档验证器已在临时归档上验证成功路径，并验证文件篡改、manifest 未声明额外文件均会失败；当前真实数据未执行 apply，因而没有可供真实验证命令读取的归档目录。
- 按用户安排，未执行真实浏览器 E2E 与故障注入；该项仍是完成定义中的未满足条件。

## 十七、方案完成定义

只有同时满足以下条件，才能将本方案归档为已完成：

1. 第十四节中影响数据模型的保留、删除、协作可见性和分析授权已决策。
2. 消息与 run 事务账本是唯一业务真值，旧全量文件写路径已删除。
3. 已 ACK 消息恢复、幂等、乱序、取消、失败、重启、删除/导出和权限隔离测试全部通过。
4. Agent 上下文可从权威账本重建，内存 checkpoint 只是缓存。
5. 产品分析从 transactional outbox 投影，不依赖原始对话文件和默认原文收集。
6. 完整性检查、在线备份、恢复演练和数据库故障时的 fail-closed 行为已验证。
