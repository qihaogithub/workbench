---
covers:
  - packages/demo-ui/src/DocumentEditor.tsx
  - packages/author-site/src/components/demo/DocumentView.tsx
  - packages/author-site/src/components/demo/KnowledgeDocDialog.tsx
  - packages/author-site/src/components/demo/document-api-adapter.ts
  - packages/shared/src/document.ts
  - packages/shared/src/document/contracts.ts
  - packages/author-site/src/app/api/knowledge/route.ts
  - packages/author-site/src/app/api/knowledge/[docId]/route.ts
  - packages/author-site/src/app/api/knowledge/content/route.ts
  - packages/project-core/src/service.ts
  - packages/project-core/src/workspace-resource-registry.ts
  - packages/agent-service/src/collab
  - packages/agent-service/src/workspace/workspace-mutation-authority.ts
  - packages/knowledge-service/src/sqlite-catalog.ts
  - packages/knowledge-service/src/server.ts
  - packages/viewer-site/src/components/ViewerDocumentView.tsx
---

# 创作端文档相关功能可维护性提升方案

> 更新日期：2026-09-01  
> 文档性质：架构收口与分阶段实施方案  
> 当前状态：Phase 1 已完成，Phase 2 生产编辑路径已迁移，兼容入口清理进行中

相关文档：

- [创作端知识库需求](../../项目文档/创作端/09-知识库/知识库_需求文档.md)
- [创作端知识库架构](../../项目文档/创作端/09-知识库/技术/01_知识库架构设计.md)
- [实时保存与协同编辑](../../项目文档/创作端/03-项目管理/技术/11_实时保存与协同编辑.md)
- [独立知识库服务架构](../../项目文档/独立知识库服务/技术/01_整体架构设计.md)
- [当前文档分享链接方案](./创作端-Markdown编辑器-当前文档分享链接方案.md)
- [项目、页面与文档引用方案](./创作端-Markdown编辑器-项目页面文档引用与双向链接方案.md)

## 一、结论先行

本方案不以新建独立文档平台为近期目标，而是：

> **建立统一的文档领域门面，收口文档身份、权限、读写、版本和对外 API，让新入口不再重复实现路径解析、保存、冲突和版本逻辑。**

近期采用“逻辑独立、物理共置”：

| 决策 | 结论 |
| --- | --- |
| 从 author-site route 抽离文档业务逻辑 | 是 |
| 统一使用 projectId + documentId | 是 |
| 新建 document-service | 否 |
| 迁移正文到独立数据库 | 否 |
| 新建第二套版本、评论、引用或发布系统 | 否 |
| 把所有 Markdown 统一为 Document | 否 |
| 保留未来物理独立化的可能 | 是，但必须由明确条件触发 |

## 二、目标与非目标

### 2.1 目标

1. 文档列表、读取、创建、更新、删除和恢复有唯一应用层入口。
2. Author、分享页、Agent 和 CLI 使用同一 typed document contract。
3. 业务 API 不接受 workingDir、fileName 或 resourcePath 作为权威定位。
4. live Workspace 文档操作不绕过现有协同和 Authority 边界。
5. 版本、评论、引用、画布、发布和知识索引复用现有能力。
6. 文档业务规则可脱离 Next.js、React 和真实文件系统测试。

### 2.2 非目标

近期不做：

- 不创建独立文档进程、容器或正文数据库。
- 不让文档模块接管整个 Workspace Authority。
- 不创建平行 DocumentRevision 存储。
- 不重写评论、wb:// 引用、Viewer 发布快照或 knowledge-service 索引。
- 不开放跨项目文档或组织级文档库。
- 不将 memory、公约、页面需求、DesignSpec 和配置字段强制转换成 Document。

## 三、当前可维护性问题

### 3.1 业务逻辑散落

文档规则分布在 author-site API route、DocumentView、KnowledgeDocDialog、project-core 和 agent-service 中。新增分享页、移动阅读或 Agent 工具时，容易重复实现保存、flush、权限和版本规则。

### 3.2 API 泄漏存储细节

当前部分 API 使用 workingDir + fileName，使浏览器必须理解 Workspace 结构，也导致路径、权限和文档定位逻辑重复。

### 3.3 写入与版本语义缺少统一编排

live、branch/offline、协同编辑、AI 写入和资源恢复使用不同底层路径。底层机制可以不同，但上层应共享同一组文档命令、成功边界和错误语义。

