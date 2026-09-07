---
covers:
  - packages/agent-service/
  - packages/agent-client/
  - packages/author-site/src/app/api/
  - packages/author-site/src/lib/agent-client.ts
  - packages/author-site/src/lib/agent-providers.ts
  - packages/author-site/src/lib/backend-providers-sync.ts
  - packages/author-site/src/lib/workspace-authority-client.ts
  - packages/project-core/
  - packages/project-cli/
  - OPS/CLI/
  - docker-compose.yml
  - docker/agent-service/Dockerfile
  - docker/author-site/Dockerfile
  - docs/项目文档/独立Agent服务层/
  - docs/项目文档/创作端/03-项目管理/
  - docs/项目文档/创作端/05-AI对话/
  - docs/项目文档/创作端/06-基础设施/
---

# 独立 Agent Runtime、Workspace 服务与业务后端拆分方案

> 状态：已完成事实审校，方案待实施
> 审校日期：2026-09-06
> 文档性质：架构评估、边界设计和实施计划
> 当前授权：仅校正方案，不修改代码、接口、部署配置或数据

## 一、执行摘要

当前系统已经完成 `author-site` 与 `agent-service` 的进程级拆分，但 `agent-service` 仍同时托管两类本质不同的有状态能力：

- Pi Agent、模型调用、Agent 会话、工具编排和流式事件；
- Hocuspocus 协同、Workspace Mutation Authority、live Workspace 恢复和投影事件。

此外，`agent-service` 还保留一套旧项目 CRUD、旧临时编辑 Session 和版本接口。源码检索未发现当前主创作流程调用这些写接口；主项目与编辑 Session 流程已经位于 `author-site`。不过 `viewer-readonly` 仍复用旧 `ProjectWorkspaceManager` 读取项目，因此不能在没有替代读取端口时直接删除整个管理器。

本方案校正后的结论是：

1. **先做安全收口，再做服务拆分。** 当前首要问题不是容器数量，而是 Agent Service 没有统一公共入口鉴权；旧项目写路由、附件路由、Agent HTTP/WS 等不能把 CORS、`sessionId` 或客户端提交的 `projectId` 当作认证。立即实施范围和验收标准见[阶段 0 安全与边界收口实施方案](./独立Agent服务层-阶段0安全与边界收口实施方案.md)。
2. **保留现有 Authority 单写者语义。** live Workspace 的主要写路径已经通过 Authority 收口，不能把现状笼统描述为“两端任意并写”。真正的问题是 Authority 放在 Agent 进程中、服务仍共享目录、部分旧路由可旁路，以及调用方身份仍依赖共享 Session 文件或内存推送。
3. **目标应是三个清晰边界，而不是把所有业务塞回 Next.js。** `author-site` 继续承担 Web/BFF 和业务控制面；新增有状态 `workspace-service` 承担 Authority 与协同；`agent-service` 收敛为 Agent Runtime。Hocuspocus、启动恢复、串行 mutation 和长连接不适合长期内嵌到 Next.js BFF。
4. **旧项目路由优先删除，不做机械迁移。** 先确认无调用方，再移除 `routes/projects.ts` 的旧写入口；项目领域继续复用 `@workbench/project-core` 和 author-site 当前 API，不复制第二套实现。
5. **先演进现有端口，不重复造抽象。** `@workbench/project-core` 已存在 `WorkspaceMutationPort`，应扩展为完整的 Workspace Client/Port 契约；Agent 工具、author-site、CLI 都通过同一版本化协议访问 Workspace Service。

## 二、目标与非目标

### 2.1 目标

- Agent Runtime 只负责模型运行、Agent 生命周期、工具编排、审批和流式事件。
- Workspace Service 独占 live Workspace、Authority 状态、协同文档、staging、receipt、backup 和恢复流程。
- author-site/Core 领域统一负责身份、项目元数据、编辑租约、评论、配置控制面、版本、发布和 canonical 项目数据。
- 每类持久数据只有一个权威写入方；跨服务只通过版本化契约交互。
- Agent、Workspace 和 Core 可以按各自负载独立重启、发布、观测和扩容。
- 保留 durable receipt、revision、rootHash、projection ack、审批和 fail-closed 语义。
- 让入口身份、服务身份、最终用户身份和审计 actor 可验证，而不是由请求体自行声明。

