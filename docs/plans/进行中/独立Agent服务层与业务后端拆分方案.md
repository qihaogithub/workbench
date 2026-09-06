---
covers:
  - packages/agent-service/
  - packages/agent-client/
  - packages/author-site/src/lib/agent-client.ts
  - packages/author-site/src/lib/agent-providers.ts
  - packages/author-site/src/lib/backend-providers-sync.ts
  - packages/project-core/
  - docker-compose.yml
  - docker/agent-service/Dockerfile
  - docker/author-site/Dockerfile
  - docs/项目文档/独立Agent服务层/
  - docs/项目文档/创作端/03-项目管理/
  - docs/项目文档/创作端/05-AI对话/
  - docs/项目文档/创作端/06-基础设施/
---

# 独立 Agent 服务层与业务后端拆分方案

> 状态：方案待实施
> 日期：2026-09-06
> 文档性质：架构评估、边界设计和后续实施计划
> 实施约束：当前仅沉淀方案，不修改代码、接口、部署配置或数据

## 一、背景

当前系统已经把 `@workbench/agent-service` 作为独立 Fastify 服务运行，并通过独立端口、Docker 容器和 `@workbench/agent-client` 与创作端连接。表面上看，Agent 服务和业务后端已经完成了进程级拆分。

但当前 `agent-service` 并不只是 Agent Runtime。它同时承载了项目管理、编辑会话、版本管理、协同、Workspace Mutation Authority、附件、模型配置和评论 AI 任务等能力；`author-site` 也继续承载认证、项目业务 API、配置、发布、资源和编辑页相关 API。两个服务还共享持久化数据目录，并通过内部接口同步运行时配置。

因此，当前真正需要解决的问题不是“是否再增加一个 Agent 进程”，而是：

> 是否应把 Agent 的运行时职责，与项目/Workspace 等业务领域职责彻底分开，并建立单一数据所有权和稳定的内部契约。

本方案的结论是：**应该拆分，但采用渐进式拆分；优先拆职责、接口和数据所有权，再决定是否进一步增加独立的 Workspace 服务。**

## 二、目标

### 2.1 总体目标

- 让 Agent Runtime 只负责模型调用、工具编排、流式事件和 Agent 生命周期。
- 让业务后端统一负责用户、项目、Workspace、协同、版本、配置、发布和业务权限。
- 保证每类核心数据只有一个权威写入方。
- 使 Agent 的高延迟、长连接、模型调用、联网和图片处理不会直接拖垮项目 API。
- 允许 Agent Runtime 和业务后端独立发布、重启、扩容和观测。
- 保持现有 Agent 事件、Workspace receipt、审批和协同语义可验证、可追踪。

### 2.2 非目标

- 不立即拆成大量微服务。
- 不因为拆分而恢复已经移除的多后端 Agent 架构。
- 不重写现有项目数据模型、Workspace Authority 或协同协议。
- 不在本阶段实施代码迁移、接口切换或数据迁移。
- 不把每个 Pi Tool 都拆成独立服务。

## 三、当前现状

### 3.1 已完成的进程级拆分

当前已经存在以下独立边界：

- `agent-service` 本地默认运行在 4201，Docker 运行在 3201。
- `author-site` 本地默认运行在 4200，Docker 运行在 3200。
- `agent-client` 为浏览器端调用 Agent REST/WebSocket 的 SDK。
- `screenshot-service` 和 `knowledge-service` 已经是独立服务。
- Docker Compose 已为各服务配置独立容器、健康检查和资源上限。

这说明后续不需要从单体 Next.js API 中重新“挖出” Agent 进程；需要处理的是独立 Agent 服务内部仍然混入了业务后端能力，以及服务之间的数据和权限边界仍不够清晰。

### 3.2 Agent 服务当前承载的职责

`packages/agent-service/src/routes/index.ts` 一次性注册了以下路由组：