### 3.4 已有能力有被重复抽象的风险

系统已经具有 ResourceVersion、评论线程、wb:// 引用、发布快照和可重建知识索引。新文档边界应组合这些能力，不建平行系统。

## 四、概念边界

### 4.1 Markdown Toolkit

Markdown Toolkit 是格式和 UI 能力，包括编辑、只读渲染、图片与代码块、引用适配和评论选区采集。

DocumentEditor 继续只接收内容、状态和宿主回调，不读取项目路径、会话或分享 Token。

### 4.2 Knowledge Document Domain

近期 Document 仅指拥有稳定 docId 的用户知识文档，管理：

- 文档身份、元数据和项目权限投影。
- 列表、读取、创建、更新、删除、版本视图和恢复。
- 分享规则。
- 对评论、引用、画布、发布和知识索引的稳定集成标识。

memory、公约、页面需求、DesignSpec 和配置字段仍保持自己的身份、权限和写入事务，只复用 Markdown Toolkit。

### 4.3 相邻边界

| 边界 | 继续拥有的事实 |
| --- | --- |
| Project Platform | 项目、Workspace、页面、画布布局、文档绑定和发布编排 |
| Collaboration / Authority | 协同文本、受管资源持久化、回执、冲突和恢复边界 |
| Content Graph | 资源版本、blob、tombstone、恢复和项目提交 |
| Comment Domain | 评论线程、选区锚点、广播和 @AI |
| Reference Domain | wb://、backlinks、未链接提及和发布引用快照 |
| Knowledge Platform | 切分、FTS、阅读地图、可重建索引和知识报告 |
| Viewer | 已发布不可变快照的只读展示 |

## 五、推荐架构

### 5.1 逻辑结构

Author、分享页、Agent 和 CLI 统一调用 DocumentApplicationService。

DocumentApplicationService 组合以下边界：

- DocumentPolicy：项目访问和文档操作权限。
- DocumentRepositoryPort：稳定身份到 Workspace manifest/正文的映射。
- DocumentAuthorityPort：复用现有协同与 Authority 写入。
- DocumentRevisionPort：把文档版本映射到 ResourceVersion。
- Integration Ports：连接评论、引用、画布、发布和知识索引。

物理事实仍分别由 Workspace/manifest、Authority/Yjs、ResourceVersion 以及现有派生系统持有。

### 5.2 建议代码位置

近期不新增 workspace package：

- packages/project-core/src/documents/types.ts
- packages/project-core/src/documents/errors.ts
- packages/project-core/src/documents/policy.ts
- packages/project-core/src/documents/ports.ts
- packages/project-core/src/documents/application-service.ts
- packages/project-core/src/documents/workspace-document-repository.ts
- packages/project-core/src/documents/resource-version-adapter.ts
- packages/shared/src/document/contracts.ts
- packages/author-site/src/app/api/projects/[projectId]/documents/

如果后续出现多个与项目无关的独立消费者，再将 documents 模块提取为 document-core。无第二个实现或部署需求时，不新建空壳包。

### 5.3 最小契约

DocumentLocator 只包含 projectId 和 documentId。

DocumentSnapshot 至少包含：

- projectId、documentId。
- title、description、content、updatedAt。
- contentHash。
- 可选 workspaceRevision 和 workspaceRootHash。

DocumentWriteResult 至少包含：

- 最新 DocumentSnapshot。
- 可选 Authority revision/rootHash。
- 可选 ResourceVersion ID。

契约不包含 workingDir、fileName、绝对路径、普通 sessionId、内部 Token、knowledge:// 引用或 Viewer published path。

### 5.4 应用服务职责

DocumentApplicationService 负责：

- 校验 actor 的项目访问权限。
- 把 documentId 解析为 manifest 条目和物化路径。
- 组织正文与 manifest 的合并更新。
- 复用现有协同/Authority 链路完成 live 写入。
- 将文档版本映射到 ResourceVersion。
- 返回统一成功、冲突、不存在、禁止写入和 Authority 未就绪错误。
- 为评论、引用、发布和知识索引提供稳定定位和提交结果。

它不直接管理 Yjs/WebSocket，不实现新版本库，不修改画布布局或发布状态，不直接更新 knowledge-service 索引表。

## 六、写入、版本与派生数据

### 6.1 写入边界

创建、更新、删除和恢复统一进入 DocumentApplicationService：

- live Workspace 复用现有协同/Authority 链路。
- branch/offline 使用 project-core 受管事务。