### 2.2 非目标

- 不把系统一次性拆成大量微服务。
- 不恢复已经移除的多后端 Agent 架构。
- 不重写 Yjs、Authority 事务协议或项目数据模型。
- 不在拆分期间引入双写或“失败后回退直写磁盘”。
- 不把每个 Pi Tool 拆成独立服务。
- 不承诺第一阶段支持 Agent Runtime 或 Workspace Service 多实例。
- 本文档本轮不实施任何代码、接口、部署或数据迁移。

## 三、核验后的当前事实

### 3.1 已完成进程级隔离，但未完成职责隔离

- `author-site`：本地 4200、Docker 3200。
- `agent-service`：本地 4201、Docker 3201。
- `screenshot-service`：本地 4202、Docker 3202。
- `knowledge-service`：本地 4203、Docker 3203。
- 浏览器使用 `@workbench/agent-client` 访问 Agent REST/WebSocket。

因此，模型调用不会与 author-site 共享 Node.js 事件循环；“Agent 推理直接拖垮全部项目 CRUD”不是准确的问题描述。真正仍与 Agent 故障域绑定的是 live Workspace mutation、协同连接、Authority 恢复、评论 AI 任务，以及任何仍调用 Agent Service 的流程。

### 3.2 Agent Service 当前注册的职责

`packages/agent-service/src/routes/index.ts` 当前注册：

| 路由组                     | 当前性质                                                                 | 目标归属                                      |
| -------------------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| `agent.ts`、`websocket.ts` | Agent 消息、会话、运行和事件                                             | Agent Runtime                                 |
| `models.ts`                | 模型探测                                                                 | Agent Runtime 只读能力                        |
| `attachments.ts`           | 会话附件上传/删除                                                        | Core 资产入口 + Agent 临时解析，见 6.6        |
| `validate.ts`              | 纯校验和基于工作区的校验                                                 | 纯函数留共享包；工作区读取走 Workspace Client |
| `internal-config.ts`       | 全局/用户模型、外部授权、Session 授权、图片配置等运行时同步              | Core 控制面与 Agent Runtime 的版本化内部契约  |
| `collab.ts`                | Hocuspocus 与协同持久化                                                  | Workspace Service                             |
| `workspace-authority.ts`   | state、resource、mutation、staging、receipt、snapshot、health、reconcile | Workspace Service                             |
| `projects.ts`              | 旧项目 CRUD、旧临时 Session、旧版本流程                                  | 确认无调用后删除；不迁移成第三套项目 API      |
| `comments-ws.ts`           | 评论实时广播                                                             | Core/评论领域                                 |
| `comment-ai-task.ts`       | 评论任务恢复与 Agent 执行编排混合                                        | Core 持久化任务，Agent Runtime 执行           |

`server.ts` 在监听前执行 Authority 启动恢复，同时启动 Agent 日志清理和评论 AI 任务恢复。这证明当前单进程同时绑定 Workspace、Agent 与业务任务三种生命周期。

### 3.3 项目与编辑 Session 的主路径不在 Agent Service

当前主流程由 `packages/author-site/src/app/api/projects/`、`packages/author-site/src/app/api/sessions/`、`packages/author-site/src/lib/session-manager.ts` 和 `@workbench/project-core` 承担。author-site 创建编辑 Session 后，会把 Session 级模型配置、外部授权和作者权限并发推送给 Agent Service。

与之并存的 `packages/agent-service/src/routes/projects.ts` 使用另一套目录结构和旧 `legacy_temp_workspace` 语义：

- 它直接写 `data/projects`、`data/sessions` 和 `data/snapshots`；
- Session 文件布局与 author-site 当前布局不同；
- 保存逻辑以目录复制覆盖 canonical Workspace，不经过当前 live Authority 流程；
- 当前检索未发现主产品代码调用其创建、删除、打开、保存或放弃接口；
- `viewer-readonly` 仍通过同一个 `ProjectWorkspaceManager` 读取项目正式工作区。

