---
covers:
  - packages/demo-ui/src/DocumentEditor.tsx
  - packages/demo-ui/src/RichTextEditor.tsx
  - packages/demo-ui/src/markdown/crepe-config.ts
  - packages/shared/src/demo/page-requirements.ts
  - packages/shared/src/contracts.ts
  - packages/shared/src/workspace.ts
  - packages/project-core/src/workspace-resource-registry.ts
  - packages/agent-service/src/workspace/workspace-mutation-authority.ts
  - packages/author-site/src/components/demo/DocumentView.tsx
  - packages/author-site/src/components/demo/KnowledgeDocDialog.tsx
  - packages/author-site/src/components/demo/DesignSpecEditor.tsx
  - packages/author-site/src/components/demo/WorkspaceCodeDialog.tsx
  - packages/author-site/src/components/demo/NoteDialog.tsx
  - packages/author-site/src/components/demo/PreviewCanvas.tsx
  - packages/author-site/src/app/api/knowledge/route.ts
  - packages/author-site/src/app/api/knowledge/[docId]/route.ts
  - packages/author-site/src/lib/publish-manager.ts
  - packages/author-site/src/app/data/[...path]/route.ts
  - packages/viewer-site/src/components/ViewerDocumentView.tsx
---

# 创作端 Markdown 编辑器：项目、页面、文档引用与双向链接方案

> 更新日期：2026-09-01
>
> 文档性质：调研结论、目标架构与分阶段实施方案
>
> 调研基线：分支 `main`，提交 `d1e25d05`。工作区当时存在其他未提交改动，本方案只依据已确认的代码和项目文档，不依赖这些未提交改动。
>
> 相关长期文档：[知识库需求](../../项目文档/创作端/09-知识库/知识库_需求文档.md)、[知识库架构](../../项目文档/创作端/09-知识库/技术/01_知识库架构设计.md)、[实时保存与协同编辑](../../项目文档/创作端/03-项目管理/技术/11_实时保存与协同编辑.md)、[AI 对话组件](../../项目文档/创作端/05-AI对话/技术/01_对话组件设计.md)

### 实施状态（2026-09-01）

- 已落地共享 `wb://` v1 target/source 类型、URI 编解码、规范 Markdown 序列化与代码块安全解析，保留 legacy `@[名称](config_key)` 语义。
- 已落地 `project-core` 的 `ResourceDirectory`、`EntityResolver` 与可重建内存 outgoing/backlinks 索引，并导出稳定领域接口。
- 已将 `demos/{pageId}/requirements.md` 纳入 Workspace 资源注册表，作为页面需求引用来源参与同一套解析与索引。
- 已接入 Author 的候选、outgoing、backlinks、rebuild API；路由从鉴权 project/session 解析 workspace，不接受任意路径。
- 已接入 `DocumentEditor`/`RichTextEditor` 的 typed reference context、`@` 候选插入、显式 BlockEdit「插入项目引用」、原子删除与宿主点击回调；知识文档、页面需求、memory、公约、DesignSpec、richtext 字段完成 Author 接线。
- 已落地 SQLite generation 全量/增量索引、Authority receipt 防旧写、损坏缓存轮换、统一 committed-event projector、outgoing/backlinks/未链接提及 API 与 Author 面板。
- 已完成 Canvas/Note/Streamdown/Markdown-it/Milkdown renderer adapters，以及同一 canonical snapshot 的 publish `markdownReferences` 目标目录、`documentPaths` 和 Viewer 只读导航。

## 一、调研问题与结论

### 1.1 要解决的问题

项目中存在多处 Markdown 编辑器，但它们目前各自接收 Markdown 字符串，只有页面需求编辑器具备面向配置项的 `@[名称](config_key)` 引用菜单。用户希望在所有项目 Markdown 编辑器中统一获得以下能力：

1. 输入 `@` 后引用当前可访问的项目、项目中的页面、项目中的文档。
2. 引用可被稳定解析、点击和跳转，不依赖文件名或显示名称。
3. 类似 Obsidian，能够看到当前文档的外链、哪些文档反向链接到当前文档，以及可选的未链接提及。
4. 知识库、页面需求、公约、设计规范、画布文档和只读查看器遵循同一套语义，而不是每个入口维护一套特殊语法。

### 1.2 结论

推荐建设一个“统一引用协议 + 共享解析器 + 派生链接索引 + 编辑器适配层”四件套：

- **协议**：使用带类型和稳定 ID 的 `wb://` URI，序列化为标准 Markdown 链接。显示文本只是快照，`projectId`、`pageId`、`docId` 才是身份；编辑器是否显示 `@` 只属于交互层，不进入 canonical 语法。
- **编辑器**：在共享 `DocumentEditor`（Milkdown Crepe）中实现 `@` 建议插件和内联引用标记（canonical link mark）；每一种正式接入的项目 Markdown 来源传入同一种 typed `referenceContext`，不再各自拼菜单。
- **索引**：从已持久化的 Markdown 文本和实体目录生成可重建的派生索引，提供 outgoing links、backlinks、unresolved links 和 unlinked mentions 查询。
- **渲染**：编辑态、只读态、画布文档、发布产物和 viewer 使用同一套引用解析/渲染适配器；任何渲染器都不能把 `wb://` 当成可直接访问的外部 URL。

第一阶段只承诺知识文档和页面需求作为来源，对“当前项目、当前项目页面、当前项目知识文档”建立稳定引用和同项目 backlinks。公约、memory、设计规范条目、配置备注、richtext 字段和画布本地草稿在各自 source locator 与持久化事务明确后分批接入；是否作为目标实体再按产品策略开放。标题/段落/块级链接、跨项目引用、跨项目公开链接、关系图谱和自动创建新文档属于后续能力，不阻塞 MVP。

## 二、现有实现盘点

### 2.1 共享编辑器与已有引用能力

`packages/demo-ui/src/DocumentEditor.tsx` 是主要共享入口，当前 props 包括内容、只读、图片处理、评论选区和 `referenceCandidates`。编辑器由 Milkdown Crepe 创建，通过 `markdownUpdated` 回传 Markdown，并以 `replaceAll` 应用外部内容更新。`RichTextEditor` 只是薄包装。