业务成功以相应存储边界已经持久化并返回可核对结果为准，不以内存状态或 HTTP 提前返回为准。

### 6.2 版本唯一性

DocumentRevision 只是 knowledge_document ResourceVersion 的领域视图：

- revisionId 对应 ResourceVersion.id。
- contentHash 对应 ResourceVersion.contentHash。
- parent 对应 previousVersionId。
- content 来自 ResourceVersion 引用的 Markdown blob。

删除继续使用 tombstone，恢复继续使用现有资源恢复与 materialization。禁止新建平行 document_revisions 表。

### 6.3 其他领域

- 评论继续由 Comment Domain 持有，文档层只提供稳定 target locator。
- 引用继续使用 wb://document/{projectId}/{docId}。
- 画布只保存文档引用、布局和隐藏状态，不复制正文。
- Viewer 继续读取不可变发布快照，不访问 live Workspace。
- knowledge-service 仍以 reconcile 保证最终一致。
- 可以使用已持久化 receipt 降低投影延迟，但不新建平行事件源。
- 只有完成 durable outbox、消费游标、幂等、重放和失败补偿后，事件消费才可成为索引主链路。

## 七、API 收口

登录态 API 收口为项目子资源：

- GET /api/projects/:projectId/documents
- POST /api/projects/:projectId/documents
- GET /api/projects/:projectId/documents/:documentId
- PATCH /api/projects/:projectId/documents/:documentId
- DELETE /api/projects/:projectId/documents/:documentId
- GET /api/projects/:projectId/documents/:documentId/revisions
- GET /api/projects/:projectId/documents/:documentId/revisions/:revisionId
- POST /api/projects/:projectId/documents/:documentId/restore

route 只负责认证、参数适配、调用应用服务和错误投影，不直接读写 manifest 或文件。Workspace 和路径由服务端解析。

项目尚未上线，实施时直接替换旧 workingDir/fileName API，不建立长期兼容层。

文档分享继续遵循已有两段 capability 方案。分享页先作为 author-site 独立 route group，不因 URL 独立而拆分站点包。

## 八、前端边界

近期不新建 markdown-editor、markdown-renderer 和 document-ui 三个 package，先建立精确子路径：

- @workbench/demo-ui/DocumentEditor
- @workbench/demo-ui/MarkdownRenderer
- @workbench/demo-ui/markdown-reference

DocumentView 和 KnowledgeDocDialog 只负责列表、当前选择、编辑/阅读状态和调用统一 API，不拼接 Workspace 路径、解析 manifest、创建 ResourceVersion 或触发索引更新。

## 九、分阶段实施

### Phase 0：冻结边界与基线

- [x] 确认近期 Document 仅指用户知识文档。
- [x] 盘点 CRUD、恢复、AI 写入和协同 flush 入口。
- [x] 为 CRUD、ResourceVersion、引用快照和 Viewer 发布建立回归基线。
- [x] 定义 locator、snapshot、写入结果和错误码。

### Phase 1：抽取文档应用层

- [x] 在 project-core 建立 documents 模块。
- [x] 实现 DocumentApplicationService、policy 和最小 ports。
- [x] 以 Workspace/manifest 为 repository adapter。
- [x] 以现有协同/Authority 为 authority adapter。
- [x] 以 ResourceVersion 为 revision adapter。
- [x] 单测覆盖身份、权限、live Authority、系统只读文档和恢复前置条件。

### Phase 2：迁移 API 与 Author

- [x] 新建项目子资源文档 API。
- [x] DocumentView 和 KnowledgeDocDialog 的生产编辑路径改用 projectId + documentId。
- [x] 项目子资源 route 不再直接使用 fs、读写 manifest 或创建版本。
- [ ] 迁移全部内部消费者后删除旧路径 API，不保留兼容分支。

当前进度：项目子资源路由、typed contract、DocumentView、KnowledgeDocDialog 和画布文档回调已切到统一门面。为保持尚未迁移的旧测试与非编辑入口可用，组件仍保留显式 `legacy` 模式，旧 `/api/knowledge` 路由暂不删除；下一步是迁移剩余内部消费者并移除兼容分支。

本轮验证：`project-core` 全量测试 189 项通过；`author-site` 文档 API 与文档视图测试 15 项通过；`author-site`、`demo-ui` 类型检查通过。Author 全量测试受当前工作区其他未完成变更影响（38 个 suite 失败、其中包含缺失模块与既有 UI 用例失败），不能作为本方案回归门禁；全量 lint 仍有一个既有的 `html-sandbox-execution.test.ts` 规则错误，与本方案无关。