| 路由组 | 当前职责 | 建议归属 |
| --- | --- | --- |
| `agent.ts` | Agent 消息发送、标题生成、会话运行 | Agent Runtime |
| `websocket.ts` | Agent 流式事件、审批、模型切换 | Agent Runtime |
| `attachments.ts` | Agent 对话附件上传与读取 | Agent Runtime 或资源服务，待定 |
| `models.ts` | Agent 模型列表和运行时模型配置 | 控制面/Agent Runtime，需拆读写职责 |
| `internal-config.ts` | author-site 向 Agent 同步供应商配置 | 过渡期保留，长期改为版本化配置分发 |
| `projects.ts` | 项目 CRUD、编辑会话、保存、放弃编辑、版本历史 | Core API / 项目领域 |
| `collab.ts` | Hocuspocus 协同服务和 Workspace 文件持久化 | Workspace/协同领域 |
| `workspace-authority.ts` | Workspace Authority 状态、事件、mutation、snapshot、health | Workspace/协同领域 |
| `validate.ts` | 项目/页面相关校验 | Core API 或独立校验能力 |
| `comments-ws.ts` | 评论实时事件广播 | 评论/业务后端 |
| `comment-ai-task.ts` | 评论 @AI 任务编排 | 任务触发在业务后端，执行在 Agent Runtime |

当前入口代码还在启动阶段执行 Workspace Authority 恢复、Agent 运行日志清理和评论 AI 任务恢复，见 [server.ts](/home/qihao/code/oneflow/packages/agent-service/src/server.ts:106)。这说明服务启动生命周期已经同时绑定了 Agent、Workspace 和业务任务三类状态。

### 3.3 项目和编辑会话已经位于 Agent 服务中

`packages/agent-service/src/routes/projects.ts` 直接暴露：

- `GET/POST/DELETE /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/edit`
- `GET /api/sessions/:sessionId`
- `POST /api/sessions/:sessionId/save`
- `POST /api/sessions/:sessionId/discard`
- `GET /api/projects/:id/versions`

这些接口使用 `ProjectWorkspaceManager`，直接管理项目目录、Session 目录、快照目录和项目元数据。它们属于项目领域和编辑生命周期，不属于模型调用或 Agent Loop。

### 3.4 业务后端仍然承载大量同领域能力

`author-site` 当前仍承载：

- 用户认证、管理员认证和用户配置。
- 项目、页面、文件、配置、资源、版本和发布 API。
- 编辑 Session 的多个 API 路由。
- 评论、知识库、图片、预览编译和发布能力。
- 模型供应商配置的数据库存储和管理后台。

当前 `author-site/src/app/api` 已有大量项目、Session、配置、发布和资源路由，同时 `author-site/package.json` 与 `agent-service/package.json` 都依赖 `@workbench/project-core`。这形成了“两个服务都理解项目领域”的结构性重复。

### 3.5 数据目录仍然共享

Docker Compose 为 `agent-service` 和 `author-site` 都挂载同一个宿主机数据目录到 `/app/data`，见 [docker-compose.yml](/home/qihao/code/oneflow/docker-compose.yml:30) 和 [docker-compose.yml](/home/qihao/code/oneflow/docker-compose.yml:77)。当前架构文档也明确要求两端指向同一份 `data/sessions` 和 `data/workspaces`。

共享目录本身不一定立即导致错误，但它会使服务边界变成约定而不是契约：

- 任一服务都可能读取或修改另一服务认为是自己的文件。
- 服务扩容时，内存态 Session、协同房间和写入顺序难以一致。
- 服务重启、Authority 恢复和项目删除可能产生跨服务竞态。
- 无法仅凭 API 访问日志完整判断数据是谁修改的。

### 3.6 服务间配置同步较为脆弱

当前数据库是模型配置源，`author-site` 保存后通过 `INTERNAL_API_TOKEN` 向 `agent-service` 推送运行时配置；Agent 重启后还需要由 author-site 周期性核验并重新推送。

相关路径包括：

- `packages/author-site/src/lib/agent-providers.ts`
- `packages/author-site/src/lib/backend-providers-sync.ts`
- `packages/agent-service/src/routes/internal-config.ts`
- `docker-compose.yml` 中的 `INTERNAL_API_TOKEN`

当前机制可以作为过渡方案，但长期应转为带版本号、可重放、可观测的配置分发协议，而不是依赖内存副本和周期性补偿。

