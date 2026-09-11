---
covers:
  - packages/shared/src/document/contracts.ts
  - packages/shared/src/document.ts
  - packages/project-core/src/documents/types.ts
  - packages/project-core/src/documents/errors.ts
  - packages/project-core/src/documents/policy.ts
  - packages/project-core/src/documents/application-service.ts
  - packages/project-core/src/documents/workspace-document-repository.ts
  - packages/project-core/src/documents/resource-version-adapter.ts
  - packages/project-core/src/documents/index.ts
  - packages/author-site/src/lib/document-application-service.ts
  - packages/author-site/src/app/api/projects/[projectId]/documents/route.ts
  - packages/author-site/src/app/api/projects/[projectId]/documents/[documentId]/route.ts
  - packages/author-site/src/app/api/projects/[projectId]/documents/[documentId]/revisions/route.ts
  - packages/author-site/src/app/api/projects/[projectId]/documents/[documentId]/revisions/[revisionId]/route.ts
  - packages/author-site/src/app/api/projects/[projectId]/documents/[documentId]/restore/route.ts
---

# 文档应用层与项目子资源 API

## 一、边界与职责

知识文档现在有一个独立的应用层门面，但仍然物理保存在项目 Workspace 中。门面只接收稳定的 `projectId + documentId`，不把工作目录、文件名或绝对路径暴露给调用方。

应用层由三部分协作：

- `DocumentPolicy` 负责项目访问、只读文档和角色判断。
- `WorkspaceDocumentRepository` 将稳定 ID 映射到 Workspace 的 manifest 与 Markdown 文件；它是唯一需要知道物化文件名的适配器。
- `ResourceVersionDocumentAdapter` 将文档历史映射到既有 `ResourceVersion` 轴，不创建第二套 revision 存储。

Author API 只负责认证、参数校验、Session/Workspace 上下文解析、调用门面和错误投影。后续分享页、Agent 和 CLI 应直接复用 `@workbench/project-core/documents`，不能在入口处重新实现 manifest、路径、版本或权限逻辑。

## 二、稳定契约

共享包 `@workbench/shared/document` 提供以下 DTO：

- `DocumentLocator`：只包含 `projectId` 和 `documentId`。
- `DocumentSnapshot`：包含标题、描述、Markdown 正文、创建/更新时间、内容哈希、来源和 Workspace Authority 证明字段；不包含 `workingDir`、`fileName`、Token 或 Session 内部字段。
- `DocumentListItem`：列表用的轻量快照，不带正文。
- `DocumentListResult`：包含 `items` 与 `issues`；`items` 只含正文存在的文档，`issues` 用稳定 `source_missing` 语义报告 manifest 孤儿及可修复的文档 ID、标题。
- `DocumentWriteResult`：返回最新快照，可附带 Authority revision/rootHash 和 ResourceVersion ID。
- `DocumentDeleteResult`：返回被删除的正常元数据或一致性问题，并附带 Authority receipt；正文缺失的孤儿不会伪造 ResourceVersion。
- `DocumentRevisionSummary` / `DocumentRevisionDetail`：ResourceVersion 的文档领域视图。

错误码被收敛为文档不存在、禁止、只读、冲突、Authority 未就绪和版本不存在等稳定语义。底层 Workspace 错误在应用层转换后再返回，调用方不需要理解文件系统或 HTTP 状态的差异。

## 三、读写流程

读取时，应用层先检查 actor 是否能访问项目。列表只读取 manifest 与逐条文件 stat，不加载所有 Markdown 正文；单个正文缺失只进入 `issues`，不会使整份列表失败。单文档读取才返回正文和内容哈希，正文缺失仍返回文档不存在。

创建、更新、删除和恢复都经过同一个门面：

1. 校验项目和文档权限，系统来源或只读条目在写入前拒绝。
2. repository 生成 manifest 与正文的成对变更。
3. live Workspace 检测到 `.workspace.json` 的 live scope 时，只能通过 `DocumentAuthorityPort` 提交一次 mutation，并等待 receipt；缺少有效 Session/Authority 时 fail-closed。
4. branch/offline Workspace 由 repository 写入受管目录。
5. 成功后通过 `ResourceVersionDocumentAdapter` 记录或读取现有资源版本；版本记录失败不会改变正文已经成功的事实。

正常删除仍保留正文快照并创建 tombstone，恢复从既有版本读取正文和元数据后重新物化。对于只剩 manifest 的孤儿，删除只通过 Authority 原子移除 manifest 条目并返回 receipt，不因无法读取旧正文而阻塞修复。评论、`wb://` 引用、画布布局、发布快照和知识索引继续由各自领域持有。

## 四、项目子资源 API

登录态 API 使用项目子资源路径：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/projects/:projectId/documents` | 返回 `{ items, issues }`，分离有效元数据与一致性异常 |
| POST | `/api/projects/:projectId/documents` | 创建文档 |
| GET | `/api/projects/:projectId/documents/:documentId` | 读取正文与元数据 |
| PATCH | `/api/projects/:projectId/documents/:documentId` | 更新标题、描述或正文 |
| DELETE | `/api/projects/:projectId/documents/:documentId` | 删除正常文档或 manifest 孤儿；正常文档写入 tombstone |
| GET | `/api/projects/:projectId/documents/:documentId/revisions` | 列出 ResourceVersion 视图 |
| GET | `/api/projects/:projectId/documents/:documentId/revisions/:revisionId` | 读取指定版本 |
| POST | `/api/projects/:projectId/documents/:documentId/restore` | 恢复指定版本 |

live 写入所需的 `sessionId` 只作为请求上下文，用于服务端解析 Workspace 和 Authority；它不进入公开文档 DTO。客户端不再传 `workingDir` 或用路径拼接文档身份。

## 五、测试与演进

`project-core` 的文档领域测试使用临时 Workspace，覆盖稳定身份、列表脱正文、角色/只读边界、live Authority mutation 和缺少 Session 时的 fail-closed 行为，不需要启动 Next.js 或 knowledge-service。

当未来出现跨项目文档、组织级 ACL、独立运维边界或 Workspace 性能瓶颈时，再按“拆包 → 拆 API 进程 → durable outbox → 独立站点 → 正文迁移”的顺序评估物理独立化。