### Phase 3：收口写入与集成

- [ ] 排除 live 文档直接文件写入旁路。
- [ ] 将资源恢复、AI 写入和 CRUD 收口到统一命令语义。
- [ ] 合并重复的文档路径分类和受管资源策略。
- [ ] 文档删除对评论、引用和画布的影响由统一提交结果驱动。
- [ ] 可降低投影延迟，但保留 reconcile 补偿。

### Phase 4：在统一边界上迭代能力

- [ ] 接入单文档分享 capability 和 author-site 独立 route group。
- [ ] 对 Agent 和 CLI 暴露同一 typed API。
- [ ] 分享阅读页复用只读 renderer，不加载完整编辑器。
- [ ] 保持 live、share 和 published 文档的 URL、授权与缓存语义分离。

### Phase 5：条件性物理提取

本阶段不是默认任务。只有出现第十二节所列条件时，才评估 document-core 拆包、独立 API 进程、独立站点、durable outbox 或正文存储迁移。

## 十、验收标准

### 10.1 可维护性

- CRUD 和恢复规则只在一个应用模块中编排。
- author-site route 不直接读写 knowledge Markdown 或 manifest。
- UI 不传递路径作为文档业务身份。
- 新增文档入口时不重新实现权限、版本、路径和冲突逻辑。
- 文档领域测试不需要启动 Next.js、React 或 knowledge-service。

### 10.2 一致性与安全

- 正文只有一个当前持久化事实源。
- DocumentRevision 与 ResourceVersion 是同一版本轴。
- live 文档写入不绕过协同/Authority 边界。
- 索引失败不影响正文和版本。
- Viewer 不访问 live Workspace。
- actor 和项目从服务端认证上下文解析。
- 公开 DTO 不包含物理路径、内部 Token 或普通 session。

### 10.3 工程质量

- project-core 单测覆盖主要文档命令和错误语义。
- author-site API 测试证明 route 只做适配。
- 协同/Authority 集成测试验证正文与 manifest 提交。
- 发布和 Viewer 回归测试验证不可变快照和引用脱敏。

## 十一、风险与对策

### 11.1 过度抽象

只为真实外部边界建立 port。没有第二个实现或测试替身时，优先使用普通模块函数。

### 11.2 重复 project-core 规则

文档模块只编排项目权限、版本和 Workspace 能力，不复制底层规则。

### 11.3 新旧 API 长期并存

项目未上线，不建立兼容层。在一个可验证迁移阶段内更新全部消费者，随后删除旧路由。

### 11.4 事件化引入新一致性问题

短期保留 reconcile 作为可靠性边界。事件只作低延迟提示，完成 durable outbox 后才能升级为主链路。

### 11.5 范围扩张为“所有 Markdown”

新资源只有在拥有稳定身份、独立生命周期、明确权限和写入事务后，才评估是否纳入 Document Domain。

## 十二、物理独立化的触发条件

下列条件至少出现两项，且当前方案已经成为可测量瓶颈时，才立项物理独立化：

1. 文档可以不属于任何项目而创建。
2. 同一文档需要绑定多个项目。
3. 出现组织级文档库、独立 ACL 或保留策略。
4. 文档站点需要独立域名、发布周期或运维团队。
5. 文档协同负载需要与项目编辑独立扩缩容。
6. Workspace 文件模型出现经监控或压测确认的并发、性能瓶颈。
7. 文档需要独立计费、审计、备份或数据驻留边界。

触发后仍按“拆包 → 拆 API 进程 → 建立 durable outbox → 评估独立站点 → 最后评估正文迁移”的顺序进行。拆包、拆进程和迁移数据是三个独立决策。

## 十三、近期优先级

如果只安排一个迭代，按以下顺序执行：

1. 建立 DocumentApplicationService 和最小 typed contracts。
2. API 改为 projectId + documentId，移除客户端路径参数。
3. 将 route 中的 manifest、文件和版本编排移入应用层。
4. 让 DocumentRevision 直接复用 ResourceVersion。
5. 消除 live 文档写入旁路，统一成功和错误语义。
6. 在此边界上实现单文档分享，验证新入口不再复制业务逻辑。

完成以上六项后，即可获得大部分可维护性收益，无需先建新服务或迁移正文数据。