所以这里应被定义为**旧旁路与读取耦合**，而不是“待整体搬迁的现行业务后端”。实施前需用访问日志和契约测试再次确认调用量，然后删除写路由，并为 viewer 提供只读替代端口。

### 3.4 live Workspace 已有单写者，但宿主与信任边界不理想

当前主线已经实现：

- Authority 串行 mutation、revision/rootHash、expected hash、receipt、backup、启动恢复和 drift 检测；
- author-site 的多数 live 写入口通过 `workspace-authority-client.ts` 调用 Authority；
- Pi Tools 在 live Workspace 下使用 Authority，并限制 bash/子 Agent 绕过写入；
- 协同房间与 Authority 共享 committed event 和草稿 flush 语义；
- `@workbench/project-core` 已定义最小 `WorkspaceMutationPort`。

但当前 `packages/author-site/src/lib/workspace-authority-client.ts` 在收到 `WORKSPACE_EXTERNAL_DRIFT` 后会自动调用一次 `reconcile/adopt` 再重试 mutation。这与长期文档声明的“检测到旁路修改后 fail-closed、只允许显式修复”并不一致，也意味着不能把当前行为描述为无条件严格单写者。实施拆分前应先决定唯一语义；推荐生产主路径保持 fail-closed，只允许独立 operator 权限在核验后显式 adopt。

仍未形成清晰服务边界的原因是：

- Authority 与 Hocuspocus 运行在 Agent 进程中；
- author-site、agent-service、knowledge-service、screenshot-service 仍挂载同一个 `/app/data`；
- Agent Service 通过扫描共享 `data/sessions` 和 `data/workspaces` 校验 Session/Workspace；
- author-site 仍直接读取 live Workspace 文件，并通过内部 HTTP 提交写入；
- 旧项目路由可以直接覆盖项目目录，绕过现行 Authority/canonical 流程；
- viewer 只读 Agent 通过旧 manager 直接读取 canonical 项目路径。

因此问题是“**单写者实现已经存在，但所有权仍由共享文件和进程内模块拼接出来**”，不是“尚无单写者”。

### 3.5 当前入口鉴权是最高优先级缺口

`INTERNAL_API_TOKEN` 目前只保护 `/internal/*` 配置同步接口；Agent、附件、旧项目、Authority 和 WebSocket 并没有统一的全局认证层。现有 Session 作者权限由 author-site 推送到 Agent Service 内存，缺失或过期时写工具会 fail-closed，这是重要防线，但它不是完整的入口认证。

需要明确：

- CORS 只约束浏览器跨域读取，不是服务端认证。
- `sessionId`、`projectId`、`workspaceId` 和 `workingDir` 都不是凭证。
- Authority 当前依据共享 Session/Workspace 元数据校验绑定，但 mutation 中的 `actor` 仍是调用方提交的数据，不能直接视为已认证审计身份。
- 未统一鉴权的模型探测、标题生成、消息、附件与旧项目接口还存在资源滥用或越权面。
- WebSocket 必须在升级或首帧前完成认证，并把通过验证的 claims 固定到连接，不能在后续消息中重选项目范围。

这项缺口必须在长周期架构迁移之前先收口。

### 3.6 模型配置同步属于可用性问题，不是数据源争夺

模型/外部授权的持久化事实源在 author-site；Agent Service 保存全局或 Session 级运行时副本。当前机制依靠内部推送和重启后的周期核验，主要问题是：

- Session 授权和用户级配置为内存态，重启后需要重推；
- 缺少统一的 `configVersion`、生效时间、加载状态和失败原因；
- 一次 Agent run 使用哪个配置版本没有固定的审计字段；
- 配置、密钥、外部授权和图片配置混在同一路由模块，生命周期不同。

长期应改为“Core 持久化事实源 + Agent 带版本缓存”，但不需要把 Agent 运行时配置复制成第二个业务数据库。

## 四、准确的问题定义

### P0：公共入口缺少统一可验证身份

风险高于物理拆分本身。尤其要优先处理旧项目写路由、附件上传/删除、Agent 消息/标题/模型接口和 WebSocket。所有写请求必须由服务端根据认证 claims 生成 actor，不能信任请求体 actor。

### P0：external drift 会被普通业务客户端自动接纳

