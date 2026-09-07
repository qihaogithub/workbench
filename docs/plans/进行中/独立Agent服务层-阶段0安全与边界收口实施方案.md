---
covers:
  - packages/agent-service/src/server.ts
  - packages/agent-service/src/routes/
  - packages/agent-service/src/config/session-authorizations.ts
  - packages/agent-service/src/workspace/project-workspace-manager.ts
  - packages/agent-client/
  - packages/author-site/src/app/api/sessions/
  - packages/author-site/src/lib/agent-client.ts
  - packages/author-site/src/lib/agent-providers.ts
  - packages/author-site/src/lib/workspace-authority-client.ts
  - packages/project-core/src/types.ts
  - packages/project-cli/
  - OPS/CLI/
  - packages/shared/src/contracts.ts
  - docker-compose.yml
  - docs/项目文档/独立Agent服务层/
  - docs/项目文档/创作端/03-项目管理/
  - docs/项目文档/创作端/05-AI对话/
  - docs/项目文档/创作端/06-基础设施/
---

# 独立 Agent 服务层：阶段 0 安全与边界收口实施方案

> 状态：建议立即实施，尚未开始
> 日期：2026-09-06
> 文档性质：可独立执行的近期实施计划
> 上位方案：[独立 Agent Runtime、Workspace 服务与业务后端拆分方案](./独立Agent服务层与业务后端拆分方案.md)
> 当前授权：仅拆分和完善计划，不修改代码、接口、部署配置或数据

## 一、决策

阶段 0 立即实施，但不启动 Workspace Service 物理拆分。

本阶段只处理已经存在、且与未来服务拓扑无关的安全和数据完整性问题：

1. 下线 Agent Service 中的旧项目写旁路；
2. 取消普通业务客户端自动接纳 external drift；
3. 为 Agent、附件、Authority 和 WebSocket 建立统一、可验证的入口身份；
4. 让 Workspace mutation 的 actor 来自服务端认证上下文；
5. 固化后续拆分必须保持的 Authority/Collab 行为基线。

阶段 0 不创建 `workspace-service`，不迁移数据，不改变 Authority 的宿主位置，也不移除共享数据卷。这样可以先获得高 ROI 的安全收益，同时避免把权限修复、协议迁移和有状态服务拆分混成一次高风险变更。

## 二、问题证据

### 2.1 旧项目 API 是现行主流程之外的写旁路

`packages/agent-service/src/routes/projects.ts` 仍公开注册项目创建、删除、旧临时编辑 Session、保存、放弃和版本接口。其实现 `project-workspace-manager.ts`：

- 直接读写 `data/projects`、`data/sessions`、`data/snapshots`；
- 保存时通过目录复制覆盖 canonical 项目 Workspace；
- 删除时直接清理项目、Session、快照和 Authority 目录；
- 使用 `legacy_temp_workspace`，不遵循当前 live Workspace 和 canonical materialization 流程；
- 路由没有业务用户鉴权。

仓库源码检索没有发现当前主产品调用这些写接口；主项目和编辑 Session 流程已经位于 author-site。唯一明确残留耦合是 `viewer-readonly` 直接复用 `ProjectWorkspaceManager` 读取项目。

结论：旧写路由应删除，不应迁移或继续兼容；删除 manager 前只需先替换 viewer 的只读读取能力。

### 2.2 Agent Service 没有统一公共入口认证

当前 `INTERNAL_API_TOKEN` 主要保护 `/internal/*`；Agent 消息、标题、模型探测、附件、旧项目、Authority 和 WebSocket 没有统一的全局认证层。

现有 Session authorization push 会让缺失作者角色的 AI 写工具 fail-closed，这是必要但不充分的二级防线，因为：

- CORS 不是认证；
- `sessionId`、`projectId`、`workspaceId` 和 `workingDir` 不是凭证；
- 未认证调用仍可能消耗模型、上传文件、探测配置或访问错误的资源范围；
- WebSocket 消息当前可以继续携带项目和工作目录意图，连接身份没有先固定；
- Authority 虽会校验共享 Session/Workspace 元数据，但缺少独立服务身份，且请求 actor 由调用方提交。

