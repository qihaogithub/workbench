---
covers:
  - packages/demo-ui/src/DocumentEditor.tsx
  - packages/author-site/src/components/demo/DocumentView.tsx
  - packages/author-site/src/components/demo/KnowledgeDocDialog.tsx
  - packages/author-site/src/components/share/ShareDialog.tsx
  - packages/author-site/src/app/api/knowledge/route.ts
  - packages/author-site/src/app/api/knowledge/[docId]/route.ts
  - packages/author-site/src/app/api/knowledge/content/route.ts
  - packages/author-site/src/hooks/useCollabDocument.ts
  - packages/agent-service/src/collab/extensions/session-auth.ts
  - packages/viewer-site/src/components/ViewerDocumentView.tsx
  - packages/project-core/src
  - packages/shared/src/markdown-reference
---

# 创作端 Markdown 编辑器：当前文档分享链接方案

> 更新日期：2026-09-01
>
> 文档性质：代码调研、目标架构与分阶段实施方案；本次仅编写方案，未修改业务代码。
>
> 调研基线：分支 `main`，提交 `d1e25d05`。调研期间不依赖工作区中与本需求无关的未提交改动。
>
> 相关文档：[知识库需求](../../项目文档/创作端/09-知识库/知识库_需求文档.md)、[知识库架构](../../项目文档/创作端/09-知识库/技术/01_知识库架构设计.md)、[实时保存与协同编辑](../../项目文档/创作端/03-项目管理/技术/11_实时保存与协同编辑.md)、[项目分享](../../项目文档/创作端/03-项目管理/技术/13_首页导航与项目分享.md)、[Markdown 引用与双向链接](./创作端-Markdown编辑器-项目页面文档引用与双向链接方案.md)

## 一、结论先行

建议新增一个独立的“文档分享”领域，不把它做成现有项目分享的一个 tab，也不把公开页面复用为项目 viewer：

1. **分享对象是稳定文档身份，不是路径。** 第一阶段以用户知识文档为范围，使用 `projectId + docId` 定位；`workingDir`、`fileName`、`sessionId` 只在服务端解析，绝不进入分享 URL 或公开 API。
2. **链接是可撤销的 bearer capability。** 生成高熵随机 secret，数据库只存 hash；链接打开后先兑换为短时、HttpOnly 的 share access，再访问文档 API 或协同房间。分享链接本身视为密码，页面设置 `no-referrer`、`no-store`、`noindex`。
3. **读写分离，权限最小化。** `read` 只能读取当前文档；`edit` 只能修改正文（可选地修改描述），不能改标题/文件名、manifest、项目配置、页面、发布、评论、AI、上传或删除。访客权限永远取“分享授权 ∩ 登录用户项目权限”的交集，不得借链接升级权限。
4. **读模式使用全屏公开路由，编辑模式使用受限实时协同。** 新增 `/s/doc/...` 全屏页面和独立的 share bootstrap API。只读页面直接读取 Authority 的当前快照；编辑页面取得短时、单资源的协同票据，新增 `share` principal，不能把现有作者 `sessionId` 当访客 token。
5. **默认分享当前 live 文档，而不是已发布快照。** 创建链接前先 flush 当前编辑态，打开时解析最新 Authority 内容；若未来需要“不可变版本链接”，另建 snapshot share，不混入本方案。

这是对当前架构的最小概念扩展：保留 `DocumentEditor` 的 Markdown 能力、Yjs/Authority 的写入链路和已存在的稳定 `docId`，只在其上增加 capability、公开渲染壳和受限协同适配层。

## 二、现状调研

### 2.1 编辑器与文档入口