`commitWorkspaceMutation()` 当前遇到 `WORKSPACE_EXTERNAL_DRIFT` 会调用 `reconcile/adopt` 后重试。这样会把 Authority 之外的磁盘变化接纳为新基线，削弱 drift 作为旁路写入告警和阻断机制的价值。应取消普通业务调用方的自动 adopt；adopt/restore 只对受审计的 operator 流程开放。

### P1：Workspace 故障域错误地依附于 Agent Runtime

Agent Runtime 重启会触发 Authority 恢复并中断协同与 Workspace API；反过来，Authority 启动恢复失败会阻止整个 Agent Service ready。两类负载的扩容、发布和恢复策略也不同。

### P1：共享数据卷仍是隐式 RPC

跨服务读取共享目录虽然方便，但会让数据模型、目录布局、权限和生命周期成为隐式契约。它还使容器无法仅凭挂载权限证明谁可以写什么。

### P1：存在旧项目写旁路

旧 `routes/projects.ts` 不是简单重复代码：其删除与保存逻辑会直接操作 canonical 项目、快照、Session 和 Authority 目录，且不遵循当前项目回收站、live Workspace、canonical materialization 和业务鉴权语义。应优先下线，而不是继续兼容。

### P2：会话与任务概念混杂

当前至少存在：

- `agentSessionId`：对话、Agent 实例和一次或多次 run；
- `editorSessionId`：用户编辑租约与业务历史；
- `workspaceId`：live/branch/snapshot-source/legacy 工作区；
- `collabDocumentId`：协同文档资源；
- `agentRunId`：单轮执行；
- `businessTaskId`：评论 @AI 等业务任务。

后续契约不得继续用无前缀的 `sessionId` 表达不同语义。

## 五、目标架构

```text
浏览器 / CLI / 自动化
        │
        ├── author-site / Core BFF
        │     ├── 登录、用户、角色和项目授权
        │     ├── 项目、页面、评论、配置控制面、版本和发布
        │     ├── editorSession 租约与 capability 签发
        │     └── canonical 项目数据与业务任务状态
        │
        ├── Agent Runtime
        │     ├── Agent session / run / cancel / resume
        │     ├── Pi Agent、Provider、Tool Registry
        │     ├── 计划审批、用户选择和流式事件
        │     └── Agent run log、checkpoint 和临时解析产物
        │
        └── Workspace Service
              ├── Hocuspocus / Yjs 房间
              ├── live Workspace 读取与受管 mutation
              ├── Authority revision / receipt / backup / recovery
              ├── staging / projection ack / committed events
              └── live Workspace 数据与 Authority 状态

Agent Runtime ──服务身份 + 委派 capability──> Workspace Service
author-site   ──服务身份 + 用户 claims──────> Workspace Service
Agent Runtime ──内部 API──────────────────> Knowledge / Screenshot
```

`Core` 是逻辑领域边界，不要求本阶段新建 `core-api` 进程。author-site 可以继续承担 BFF 和 Core API；如果未来需要独立扩容，再把纯业务服务从 Next.js 抽出。Workspace Service 则应作为明确目标，因为它具有长连接、单写者、恢复门禁和持久状态，不适合长期归入 Web BFF。

## 六、关键设计决策

### 6.1 数据所有权

| 数据                                                      | 唯一写入方            | 其他服务访问方式                        |
| --------------------------------------------------------- | --------------------- | --------------------------------------- |
| 用户、角色、项目元数据、评论、模型配置                    | Core/author-site      | 业务 API 或受控内部 API                 |
| canonical 项目内容、版本、发布状态                        | Core 项目领域         | Project API；Workspace 不直写 canonical |
| live Workspace 文件                                       | Workspace Service     | Workspace Contract                      |
| Authority state、journal、receipt、backup、staging、lease | Workspace Service     | Workspace Contract/运维入口             |
| Yjs/协同状态                                              | Workspace Service     | Collab Contract                         |
| Agent 会话、run log、checkpoint                           | Agent Runtime         | Agent Contract                          |
| 用户上传原件和正式项目资产                                | Core 资产领域         | 受权资源 API                            |
| Agent 临时解析结果                                        | Agent Runtime，带 TTL | 仅绑定 `agentSessionId`/`agentRunId`    |
| 知识索引                                                  | Knowledge Service     | Knowledge API                           |
| 截图任务与缓存                                            | Screenshot Service    | Screenshot API                          |