### 2.3 普通业务客户端会自动 adopt external drift

`packages/author-site/src/lib/workspace-authority-client.ts` 的 `commitWorkspaceMutation()` 收到 `WORKSPACE_EXTERNAL_DRIFT` 后，会自动调用 `reconcile/adopt` 并重试。

这与长期文档中的“检测到旁路修改后 fail-closed，只允许显式修复”冲突。自动 adopt 会把 Authority 之外的磁盘变化接纳成新基线，削弱 drift 告警和阻断机制。

结论：普通业务路径必须返回稳定冲突，不得自动 adopt；adopt/restore 只允许独立 operator 身份显式触发。

## 三、目标与非目标

### 3.1 目标

- 未认证请求不能调用模型、上传/删除附件、访问项目写接口或提交 Workspace mutation。
- 浏览器和机器调用方使用不同凭据，不把服务间 Token 暴露给前端。
- Agent/WebSocket 身份绑定项目、Session 和允许操作；连接建立后不能靠消息切换权限范围。
- Authority 的 actor 由服务端根据认证主体生成，拒绝或忽略请求体伪造 actor。
- external drift 默认 fail-closed，普通业务调用方不能自动 adopt。
- 旧项目写路由和旧 Session 写实现从运行时入口移除。
- 阶段 0 不改变 Workspace mutation、receipt、revision、rootHash、草稿 flush 和恢复语义。

### 3.2 非目标

- 不创建或部署 Workspace Service。
- 不迁移 Authority、Hocuspocus 或数据目录。
- 不解决 Agent/Workspace 多实例扩容。
- 不重写项目领域、Yjs 或 Authority 事务实现。
- 不用长期兼容层保留已确认无调用的旧项目 API。
- 不把 `INTERNAL_API_TOKEN` 或模型 API Key 发送给浏览器。

## 四、入口分级与最小认证设计

### 4.1 入口分级

| 入口                                        | 目标级别         | 阶段 0 规则                                              |
| ------------------------------------------- | ---------------- | -------------------------------------------------------- |
| `/health`                                   | 公开最小健康检查 | 只返回存活状态；详细恢复/队列信息走内部诊断              |
| Agent message/title/models/tools            | 用户受权入口     | 要求短期 Agent ticket，并绑定 agentSession/project/scope |
| Agent WebSocket                             | 用户受权长连接   | 首帧认证后才能处理其他消息；超时或失败立即关闭           |
| Collab WebSocket                            | 用户受权长连接   | 使用独立 Collab ticket，绑定 editorSession/workspace     |
| 附件上传/删除                               | 用户受权入口     | 校验 Session、项目和附件 owner；不能只信 projectId       |
| Workspace state/resource/mutation/staging   | 内部或受限代理   | 要求服务身份，并继续校验 Session/Workspace 绑定          |
| Workspace reconcile adopt/restore           | 运维入口         | 独立 operator 身份、审计记录，不对普通业务客户端开放     |
| `/internal/*`                               | 服务间入口       | 保留并统一现有内部 Token 校验与日志脱敏                  |
| 旧 `/api/projects`、旧编辑 Session/版本接口 | 删除             | 不增加新认证层后继续保留                                 |

### 4.2 浏览器 Agent ticket

使用由 author-site 在完成登录、项目授权和编辑 Session 校验后签发的短期、用途受限票据，不复用登录 Cookie，也不暴露 `INTERNAL_API_TOKEN`。

最小 claims：

- `typ`、`aud`、`contractVersion`；
- `subjectUserId`、`role`；
- `projectId`、`editorSessionId`、`workspaceId`、`agentSessionId`；
- `scopes`；
- `iat`、`exp`、`jti`。

规则：

- HTTP 使用 `Authorization: Bearer <ticket>`；
- Agent WebSocket 优先使用认证首帧，避免把票据放入 URL 和访问日志；
- 服务端在认证成功后把 claims 固定到连接上下文；
- 后续消息中的 `projectId`、`workspaceId`、role 和 `workingDir` 只能与 claims 一致，不能扩大范围；
- ticket 使用短 TTL，通过 author-site 的已认证接口续签；
- 阶段 0 先使用签名票据的离线校验，不引入全量在线 Session 查询；只有高风险撤销需求再增加 `jti` denylist。