- 共享编辑器是 `packages/demo-ui/src/DocumentEditor.tsx:67-97`。它接收 `value/onChange/readOnly`、上传、评论选区和 `wb://` 引用上下文；由 Crepe 产生 `markdownUpdated`，外部值通过 `replaceAll` 同步。组件没有分享、鉴权、路径读取或保存职责，因此不应在这里加入 share token 逻辑。
- 当前主编辑入口是 `packages/author-site/src/components/demo/DocumentView.tsx:57-78,112-127`，目标包括知识文档、memory、公约、页面公约和设计规范；知识文档从左侧目录选中后在右侧直接编辑（`DocumentView.tsx:1182-1205`）。它有约 800ms 防抖自动保存，并在切换/卸载时 flush（`DocumentView.tsx:471-528,530-560`）。知识文档保存调用 `/api/knowledge/:docId`（`DocumentView.tsx:361-413`）。
- `KnowledgeDocDialog` 是旧的阅读/编辑弹窗入口：编辑协同 descriptor 使用 `knowledge/${item.fileName}`（`KnowledgeDocDialog.tsx:101-122`），保存前 flush 再 PUT（`KnowledgeDocDialog.tsx:208-285`），阅读态是 Streamdown 且固定为 `max-w-4xl h-[85vh]` 对话框（`KnowledgeDocDialog.tsx:411-419,482-504`）。它可继续作为“从旧入口创建分享”的接线点，但不能作为公开全屏页面。
- `DocumentView` 的更多菜单目前只有历史、删除（`DocumentView.tsx:1334-1392`），编辑页 header 打开的 `ShareDialog` 是项目级分享（`edit/page.tsx:9110-9134` 以及对应 header 调用），没有当前文档上下文。

### 2.2 当前项目分享与 viewer

- `packages/author-site/src/components/share/ShareDialog.tsx:18-52,141-217` 只生成 `/demo/{projectId}/edit` 项目编辑链接或发布后的 viewer 链接；浏览链接要求先发布，语义是“整个项目的公开发布产物”，不是当前 live 文档。
- `packages/viewer-site/src/components/ViewerDocumentView.tsx:19-27,153-213` 读取发布项目下的知识文档，带左侧目录并只读渲染（`ViewerDocumentView.tsx:266-379`）。viewer 没有单文档路由、没有 live Workspace、没有编辑能力。因此不建议把文档分享强行塞进 viewer；否则会把实时文档和发布快照混为一谈，也会让编辑权限无法落地。

### 2.3 数据、保存与鉴权边界

- 知识文档 manifest 的稳定身份是 `docId`，`fileName` 只是物化文件名；知识库架构文档和 `KnowledgeDocDialog` 均以此为基础。当前 GET 内容接口仍接受 `workingDir + fileName`（`packages/author-site/src/app/api/knowledge/content/route.ts:8-42`），列表接口接受 `workingDir`（`packages/author-site/src/app/api/knowledge/route.ts:140-163`），不能直接作为公开分享 API。
- PUT/DELETE 会读取 manifest，校验 system 文档，live Workspace 通过 `commitWorkspaceMutation` 写入正文和 manifest（`packages/author-site/src/app/api/knowledge/[docId]/route.ts:91-191,202-304`）。分享编辑必须复用同一 Authority 事务入口，禁止直接写 `workingDir`。
- `useCollabDocument` 将 `sessionId` 作为 Hocuspocus token，document name 包含 project/workspace/resourcePath/kind（`packages/author-site/src/hooks/useCollabDocument.ts:73-103,198-240`）。Agent 的 `SessionAuthExtension` 只接受并验证 sessionId（`packages/agent-service/src/collab/extensions/session-auth.ts:23-78`）。这条链路是“已登录编辑会话”，不是公开 capability；把分享 secret 塞进 sessionId 会绕过现有会话语义并扩大权限。
- `packages/author-site/src/proxy.ts:15-20,85-103` 目前只在 Proxy 层保护 `/demo` 与 `/api/sessions`，知识库 GET 路由本身也未统一调用用户鉴权。新分享路由必须显式建立公开 bootstrap 与受保护管理 API，不能依赖当前 proxy 白名单的偶然行为。

### 2.4 可复用的现有能力

- `@workbench/shared/markdown-reference` 已有 `wb://project/page/document` 的 URI、解析器和权限投影；公开页面可复用“只显示允许目标、禁止浏览器直接请求 `wb://`”的规则，但分享页面默认不应把整个项目引用图暴露给匿名用户。
- `project-core` 已有稳定资源目录、Authority/Workspace 相关服务和资源版本记录，适合承载分享记录的领域类型、source resolver 与事务边界；author-site 只负责 HTTP/UI 适配，agent-service 只负责协同票据验证。
- author-site 的 `/viewer`、`/embed` 和部分 `/api/viewer/:projectId/data` 是项目级公开入口，当前不带文档 share grant；即使它们能返回 live 或发布数据，也不能作为文档分享的鉴权边界。

## 三、产品范围与不变量

### 3.1 第一阶段范围

**支持：**