迁移期可以临时共享物理卷，但必须逐目录改成只读/读写挂载并列出退出条件。最终 Agent Runtime 不挂载 `projects/`、`workspaces/`、`workspace-authority/` 或 `collab-state/`。

### 6.2 演进现有 WorkspaceMutationPort

不再新增一个同义 `WorkspacePort`。应以 `@workbench/project-core` 当前 `WorkspaceMutationPort` 为起点，演进为按能力拆分的稳定客户端接口：

- `WorkspaceReader`：state、snapshot、resource、events；
- `WorkspaceMutator`：mutation、document proposal、binary staging；
- `WorkspaceProjector`：projection ack；
- `WorkspaceOperator`：health、bootstrap、reconcile，仅内部运维身份可用；
- `CollabGateway`：协同票据和连接信息。

普通业务代码只注入所需最小接口，不能获得运维 reconcile 能力。HTTP DTO 继续复用 shared contract；实现类放在调用方适配层，不能让 Agent Runtime import Workspace Service 的文件存储实现。

### 6.3 能力票据与服务身份

推荐同时验证两种身份：

1. **服务身份**：mTLS 或轮换的服务凭据，证明调用来自 author-site、Agent Runtime、CLI gateway 等受信服务。
2. **委派 capability**：短期签名票据，绑定 `subjectUserId`、`role`、`projectId`、`workspaceId`、`editorSessionId`、`agentSessionId`、允许操作、`iat`、`exp`、`jti` 和契约版本。

规则：

- author-site 在完成用户鉴权和项目授权后签发票据；
- Agent Runtime 校验后将 claims 固定绑定到 `agentSessionId`；
- Workspace Service 根据 claims 在服务端生成 mutation actor；
- 客户端的 `workingDir`、actor、role 和任意绝对路径都不得参与授权；
- WebSocket 建连时认证一次，范围变化必须重新签发并重连；
- 运维 reconcile 使用独立 operator 权限，不能复用普通编辑票据；
- 票据只包含引用和权限，不包含模型密钥或外部 OAuth 密钥。

短期内可继续使用现有 `INTERNAL_API_TOKEN` 和 Session authorization push 作为过渡，但必须把 Agent/Workspace 公共入口纳入认证；它们不能只保护 `/internal/*`。

### 6.4 浏览器连接策略

- 业务 HTTP 始终走 author-site 同源 BFF。
- Agent 流式连接可继续浏览器直连 Agent Runtime，但必须使用短期 Agent capability；不要为追求“所有流量都经过 BFF”而在不支持可靠 WebSocket 代理的 Next.js 层强行中转。
- Collab 连接直达 Workspace Service，使用单独的 Collab capability。
- Workspace 普通 HTTP 可以由 author-site 受限代理；浏览器不得访问内部运维 endpoint。
- 服务地址发现与 token 签发分离，前端不能持有服务间凭据。

### 6.5 旧项目 API 的处理

不将 `packages/agent-service/src/routes/projects.ts` 搬到 Core API。正确顺序是：

1. 记录各旧 endpoint 的实际调用量并检索所有仓库调用方；
2. 为 `viewer-readonly` 改用 Core 的只读 Project Snapshot/Context API；
3. 默认关闭旧写路由，测试环境验证无回归；
4. 删除旧路由、旧 Session 文件布局和其专用保存/删除代码；
5. 更新 Agent 服务长期文档和 SDK，避免继续宣传这套旧 API。

项目 API 只保留 author-site/Project Core 这一条主线。

### 6.6 附件、校验、评论任务与配置