普通短期签名 ticket 本质上仍是 bearer credential，离线校验不能承诺同一 scope 内绝对不可重放。阶段 0 通过 TLS、短 TTL、Session/项目/Workspace 绑定、连接级 claims 和并发策略限制风险；operator 等高风险操作若要求一次性语义，必须使用在线 nonce/jti 校验，不能只依赖签名和过期时间。

### 4.3 Collab ticket

Collab 使用独立 audience 和 scopes，不复用 Agent ticket。票据只允许连接指定 `editorSessionId`、`workspaceId` 和资源集合。

如果当前 Hocuspocus provider 只能通过连接参数传 token：

- 使用更短 TTL；
- 服务端日志必须脱敏 URL/query；
- 不把 token 写入诊断事件、错误详情或持久 Session 文件；
- 连接成功后只保存解析后的 claims，不保存原 token。

### 4.4 服务身份与 operator 身份

- author-site、Agent Runtime、project-cli gateway 和 OPS CLI 不能共用一个无法区分主体的万能身份。
- 阶段 0 可以复用现有内部 Token 机制，但至少按用途拆分普通 service 与 operator 凭据。
- Workspace 普通 API 同时验证服务身份和 Session/Workspace 业务绑定。
- reconcile adopt/restore 只接受 operator 凭据，并记录 operator、目标 Workspace、前后 revision/rootHash、reason 和 traceId。
- 客户端提交的 `WorkspaceMutationRequest.actor` 不作为最终审计身份；服务端从认证上下文生成 actor，并保留调用服务与最终用户两个维度。

## 五、实施工作包

### 5.1 工作包 A：路由清单与旧旁路删除

- [ ] 建立机器可检查的路由清单，记录 owner、调用方、认证级别、读写目录和去留。
- [ ] 检索 author-site、viewer、agent-client、project-cli、OPS CLI、自动化和测试中的旧项目 endpoint 调用。
- [ ] 有可用部署日志时核对旧 endpoint 调用量；无部署流量时以仓库调用清单和现有契约测试为删除依据。
- [ ] 为 viewer-readonly 提供最小只读 Project Context/Repository，停止依赖可写 `ProjectWorkspaceManager`。
- [ ] 从 `routes/index.ts` 移除 `registerProjectRoutes`。
- [ ] 删除旧项目创建、删除、旧 Session 保存/放弃和旧版本代码及专用 contract；不保留兼容 flag。
- [ ] 增加静态门禁，阻止 Agent Runtime 重新注册项目 CRUD 或直接删除 canonical 项目目录。

完成标准：旧项目写 endpoint 返回 404；viewer-readonly 仍能读取允许的项目上下文；现行 author-site 项目与 Session 流程不变。

### 5.2 工作包 B：取消 drift 自动 adopt

- [ ] 删除 `commitWorkspaceMutation()` 对 `WORKSPACE_EXTERNAL_DRIFT` 的自动 reconcile/adopt 和重试。
- [ ] 普通 mutation 将稳定的 409/`WORKSPACE_EXTERNAL_DRIFT` 原样返回调用方。
- [ ] 将 adopt/restore 与普通 Workspace client 分离到 operator client。
- [ ] operator 请求要求独立凭据、显式 reason 和审计记录。
- [ ] 更新与长期项目文档相冲突的代码注释和测试。

完成标准：制造外部漂移后，普通保存不会改变 Authority 基线或磁盘内容；只有 operator 流程能显式 adopt/restore。

### 5.3 工作包 C：公共入口认证