当前引用只覆盖配置项：`crepe-config.ts` 的 BlockEdit 菜单调用 `referenceCandidates`，写入 `@[label](config_key)`；`packages/shared/src/demo/page-requirements.ts` 用正则解析该格式，`note-html.ts` 只把它渲染成配置项标记。它不是通用实体链接，也没有反向索引。

### 2.2 所有 Markdown 编辑入口

| 入口                                           | 当前内容/保存方式                                                                                                                                    | 本方案接入策略                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DocumentView`                                 | AI memory、项目公约、页面公约、知识库、设计规范；知识库走 `/api/knowledge`，其他工作区文件走 session workspace API，约 800ms 防抖并在切换/卸载 flush | 传入源资源身份和引用策略；可编辑入口统一启用 `@`，公约的只读状态保持不变                  |
| `KnowledgeDocDialog`                           | `knowledge/{fileName}` 的知识文档协同编辑；正文与 manifest 共同提交                                                                                  | 以 `docId` 作为目标身份，`fileName` 仅作为物化路径；协同编辑也使用同一引用节点            |
| `PageConfigPanel` / `RichTextEditor`           | 页面需求 Markdown，已有配置项引用                                                                                                                    | 保留配置项语法；新增项目/页面/文档分组候选，解析器先识别 `wb://` 再处理 legacy config ref |
| `DesignSpecEditor`                             | 设计规范 JSON 中的 `entry.markdown`，整个 DesignSpec JSON 防抖保存；另有结构化 `DesignSpecRef`                                                       | Markdown 中的实体引用走统一协议；结构化配置引用继续独立保存，禁止两种引用互相猜测         |
| `ConventionDialog` / `WorkspaceMarkdownEditor` | `memory.md`、`convention.md`、`demos/{pageId}/convention.md` 等工作区文件                                                                            | 传入 `workspace_file` 源类型和权限策略；不把任意路径暴露为可引用 ID                       |
| `WorkspaceCodeDialog`                          | 对 `.md` 文件使用 DocumentEditor；当前可编辑白名单较窄，知识库文档由专用入口管理                                                                     | 所有允许进入编辑器的 Markdown 文件接入；候选与可跳转目标由资源注册表控制                  |
| `FieldRenderer` / `NoteDialog`                 | 配置字段和配置备注中的 Markdown 字符串；备注只读态走 Markdown-it                                                                                     | 若字段具有项目资源上下文则启用；纯配置项文本只保留 legacy config ref                      |
| `PreviewCanvas` 文档节点                       | 画布节点引用知识文档，正文仍来自 `knowledge/*.md`，画布保存引用和布局                                                                                | 文档正文中的链接按知识文档身份解析；画布节点本身不是新的 Markdown 目标类型                |
| `ViewerDocumentView`                           | 发布后的知识文档只读展示；其他展示路径还使用 Streamdown/Markdown-it                                                                                  | 使用发布快照中的引用索引和安全路由；无编辑、无未发布资源泄露                              |
| AI 计划审批编辑器                              | 临时计划 Markdown，不属于项目持久化资源                                                                                                              | 默认不接入项目引用；若未来需要，必须显式提供 source context，不能从临时文本推断项目权限   |

### 2.3 稳定身份和权限边界

- 页面树的唯一真值是 `workspace-tree.json`；`project.json.demoPages` 是派生投影。页面 `id`、项目 `id` 应作为链接身份。
- 知识库 manifest 已有 `docId`；`fileName` 是 materialization 字段，不是长期身份。文档改名或文件名重写不能使链接失效。
- 现有 `ProjectResourceKind`、资源注册表、workspace/session 隔离和 Authority mutation 已提供部分路径及写入边界，但资源注册表只负责路径分类和写入校验，不负责把路径解析为 page/doc 等领域身份；页面需求、DesignSpec entry、配置备注和 richtext 字段也尚未统一进入同一种资源定位模型。链接能力必须新增实体目录解析层，不能把 registry 的 `kind` 直接当作稳定实体身份，也不能通过任意目录扫描绕过授权。
- 知识文档协同以 Yjs 文本为编辑态权威，flush 后由 Authority receipt 证明 live Workspace 已提交；canonical materialization 是独立的后续版本轴。live 索引不能读取尚未 flush 的编辑器状态，也不能把 Authority revision 与 canonical synced revision 混为一谈。

### 2.4 明确的当前缺口

代码中未发现项目、页面、文档统一候选聚合；未发现 `[[wikilink]]`、backlinks、outgoing links、unlinked mentions 或链接图索引。Agent 的 `ref://project/...` 是读取工具协议，不能直接作为 Markdown 持久化协议；AI 对话中的 `InlineTag` 是 contenteditable 芯片，也不能当作 Markdown 的 canonical 格式。

## 三、外部调研与可借鉴边界

### 3.1 Obsidian