- **附件**：上传入口归 Core 资产领域，先校验用户与项目；Agent Runtime 只领取受限下载引用并产生带 TTL 的解析缓存。正式资产注册必须走 Workspace/Core 受管流程。
- **校验**：纯 `code + schema` 校验留在共享包或调用进程；基于 Workspace 的校验通过 `WorkspaceReader` 获取资源，不读取挂载路径。
- **评论 @AI**：Core 创建并持久化 `businessTaskId`、状态和幂等键；Agent Runtime 执行并回写结果。不要让 Agent 启动生命周期恢复评论业务队列。
- **模型配置**：Core 是事实源；Agent Runtime 按 `configVersion` 拉取或接收通知并缓存。每个 `agentRunId` 固定使用启动时版本，运行中配置更新只影响后续 run。
- **外部授权**：只传递短期 provider token 或安全引用；与全局模型目录、Session 用户配置、图片生成配置分开版本和过期策略。

### 6.7 一致性与事件

- Workspace mutation 继续以 durable receipt 为唯一成功依据。
- 跨服务不做分布式文件事务；Core 需要消费 Workspace revision 时使用现有 canonical materialization 边界和 revision/rootHash 校验。
- 业务任务回写采用幂等 `businessTaskId`；需要可靠异步投递时使用 outbox/inbox，而不是“HTTP 成功后再随手写第二份状态”。
- 每个请求贯穿 `traceId`，每轮 Agent 使用 `agentRunId`，每次 mutation 使用 `mutationId`；三者不可混用。
- API 路径或 envelope 必须显式 `contractVersion`。兼容策略只覆盖迁移窗口，当前未上线阶段不保留长期双协议分支。

## 七、分阶段实施计划

### 阶段 0：基线与立即安全收口

阶段 0 已拆分为独立的[安全与边界收口实施方案](./独立Agent服务层-阶段0安全与边界收口实施方案.md)。其任务状态、技术决策、验证证据和退出条件只在该文档维护；本文不复制清单，避免两处状态漂移。

阶段 0 完成是进入阶段 1 的前置门禁。

### 阶段 1：契约和进程内依赖反转

- [ ] 扩展现有 `WorkspaceMutationPort`，按读、写、投影、运维和协同拆分最小接口。
- [ ] Agent 工具不再直接获得正式 Workspace 绝对路径；live 模式全部通过端口读写。
- [ ] viewer-readonly 改为消费 Core 提供的只读项目上下文，不再依赖 `ProjectWorkspaceManager`。
- [ ] author-site、Agent、project-cli、OPS CLI 复用同一版本 DTO、错误码和客户端适配器。
- [ ] 给端口增加 contract tests、超时、取消、幂等和不可重试副作用测试。
- [ ] 增加依赖门禁：Agent Runtime 不得 import project/workspace 文件存储实现。

退出条件：在仍同进程部署时，Authority/Collab 已可通过接口替换；Agent 主路径不依赖 live Workspace 本地路径。

### 阶段 2：抽出 Workspace Service

- [ ] 新建有状态 Workspace Service，原样迁移 Authority、Hocuspocus、启动恢复和诊断模块，避免同时改协议。
- [ ] Workspace Service 独占 `workspaces/`、`workspace-authority/`、`collab-state/` 及相关 staging/backup。
- [ ] author-site 和 Agent Runtime 均切换为远程 Workspace Client。
- [ ] 迁移采用停写窗口、备份、预检、单 writer 切换；只允许 shadow read，不允许双写。
- [ ] 将协同票据、mutation capability 和 operator 身份分开。
- [ ] 更新部署 health/readiness：恢复未完成或 backup 缺失时 Workspace Service 不 ready，但 Agent Runtime 仍可启动为受限状态。

退出条件：Agent Runtime 重启不影响协同与 Authority；Workspace Service 是 live 数据唯一写入方。

### 阶段 3：收敛 Agent Runtime 与业务任务

- [ ] 从 Agent Service 移除 Collab、Authority、旧项目 API 和业务评论广播。
- [ ] 评论 AI 改为 Core 持久化任务 + Agent 执行器，具备幂等领取、心跳、重试和结果回写。
- [ ] 把模型目录、用户模型配置、外部授权和图片配置拆成独立版本缓存。
- [ ] Agent run log、checkpoint、临时附件解析使用独立存储与 TTL。
- [ ] Agent Service 不再挂载正式项目或 live Workspace 数据目录。

退出条件：Agent Service 的依赖和启动生命周期只包含 Agent Runtime 职责。

### 阶段 4：部署隔离与按需扩容