- 从当前知识文档的目录更多菜单、文档编辑器顶部操作栏和旧 `KnowledgeDocDialog` 标题栏打开“分享当前文档”。
- 创建“只读链接”或“可编辑链接”，复制、查看、撤销；同一文档可存在多个链接。
- 未登录收件人打开链接后，全屏展示一个文档，不展示项目导航、作者侧边栏或其它文档列表。
- read 链接读取最新 live 文档；edit 链接可在受限编辑器中保存正文，并可看到必要的“已保存/冲突/链接已撤销”状态。
- 文档改标题或物化文件名后链接仍有效；文档删除、项目归档、链接撤销或过期后立即失效。

**暂不支持：**

- memory、项目公约、页面公约、设计规范条目、画布节点、临时 AI 计划等非知识文档来源；这些资源的 source locator 和写权限尚未统一。
- 发布版本/历史版本分享、跨项目分享、分享整个项目、评论/批注、AI 操作、文件上传、文档重命名/删除、manifest 元数据写入。
- 匿名用户沿 `wb://` 链接浏览整个项目。默认只将引用显示为不可跳转或“目标未在分享范围内”；若未来支持链式分享，必须为每个目标再次校验独立 capability。

### 3.2 关键不变量

1. capability 只绑定一个 `projectId + sourceKind + docId`，不接受客户端传入的任意文件路径。
2. `read` 永远不能触发 Workspace mutation、Yjs 持久化或资源版本创建。
3. `edit` 的每次提交都经过 Authority/CAS；冲突返回可识别的 409，不能静默覆盖作者最新内容。
4. 公开响应只返回渲染所需的标题、正文、更新时间、权限和版本游标，不返回 `workingDir`、`fileName`、`sessionId`、用户 JWT、原始 share secret 或内部 Workspace 路径。
5. 链接记录撤销、过期、文档删除和项目权限变化均在服务端即时生效；长连接收到失效事件后关闭并要求重新 bootstrap。

## 四、目标架构

### 4.1 边界与模块职责

建议新增 `document-sharing` 领域（首选放在 `packages/project-core/src/document-sharing`，纯类型放在 `packages/shared`；如果未来需要独立部署再拆包），分成四层：

| 层 | 职责 | 不应承担 |
| --- | --- | --- |
| `DocumentSharePolicy` | 校验创建者项目权限、来源类型、read/edit 能力交集 | 读取任意路径、拼 HTML、管理 WebSocket |
| `DocumentShareStore` | SQLite 持久化链接、hash、状态、审计游标和短时 access session | 保存正文、保存 JWT 明文 |
| `SharedDocumentResolver` | 通过 `projectId + docId` 找当前 live Workspace，读取 manifest/正文，生成脱敏 DTO | 接收 `workingDir/fileName` 外部参数 |
| Author/Agent adapter | Author 提供管理 API 与全屏页面；Agent 校验 scoped room ticket 并连接现有 Authority/Yjs | 各自实现另一套权限规则 |

分享记录数据库独立于用户表，建议位于 `<DATA_DIR>/derived/document-sharing.sqlite`（或现有 project-core 数据库的独立表），并通过迁移版本管理。分享域不应依赖 author-site 的 React 或路由。

为了让“当前文档”不被知识库路径实现绑死，领域层应使用 source adapter，而不是在路由中写 `if (knowledge) ...`：

```ts
interface ShareableSourceAdapter {
  kind: "knowledge-document" | "workspace-memory" | "project-convention" | "page-convention" | "design-spec";
  canShare(input: { projectId: string; sourceId: string; actor: ProjectActor }): Promise<ShareDecision>;
  read(input: { projectId: string; sourceId: string }): Promise<SharedDocumentSnapshot>;
  write?(input: { projectId: string; sourceId: string; markdown: string; grant: ShareGrant }): Promise<CommitReceipt>;
}
```

第一阶段只注册 `knowledge-document` adapter；其余 `ActiveTarget` 在 `canShare` 中返回“暂不支持”，不会被误当作普通文件共享。这样以后接入 memory、公约或设计规范时，只增加来源适配器及其字段白名单，不改变 token、公开路由和权限核心。

### 4.2 预计文件与职责映射