- [ ] 定义共享 ticket claims、scopes、错误码和版本校验。
- [ ] author-site Session bootstrap 签发 Agent/Collab ticket，并提供受认证续签入口。
- [ ] agent-client 为 HTTP 自动附带 Bearer ticket。
- [ ] Agent WebSocket 增加认证首帧、认证超时和连接级 claims。
- [ ] Agent HTTP、标题、模型、附件和工具能力接口接入统一认证 middleware。
- [ ] Collab 连接接入独立 ticket 校验。
- [ ] Authority 普通接口要求服务身份；浏览器继续经 author-site 的受限同源代理访问。
- [ ] 详细 health、Authority state 和运维端点不再作为公开匿名诊断面。
- [ ] 从 CORS 允许头和 SDK 中移除无服务端语义的伪认证字段，或为机器凭据赋予明确 principal；不能继续“客户端发送但服务端不校验”。

完成标准：匿名、过期、错误 audience、项目不匹配和 scope 不足请求均稳定失败；合法编辑、viewer 只读、Agent 对话和 Collab 主流程通过。

### 5.4 工作包 D：Authority actor 收口

- [ ] 定义认证上下文到 `WorkspaceMutationActor` 的唯一映射。
- [ ] author-site 请求记录 service=`author-site` 与 subject user，而不是直接相信 body actor。
- [ ] Pi Tools 请求记录 service=`agent-runtime`、subject user、agentSessionId 和 agentRunId。
- [ ] CLI/自动化使用各自 service principal，并保留触发用户或 automation ID。
- [ ] 请求体 actor 与认证上下文冲突时拒绝请求，或由服务端覆盖并记录安全事件；最终只选择一种统一策略。
- [ ] receipt/journal/诊断不记录原始 ticket、内部 Token 或模型密钥。

完成标准：伪造 body actor 不能改变 receipt/journal 中的真实调用主体。

### 5.5 工作包 E：行为基线与静态门禁

- [ ] 固化 Agent message、stream、cancel、busy、approval、choice 和 run summary 契约。
- [ ] 固化 Authority mutation、receipt、conflict、drift、backup、recovery 和 projection ack 契约。
- [ ] 固化 Collab 初始同步、草稿 flush、重连和 committed event 投影。
- [ ] 固化 author-site Session 创建、续租、保存、版本和发布前 canonical materialization。
- [ ] 增加静态检查：无认证写路由、Agent 项目 CRUD、普通 client reconcile、客户端绝对 `workingDir` 授权均视为失败。
- [ ] 对 auth/ticket/claims 日志增加秘密扫描和脱敏测试。

完成标准：后续阶段 1–2 能以这些测试证明“只换边界、不改语义”。

### 5.6 工作包 F：文档同步

- [ ] 使用 `doc-maintainer` 更新独立 Agent 服务层的架构、接口和核心模块文档。
- [ ] 更新项目管理的实时保存/协同文档，统一 drift fail-closed 与 operator reconcile 语义。
- [ ] 更新 AI 对话文档中的 Agent ticket、附件和 WebSocket 身份边界。
- [ ] 更新基础设施文档中的公开、内部和 operator 入口及环境变量。
- [ ] 更新相关模块 INDEX；删除对旧项目 API 的主线描述。
- [ ] 若形成新的长期仓库约定，同步维护根或包级 `AGENTS.md`。

## 六、建议交付顺序

### 交付 0A：数据完整性止血

先完成工作包 A、B：删除旧项目旁路并取消 drift 自动 adopt。这两项不需要等待完整 ticket 体系，且能最快降低不可逆数据风险。

### 交付 0B：入口身份闭环

完成工作包 C、D：统一 HTTP/WS 身份、区分 service/operator、收口 actor。涉及 author-site、agent-client、agent-service 和 Collab，必须协调发布，不能只上线单边协议。

### 交付 0C：门禁和文档

完成工作包 E、F：把关键契约、静态检查和长期文档作为阶段 0 退出条件，而不是实施结束后的补记。

每个交付均应独立可回滚；回滚采用代码版本回退，不恢复已确认废弃的旧项目旁路，不通过自动 adopt 掩盖回滚产生的 drift。

## 七、验证方案

### 7.1 必跑检查

```bash
corepack pnpm check:contracts
corepack pnpm check:workspace-authority
corepack pnpm check:agent
corepack pnpm check:agent-client
corepack pnpm check:author
corepack pnpm check:project-core
corepack pnpm check:project-cli
corepack pnpm test:e2e:core-flow
```