## 四、问题与影响

### 4.1 故障隔离不足

Agent 请求可能包含模型长响应、工具执行、截图、联网、图片生成、文件读取和子 Agent 委派。它们的 CPU、内存、网络和连接占用模型与项目 CRUD、发布、配置保存完全不同。当前业务路由与 Agent 路由位于同一 Agent Fastify 服务中，服务内存或事件循环异常时会同时影响多类能力。

### 4.2 领域边界不清

Agent 服务既是模型运行时，又是项目后端和 Workspace 后端。新增功能时很难判断代码应放在 Agent、author-site、project-core 还是 Workspace Authority 中，容易形成重复路由、重复权限和重复文件操作。

### 4.3 数据写入责任不清

当前系统已经有 Workspace Mutation Authority 单写者原则，但该 Authority 本身位于 Agent 服务中，而 author-site 又拥有大量项目和 Session API。只要两个服务都能直接触碰同一份 Workspace，单写者原则就依赖调用约定，难以从架构上保证。

### 4.4 权限和信任边界复杂

Agent 服务当前注册 CORS，并允许浏览器侧使用 `Authorization`、`X-API-Key` 等请求头。Agent 消息还携带 `projectId`、`workingDir`、`demoId`、模式和上下文。虽然当前代码已经有会话绑定、项目匹配和只读模式防线，但长期应让业务后端签发受限能力，而不是让 Agent 服务自行解释完整业务身份。

### 4.5 会话概念容易混淆

当前系统同时存在 Agent 运行会话、编辑 Session、Workspace、协同房间和评论 AI 任务。多个入口使用 `sessionId` 作为参数，后续拆分时如果不显式区分，将继续产生“Agent 对话是否等于编辑会话”的耦合。

### 4.6 独立扩缩容受限

Agent Runtime 可能需要按并发模型请求数、上下文长度、工具执行时长和供应商延迟扩容；Core API 可能需要按 HTTP 请求量、数据库访问量和协同连接数扩容。当前职责混合会使扩容粒度和资源预算失去针对性。

## 五、目标架构

### 5.1 推荐的逻辑分层

```text
浏览器 / CLI / 自动化
          │
          ├── Core API / BFF
          │     ├── 身份、用户和业务权限
          │     ├── 项目、页面、配置、资源和发布
          │     ├── 编辑 Session、Workspace、协同和版本
          │     └── Workspace Mutation Authority（唯一项目写入方）
          │
          └── Agent Runtime
                ├── Agent Session 与运行生命周期
                ├── Pi Agent / Model Provider
                ├── Tool Registry 与工具编排
                ├── 权限请求、计划审批和用户选择
                ├── REST / WebSocket 流式事件
                └── Agent Run Log 与临时工作区

Agent Runtime ──受控内部 API / 能力令牌──> Core API / Workspace Authority
Agent Runtime ──内部 API────────────────> Knowledge Service / Screenshot Service
```

这里的 `Core API` 不必立即变成新的独立进程。第一阶段可以由现有 `author-site` 继续承担 BFF 和业务后端职责；只有当其 Next.js API、协同和项目领域需要独立扩容时，再抽出专用 `core-api` 或 `workspace-service`。

### 5.2 Agent Runtime 的职责

保留在 Agent Runtime 的能力：

- Pi Agent 初始化、模型调用和 Provider 适配。
- Agent Loop、Agent Session、busy 状态和取消。
- Prompt 组装中属于 Agent 的运行时部分。
- Tool Registry、工具参数校验和工具事件转换。
- 权限确认、计划审批、用户选择和流式事件。
- Agent 附件解析、模型上下文准备和运行日志。
- 分支/临时工作区的生命周期与快照；前提是它不直接拥有正式项目 Workspace。

Agent Runtime 不应继续直接负责：

- 项目创建、删除、列表和项目元数据。
- 编辑 Session 的业务租约、保存、版本和发布。
- 正式 Workspace 的文件持久化、协同房间和项目版本基线。
- 评论实体 CRUD、项目配置和发布业务规则。

### 5.3 Core API / Workspace 领域的职责