| 位置（规划） | 职责 |
| --- | --- |
| `packages/shared/src/document-sharing/types.ts` | source locator、permission、share DTO、错误码、room ticket claims |
| `packages/project-core/src/document-sharing/policy.ts` | 项目 actor 与 share 权限交集、来源可分享性、字段能力矩阵 |
| `packages/project-core/src/document-sharing/store.ts` | share link/access session 的 SQLite repository、迁移、token hash/rotation |
| `packages/project-core/src/document-sharing/resolver.ts` | source adapter 注册表、docId→当前 Workspace/manifest、脱敏 snapshot |
| `packages/author-site/src/app/api/projects/[projectId]/documents/[docId]/shares/route.ts` | 已登录创建、列举管理 API；调用 flush proof + policy + store |
| `packages/author-site/src/app/api/projects/[projectId]/document-shares/[shareId]/route.ts` | 权限变更、撤销、旋转和管理端审计 |
| `packages/author-site/src/app/api/shared/documents/[shareId]/route.ts` | access cookie 下的公开文档 bootstrap/read |
| `packages/author-site/src/app/api/shared/documents/[shareId]/room-ticket/route.ts` | edit grant 的一次性协同票据 |
| `packages/author-site/src/app/s/doc/[secret]/page.tsx`、`[shareId]/page.tsx` | secret bootstrap 与非秘密 canonical 全屏页面 |
| `packages/author-site/src/components/share/DocumentShareDialog.tsx` | 当前文档的创建、列举、复制、撤销 UI |
| `packages/author-site/src/components/share/SharedDocumentSurface.tsx` | 全屏 read/edit surface、状态和引用隔离 |
| `packages/author-site/src/hooks/useSharedCollabDocument.ts` | share room ticket → Yjs provider，禁止复用普通 session hook |
| `packages/agent-service/src/collab/extensions/share-auth.ts` | share principal 验证、单资源 descriptor 约束、失效断连 |

这些是职责边界，不要求一次提交全部文件；实现时应先落 `shared/project-core` 契约，再由两个服务接 adapter，避免 author-site 与 agent-service 互相复制权限逻辑。

### 4.3 链接与 access 兑换

推荐使用两段 capability，降低长 secret 在浏览器历史、Referer、监控中的暴露面：

```text
分享者创建
  └─ 认证管理 API → flush 当前协同草稿 → 写入 secret_hash → 返回 https://host/s/doc/{secret}

访客打开
  └─ GET /s/doc/{secret}（只做 bootstrap，不返回正文）
       └─ 校验 hash / status / expiry / source → 写 HttpOnly share_access cookie
       └─ 302 到 /s/doc/{shareId}（非秘密公开 ID）
            └─ GET /api/shared/documents/{shareId} 读取脱敏正文
            └─ edit 时再换取一次性短时 room ticket
```

如果部署环境无法安全使用重定向，可保留 secret 路由，但必须设置 `Referrer-Policy: no-referrer`、`Cache-Control: no-store`、不记录完整 URL，并在首次 bootstrap 后用 `history.replaceState` 清理地址栏。无 access cookie 的裸 `shareId` 不应有读取权限。

secret 至少 128 bit，建议 256 bit；服务端仅保存带 pepper 的 SHA-256/HMAC。数据库、日志、诊断和错误消息都不得保存原 secret。短时 access 和 room ticket 保存 hash 或使用不可回放的签名票据，TTL 建议 5–15 分钟，并绑定 shareId、权限、docId、浏览器会话和发行版本。

### 4.4 数据模型

`document_share_links`：

| 字段 | 说明 |
| --- | --- |
| `shareId` | 非秘密公开 ID，用于管理、bootstrap 后的 canonical URL |
| `secretHash` | 长期链接 secret 的 hash，唯一索引 |
| `projectId` / `sourceKind` / `docId` | typed source locator；第一阶段 `sourceKind = knowledge-document` |
| `permission` | `read` 或 `edit`；创建后可变更，但变更时增加 `tokenVersion` 并使旧 room ticket 失效 |
| `status` | `active` / `revoked` |
| `createdBy` / `createdAt` / `updatedAt` | 管理审计 |
| `expiresAt` | 可选过期时间，默认由产品策略决定 |
| `revokedAt` / `revokedBy` | 撤销审计 |
| `tokenVersion` | 权限变更、旋转、批量失效的版本号 |
| `lastAccessAt` / `lastWriteAt` | 仅统计，不记录正文或 IP 原文 |

`share_access_sessions`：`accessId`、`shareId`、`grantHash`、`permission`、`expiresAt`、`createdAt`、`lastSeenAt`、`tokenVersion`。索引至少包括 `secretHash`、`shareId + status`、`expiresAt`、`projectId + docId`。