- [ ] 为 Core、Agent、Workspace、Knowledge、Screenshot 分别配置资源预算、SLO 和告警。
- [ ] 决定 Agent 多实例策略：优先显式 session ownership/粘性路由；需要无粘性时再引入共享事件和 durable run coordinator。
- [ ] Workspace Service 在没有跨实例串行、事件广播、lease 和恢复验收前保持单实例。
- [ ] 将迁移期共享卷改为目录级只读挂载，最终移除非 owner 挂载。
- [ ] 完成故障注入、回滚演练和数据恢复演练。

## 八、验证与验收

### 8.1 静态门禁

- Agent Runtime 不直接 import 项目存储、Session 文件、Workspace Authority 实现或 canonical materializer。
- author-site 和 Agent Runtime 不直接写 live Workspace。
- Workspace Service 不写用户、评论、模型配置或 canonical 项目元数据。
- 正式项目请求中不存在以绝对 `workingDir` 授权的代码路径。
- 所有 WebSocket/HTTP 写入口均声明认证策略和最小 capability。
- 不存在两个 live Workspace writer 或失败后直写磁盘的 fallback。

### 8.2 契约测试

- Agent：send、stream、cancel、busy、resume、approval、choice、finish、run summary。
- Workspace：read、mutation、staging、receipt、revision、conflict、drift、projection ack、recovery。
- Capability：签发、过期、撤销、项目不匹配、Workspace 不匹配、只读、重放和 operator 隔离。
- 配置：`configVersion` 加载、Agent 重启恢复、run 版本固定、密钥不可出现在客户端或日志。
- 业务任务：领取、幂等、超时、重试、取消和结果回写。

### 8.3 故障矩阵

| 故障                      | 必须继续可用                                               | 必须 fail-closed / 可降级                                                                      |
| ------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Agent Runtime 不可用      | 登录、项目列表、canonical 只读、已发布内容、非 AI 业务管理 | AI 对话、Agent 工具和评论 AI；不得影响 Workspace 已提交数据                                    |
| Workspace Service 不可用  | 登录、canonical 项目只读、已发布内容、纯业务配置控制面     | live 编辑、协同、自动保存、AI 写 Workspace、依赖 live revision 的发布/版本动作必须 fail-closed |
| Core/author-site 不可用   | 已建立且未过期连接可按票据剩余 TTL 继续最小范围运行        | 不签发新票据、不扩大权限；需要业务落库的结果进入有界重试                                       |
| Knowledge Service 不可用  | Agent 基础对话与 Workspace 操作                            | 知识检索明确降级，不伪造空知识结果                                                             |
| Screenshot Service 不可用 | 文本编辑、项目与 Agent 非截图工具                          | 截图/预览诊断明确失败，不拖垮 Agent run                                                        |

特别校正：不能把“Agent Service 不可用时配置编辑和发布仍可用”作为当前阶段的笼统验收，因为 live 配置写入和发布前 canonical 同步依赖 Workspace Authority。只有 Workspace Service 抽出后，才能按上表分别验证。

### 8.4 数据与恢复验收

- 迁移前后同一 Workspace 的 revision、rootHash、resourceHashes 和 receipt 链一致。
- prepared mutation、stale lease、backup 缺失和 external drift 的恢复结果与现状一致。
- 迁移过程中无双写窗口；回滚只切回旧唯一 writer。
- canonical materialization 只消费已确认的 revision/rootHash。
- project/session/workspace/agent-run/business-task 的 ID 不发生语义复用。

### 8.5 观测指标

- Agent：排队、首 token、模型等待、工具耗时、取消收束、run 成功率。
- Workspace：mutation 延迟、队列深度、冲突、drift、lease、恢复、backup 缺口、协同连接。
- Core：业务 API、项目授权、capability 签发、canonical materialization、任务回写。
- 跨服务：按 `traceId` 记录调用、超时、重试、幂等命中和 fail-closed 次数。
- 安全：认证失败、scope 不匹配、过期/重放票据、未授权 operator 调用；不得记录票据和密钥正文。

## 九、风险与待确认事项

### 9.1 主要风险