统一由业务后端或 Workspace 领域负责：

- 用户身份、角色、项目归属和权限判断。
- 项目、页面、文件、配置、资源、版本和发布状态。
- `editorSessionId` 与 `workspaceId` 的创建、租约和归属。
- Yjs/Hocuspocus 协同、Workspace 当前态和 Authority receipt。
- 所有正式项目 Workspace 的写入、恢复、备份和 drift 检测。
- 评论、知识文档、业务配置和页面可见性等领域规则。

Agent 只能通过受控的 `WorkspacePort` 或内部 API 请求读取和修改正式 Workspace，不能把客户端传入的 `workingDir` 当作项目写入授权。

### 5.4 稳定契约

建议形成三类稳定契约：

1. **Agent Contract**：消息请求、Agent 事件、工具调用、审批、取消、完成和错误。
2. **Workspace Contract**：Workspace 读取、受管 mutation、revision、receipt、projection ack 和冲突错误。
3. **Capability Contract**：Core API 签发的短期能力，声明用户、项目、Workspace、Agent 会话、模式、权限和过期时间。

共享包只放 DTO、错误码、事件和校验，不让 Agent Runtime 直接 import Core API 的具体文件读写实现。

## 六、关键设计决策

### 6.1 优先拆数据所有权，而不是优先拆容器

第一原则是：**一个资源只有一个权威写入方。**

- 正式项目 Workspace：Core API / Workspace Authority 写入。
- Agent 运行日志和对话状态：Agent Runtime 写入。
- Agent 临时分支工作区：Agent Runtime 可拥有，但不能与正式 Workspace 共用身份。
- 知识库索引：Knowledge Service 写入。
- 截图缓存和截图任务：Screenshot Service 写入。

物理上暂时共用宿主机目录可以作为迁移期方案，但必须通过模块接口和静态检查禁止跨边界直接写入；最终应取消 Agent 与 Core API 对正式 Workspace 的共享文件写入。

### 6.2 显式区分三类 ID

后续接口和代码应明确区分：

- `agentSessionId`：Agent 对话和运行状态。
- `editorSessionId`：用户编辑租约、保存、恢复和版本流程。
- `workspaceId`：协同和项目当前工作区的资源身份。

Agent 请求上下文应携带 `projectId` 和 `workspaceId` 的服务端绑定结果；客户端传入值只能作为请求意图，不能直接改变访问范围。

### 6.3 认证方式

推荐的调用链是：

1. 浏览器先通过 Core API 完成用户认证。
2. Core API 为当前 Agent 会话签发短期、范围受限的能力令牌或内部授权票据。
3. Agent Runtime 校验票据并将其绑定到 `agentSessionId`。
4. Agent 工具访问 Workspace 时，只能使用票据声明的项目、Workspace、模式和操作范围。
5. 权限失败、票据过期或项目不匹配时 fail-closed。

现有 `INTERNAL_API_TOKEN` 可以作为服务间鉴权的过渡实现，但不应承担用户级、项目级和 Workspace 级授权语义。

### 6.4 浏览器到 Agent Runtime 的连接

推荐让浏览器通过 Core API/BFF 或边缘层连接 Agent Runtime，统一处理用户认证和短期票据。若出于 WebSocket 延迟或部署原因必须让浏览器直连 Agent Runtime，则必须使用短期签名票据，不能暴露服务间 Token，也不能仅凭 `projectId` 或 `workingDir` 授权。

### 6.5 评论 AI 和模型配置

- 评论实体和 @AI 任务触发属于 Core API。
- Agent Runtime 负责执行任务、流式输出和运行记录。
- 任务状态和最终结果通过明确的任务 API/事件回写 Core API。
- 模型供应商配置以 Core API 的持久化配置为源，Agent Runtime 只维护带版本的运行时缓存。
- 配置同步必须包含配置版本、更新时间、来源、成功/失败状态和可重试语义。

### 6.6 Workspace Authority 的迁移位置

Workspace Authority 是安全和数据完整性的基础设施，不应因为“Agent 工具需要写文件”而永久归属于 Agent Runtime。推荐顺序是：