不把当前正文或 `workingDir` 复制到分享表；正文始终从 live Workspace/Authority 解析。可存创建时的 `authorityRevision/rootHash` 作为诊断基线，但不能把它当作分享内容的权威版本。

### 4.5 端到端数据流

**创建：**

1. 文档操作栏打开 `DocumentShareDialog`，先调用宿主的 `flushCurrentDocument()`；若有未保存变更或 Authority 不可用，创建失败并明确提示。
2. 管理 API 从 JWT 得到 actor，调用 `DocumentSharePolicy` 检查项目角色和来源类型。
3. `SharedDocumentResolver` 按 `projectId + docId` 读取当前 manifest，拒绝 system/不存在/已归档资源，得到当前 `workspaceId` 和正文版本证明。
4. 生成随机 secret，事务写入 share record 和审计事件，返回完整 URL 一次；服务端后续不再返回原 secret。

**只读打开：**

1. 公开 bootstrap 验证 secret hash、状态、过期时间、项目/文档仍存在。
2. 设置短时 HttpOnly access cookie 并重定向到非秘密 `shareId` 页面；页面调用公开文档 bootstrap API。
3. API 返回 `{title, content, updatedAt, permission:"read", revision, references}` 等最小 DTO；读取失败统一返回 404/410，不泄露是撤销、删除还是不存在的内部细节（管理端可区分）。
4. 页面使用独立的全屏 `SharedDocumentSurface`：只读时优先使用与 Streamdown/Markdown renderer 共享的渲染适配器；若复用 `DocumentEditor`，必须传 `readOnly`、关闭上传/评论/引用写入并使用 `scrollable={false}`，不能复用 Dialog 外壳。

**可编辑打开：**

1. bootstrap 返回 `permission:"edit"`，页面通过 HTTPS API 申请一次性 room ticket；ticket 仅含 shareId、projectId、docId、resourcePath、`edit` 能力和短 TTL。
2. 前端通过专用 `useSharedCollabDocument` 建立 Yjs 连接。document name 仍使用结构化字段，但 token 不再是普通 sessionId。
3. Agent 的认证扩展新增 `share` principal：校验 ticket、share 状态/版本、来源与 room descriptor 一致；构造 `CollabConnectionContext` 时标记 `principalType:"share"`、`permission:"edit"`、可选匿名显示名。
4. `onLoadDocument` 只能加载该 doc；`onStoreDocument` 只有 edit principal 可执行，并继续经过 Workspace Authority。禁止通过 descriptor 改写到另一个 path、kind 或 project。
5. flush/commit 成功后返回 Authority receipt/revision；失败或 CAS 冲突进入 UI 的“需要刷新/合并”状态，不自动覆盖当前作者内容。撤销/过期事件关闭 WebSocket。

### 4.6 权限矩阵

| 能力 | read | edit |
| --- | ---: | ---: |
| 读取当前 Markdown 与标题 | ✓ | ✓ |
| 全屏查看 | ✓ | ✓ |
| 修改正文 | — | ✓ |
| 修改描述 | — | 可选（若产品确认需要） |
| 修改标题/文件名 | — | — |
| 修改 manifest、删除文档、上传附件 | — | — |
| 项目配置、页面、公约、设计规范 | — | — |
| 评论、AI、发布、历史版本 | — | — |
| 通过 `wb://` 浏览其它项目资源 | — | — |

若用户同时登录，服务端取“当前用户对项目的基础权限”和“share permission”的交集；已登录用户不能利用 edit 链接取得超出自身项目角色的项目能力。若产品不接受匿名写入，可把 edit bootstrap 改为登录后继续，但仍保留 share capability 作为文档范围约束，不能直接跳转 `/demo/{projectId}/edit`。

## 五、前端体验方案

### 5.1 分享管理

新增 `DocumentShareDialog`（或 `DocumentSharePopover`）而不是改造项目级 `ShareDialog`：

- 入口：`DocumentView` 知识文档更多菜单增加“分享”（当前文档）；右侧编辑区标题栏可增加同一入口；`KnowledgeDocDialog` 标题栏在用户文档上显示同一按钮。
- 创建表单：权限单选“只读 / 可编辑”，可选过期时间；编辑链接增加明确的“持有链接者可修改正文”确认文案。
- 已有链接列表：显示权限、创建时间、过期/撤销状态、复制、撤销；权限变更要提示会立即影响已拿到链接的访问者，并递增 `tokenVersion`。
- 复制逻辑复用现有 `ShareDialog` 的安全上下文兼容方案（`navigator.clipboard`，HTTP LAN 下 fallback 到已渲染 Input 的 `execCommand`），但不复用项目链接拼接逻辑。