- Authority、Yjs 草稿 flush、自动保存和 canonical materialization 有严格时序，不能在抽服务时顺便重写语义。
- Agent 工具从本地文件切到远程读取会增加延迟，需要批量 snapshot/read API，避免 N+1。
- 共享卷移除后，预览编译、图片、截图和发布的资源访问必须逐项改成受控 API 或 owner 生成的不可变快照。
- capability 的签名轮换、撤销、时钟偏差和 WebSocket 续期需要专项设计。
- Agent 多实例与 Workspace 多实例是两个不同问题，不能用同一种“共享内存外置”方案草率处理。
- 当前 `workspace-authority-client.ts` 对 external drift 的自动 adopt 与长期 fail-closed 语义冲突；迁移前必须先收口，否则会把既有旁路变化一并带入新服务。

### 9.2 待确认决策

- capability 采用自包含签名票据还是一次性 opaque ticket；建议先用短 TTL 签名票据，只有高风险操作或确有即时撤销需求时再增加 `jti` denylist，避免一开始引入全量在线票据状态。
- Workspace Service 的持久化第一阶段继续文件系统还是迁到对象存储/数据库；建议先保持文件语义，完成边界拆分后再评估。
- Agent 会话是否需要跨实例恢复；若近期没有明确容量需求，先采用单实例或粘性路由。
- 附件正式资产与临时解析缓存的保留期限、去重和病毒扫描策略。
- 评论任务是否需要通用任务队列；若只有一种任务，先实现最小 outbox/claim 协议，避免引入过重平台。
- viewer AI 的只读 Project Context API 返回不可变快照还是按资源读取；建议优先一次性、带版本的不可变上下文快照。

## 十、实施前证据清单

| 证据                                                                | 当前结论                                               | 实施前动作                      |
| ------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------- |
| `packages/agent-service/src/routes/index.ts`                        | Agent、Workspace、旧项目和业务任务同进程注册           | 固化路由 owner 清单             |
| `packages/agent-service/src/server.ts`                              | Authority、Agent 日志、评论任务共享启动生命周期        | 拆 readiness 与恢复责任         |
| `packages/agent-service/src/routes/projects.ts`                     | 旧项目/Session 写入口仍公开注册                        | 统计调用并优先下线              |
| `packages/agent-service/src/workspace/project-workspace-manager.ts` | 旧目录复制写流程；viewer 仍依赖其读取                  | 分离只读替代后删除旧写实现      |
| `packages/author-site/src/app/api/sessions/route.ts`                | 当前编辑 Session 主流程与授权推送在 author-site        | 作为 Core/BFF 基线              |
| `packages/project-core/src/types.ts`                                | 已存在 `WorkspaceMutationPort`                         | 演进而非新建同义端口            |
| `packages/author-site/src/lib/workspace-authority-client.ts`        | author-site 通过 Agent 内 Authority 提交 mutation      | 切换为 Workspace Service client |
| `packages/agent-service/src/routes/workspace-authority.ts`          | Authority API 校验 Session/Workspace，但无统一服务认证 | 增加服务身份与 capability       |
| `packages/agent-service/src/config/session-authorizations.ts`       | 作者权限是 Agent 进程内存态                            | 改为可验证短期票据/缓存         |
| `docker-compose.yml`                                                | 多服务共享 `/app/data`                                 | 建立目录 owner 与退出计划       |

## 十一、最终结论

1. 当前不是“Agent 仍在业务单体中”，而是 **Agent Runtime 与 Workspace/Collab 共处一个独立服务**，并残留一套旧项目写旁路。
2. live Workspace 的 Authority 单写者已经是正确基础，应保留协议并迁移宿主；不能先拆掉 Authority，也不能在迁移期双写。
3. 最合理的目标不是把 Workspace 全部塞入 author-site，而是形成 **Core/BFF、Agent Runtime、Workspace Service** 三个边界。
4. 实施优先级应是：**[阶段 0：入口鉴权与旧旁路收口](./独立Agent服务层-阶段0安全与边界收口实施方案.md) → 复用并扩展现有端口 → 抽出 Workspace Service → 收敛 Agent Runtime → 移除共享卷与按需扩容**。
5. 长期拆分开始前必须先通过阶段 0 的退出门禁；阶段 0 的状态和证据以独立文档为准。