- 先抽象为 `WorkspacePort`，让 Agent 工具依赖接口。
- 迁移期在同一服务或同一进程中使用本地适配器，保持行为不变。
- 之后把适配器指向 Core API 内的 Authority 模块。
- 当协同连接、写入吞吐和独立部署有实际需求时，再将 Authority/Collab 抽成独立 Workspace Service。

不建议在第一阶段同时重写 Yjs、Authority、发布和 Agent 工具，否则难以判断故障来自架构迁移还是业务行为变化。

## 七、分阶段实施计划

### 阶段 0：冻结边界和建立基线

- [ ] 建立路由所有权清单，标记每个接口的调用方、数据读写方和最终归属。
- [ ] 建立资源写入矩阵：Project、Page、Workspace、Session、Comment、Knowledge、Agent Run。
- [ ] 盘点所有直接 `fs`、`DATA_DIR`、`workspacePath`、`workingDir` 和共享目录访问。
- [ ] 盘点 Agent Runtime 与 author-site 的 REST、WebSocket、配置同步和事件回调。
- [ ] 定义 `agentSessionId`、`editorSessionId`、`workspaceId` 的语义和传递链路。
- [ ] 为 Agent Contract、Workspace Contract 和 Capability Contract 建立版本字段。

### 阶段 1：先做进程内逻辑拆分

- [ ] 在 Agent 服务内部将 Agent Runtime、Core/Workspace Adapter、API 适配层分目录和依赖方向隔离。
- [ ] 将 Pi Tools 对正式 Workspace 的读写改为依赖 `WorkspacePort`，禁止工具直接拿任意路径写入。
- [ ] 把项目 CRUD、编辑 Session、版本和业务校验标记为迁移中的 Core API 能力。
- [ ] 为跨模块依赖增加静态检查，禁止 Agent Runtime import 项目具体文件存储实现。
- [ ] 保持当前对外接口可用，先用适配器验证事件、receipt、协同和恢复语义。

### 阶段 2：迁移业务路由和权威写入

- [ ] 将 `/api/projects`、编辑 Session、版本和业务校验迁移到 Core API 归属范围。
- [ ] 将 Collab 和 Workspace Authority 迁移到 Core API 内的 Workspace 领域，或建立专用 Workspace Service。
- [ ] 让 Agent Runtime 通过内部 API/WorkspacePort 访问正式 Workspace。
- [ ] 将 Agent 的 `workingDir` 限制为临时工作区标识；正式项目只接受服务端解析的 `workspaceId`。
- [ ] 保证项目 API、Agent Tool、CLI 和自动任务都遵守同一个 Authority 写入入口。

### 阶段 3：建立认证、配置和事件契约

- [ ] 引入短期能力票据，覆盖用户、项目、Workspace、Agent 会话、模式和操作范围。
- [ ] 将浏览器直连 Agent 的鉴权改为 BFF/边缘代理或短期签名 WebSocket 票据。
- [ ] 将模型配置同步改为版本化 pull/push，并保留配置源、版本和失败状态。
- [ ] 将 Agent 任务与评论、发布等业务任务通过稳定任务 ID 和事件关联。
- [ ] 为 `run_summary`、Authority receipt、projection ack 和最终业务状态建立统一 trace ID。

### 阶段 4：移除共享文件写入和独立部署

- [ ] Agent Runtime 不再挂载正式项目 Workspace，或只挂载经过明确隔离的临时目录。
- [ ] Core API/Workspace Service 独占正式项目数据和 Authority 状态。
- [ ] Agent Run Log、对话 checkpoint 和运行时配置使用 Agent 自己的存储。
- [ ] 分别配置 Agent、Core API、Workspace、Knowledge 和 Screenshot 的资源预算与扩缩容策略。
- [ ] 完成 Agent 服务故障不影响项目 CRUD、项目 API 故障时 Agent fail-closed 的验证。

## 八、验证方案

### 8.1 静态验证