### 5.2 全屏公开页面

建议路由组 `(public-share)/s/doc/[secret|shareId]` 使用独立 layout：

- 100vh/100dvh，顶部只显示文档标题、权限 badge、更新时间和“链接已失效”状态；不显示 author-site 的项目导航、侧栏、用户会话或其它文档。
- 正文区域使用统一 Markdown renderer，最大阅读宽度、代码块、表格、CJK 和图片策略与现有 Streamdown 保持一致；编辑态在同一 surface 切换为 DocumentEditor，避免“读一个页面、编辑另一个页面”的双重语义。
- 默认禁止外部/内部引用导航；`wb://` 仅渲染安全文本或提示“目标不在此分享范围”。若未来支持共享文档之间跳转，跳转必须再次走 share capability，不得将 `projectId/docId` 直接变成公开 API URL。
- 页面头部和 API 使用 CSP、`Permissions-Policy`、`X-Content-Type-Options`、`Referrer-Policy: no-referrer`、`Cache-Control: no-store`；页面加入 `robots: noindex, nofollow`，不进入 sitemap。
- 编辑状态提供保存中、已保存、离线、冲突、链接撤销、文档已删除等可理解的状态；不展示内部 revision、workspace 路径和 session ID。

## 六、接口建议

以下是资源导向的建议命名，实际实现可按项目路由约定调整，但应保持“管理 API 与公开 API 分离”：

### 6.1 已登录的管理 API

```text
POST   /api/projects/:projectId/documents/:docId/shares
       body: { permission: "read" | "edit", expiresAt?: ISOString }
       response: { shareId, url, permission, expiresAt }

GET    /api/projects/:projectId/documents/:docId/shares
       response: { shares: [{ shareId, permission, status, createdAt, expiresAt }] }

PATCH  /api/projects/:projectId/document-shares/:shareId
       body: { permission?: "read" | "edit", expiresAt?: ISOString }

DELETE /api/projects/:projectId/document-shares/:shareId
       revoke；幂等
```

创建/列举/修改/撤销全部需要 JWT、项目权限和 source resolver；接口不接受 `workingDir`、`fileName` 或客户端 `workspaceId`。创建前由服务端或同一请求协调 flush proof，不能让客户端仅凭旧内容创建链接。

### 6.2 公开 bootstrap 与文档 API

```text
GET  /s/doc/:secret
     校验长期 capability，设置短时 HttpOnly share_access，302 到 /s/doc/:shareId

GET  /api/shared/documents/:shareId
     需要 share_access；返回脱敏的当前文档 DTO

POST /api/shared/documents/:shareId/room-ticket
     仅 edit；返回一次性短时 WebSocket ticket

WS   /api/collab/shared/:shareId/room
     仅接受 room-ticket；不能接受普通 sessionId 或 URL query secret
```

如果决定不做匿名实时协同，可把 edit 改为 `PUT /api/shared/documents/:shareId/content`，body 带 `baseRevision/baseHash/content`，服务端用 Authority/CAS 提交并返回 409；但不能继续沿用现有 PUT 的 `workingDir + fileName` 形式。考虑到项目已经有 Yjs/Authority，本方案首选新增 share principal，避免维护第二套编辑一致性模型。

## 七、安全、隐私与运维要求