[Obsidian 内部链接](https://obsidian.md/help/links)支持 Wikilink 和 Markdown 链接、标题/块锚点、别名，并会在重命名时更新内部链接；[Outgoing links](https://obsidian.md/help/plugins/outgoing-links)同时展示当前文档的外链和未链接提及；[Backlinks/Graph 等核心插件](https://obsidian.md/help/plugins)提供入链视图和关系图；设置中还允许关闭自动改名和排除文件。[Link notes](https://obsidian.md/help/link-notes)允许指向尚不存在的笔记。

可借鉴的是信息架构：链接列表、反向链接、未链接提及、别名和 unresolved 状态。不能原样照搬“按文件名解析 `[[name]]`”：项目内可能有重名页面/文档，跨项目还存在权限隔离。因此 Workbench 应把显示名称仅作为搜索和快照，把稳定 ID 写入 canonical 链接。

### 3.2 Milkdown/ProseMirror

当前使用 Crepe。其 [Crepe API](https://milkdown.dev/docs/api/crepe)支持 BlockEdit 和按 feature 配置；自定义 Markdown 语法需要 [Remark/Schema/Parser/Serializer/Input Rule 插件](https://milkdown.dev/docs/plugin/example-marker-plugin)，生命周期可通过 [Milkdown 插件机制](https://milkdown.dev/docs/plugin/plugins-101)接入。底层 ProseMirror 可用 inline node、nodeView、decoration 和 editor props 实现可点击、原子化的引用芯片。

因此不建议只在 `onChange` 后用正则替换文本，也不建议把 HTML 芯片直接写回 Markdown；应让编辑态节点与 canonical Markdown 双向序列化，并共享解析测试。

### 3.3 Tiptap 作为交互参考

[Tiptap Mention 扩展](https://tiptap.dev/docs/editor/extensions/nodes/mention)和 [Suggestion 工具](https://tiptap.dev/docs/editor/api/utilities/suggestion)展示了 `@` 触发、异步候选、多个触发字符、键盘导航和自定义渲染的成熟交互。项目不需要因此迁移到 Tiptap；方案只借鉴其“本地输入触发、远程协同不弹菜单、候选异步加载”的交互规则。

## 四、产品范围与不变量

### 4.1 MVP 范围

**目标实体**：

- `project`：当前项目。
- `page`：当前项目 workspace tree 中的页面。
- `document`：当前项目知识库 manifest 中的用户文档，首期只包含 `knowledge_document`。

**MVP 来源**：知识库正文、页面需求。二者都已有稳定领域 ID，并能形成清晰的保存、重开、跳转和 backlinks 闭环。

**后续来源**：公约、memory、设计规范 entry、配置备注、richtext 字段和画布本地 Markdown。它们必须先定义 typed source locator、物化路径解析和提交事务，不能仅因为 UI 使用了 `DocumentEditor` 就自动进入索引。

**首期不做**：跨项目引用、viewer 引用导航、块级协作评论定位重写、自动创建文档、任意文件路径链接、全局知识库实体和实时 Graph view。

### 4.2 必须保持的不变量

1. 链接身份只能由 `projectId/pageId/docId`（以及未来明确版本化的 entry/block ID）组成，不能用标题、slug 或 `fileName` 充当主键。
2. 纯语法解析与实体/权限解析必须分层：parser 只输出语法有效性和结构；resolver 内部可区分 `resolved`、`missing`、`deleted`、`forbidden`。当调用者无权获知目标元数据时，API/UI 必须把 `forbidden` 与不存在目标统一投影为 `unavailable`，避免通过状态差异确认目标存在。
3. `@[名称](config_key)` 仍是页面配置项引用；不能因文本长得相似而把它解释为文档链接。
4. 引用索引是派生数据，可通过全量 rebuild 得到；索引损坏不能损坏 Markdown 正文或 manifest。
5. 候选、backlinks、跳转和发布渲染均经过当前用户/发布快照的权限过滤，不返回工作区绝对路径、session token、执行 ticket 或未发布源码。
6. 编辑器外部值更新、Yjs 远程更新和本地 `@` 菜单不能形成回写循环；协同远程事务不应弹出本地候选菜单。

## 五、统一引用协议

### 5.1 Canonical Markdown 格式

推荐 v1 使用普通 Markdown 链接承载类型化 `wb://` URI。`@` 只是候选触发字符和芯片视觉标识，不写入 canonical 文本：

| 目标 | Canonical 语法                                  | 展示示例             |
| ---- | ----------------------------------------------- | -------------------- |
| 项目 | `[项目名称](wb://project/{projectId})`          | `@营销网站`          |
| 页面 | `[页面名称](wb://page/{projectId}/{pageId})`    | `@营销网站/首页`     |
| 文档 | `[文档名称](wb://document/{projectId}/{docId})` | `@营销网站/品牌规范` |

协议要求：

- `projectId`、`pageId`、`docId` 使用现有领域 ID，并进行 URI percent-encoding；不把中文名称塞入路径。
- `label` 是插入时的显示快照。渲染时优先显示当前名称，并可在编辑器标记“名称已更新”；不在每次改名时同步改写所有正文。
- v1 不要求块链接。后续可以在 URI fragment 中增加 `#heading-slug` 或 `#^block-id`，但必须先定义稳定化和协同定位规则。
- 外部 URL、普通 Markdown 链接、图片链接和 legacy config ref 保持现状；解析器只接管 destination scheme 为 `wb://` 的链接。这样实体引用不会与 `@[名称](config_key)` 共享一套非标准语法。

### 5.2 `[[...]]` 的兼容策略

Obsidian 风格 `[[...]]` 可作为输入快捷方式，但不建议作为 v1 的持久化格式：同名目标、跨项目范围、发布端解析和权限状态都无法仅靠名称确定。若产品希望降低迁移成本，可在编辑器输入/粘贴时接受 `[[页面名]]` 或 `[[项目/页面|别名]]`，弹出歧义候选后立即归一化为 `[label](wb://...)`；未能唯一解析时保留普通文本或本地待解析状态，不把纯名称写入 canonical 文本。

### 5.3 解析优先级和错误处理

解析器按以下顺序处理：Markdown 代码围栏/行内代码排除 → `wb://` 类型链接 → legacy config ref → 普通 Markdown 链接。它必须忽略代码块、行内代码和 HTML 属性中的伪链接，识别转义字符、中文标签、缺失右括号和 malformed URI，并保留源位置。

对于未知实体类型、非法 ID 或不存在目标，正文不被删除。parser 输出语法诊断，领域 resolver 再解析目录与权限；客户端只接收其有权分辨的状态，无权获知目标元数据时统一显示“链接不可用”。

## 六、共享领域模型与模块边界

建议在 `@workbench/shared` 增加 `markdown-reference` 子路径（名称可在 ADR 中确定），在 `project-core` 放置实体目录解析与索引领域服务，在 `demo-ui` 放置编辑器插件和展示组件。身份模型必须使用 discriminated union，避免 `kind=project` 却携带另一个 `resourceId` 之类的非法组合：

| 模型                         | 必要变体/字段                                                                                                       | 说明                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MarkdownReferenceTarget`    | `project { projectId }`、`page { projectId, pageId }`、`document { projectId, docId }`                              | target 只表达 canonical 身份；label 和解析状态不混入身份对象                                                                                          |
| `MarkdownReferenceSource`    | MVP：`knowledge-document { projectId, workspaceId, docId }`、`page-requirements { projectId, workspaceId, pageId }` | 后续按类型增加 design-spec-entry、workspace-memory、page-convention、config-note、richtext-field、canvas-local-document；每个变体独立定义稳定 locator |
| `ResolvedSourceLocation`     | `source`、服务端解析得到的 `materializedPath`、可选 `jsonPointer`                                                   | 只在服务端内部使用；路径不是客户端提交字段，也不是 source identity                                                                                    |
| `ParsedMarkdownReference`    | target、labelSnapshot、syntaxVersion、start/end、line/column                                                        | parser 的纯语法结果，不包含权限状态                                                                                                                   |
| `ResolvedMarkdownReference`  | parsed reference、`targetState`、可选当前 label                                                                     | `targetState` 为 active/missing/deleted/forbidden；出 API 时再按权限投影为 resolved/unavailable                                                       |
| `ReferencePolicy`            | allowedTargetKinds、sameProjectOnly、publishedOnly、allowUnresolved、allowCreate                                    | policy 由宿主/服务端选择，不携带当前用户对象                                                                                                          |
| `MarkdownReferenceCandidate` | target、displayPath、aliases、score                                                                                 | 候选接口只返回已授权实体，不需要把 permission 字段下发给客户端                                                                                        |
| `MarkdownLinkIndex`          | version、parserVersion、workspaceId、authorityRevision/rootHash、outgoing entries、build status                     | 派生、可重建；MVP 按 source project/workspace 隔离                                                                                                    |

职责边界：

- `shared` 只保存类型、URI 编解码、纯解析结果和兼容语义，不读取文件系统和会话。
- `project-core` 新增 `ResourceDirectory/EntityResolver`，根据 workspace tree、knowledge manifest 和已注册 source adapter 解析稳定身份与物化位置；生成索引、执行 rebuild，但不绕过 Authority 写入正文。
- `author-site` 提供带鉴权的候选、outgoing、backlinks API，并把 `referenceContext` 注入各编辑入口。
- `demo-ui` 只负责输入、芯片、菜单、点击回调和渲染 hook，不自行查询项目目录。
- `viewer-site` 只读取同一次发布快照生成的目标目录和索引，不访问 live workspace。

## 七、候选目录与解析 API

### 7.1 候选来源

当前编辑器打开时只加载当前项目的轻量目录：项目名称/id、页面 tree 和知识库 manifest。输入关键词后通过异步 provider 查询，不把正文注入编辑器首屏。跨项目候选不进入 MVP。

候选排序建议为：当前文档/页面上下文 → 最近使用 → 当前项目；同名项必须显示页面/文档层级，不能只显示一个名称。

### 7.2 建议 API

实际路由可在 API 评审时调整，但语义应稳定：

```text
GET /api/projects/{projectId}/markdown-references/candidates
    ?kind=project,page,document&q=&limit=&cursor=

GET /api/projects/{projectId}/markdown-references/outgoing
    ?sourceKind=&sourceId=&entryId=

GET /api/projects/{projectId}/markdown-references/backlinks
    ?targetKind=project|page|document&targetId=&limit=&cursor=

POST /api/projects/{projectId}/markdown-references/rebuild  # 管理员/内部维护任务
```

候选接口只返回用户有权看到的实体摘要；outgoing/backlinks 响应附带 `observedWorkspaceId`、`observedRevision`、`observedRootHash` 和 `indexStatus`，由服务端声明查询对应的版本，而不是允许客户端任意指定 revision。backlinks 接口返回来源标题、来源类型、相对位置、短摘录和跳转所需的 typed locator，不返回不可访问来源。服务端通过 `project-core` 解析稳定 ID，不接受客户端提交的任意 `relativePath` 作为 source 或 target。

新引用 API 必须从已鉴权的 `projectId + session/workspace context` 在服务端解析 Workspace，不复用由客户端直接提交 `workingDir` 或以 `fileName` 作为身份的旧知识正文接口。旧接口可继续服务现有 UI，但引用目录、跳转和索引只接受 typed ID；待调用方迁移完成后再单独评审旧路径型 API 的收口。

### 7.3 与已有读取协议的关系

Agent 的 `ref://project/{projectId}/{relativePath}` 和知识库服务的 `knowledge://` 是服务内部读取/检索引用；Markdown `wb://` 是用户可见、可发布、可渲染的实体链接。三者可以由服务端建立映射，但不得让前端自行拼接或把内部 token 写入正文。

## 八、编辑器实现方案

### 8.1 `DocumentEditor` 新增上下文，而非复制组件

建议扩展 props：

- `referenceContext`：typed source identity、项目/页面/文档 scope、编辑器用途和服务端授予的 `ReferencePolicy`；不把当前用户对象传进 `demo-ui`。
- `referenceProvider`：按输入文本、触发类型和 scope 异步返回 `MarkdownReferenceCandidate[]`；默认由 author-site 注入。
- `onReferenceClick`：只读和编辑态统一回调，交由宿主导航。
- `onReferenceInserted` / `onReferenceResolved`：用于诊断、最近使用和索引刷新提示。

保留 `referenceCandidates` 兼容页面配置项；实体 provider 与 legacy config ref 使用不同类型和命令，避免一个候选接口同时承担两种身份语义。

### 8.2 Milkdown 插件和交互

1. **内联引用节点**：编辑态将 `wb://` 链接解析为带 attrs 的原子 inline node 或等价 decoration，attrs 包含 kind、projectId、resourceId、label、status。序列化时严格生成 canonical Markdown；Backspace 一次删除整个引用。
2. **`@` 触发器**：本地用户在正文中输入 `@` 后显示“项目 / 页面 / 文档”分组候选，支持关键词、中文拼音/别名搜索、上下键、Enter、Esc、鼠标选择和异步分页。插入后光标位于芯片之后。
3. **协同规则**：当前 `DocumentEditor` 通过外部 `value` 和 `replaceAll` 接收 Yjs 投影，并不直接拥有 Yjs transaction origin。适配器必须给本地输入、外部 value 同步、初始化、undo/redo 标记明确的 editor transaction meta；只有本地输入可打开菜单，外部同步不得弹出候选或形成回写循环。
4. **显示状态**：resolved 为普通芯片；调用者有权确认目标已删除/缺失时可显示警告芯片并提供“重新选择”；无权获知目标元数据时统一显示“链接不可用”，不暴露 forbidden 与 missing 的差异。
5. **点击规则**：编辑态点击调用宿主 `onReferenceClick`，不让浏览器直接请求 `wb://`；只读态同样支持点击，无法导航时显示原因。
6. **菜单复用**：现有 BlockEdit “插入配置项引用”保留；新增“插入项目引用”作为显式入口，和 `@` 触发共享候选组件。

### 8.3 来源逐类接入要求

每一种被正式启用引用能力的持久化 Markdown 来源必须完成三件事：声明 typed `source`、声明 `ReferencePolicy`、注入候选/导航 provider，并具备 Authority receipt、重开定位和 backlinks 验证。使用 `DocumentEditor` 不等于自动获得引用能力；没有 source context 的临时文本默认关闭实体引用，避免从 UI 位置猜权限。

| 入口              | `source` 示例                                                        | 首期策略                                                       |
| ----------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| 知识库文档        | `knowledge-document/projectId/workspaceId/docId`                     | MVP；同项目 project/page/document                              |
| 页面需求          | `page-requirements/projectId/workspaceId/pageId`                     | MVP；project/page/document + legacy config ref                 |
| memory/公约       | 固定 resource key 或 `page-convention/pageId`                        | Phase 3；禁止客户端提供任意 path                               |
| DesignSpec entry  | `design-spec-entry/specId/entryId`                                   | Phase 3；只引用 `entry.markdown`，不改变结构化 `DesignSpecRef` |
| 配置备注/字段     | `config-note` / `richtext-field` + scope、fieldKey、受限 jsonPointer | Phase 3；需同时定义 schema/value 保存事务                      |
| 画布知识文档正文  | `knowledge-document/projectId/workspaceId/docId`                     | 与知识库同源，不另建 target/source                             |
| 画布本地 Markdown | `canvas-local-document/nodeId`                                       | Phase 3；持久化为知识文档前不得伪装成 docId                    |
| Viewer            | published source locator                                             | Phase 4；只读，只解析同一发布快照中的目标                      |

## 九、链接解析、索引与双向链接体验

### 9.1 解析器要求

不要在多个包中继续增加正则。实现一个共享的 `parseMarkdownReferences(markdown, options)`，输出引用、源位置和诊断。实现可选 `micromark/mdast` 或 Markdown-it token 化，但必须由同一套 fixture 覆盖客户端序列化、服务端索引和 viewer 渲染；具体依赖选择在 Phase 0 通过 bundle 体积和位置精度验证后确定。

必须测试代码围栏、行内代码、嵌套 Markdown、转义括号、中文标签、重复名称、malformed URI、legacy config ref 和非法/缺失实体。

### 9.2 派生索引

首期由 `project-core` 管理 `<DATA_DIR>/derived/markdown-links.sqlite`。数据库以 `projectId + workspaceId` 隔离 source graph，不进入 active Workspace、workspace tree、项目复制/备份或用户源码；它是可删除、可重建的派生存储。选择 SQLite 而不是同时保留 JSON/SQLite 两套可能实现，是因为 backlinks、分页、按 target 查询和后续 source adapter 都需要稳定的倒排查询。逻辑记录包含：

- `source`：项目、资源类型、资源 ID、相对路径、可选 entryId。
- `target`：kind、projectId、resourceId、label snapshot。
- `locator`：UTF-16 code unit 的 start/end、1-based line/column、source content hash，以及未来 heading/block ID；读取 locator 时先校验 source revision/hash，过期则降级到引用文本搜索。
- `targetState`：active/missing/deleted/forbidden；对外再按调用者权限投影为 resolved/unavailable。
- `mutationId`、`authorityRevision`、`authorityRootHash`、`generatedAt`、`parserVersion`。

索引生成时只从同一个 Authority snapshot 读取已持久化的知识正文、manifest、页面树和已注册 source adapter；不读取 Yjs 草稿，也不把多个 revision 的文件拼成一次构建。索引缺失或 revision 不匹配时，API 返回 `stale/rebuilding`，并投递幂等 rebuild 任务；普通查询不得在请求线程里扫描整个 Workspace。

Authority revision 与 canonical 同步 revision 是两个不同版本轴：

- live author 索引绑定 Workspace Authority receipt 的 `workspaceId + mutationId + revision + rootHash`。
- 发布前使用的 canonical snapshot 另行绑定 `canonicalSyncedRevision + canonicalSyncedRootHash`，不能用 live revision 代替。
- canonical materialization 不是 Authority mutation 的同义词；只有发布/基准 Workspace 读取需要等待 canonical 同步。

### 9.3 更新时机与一致性

- 本地编辑：Yjs 文本更新 → 现有防抖 flush → 收到对应 `workspace_mutation_committed` durable receipt → 索引 projector 获取一个 revision 不早于该 receipt 的一致 Authority snapshot → 在一个 SQLite transaction 中更新受影响来源。若 Workspace 已推进到更新 revision，projector 合并中间事件并记录实际读取的最新 revision/rootHash，不假定历史 revision snapshot 永远可读。
- 所有写入入口（UI、AI、API、CLI、导入、恢复）共用 committed-event projector/outbox；不得在每个业务保存 handler 中各挂一套索引更新逻辑。
- 知识文档新增/改名/删除：正文与 manifest 在同一次 Authority mutation 中提交；manifest 必须基于 Authority critical section 内的最新 snapshot 构造或具备 metadata CAS，索引只消费最终 receipt，不能消费请求前读取的旧 manifest。
- 页面创建/复制/删除：复用现有页面树 mutation，同时更新页面目标目录；不要从 `project.json.demoPages` 推断身份。页面需求在进入 MVP 前必须注册为受管 source，并随对应 Authority revision 提交。
- rename：只更新目录名称和 `labelSnapshot` 的显示解析，不批量改写所有 Markdown；可提供后台“刷新显示标签”但不改变 URI。
- delete：保留正文中的链接；目标目录记录 `targetState=deleted`，引用边不自造 tombstone 状态。授权 UI 可显示已删除并提供重新选择或删除链接，无权确认目标元数据时仍显示 unavailable。
- rebuild：幂等、可取消、按 project/workspace 串行；在临时 generation 中完整生成后通过单次 SQLite transaction 切换 active generation，避免半成品被查询。

### 9.4 Outgoing、Backlinks、Unlinked mentions

文档侧栏建议增加三个区块：

1. **此文档链接到**：当前来源解析出的 outgoing links，按项目/页面/文档分组。
2. **链接到此文档**：反向索引命中的来源，显示来源标题、类型、短摘录和位置；点击后宿主打开来源并滚动到 locator。
3. **未链接提及**：在代码块/行内代码外，用目标名称和 alias 做有界匹配；点击“转为链接”时必须再次确认唯一目标和权限。该能力可在 backlinks 后上线。

没有必要把实时 Graph 作为 MVP；未来可用同一索引生成当前项目局部图。跨项目边不进入 MVP：若后续开放，边默认归 source project，目标 backlinks 查询必须通过受权限过滤的账户级聚合层，不能直接读取其他项目数据库或把入链写进目标 Workspace。

## 十、渲染、跳转与发布

### 10.1 统一渲染适配器

新增共享解析核心，并为每一种渲染技术提供薄 adapter；不要试图用一个 React 组件直接覆盖 Milkdown、Markdown-it 和 Streamdown：

- 将 `wb://` 转换为带 `data-reference-*` 的安全内部链接/按钮。
- 普通外链继续按原安全策略处理；`wb://` 不交给浏览器原生导航。
- 读取目标当前名称和状态，标签过期时可显示提示。
- 保留代码块和行内代码原文，不把其中的 `wb://` 变成链接。

必须维护 renderer 接入矩阵：`DocumentEditor` 编辑/只读态、`KnowledgeDocDialog` Streamdown 阅读态、`note-html`、`PageRequirements`、`CanvasDocumentContent`、viewer knowledge DocumentEditor 和 viewer DesignSpec PageRequirements。它们共享 URI codec、解析 fixture、状态投影和点击契约，各自只实现渲染层 adapter，避免“编辑器能点、预览不能点”。

### 10.2 author 与 viewer 导航

- author-site：MVP 点击 project/page/document 交给宿主打开当前项目概览、当前项目页面编辑器或知识库文档。Phase 0 必须固化 typed navigation locator、目标不存在/删除/拒绝状态以及打开后返回原来源的行为；宿主在每次跳转前重新校验权限。
- viewer-site：Phase 4 只导航到同一发布快照中存在的页面/文档。跨项目发布链接不在本方案 v1 范围内，也不在此功能中顺带引入新的 opaque public project ID 体系。
- backlinks 面板在 author 的文档视图先实现；viewer 可在后续发布快照中显示只读 backlinks，不能查询作者工作区实时索引。

### 10.3 发布快照

Phase 4 发布规则必须基于当前真实发布契约，而不是假设已经存在文档级公开权限：当前项目发布会公开项目页面以及随发布包复制的用户知识文档。因此 v1 的“公开目标”定义为“存在于同一个不可变发布快照中的页面或用户知识文档”。若产品需要私有知识文档，必须先单独增加文档级发布可见性模型和直接文件访问保护，再开放引用发布。

发布流程必须先锁定/生成一个一致的 canonical snapshot，再从该 snapshot 同时产生页面、知识正文、`docId → publishedPath` 目标目录和引用索引；不能先复制 live knowledge，之后才生成另一个 revision 的发布版本。发布产物保存精简的 resolved edges 和目标目录，viewer 按 `docId/pageId` 导航，不直接把 `fileName` 当作长期身份，也不在首次访问时查询 live workspace 或扫描正文。

发布态不携带 author 的 `forbidden` 状态。无法映射到同一快照公开目标的链接统一变成 `publish-unavailable`；发布策略可选择阻断或经用户确认后以不可用样式发布，但必须在发布前完成决定。

## 十一、权限、协同和安全

### 11.1 权限

- 候选 API 使用当前 session/workspace/project 权限；v1 只查询当前项目，跨项目搜索路由和开关均不实现。
- resolver/audit 内部可以区分 `forbidden` 与 `missing`；候选 API 永不返回 forbidden 项，outgoing/backlinks 和 UI 对无元数据权限的目标统一返回 `unavailable`，不能通过状态、名称、路径或数量确认其存在。
- 结构化资源注册表负责将 page、knowledge-document、workspace-memory 等资源映射到合法路径；客户端永远不能把任意路径编码成目标。
- viewer 只读发布快照；编辑、评论、AI/Agent 写回仍走既有权限和 mutation 流程。

### 11.2 协同

- `@` 候选菜单是本地 UI 状态；远程协作者看到的是已经序列化的引用节点。
- 索引更新必须在 canonical flush 成功后进行；如果索引落后，显示“索引同步中”并允许打开正文，不阻塞用户编辑。
- 通过 committed receipt 的 `workspaceId + mutationId + authorityRevision/rootHash` 防止旧索引覆盖新正文；增量失败时进入 outbox/rebuild，而不是修改用户内容。canonical revision 仅用于发布/基准索引，不与 live revision 混用。
- 评论已有相对路径、选区文本和上下文定位机制；引用芯片应被视为一个原子范围，正文改动后的评论重定位不应把 URI 拆开。

### 11.3 安全

- 渲染器只接受严格的 `wb://project|page|document`，拒绝 `javascript:`、自定义任意 scheme、路径穿越和 HTML 属性注入。
- 不把 session ID、Yjs room、执行 ticket、绝对工作区路径或未脱敏 HTML 放入 Markdown 或公开索引。
- 日志只记录 source/target 的类型与脱敏 ID、解析状态、revision 和耗时，不记录正文和授权 token。

## 十二、迁移与兼容

1. **现有正文零迁移**：没有 `wb://` 的 Markdown 原样有效；现有 `@[名称](config_key)` 继续按页面配置项解释。
2. **索引冷启动**：发布前、启用功能后或后台任务按项目扫描现有 Markdown，生成 v1 index；扫描失败只影响 backlinks，不影响正文读取。
3. **显示名变更**：项目/页面/文档改名不改 URI；解析器读取当前目录名，旧 label 仅作为审计/离线回退。
4. **删除与重建**：目标删除后旧链接保持 unresolved；新建同名实体不会自动复活旧链接，只有用户重新选择才绑定新 ID。
5. **`[[...]]` 可选导入**：如启用，仅作为一次性输入 sugar，成功解析即归一化为 `[label](wb://...)`；不新增第二种 canonical 持久化格式。
6. **DesignSpec 结构化引用**：`DesignSpecRef` 继续用于配置字段关系；Markdown 实体链接通过独立索引记录，避免破坏现有 JSON schema。
7. **AI InlineTag 不迁移**：AI 聊天中的 `InlineTag` 继续使用自身协议；如果未来 AI 生成 Markdown 引用，服务端应输出 `wb://` canonical，而不是把 contenteditable HTML 直接保存。

## 十三、分阶段实施计划

### Phase 0：协议与决策（1 个迭代）

- [x] 固化 `wb://` v1、标准 Markdown canonical、实体种类、ID/label、parser/resolver/client 状态投影；v1 明确 `sameProjectOnly=true`。
- [x] 在 `@workbench/shared` 定义 discriminated target/source union、URI codec、解析器 fixture 和错误码。
- [x] 决定 parser 实现：采用 `@workbench/shared/markdown-reference` 内的轻量扫描器，不新增 Markdown AST 运行时依赖；bundle 取舍已记录在引用协议 ADR。
- [x] 在 `project-core` 定义 `ResourceDirectory/EntityResolver` 与 source adapter 接口；把页面需求纳入受管 source，明确 Authority 写入边界。
- [x] 固化 author typed navigation locator、打开/返回行为、删除/拒绝状态，以及 API 的权限投影规则。
- [x] 固化索引 SQLite schema、committed-event projector/outbox、Authority 与 canonical 两个版本轴。
- [x] 明确当前发布契约下的公开目标集合：同一不可变发布快照中的页面和用户知识文档；文档级私有发布若成为需求，单独立项而非隐式假设。
- [x] 形成引用协议 ADR，并由 `project-core`、author-site、demo-ui、viewer-site 的实现边界共同约束。

**验收**：协议可表达 project/page/document，parser 能区分实体链接、legacy config ref 和普通链接；source/target 不依赖文件名或任意路径；客户端状态不会泄露 forbidden 目标。

### Phase 1：Author MVP 编辑器引用（1–2 个迭代）

- [x] 实现 Milkdown inline reference node、Markdown parser/serializer、chip 状态和 click callback。
- [x] 实现 `@` 本地触发、异步候选、分组搜索、键盘和原子删除。
- [x] 只把 KnowledgeDocDialog/DocumentView 的知识文档路径和 PageConfigPanel 页面需求接入 typed context/provider/navigation。
- [x] 保留现有配置项引用菜单和 round-trip 行为。
- [x] 对知识文档和页面需求的 author 编辑态与阅读态接入 renderer adapter；外部 `replaceAll` 会关闭本地引用菜单，协同更新不触发候选。

**验收**：知识文档与页面需求能插入同项目 project/page/document 引用；保存、重开、协同更新后 URI 不变；旧页面需求 config ref 测试不回归。

### Phase 2：索引与 backlinks（2 个迭代）

- [x] 实现 `project-core` index builder、SQLite generation、增量更新、全量 rebuild 和 Authority receipt 校验。
- [x] 增加 candidates/outgoing/backlinks API 与权限测试。
- [x] 在 DocumentView/KnowledgeDocDialog 中增加 outgoing/backlinks 面板和来源定位。
- [x] 实现 rename/delete/unresolved 状态；随后增加 unlinked mentions 和“转为链接”。
- [x] 提供统一 committed-event projector 接入点：Authority receipt stream 作为 durable outbox，按 receipt 串行加载一致快照并投影 knowledge、page requirements、manifest 和页面树相关来源；保存 handler 不直接改写索引。

**验收**：输入 A→B 后 B 能看到 A；删改 B 后状态可预测；索引损坏可 rebuild，正文和 manifest 不受损。

### Phase 3：扩展来源与 renderer 矩阵（2 个迭代）

- [x] 逐类增加 workspace memory/公约、page convention、DesignSpec entry source adapter。
- [x] 在 schema/value 事务与 locator 稳定后接入 config note/richtext field。
- [ ] 明确 canvas-local document 的持久化和转知识文档规则后再接入；knowledge-backed canvas document 继续复用 knowledge source。
- [x] 完成 `DocumentEditor`、Streamdown、`note-html`、`PageRequirements`、`CanvasDocumentContent` 的 renderer adapter 矩阵。

**验收**：每个新增来源都有唯一 typed locator、明确 Authority receipt、重开定位和 backlinks E2E；没有 source context 的临时 Markdown 保持关闭引用。

### Phase 4：发布和 Viewer 一致性（1–2 个迭代）

- [x] publish-manager 从同一个 canonical snapshot 生成公开目标目录、`docId → publishedPath` 映射和精简引用索引。
- [x] viewer knowledge DocumentEditor 与 viewer DesignSpec PageRequirements 接入只读 renderer/navigation adapter。
- [x] 增加发布前 unresolved 计数与不可用链接安全降级、DesignSpec 直接文件内容清理及发布快照一致性测试；viewer 不访问 live workspace。

**验收**：author 与 viewer 的可见链接一致；未发布/无权限目标不会泄露；发布包可离线解析可见链接。

### Phase 5：增强能力（按反馈排序）

- [ ] 跨项目 author 引用：先定义账户级候选与边聚合、source-project 归属和查询权限，再开放显式开关。
- [ ] 跨项目公开链接：在独立发布身份/可见性设计完成后评估，不复用 live workspace 权限。
- [ ] `[[...]]` 输入 sugar、alias 管理和 unresolved 一键修复。
- [ ] 标题/块级链接、评论与 block locator 的稳定化。
- [ ] 当前项目局部 Graph view、引用统计、孤立文档检测。
- [ ] 将 backlinks 摘要注入 Agent 上下文（只读、脱敏、权限过滤），不扩大 Agent 写入权限。

## 十四、验证方案与质量指标

### 14.1 自动化测试

- **shared parser**：三种实体、标准 Markdown canonical、legacy config、代码块/行内代码排除、中文/别名、非法 URI、重复名称、语法诊断和 round-trip；parser 测试不伪造权限状态。
- **demo-ui**：`@` 触发、异步候选、键盘导航、原子删除、外部 `replaceAll`/远程 Yjs 投影不弹窗、外部 value 更新不循环、点击回调、输入法和 selection 保持。
- **project-core/resolver/index**：typed source/target 非法组合、目录解析、同 snapshot 全量/增量、行列 locator、rename/delete、Authority receipt 防旧写、幂等 rebuild、generation 原子切换。
- **author API**：project/session/workspace 权限、候选不返回 forbidden 项、backlinks unavailable 投影、分页、stale/rebuilding 响应和管理员 rebuild。
- **publish/viewer**：同一 canonical snapshot、`docId → publishedPath` 映射、直接文件访问边界、publish-unavailable 策略、viewer 不访问 live workspace。
- **E2E**：Phase 1–2 先覆盖知识库与页面需求的插入→保存→重开→点击→backlink 闭环；后续每新增一种 source adapter 必须增加同等级 E2E，不能只测编辑器组件。

### 14.2 运行指标

- 编辑器首屏不加载所有项目正文；候选首字节和搜索耗时单独统计。
- 索引记录 `parserVersion`、workspaceId、Authority mutationId/revision/rootHash、active generation、构建耗时、失败原因和 backlog 长度；发布另记 canonical synced revision/rootHash。
- 诊断事件按 source/target 类型统计 unavailable、resolver 内部状态、stale index、candidate API 超时和导航失败，不记录正文；客户端诊断不得携带 forbidden 目标元数据。
- 发布前检查公开链接解析率；对 `publish-unavailable` 设定可接受阈值，超过阈值阻断或要求确认。

## 十五、风险与待确认事项

| 问题                           | 建议默认值                                                                     | 需要产品确认                                               |
| ------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| “项目中文档”是否只指知识库文档 | MVP 只把 knowledge document 作为 document 目标；公约/DesignSpec 后续先作为来源 | 是否允许它们互相成为目标                                   |
| 跨项目 page/document 链接      | v1 不支持；Phase 5 先设计账户级边聚合与权限                                    | 是否真的需要跨项目 author/公开链接                         |
| `[[...]]` 是否持久化           | 不持久化，只作为输入 sugar                                                     | 是否接受迁移期的显示差异                                   |
| 链接重命名                     | ID 不变、label 延迟更新                                                        | 是否需要全局“刷新标签”动作                                 |
| unresolved 文档                | 保留芯片和正文，不自动建文档                                                   | 是否提供“创建目标”流程                                     |
| 索引物理存储                   | `<DATA_DIR>/derived/markdown-links.sqlite`，可重建，不随项目复制/备份          | 发布时只从 canonical snapshot 生成精简快照，不复制 live DB |
| 发布文档可见性                 | 当前契约下，随项目发布的用户知识文档均为公开目标                               | 是否需要文档级私有/公开选择；若需要应独立立项              |
| 配置备注/richtext 来源         | 等 schema/value locator 与 Authority transaction 固化后再接入                  | 数组项是否需要稳定 item ID，而不是易漂移的下标             |
| 画布本地 Markdown              | 不进入 MVP；转为知识文档后复用 docId                                           | 是否保留长期 canvas-local document 类型                    |
| block/heading link             | Phase 5                                                                        | 是否和评论/协同 locator 共用 ID                            |

## 十六、改动边界与文件清单

**首期新增/修改方向**（实施时应拆成独立 PR）：

- `packages/shared/src/markdown-reference/*`：协议、类型、解析器、测试 fixture 和导出。
- `packages/project-core/src/markdown-references/*`：实体目录/source adapter、SQLite 索引、rebuild、权限过滤适配。
- `packages/project-core/src/workspace-resource-registry.ts`、Authority contracts：把页面需求及后续 source 纳入明确的受管资源/事务边界。
- `packages/demo-ui/src/markdown/*`、`DocumentEditor.tsx`、`RichTextEditor.tsx`：Milkdown plugin、候选 UI、renderer hook。
- `packages/author-site/src/app/api/projects/[projectId]/markdown-references/*`：候选、outgoing、backlinks、rebuild API。
- Authority committed-event projector/outbox：统一触发增量索引，不在每个保存入口重复挂钩。
- `packages/author-site/src/components/demo/*`：按 phase 为各来源传入 typed source context 和导航回调。
- `packages/author-site/src/lib/publish-manager.ts`、`packages/viewer-site/*`：同一 canonical snapshot 的公开目标目录、引用快照和只读渲染。
- `docs/项目文档/`：协议稳定后补充知识库、配置与预览、项目管理和 AI 模块的当前事实文档；本方案本身只属于远期规划，不替代这些技术文档。

不建议在 `ai-chat-shared` 复制一套 Markdown tag 语法，不建议把链接索引写入用户可编辑的 `knowledge/manifest.json`，也不建议用目录名或 `fileName` 作为 canonical target。

## 十七、参考资料

### 代码与项目文档

- [`DocumentEditor.tsx`](../../../packages/demo-ui/src/DocumentEditor.tsx)
- [`crepe-config.ts`](../../../packages/demo-ui/src/markdown/crepe-config.ts)
- [`page-requirements.ts`](../../../packages/shared/src/demo/page-requirements.ts)
- [`workspace.ts`](../../../packages/shared/src/workspace.ts)
- [`workspace-resource-registry.ts`](../../../packages/project-core/src/workspace-resource-registry.ts)
- [`DocumentView.tsx`](../../../packages/author-site/src/components/demo/DocumentView.tsx)
- [`KnowledgeDocDialog.tsx`](../../../packages/author-site/src/components/demo/KnowledgeDocDialog.tsx)
- [`知识库架构设计.md`](../../项目文档/创作端/09-知识库/技术/01_知识库架构设计.md)
- [`实时保存与协同编辑.md`](../../项目文档/创作端/03-项目管理/技术/11_实时保存与协同编辑.md)

### 外部资料

- [Obsidian — Internal links](https://obsidian.md/help/links)
- [Obsidian — Outgoing links](https://obsidian.md/help/plugins/outgoing-links)
- [Obsidian — Core plugins](https://obsidian.md/help/plugins)
- [Obsidian — Link notes](https://obsidian.md/help/link-notes)
- [Milkdown — Crepe API](https://milkdown.dev/docs/api/crepe)
- [Milkdown — Marker plugin example](https://milkdown.dev/docs/plugin/example-marker-plugin)
- [Milkdown — Plugins 101](https://milkdown.dev/docs/plugin/plugins-101)
- [Tiptap — Mention extension](https://tiptap.dev/docs/editor/extensions/nodes/mention)
- [Tiptap — Suggestion utility](https://tiptap.dev/docs/editor/api/utilities/suggestion)