- 检查 Agent Runtime 是否仍直接 import 项目文件读写、项目元数据和发布实现。
- 检查正式 Workspace 是否存在两个以上写入入口。
- 检查服务间共享目录和环境变量是否仅用于迁移期，并有明确过期条件。
- 检查所有跨服务调用是否使用版本化 DTO、标准错误码和 trace ID。
- 检查是否存在 `sessionId` 语义混用或以客户端 `workingDir` 越权的路径。

### 8.2 契约验证

- Agent 消息发送、流式事件、取消、busy、审批、用户选择和错误恢复。
- 文件修改后的 `committed`、`mutationId`、revision、projection ack 和 `run_summary` 一致性。
- 能力票据的签发、过期、项目不匹配、Workspace 不匹配和只读模式。
- 模型配置版本同步、Agent 重启恢复和配置不可用时的降级。
- 评论 @AI 任务创建、执行、失败重试和结果回写。

### 8.3 端到端验证

- Agent 服务不可用时，项目列表、项目读取、配置编辑和发布仍可用。
- Core API 不可用时，Agent 不得绕过授权直接写正式 Workspace。
- 多人协同、AI 写入、自动保存、版本创建、发布和恢复不会互相覆盖。
- Agent 重启后能恢复允许恢复的运行状态，不能恢复已过期的用户能力。
- 多实例 Agent 不会错误共享内存态 Agent、Session 或 WebSocket 连接。

### 8.4 观测指标

- Agent 请求排队、模型等待、工具执行、Workspace API 调用和整体完成延迟。
- 按服务统计 CPU、内存、事件循环延迟、WebSocket 连接和失败率。
- 每次项目写入的 actor、service、workspace、revision、receipt 和 trace ID。
- 配置同步版本、最后成功时间、失败原因和重试次数。
- 跨服务调用的超时、重试、降级和 fail-closed 次数。

## 九、风险与待确认事项

### 9.1 主要风险

- Workspace Authority、Yjs 协同和自动保存之间存在较强时序耦合，迁移时容易引入丢稿或旧内容覆盖。
- 当前 Agent 工具大量依赖项目文件和 Workspace 上下文，改为 API 访问后会增加延迟和错误处理复杂度。
- 共享数据目录移除后，需要重新设计快照、备份、资源读取和截图编译的访问方式。
- 浏览器 WebSocket 代理、CORS、Cookie 和短期票据的组合需要单独验证。
- 模型配置从推送副本改为版本化配置后，需要处理 Agent 正在执行任务时的配置一致性。

### 9.2 待确认事项

- `author-site` 是否长期继续承担 Core API，还是在项目领域稳定后抽出专用 `core-api`。
- Workspace Authority 与 Hocuspocus 是否作为 Core API 内模块，还是独立为 Workspace Service。
- Agent 流式 WebSocket 最终采用 BFF/边缘代理，还是浏览器直连短期签名票据。
- Agent 对话历史和运行日志的持久化保留期限、查询主体和跨实例共享方式。
- 附件、图片资产和截图工具最终由 Agent Runtime、资源服务还是独立文件服务负责。
- 是否需要支持 Agent Runtime 多实例；如果支持，需要先确定 Session 粘性、事件总线和任务恢复方案。

## 十、相关代码路径

### 10.1 Agent Runtime

- `packages/agent-service/package.json`：Agent 服务依赖、构建和独立启动入口。
- `packages/agent-service/src/server.ts`：Fastify、CORS、WebSocket、Pi Agent 注册、Authority 恢复和任务恢复。
- `packages/agent-service/src/core/agent-manager.ts`：Agent 实例生命周期和内存态管理。
- `packages/agent-service/src/core/backend-agent.ts`：服务层 Agent 包装。
- `packages/agent-service/src/backends/pi-agent.ts`：Pi Agent 后端、模型调用、事件和工具集成。
- `packages/agent-service/src/backends/pi-tools/`：文件、页面、图片、预览、知识库、评论和外部工具。
- `packages/agent-service/src/routes/agent.ts`：Agent REST 请求和运行入口。
- `packages/agent-service/src/routes/websocket.ts`：Agent WebSocket 连接和消息协议。
- `packages/agent-service/src/routes/ws-event-router.ts`：底层事件到应用事件的转换。
- `packages/agent-service/src/session/`：Agent Session、checkpoint、运行日志和快照。