- **Bearer 风险：** UI 明确提示“获得链接即可按权限访问”；允许撤销、过期和旋转。链接不放进日志、诊断、错误消息、OpenGraph、分析事件或 Referer。
- **CSRF/重放：** bootstrap 只做 token 兑换；写操作依赖 HttpOnly access + Origin/CSRF 校验或一次性 room ticket，不接受 URL query 中的 secret 作为每次写凭据。ticket 绑定 shareId、docId、权限、tokenVersion 和短 TTL。
- **限流与大小：** 按 shareId/IP/设备限流；限制 Markdown 字节数、单次 patch 大小、并发房间数和写入频率；上传、外链图片本地化、脚本、HTML 执行默认关闭。
- **来源与路径：** `SharedDocumentResolver` 只允许 `knowledge-document` 和 user source；通过 docId 找 manifest，再由服务端拼接受控的 `knowledge/{fileName}`。任何客户端传入的 path、resourcePath、workspaceId 只作为不可信输入。
- **实时权限：** Agent 每次新连接都重新验证 share 状态/版本；`onStoreDocument`、flush、恢复、presence 都区分 share principal。read 连接最好不进入可写 Yjs 房间，避免“前端只读、服务端可写”的错觉。
- **审计：** 记录创建、复制（可选只记计数）、访问成功/失败、写入成功/冲突、撤销、过期、权限变更和限流；只记 shareId、docId 的脱敏标识和结果，不记录正文、secret、Cookie、IP 原文。
- **失效语义：** 撤销/过期返回统一公开 404/410；管理端可区分 `REVOKED/EXPIRED/DOCUMENT_DELETED`。所有活动 room 收到状态变化后主动关闭，防止撤销后仍能写入。
- **缓存：** 文档 DTO、bootstrap、room ticket 均 `no-store`；不能进入 Next 静态缓存、CDN 公共缓存或 viewer 发布目录。

## 八、一致性与异常语义

1. **创建前 flush：** DocumentView 的防抖保存、KnowledgeDocDialog 的 `collab.flush()` 和新分享入口应汇聚为宿主级 `flushCurrentDocument`。没有 durable Authority receipt 时不生成链接，避免收件人看到不存在的最后几秒内容。
2. **当前文档解析：** 分享记录只保存 typed `docId`。每次读取从当前项目 live Workspace 的 manifest 解析 `fileName`，因此重命名文件不影响链接；若 docId 被删除则链接失效。不要把创建时的 `workspaceId` 当长期绑定，因为 session/workspace 可能轮换。
3. **并发编辑：** Yjs 正常合并；落 Authority 时仍以 receipt/revision 为提交证明。HTTP fallback 必须使用 `baseRevision/baseHash`，冲突返回 409 并要求刷新或人工合并。
4. **权限变化：** 当前用户被移出项目、项目归档或 share permission 降级时，下一次 API/WS 校验立即拒绝；已签发但未使用的 room ticket 按 `tokenVersion` 失效。
5. **索引与引用：** 文档正文提交后沿用现有 Markdown reference projector/重建机制更新 outgoing/backlinks；公开分享只返回已获授权的引用投影，不能让匿名访问触发全项目索引扫描。
6. **发布隔离：** 发布 viewer 继续读取 immutable release；文档分享读取 live Workspace。两者在 URL、缓存、数据 DTO 和诊断事件中分开，不能用发布目录回填 edit link。

## 九、分阶段实施

### Phase 0：契约与风险验证

- [ ] 固化 `DocumentShareSource`、`DocumentSharePermission`、公开 DTO、错误码和 access/room ticket TTL。
- [ ] 明确产品选择：匿名 edit 是否允许；默认过期策略；是否允许修改描述；read 链接的 `wb://` 展示策略。
- [ ] 为 `project-core` 设计 SQLite migration、hash/rotation 策略和统一 `DocumentSharePolicy`。
- [ ] 增加 threat model、日志脱敏和公开路由 no-store/no-referrer 验收清单。

### Phase 1：只读分享闭环

- [ ] 实现 share store、source resolver、已登录管理 API、创建/列举/撤销。
- [ ] 在 DocumentView/KnowledgeDocDialog 接入“分享当前文档”按钮和管理弹窗。
- [ ] 实现 `/s/doc/:secret` bootstrap、短时 access、全屏只读页面和脱敏文档 API。
- [ ] 只读页面复用统一 Markdown renderer，验证代码块、表格、CJK、图片和无权限引用。

### Phase 2：受限编辑能力

- [ ] Agent 增加 `share principal`、room ticket verifier 和 `CollabConnectionContext.permission`。
- [ ] 新增 `useSharedCollabDocument`，严格限制单文档、单项目、edit 权限和 presence 信息。
- [ ] 把 share 写入接入 Authority receipt、冲突、撤销断连和资源版本/诊断事件。
- [ ] 全屏页面支持保存状态、冲突恢复和文档删除/链接撤销的明确反馈。

### Phase 3：治理、测试与扩展

- [ ] 完成限流、审计看板、过期清理、异常告警和多实例共享 store/ticket key 的部署验证。
- [ ] 增加单元、API、协同和浏览器 E2E；通过安全测试后再开放匿名 edit 默认选项。
- [ ] 评估 memory、公约、设计规范等 source adapter；每种来源单独定义可编辑字段和事务，不把任意 Markdown 文件纳入分享。
- [ ] 如需历史/发布分享，新增 immutable snapshot share 类型，与 live share 使用不同 URL/DTO/权限，不改变当前方案的不变量。