若改动 Collab、自动保存或 Authority 恢复链路，再运行对应 Workspace/协同专项测试和部署预检：

```bash
corepack pnpm check:workspace-deploy-preflight
corepack pnpm test:workspace-deploy-preflight
```

### 7.2 安全用例

- 匿名 HTTP 调用 Agent、附件、Authority 写接口返回 401。
- 合法身份但 scope 不足、项目不匹配或 Workspace 不匹配返回 403。
- 过期、错误 audience、错误版本和篡改 ticket 被拒绝；票据跨 Session、项目或 Workspace 重放被 scope 绑定拒绝。
- WebSocket 未认证先发业务消息、认证超时或重复换身份时关闭连接。
- 伪造 body actor 不改变服务端审计主体。
- 普通业务身份不能调用 reconcile adopt/restore。
- Ticket、内部 Token 和模型密钥不出现在 URL、日志、诊断或错误响应。

### 7.3 数据完整性用例

- external drift 后普通 mutation 返回 `WORKSPACE_EXTERNAL_DRIFT`，revision/rootHash 不变。
- operator adopt/restore 产生完整审计，且结果与显式选择一致。
- 旧项目写 endpoint 不存在，现行 author-site 项目/Session 流程正常。
- Authority receipt、backup、恢复、草稿 flush 和 projection ack 与修改前基线一致。
- 认证失败不会创建 Agent、写附件、创建 staging 或触发模型调用。

## 八、退出门禁

只有全部满足后，阶段 0 才能标记完成并进入长期方案的阶段 1：

- [ ] Agent Service 不再注册旧项目 CRUD/旧编辑 Session 写路由。
- [ ] viewer-readonly 不再依赖可写旧 manager。
- [ ] 普通业务 client 不再自动 adopt external drift。
- [ ] 所有非公开 HTTP/WS 入口均有明确认证级别和自动化测试。
- [ ] 浏览器不持有服务间或 operator 凭据。
- [ ] Authority actor 由服务端认证上下文生成。
- [ ] 匿名、越权、过期、跨 scope 重放和 actor 伪造用例通过；同 scope 重放边界与连接并发策略有明确测试。
- [ ] Authority、Collab、Session、Agent 主流程回归通过。
- [ ] 长期项目文档和模块 INDEX 已同步。
- [ ] 没有新增兼容旁路、双写或失败后直写磁盘 fallback。

## 九、风险与控制

| 风险                                      | 控制措施                                                          |
| ----------------------------------------- | ----------------------------------------------------------------- |
| 外部未知调用方仍使用旧项目 API            | 仓库调用清单 + 可用访问日志；项目未上线，不保留长期兼容入口       |
| Ticket 改造导致 Agent/Collab 连接失败     | author-site、agent-client、Agent Service 协调发布；先完成契约测试 |
| Token 出现在 URL 或日志                   | Agent WS 使用认证首帧；Collab 必要 query 全面脱敏并缩短 TTL       |
| 认证中间件误伤内部调用                    | 建立公开/用户/service/operator 四级路由矩阵和逐路由测试           |
| drift 改为 fail-closed 后暴露历史旁路修改 | 提供显式 operator runbook，不以自动 adopt 恢复可用性              |
| actor 收口改变历史诊断字段                | 保留 DTO 字段但由服务端赋值，同步消费者和文档                     |
| 阶段 0 膨胀成服务拆分                     | 严守非目标；Workspace Service 和共享卷迁移留在上位方案            |

## 十、任务状态

### 当前进度

- [x] 完成阶段 0 独立立项和范围拆分。
- [x] 完成现状源码核验与问题分级。
- [ ] 工作包 A：路由清单与旧旁路删除。
- [ ] 工作包 B：取消 drift 自动 adopt。
- [ ] 工作包 C：公共入口认证。
- [ ] 工作包 D：Authority actor 收口。
- [ ] 工作包 E：行为基线与静态门禁。
- [ ] 工作包 F：长期文档同步。

### 当前阻塞

无实施级外部阻塞。进入编码前只需在工作包 C 内确定 ticket 签名密钥管理方式和 Collab token 传输细节；这两个选择不得阻塞工作包 A、B 先行。