### 10.2 当前混入的项目/Workspace 后端

- `packages/agent-service/src/routes/projects.ts`：项目 CRUD、编辑 Session、保存、放弃和版本历史。
- `packages/agent-service/src/workspace/project-workspace-manager.ts`：项目目录、Session 目录和版本/快照操作。
- `packages/agent-service/src/workspace/workspace-manager.ts`：临时和项目工作空间管理。
- `packages/agent-service/src/workspace/workspace-mutation-authority.ts`：正式 Workspace mutation、receipt 和单写者队列。
- `packages/agent-service/src/routes/collab.ts`：协同连接和 Workspace 持久化入口。
- `packages/agent-service/src/routes/workspace-authority.ts`：Authority 查询、事件、mutation、snapshot 和 health API。
- `packages/agent-service/src/routes/comment-ai-task.ts`：评论 @AI 任务恢复和执行编排。
- `packages/project-core/`：项目领域服务和资源/配置相关共享逻辑。
- `packages/shared/src/contracts.ts`：当前跨服务共享类型和契约。

### 10.3 author-site 与 Agent 的连接

- `packages/author-site/src/lib/agent-client.ts`：浏览器/服务端 Agent Client 实例。
- `packages/agent-client/src/client.ts`：Agent REST/WebSocket 客户端 SDK。
- `packages/author-site/src/app/api/ai/chat/route.ts`：author-site 侧 AI 请求入口。
- `packages/author-site/src/app/api/sessions/`：编辑 Session 相关 API。
- `packages/author-site/src/app/api/projects/`：项目、页面、配置、版本、发布和资源 API。
- `packages/author-site/src/lib/agent-providers.ts`：内部配置、用户模型和外部授权同步。
- `packages/author-site/src/lib/backend-providers-sync.ts`：Agent 重启后的配置核验和补偿同步。
- `packages/author-site/src/lib/workspace-flush.ts`：协同 Workspace flush 调用。

### 10.4 部署与文档

- `docker-compose.yml`：服务、端口、数据卷、环境变量、依赖和资源限制。
- `docker/agent-service/Dockerfile`：Agent 服务镜像构建和运行时依赖。
- `docker/author-site/Dockerfile`：author-site 构建和运行时边界。
- `docs/项目文档/独立Agent服务层/README.md`：当前 Agent 服务层职责和接口导航。
- `docs/项目文档/独立Agent服务层/01-架构设计.md`：当前独立 Agent 层架构设计。
- `docs/项目文档/独立Agent服务层/02-接口规范.md`：Agent REST、WebSocket、Authority 和内部配置接口。
- `docs/项目文档/独立Agent服务层/03-核心模块设计.md`：Agent、工具、Session、Workspace 和路由模块职责。
- `docs/项目文档/创作端/03-项目管理/技术/11_实时保存与协同编辑.md`：Workspace、协同、Authority、自动保存和写入边界。
- `docs/项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md`：Agent 工具权限、写入和安全约束。
- `docs/项目文档/创作端/05-AI对话/技术/07_运行进度与事件日志.md`：Agent 运行状态、事件、busy、checkpoint 和日志。
- `docs/项目文档/创作端/06-基础设施/技术/03_Docker部署方案.md`：当前服务部署、端口、共享数据目录和资源预算。

## 十一、当前结论

1. 当前已经完成了 Agent 与 author-site 的进程级拆分，但没有完成业务领域和数据所有权拆分。
2. 长期应把 `agent-service` 收敛为 Agent Runtime，把项目、编辑 Session、Workspace、协同、版本和发布归还给 Core API/Workspace 领域。
3. 第一优先级是建立唯一写入方、显式 ID 和稳定内部契约；第二优先级才是迁移路由和取消共享数据卷。
4. Workspace Authority 不应被简单删除或绕过，应先通过 `WorkspacePort` 抽象，再渐进迁移其宿主位置。
5. 在实现前，应先完成阶段 0 的路由/数据/调用链盘点，并对 Workspace、自动保存、AI 写入、发布和恢复建立基线测试。