## 十、验收与测试矩阵

**领域/单元：**

- secret 生成、hash 比对、TTL、撤销、旋转和 tokenVersion；枚举不可预测且日志无明文。
- `projectId + docId` 解析、重命名保持有效、删除失效、system 文档/跨项目/归档项目拒绝。
- read/edit 权限交集、匿名与已登录 actor、管理 API 越权拒绝、响应字段脱敏。

**API/安全：**

- 未登录不能创建/列举/撤销；公开 bootstrap 不泄露文档是否存在的内部原因。
- 公开文档响应不包含 `workingDir`、`fileName`、`sessionId`、JWT、原始 secret；所有响应 `no-store`。
- read 不能写；edit 不能改 manifest、标题、删除、上传、发布、评论或其它项目资源；过期/撤销 access 与 room ticket 立即失效。
- path traversal、伪造 `workspaceId/resourcePath`、重放 room ticket、Origin/CSRF、限流和超大正文均有测试。

**浏览器/E2E：**

- 登出打开 read 链接：全屏、只读、刷新仍可读、无项目侧栏；复制链接可在另一浏览器打开。
- edit 链接：两标签协同、自动保存/刷新可恢复、冲突有提示、read 标签不能写。
- 文档重命名不失效；文档删除、撤销、过期在现有页面显示统一失效态并关闭编辑连接。
- 引用、代码块、表格、长文滚动、移动端、键盘可访问性、noindex/no-referrer 检查。

## 十一、待确认决策

1. **匿名 edit：** 本方案按用户需求设计为可实现，但建议产品默认勾选 read；edit 创建时二次确认，并可由部署策略整体关闭。若安全策略要求必须登录，保留同一 share capability，只把 room ticket 兑换绑定到登录用户。
2. **链接有效期：** 推荐支持可选过期；默认值需结合团队协作习惯和泄露风险确定。撤销必须始终可用。
3. **分享来源：** 第一阶段仅 user knowledge document。其它 Markdown 来源需要独立 source locator、读取事务和写入权限，不能因为共享编辑器能打开就自动分享。
4. **引用导航：** 推荐默认不跨文档跳转；若业务需要，应新增“被分享目标”策略，而不是把 `wb://` 解析成公开项目 API。
5. **实时协同与 HTTP fallback：** 首选 share principal + Yjs/Authority；只有确认编辑链接不需要实时协同，才采用带 CAS 的 HTTP mutation，并将其作为另一种明确的写入协议。

## 十二、调研文件索引

| 主题 | 关键文件 |
| --- | --- |
| 共享 Markdown 编辑器 | `packages/demo-ui/src/DocumentEditor.tsx:67-97,193-232,532-616` |
| 主文档视图与自动保存 | `packages/author-site/src/components/demo/DocumentView.tsx:57-78,361-413,471-560,1182-1224` |
| 旧知识文档弹窗 | `packages/author-site/src/components/demo/KnowledgeDocDialog.tsx:101-122,208-285,411-504` |
| 项目级分享 | `packages/author-site/src/components/share/ShareDialog.tsx:18-52,54-94,141-217` |
| 知识库 CRUD/路径接口 | `packages/author-site/src/app/api/knowledge/route.ts:140-269`；`packages/author-site/src/app/api/knowledge/[docId]/route.ts:91-191`；`packages/author-site/src/app/api/knowledge/content/route.ts:8-42` |
| 登录协同 token | `packages/author-site/src/hooks/useCollabDocument.ts:73-103,198-240`；`packages/agent-service/src/collab/extensions/session-auth.ts:23-78` |
| Proxy 鉴权边界 | `packages/author-site/src/proxy.ts:15-20,85-103` |
| 发布 viewer | `packages/viewer-site/src/components/ViewerDocumentView.tsx:19-27,153-213,266-379` |
| 稳定引用协议 | `packages/shared/src/markdown-reference/`；`packages/project-core/src/markdown-references/` |

本方案只新增规划文档，没有修改 `docs/项目文档/` 中的当前事实，也没有修改任何业务代码；进入实施阶段后，每个阶段完成时再按实际行为更新知识库、项目分享和协同技术文档。
