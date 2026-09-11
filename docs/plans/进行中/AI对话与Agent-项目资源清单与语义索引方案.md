# AI 对话与 Agent：项目清单与语义索引方案

## 背景

当前 Agent 已能接触项目、页面、文档、配置字段和跨项目引用，但这些能力分散在三条链路中：

- `workspace-tree.json`、`knowledge/manifest.json` 和配置 Schema 用于工作区发现与 L3 上下文拼装；
- `wb://` 用于项目、页面、文档和页面配置字段的稳定引用；
- `knowledge://`、`ref://project/...` 用于知识报告和跨项目原文读取，是服务内部生成的读取句柄。

项目上下文同时已有两类治理资产：

- 项目公约：描述项目范围内的业务规则、硬约束和优先级；
- 页面公约：描述当前页面的局部规则、交互约束和页面职责。

现有链路可以告诉 Agent “资源在哪里”，但不能稳定、低成本地回答“当前项目有什么”“某个页面承担什么职责”“哪些资源可能是活动入口”。项目和页面通常只有名称、运行时和路径，业务语义仍需临时读取源码、页面文案和知识文档后推断；大型项目因此容易产生多轮扫描、上下文膨胀和理解偏差。

本方案新增项目清单（Project Inventory），但不另造资源身份、独立搜索栈或权限系统。它复用现有资源目录、`wb://`、Workspace Authority revision/rootHash、知识服务的 SQLite FTS5/BM25 基础和逐次授权读取能力，在其上增加可维护的语义注解与 Agent 投影。

## 当前事实基线

实施必须以以下仓库事实为准：

1. `wb://` 当前稳定寻址 `project`、`page`、`document`、`config` 四类目标；其中 `config` 表示页面配置 Schema 的字段定义，不表示任意配置值或数组实例。
2. `ResourceDirectorySnapshot` / `ResourceDirectoryEntry` 已能从项目树、知识文档和配置 Schema 构建本地资源候选目录，应作为确定性目录的基础，而不是平行实现第二套本地目录。跨项目引用继续建模为出站边，不塞入只接受当前项目目标的 ResourceDirectory。
3. 项目/页面公约虽然来自动态工作区内容，但当前进入 `projectRules` 注入槽位；资源清单继续作为 L3 项目资料注入，不提升为规则。
4. 页面源码不再默认嵌入 L3；资源清单也不得恢复全量源码预嵌。
5. knowledge-service 当前使用 SQLite FTS5、中文检索扩展和 BM25 排序，没有向量检索基础设施。
6. live Workspace 的持久修改必须经过 Workspace Mutation Authority；SQLite 索引是可重建派生数据，不能反向成为项目事实源。
7. 发现一个外部引用不代表获得读取授权。`readProjectReference` 每次读取都必须按当前用户、来源项目、会话和目标权限重新校验。

## 决策摘要

一期采用“确定性目录 + 语义注解 + 查询投影”三层模型：

```text
项目事实源
  workspace-tree / knowledge manifest / config schema / managed documents
  └─ Workspace Authority revision + rootHash
        ↓
确定性资源目录（可重建）
  资源身份、类型、名称、层级、canonical wb://、来源状态
        ↓
语义注解层
  原生语义 + AI 生成基线 + 人工覆盖
        ↓
权限过滤后的查询与上下文投影
  UI 清单 / FTS 查询 / L3 紧凑上下文 / 按需原文读取
```

关键决策：

- `canonicalUri` 只使用现有 `wb://` 编码结果，是条目的唯一稳定键；不另设可能与 URI 漂移的 `id`。
- `knowledge://` 和 `ref://project/...` 只作为一次查询返回的内部读取句柄，不持久化为项目资源身份，不直接注入 L3。
- 资源目录和 AI 生成结果属于可重建派生数据；人工覆盖属于项目事实，单独持久化并纳入 Authority、版本和审计。
- 目录完整性、生成任务、人工复核和目标可用性使用正交状态，不合并为单个 `status`。
- 一期“语义索引”指结构化字段、AI 摘要/关键词和 FTS5/BM25 检索，不引入 embedding、向量数据库或 ANN。
- 文档和配置优先复用原生元数据；只有项目、页面及确有缺口的条目调用 AI，避免重复摘要和无意义成本。

## 目标

1. 为当前项目提供完整、确定、可快速查询的项目、页面、知识文档、治理文档、页面配置字段和显式外部 `wb://` 引用目录。
2. 为项目和页面提供有证据、可更新、可人工覆盖的简短语义，帮助 Agent 识别资源职责和业务角色。
3. Agent 在首轮即可获得当前项目、当前页面和少量高价值资源概览；需要更多条目时通过只读查询获取，不扫描整个工作区。
4. 保持公约、资源目录、SOP、知识库和原始对象的职责边界，任何摘要都不能升级为规则或写权限。
5. 复用现有资源、权限、Authority 和检索能力，避免双事实源、独立搜索栈和多套 URI。
6. 使自动更新可幂等、可恢复、可观测，并在 AI 服务不可用时保留确定性目录和上一版有效语义。

## 非目标

- 不把所有项目 SOP 强制转换成统一业务 Schema。
- 不让资源清单替代项目公约、页面公约、知识文档或原始对象。
- 不把 `knowledge://`、`ref://project/...` 升级为新的用户可见 canonical URI。
- 不索引配置值、数组数据实例、凭据、Cookie、execution ticket、完整 HTML、用户代码或会话附件。
- 不在后台递归读取外部项目，也不缓存依赖当前用户权限才能看到的外部正文摘要。
- 不在一期建设 embedding、向量数据库、跨项目全局语义搜索或自动业务分类体系。
- 不允许 Agent 直接修改 AI 生成字段或人工覆盖文件。
- 不为旧的非标准 URI、旧索引格式或未发布草稿增加兼容分支；项目尚未上线，发现错误数据时直接修正数据。

## 领域边界

### 1. 确定性资源目录

确定性目录只回答“对象是什么、在哪里、属于谁、当前是否存在”，不负责生成业务判断。它由资源适配器从权威项目源重建，并复用 `ResourceDirectory` 的本地目标模型和 URI 编码。跨项目 `wb://` 链接作为 `ReferenceDeclaration` 出站边保存，查询投影可将其展平为 referenced 条目，但不会改变 ResourceDirectory 的同项目约束。

一期覆盖：

| 资源类型     | 确定性来源                            | canonical URI                                         | 备注                                                        |
| ------------ | ------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| 项目         | 项目元数据                            | `wb://project/{projectId}`                            | 每个清单恰好一个本地项目根条目                              |
| 页面         | `workspace-tree.json`                 | `wb://page/{projectId}/{pageId}`                      | `parentId` 仍表示文件夹层级，不作为跨类型资源 ID            |
| 知识文档     | `knowledge/manifest.json`             | `wb://document/{projectId}/{docId}`                   | 复用 title、description、aiSummary 等原生语义                |
| 治理文档     | 已注册的固定资源                      | `wb://document/{projectId}/{documentKind}/{docId}`    | memory、公约和 DesignSpec；注入优先级仍由原链路决定         |
| 页面配置字段 | 页面配置 Schema catalog               | `wb://config/{projectId}/{pageId}/{encodedFieldPath}` | 只表示字段定义，不包含值和数组实例                          |
| 外部引用声明 | 受管 Markdown 的出站 `wb://` 链接索引 | 原链接的 canonical `wb://`                            | 作为 source locator → target URI 的声明边，不展开目标子资源 |

项目级配置目前没有对应的 `wb://config` 目标。一期不伪造 URI：项目级配置仅作为项目根条目的原生能力摘要，待独立引用协议明确后再拆成可寻址条目。

目录条目以 `canonicalUri` 为 Map key。名称、别名、层级和物化路径都是可变化属性，不参与身份判断。对象重命名只刷新属性；稳定 ID 改变视为删除旧目标并创建新目标，不做猜测迁移。

### 2. 语义注解

语义注解只回答“这个资源大致做什么、扮演什么角色、可用哪些关键词发现”，不改变目录身份或原始对象。

语义值按字段解析，而不是整块对象覆盖：

```text
resolved.field = human.field ?? generated.field ?? native.field
```

三类来源：

- `native`：来自对象自身名称、别名、description、Schema title/description、routeKey 等确定性元数据；只读、随目录重建。
- `generated`：AI 基于受限证据生成的最近一版基线；可丢弃、可重建。
- `human`：人工确认或编辑的可选简介；是唯一可编辑覆盖层，另含确认 hash 和更新时间等审计字段。

资源原生名称、别名、类型、来源和刷新状态属于身份/系统信息，只读展示。若用户要重命名源对象，必须走该对象原有的领域操作。

### 3. 查询与上下文投影

查询层只消费确定性目录和语义注解，不直接读取任意工作区路径。所有列表、搜索和 L3 注入必须先按请求主体、项目、用途和能力过滤，再排序、截断和渲染。

一期查询支持：

- 精确 URI、对象 ID、名称和别名；
- 资源类型、local/referenced 和 scope 过滤；
- 名称、别名、简介、URI 的 FTS5/BM25 检索；
- 确定性排序：精确 URI/ID > 精确名称 > 名称前缀 > 简介文本 > 更新时间；同分结果按 canonical URI 排序。

每个结果返回匹配原因、canonical URI、resolved 语义和正交状态。查询结果不得直接携带原文；原文继续通过 `readFile`、`readProjectReference` 或知识读取工具按需获取。

## 数据模型

### 清单快照

```json
{
  "schemaVersion": 2,
  "projectId": "project-id",
  "workspaceRevision": 42,
  "workspaceRootHash": "sha256",
  "catalogFingerprint": "sha256",
  "overlayHash": "sha256",
  "projectionFingerprint": "sha256",
  "generatorVersion": "inventory-summary-v2",
  "builtAt": "2026-09-11T00:00:00.000Z",
  "entries": []
}
```

- `workspaceRevision` 与 `workspaceRootHash` 标记本次目录观察到的 Authority 快照。
- `catalogFingerprint` 是不含 generated/human 的确定性目录 canonical 序列化 hash；`overlayHash` 是人工覆盖资产 hash。
- `projectionFingerprint` 由 catalogFingerprint、overlayHash 和当前匹配的 generated contentHash 集合计算，用于判断 resolved FTS 投影是否需要刷新。
- `generatorVersion` 包含摘要 Schema、提示模板和证据提取策略版本；模型供应商或具体模型只记在生成审计中，不进入业务协议。
- 快照是派生缓存，不写入项目 Workspace，不参与项目发布。

### 条目模型

```json
{
  "canonicalUri": "wb://page/project-id/page-id",
  "resourceType": "page",
  "scope": "local",
  "parentUri": "wb://project/project-id",
  "refreshMode": "auto",
  "native": {
    "name": "活动投放入口",
    "aliases": ["campaign-entry"],
    "description": null,
    "metadata": {
      "runtimeType": "high-fidelity-react",
      "routeKey": "campaign-entry"
    }
  },
  "generated": {
    "summary": "面向活动 Banner 导流的投放入口页。",
    "sourceFingerprint": "sha256",
    "contentHash": "sha256",
    "generatorVersion": "inventory-summary-v2",
    "generatedAt": "2026-09-11T00:00:00.000Z",
    "evidenceRefs": []
  },
  "human": {
    "summary": null,
    "confirmedGeneratedHash": null,
    "updatedAt": null
  },
  "sourceState": "active",
  "generationState": "ready",
  "reviewState": "unreviewed"
}
```

referenced 投影在上述字段之外附带 `declarations`，每项只包含已注册的结构化 `sourceLocator`、目标 `canonicalUri`、`labelSnapshot`、源 contentHash 和源位置；同一目标可由多个本地来源声明。目标项目的当前名称、简介和可读性不作为持久 native 元数据。

### 正交状态

不得使用一个 `status` 同时表达对象存在性、AI 任务结果和人工确认。

| 维度                        | 状态                                                               | 含义                                               |
| --------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| `sourceState`               | `active` / `missing` / `deleted`                                   | 权威源对象当前状态，不承载请求主体的权限判断       |
| `generationState`           | `not_required` / `pending` / `ready` / `failed` / `disabled`       | AI 语义基线的生成状态                              |
| `reviewState`               | `not_required` / `unreviewed` / `confirmed` / `review_recommended` | 当前人工覆盖或确认是否仍对应最新生成内容与源指纹   |
| 快照 freshness              | `fresh` / `stale` / `rebuilding` / `unavailable`                   | 整体派生目录相对 Authority 快照的新鲜度            |
| 请求级 `targetAvailability` | `unknown` / `available` / `unavailable`                            | 外部目标对当前请求主体是否可读；不持久化到项目清单 |

状态规则：

1. `sourceState !== active` 的条目不进入正常 L3 和搜索结果，只在管理 UI 中按权限显示诊断状态。
2. `generationState=failed` 时保留上一版有效 generated 内容；若从未成功生成，则回退 native 语义，禁止写空字符串冒充结果。
3. 只要 human.summary 有值，该字段始终优先；自动生成永不覆盖 human。
4. 人工点击确认时记录 `confirmedGeneratedHash`。生成内容 hash 不再匹配，或当前 expected sourceFingerprint 与 generated 记录不匹配时，确定性地转为 `review_recommended`；一期不再调用第二次 LLM 做“语义差异较大”判断。
5. 用户清空人工简介只恢复 generated/native 简介，不影响其它系统状态。
6. `refreshMode` 为 `auto` 或 `manual`，默认 `auto`，只表达系统刷新策略，不作为人工语义填写项。`auto` 在源指纹变化后排队生成；`manual` 只标记旧基线和复核状态，由用户显式触发。文档和配置等 `not_required` 条目不显示刷新开关。
7. `summary` 为空时按 `human.summary > generated.summary > native.description` 回退；用户清空简介即恢复默认简介，不影响其它系统状态。

## 证据与生成协议

### 证据引用

`evidenceRefs` 只保存可重新定位的摘要，不保存证据正文：

```json
{
  "sourceUri": "wb://document/project-id/page-convention/page-id",
  "sourceKind": "page-convention",
  "contentHash": "sha256",
  "selector": "document | schema:/properties/title | visible-text",
  "observedWorkspaceRevision": 42
}
```

要求：

- locator 必须来自注册资源或受限 Schema pointer，不接受客户端任意磁盘路径；
- 不记录 HTML、源码、配置值、用户文案原文、凭据或 execution ticket；
- 权限过滤发生在证据读取之前，生成任务不能借索引任务扩大读取范围；
- evidence 用于复核来源和计算指纹，不赋予 Agent 后续读取权限。

### 生成输入

| 类型          | 一期语义来源                                                                 | 是否默认调用 AI                |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------ |
| 项目          | 项目名称与描述、项目公约的资料性片段、页面目录、已有主要文档标题             | 是                             |
| 页面          | 页面名称、routeKey、页面公约的资料性片段、Schema 标题/描述、受限可见文本摘要 | 是                             |
| 知识/治理文档 | title、description、现有 aiSummary                                      | 否，直接复用原生语义           |
| 页面配置字段  | Schema title、description、类型、分组和默认值是否存在                        | 否，确定性格式化；不索引配置值 |
| 外部引用声明  | 当前项目中的链接标签、引用位置                                         | 否，不后台读取目标正文         |

页面内容提取按 runtime 使用专门适配器，并统一执行：去除脚本和隐藏执行内容、只保留有界可见文本、限制单资源和单任务字节数、把所有提取文本标记为不可信资料。生成提示必须要求模型只输出固定 JSON Schema，不执行或转述来源中的指令。

### 源指纹

`sourceFingerprint` 由以下内容 canonical 序列化后计算 SHA-256：

- 资源 canonical URI 和类型；
- 实际使用的 evidence locator 与 contentHash；
- 影响生成的 native 字段；
- 证据提取策略版本和 generatorVersion。

时间戳、文件系统绝对路径、模型随机输出和与该条目无关的 Workspace 文件不进入指纹。相同输入和协议版本必须得到相同任务键。

## 人工覆盖的持久化

人工覆盖保存为项目治理资产 `project.inventory-overrides.json`，只包含 canonical URI 到 human overlay 的映射，不复制目录、native 字段或 generated 基线。

```json
{
  "schemaVersion": 2,
  "entries": {
    "wb://page/project-id/page-id": {
      "summary": "品牌活动的主要投放入口。",
      "confirmedGeneratedHash": "sha256",
      "updatedAt": "2026-09-11T00:00:00.000Z"
    }
  }
}
```

写入规则：

- Author API 先校验项目治理编辑权限，再通过 project-core 领域服务和 Workspace Mutation Authority 提交；
- 写入携带 `baseRevision`、`expectedHash` / `expectedAbsent`，冲突返回明确错误，不做 last-write-wins；
- Agent 只有读取 resolved 投影的权限，不提供修改 generated 或 human 的工具；
- 条目删除后，覆盖记录在可恢复版本窗口内保留为 orphan 诊断，但不进入 Agent 投影；永久清理随项目资源版本保留策略执行；
- 文件进入 Workspace 资源注册表、内容图、版本、审计和备份范围，但不进入发布产物。

## 派生索引的存储与归属

### 职责分配

| 模块                           | 职责                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `@workbench/shared`            | 复用 `MarkdownReferenceTarget` 与 `wb://` 编解码；定义稳定的 inventory wire types |
| `@workbench/project-core`      | 确定性资源适配器、覆盖文件校验、resolved 字段合并和 Authority 写入入口            |
| `@workbench/knowledge-service` | 派生快照、生成任务、资源级 FTS5/BM25 投影、reconcile、备份与统计                  |
| `@workbench/author-site`       | 鉴权后的清单 API、人工编辑 UI、query-aware L3 投影                                |
| `@workbench/agent-service`     | 消费已过滤的 L3 投影，提供只读清单查询并继续按需读取原文                          |

knowledge-service 的 SQLite 是单写者派生索引，保存：目录 generation、generated 注解、生成任务、活动目录指针和 FTS 投影。目录和注解可以从项目事实与覆盖文件重新生成，数据库损坏或丢失不得影响项目原始数据；AI 注解重建前允许暂时回退 native 语义。

资源级 FTS 投影与既有知识正文分块检索位于同一 knowledge-service、复用同一 SQLite 运维和 BM25 工具，但使用独立表和查询入口：前者返回资源，后者返回正文片段。两者不得复制保存同一份原文，也不得互相冒充 canonical 身份。

不在 `knowledge/manifest.json` 中重复写项目/页面摘要，也不把 generated 基线写回 Workspace，避免每次自动生成都制造项目版本、协同冲突和发布噪声。

### 目录发布与注解补全

确定性目录和 AI 注解分开提交，确保新项目不必等待模型即可使用清单：

1. 读取一个 Authority revision/rootHash 快照并构建不可变目录 generation；
2. 在同一 SQLite 事务中写入完整目录、native FTS 行和统计；
3. 提交前再次确认项目 rootHash。若已变化，当前目录标记 superseded，不切换 active；
4. 原子切换 active 目录 generation，使确定性目录立即可读；旧目录按保留策略异步清理；
5. 复用 sourceFingerprint 未变化的 generated 注解，为缺失或变化的条目创建异步幂等任务；
6. 单条生成完成后，只有当 canonical URI、sourceFingerprint 和 active 目录仍匹配时，才在一个事务中写入不可变注解并更新该条 FTS 投影；否则丢弃为 superseded。

人工覆盖提交后不触发 AI 生成。系统只重算 overlayHash、resolved 字段、reviewState 与受影响的 FTS 行；周期 reconcile 负责兜底修复遗漏的投影更新。

读路径只读 active 目录及其匹配注解，从不在用户请求内同步生成 AI 摘要。目录重建期间继续提供上一版并标记 `stale` / `rebuilding`；AI 未完成时使用 native 或上一版 generated，并通过 generationState 和 reviewState 如实表达新鲜度。

## 更新生命周期

### 触发与对账

变更提交后的领域事件只负责快速唤醒，不是唯一正确性来源。knowledge-service 同时运行周期性 reconcile，以 Authority revision/rootHash 兜底发现丢失事件。

协调任务键：

```text
projectId + workspaceRootHash + catalogFingerprint + overlayHash + generatorVersion
```

单条 AI 任务键：

```text
canonicalUri + sourceFingerprint + generatorVersion
```

同键任务幂等去重；同项目只允许一个活跃协调任务。新 rootHash 到达时，旧任务允许完成模型调用，但结果只有在仍匹配 active 目录时才能提交。

### 变更处理

| 变化                                         | 处理                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| 名称、routeKey、层级变化                     | 重建 native 目录与查询投影；仅当进入 sourceFingerprint 的字段变化时重新生成     |
| 项目/页面公约、页面 Schema、受限可见文本变化 | 更新 sourceFingerprint；`auto` 排队生成，`manual` 标记待刷新                    |
| 文档元数据变化                               | 直接刷新 native 语义与 FTS，不调用 AI                                           |
| 页面配置值变化                               | 不进入一期索引，不触发摘要生成                                                  |
| 人工覆盖变化                                 | 重算 resolved 投影、reviewState 和 FTS，不调用 AI                               |
| 对象删除或恢复                               | 更新 sourceState、查询投影和 orphan 覆盖状态                                    |
| 生成失败                                     | 保留旧 generated 或回退 native，记录有限错误码和可重试时间                      |
| Authority external drift                     | 停止发布新 generation，沿用上一版并标记 unavailable/stale，等待现有恢复流程处理 |

重试采用有界指数退避并设最大次数；错误只保存分类码、供应商、耗时和重试次数，不保存提示全文或证据正文。管理员可按项目手动触发 reconcile 或重新生成指定条目。

## 外部引用与权限

### 项目级外部声明

只有当前项目受管内容中已持久化、已被 Markdown 引用索引识别的跨项目 `wb://` 链接，才进入项目清单的 `scope=referenced` 投影。该投影只使用当前项目本地的链接标签和声明来源，不生成或后台读取目标正文摘要。

外部条目持久状态只表达声明是否存在，不持久化“当前用户可读”结论。可读性是请求级投影：

- 列表或搜索时先按当前用户重新解析目标；
- 无权、已删除和不存在统一投影为 `unavailable`，不暴露具体原因；
- 读取内容时继续调用 `readProjectReference`，再次校验授权；
- 权限失效后，不得从旧 generated、缓存 snippet 或 evidence 中泄露目标内容。

### 会话级引用项目

用户在某次对话中通过 `referencedProjects` 选择的项目属于会话上下文，不写入 `project.inventory-overrides.json`，也不变成项目长期清单。它可以在本轮以 `origin=session-reference` 追加临时投影，并继续使用现有 `knowledgeReport`、`knowledge://` 和 `ref://project/...` 读取链路；持久条目的 `scope` 仍只有 `local` / `referenced`。

这一区分避免把一次对话授权永久写入项目，也避免把内部读取句柄与 `wb://` 稳定身份混为一谈。

## Agent 上下文注入

### 信任层级

```text
服务端安全与工具权限
  > 项目/页面公约所在的 projectRules 注入槽位
  > 当前 Workspace 的可验证事实
  > 项目清单 resolved 投影
  > 文档、配置、外部引用正文
  > Agent 推断
```

这里的 L2/L3 是仓库内的注入分层约定，不代表权限等级。项目/页面公约虽来自动态工作区内容，仍必须由服务端安全骨架约束；资源清单始终作为不可信项目资料处理。

### 紧凑投影

每次请求的 inventory L3 投影采用固定预算：

- 硬上限 12,000 字符；
- 最多 40 个条目；
- 单条简介最多 160 字符，单条总投影最多 320 字符；
- 当前项目和当前页面始终优先；
- 其余条目按当前用户问题、名称/别名/简介相关性和稳定 URI 排序；
- 超出预算时返回 `truncated=true`、总条目数和只读查询提示，不静默丢失状态。

上下文组装接口应接收当前页面和当前用户问题，先在服务端做权限过滤与检索，再返回结构化投影；客户端只负责渲染为带明确边界的 L3 文本。若用户问题尚不可用，则使用确定性优先级：项目、当前页、其它页面、人工确认条目、最近更新文档、外部声明。

上下文失败不阻断普通聊天，但必须注入机器可辨识的 `inventoryStatus=unavailable`，使 Agent 明确说明资源发现能力受限。禁止静默退化为全工作区递归扫描。

### 只读工具

增加 `searchProjectInventory` 只读能力，参数为：

- `query`；
- 可选 `resourceTypes`、`scopes`；
- `cursor` 和有界 `limit`。

返回结构化结果、匹配原因、freshness 和分页游标。工具只访问 Author/knowledge-service 的鉴权投影，不接受工作区路径，不返回证据正文，不赋予原文读取权限。

## 编辑入口

桌面端项目清单采用“单列分组概览 + 按需右侧编辑面板”：

- 项目、页面、页面下配置项、项目文档和外部引用按层级分组；页面下配置项默认折叠，搜索命中下级资源时自动展开；
- 默认只显示名称和简介等有限语义，不把 native/generated/human/resolved 的技术差异铺满主视图；
- 按名称、别名、简介、资源类型和状态筛选；
- 所有资源按需打开“编辑简介”面板，人工只填写可选 `summary`；
- 支持确认当前 AI 版本、恢复默认简介；`auto` / `manual` 刷新策略只作为系统信息保留，不提供人工语义编辑控件；
- 保存由用户显式触发；存在草稿时阻止刷新，切换目录或离开页面先提示；CAS 冲突时重新载入最新数据并按字段保留本地修改，等待再次保存；
- 查看 evidence locator、hash、观察 revision 和生成审计摘要，但不显示被权限过滤的原文。

一期不提供拖拽目录、直接改 canonical URI、编辑 generated 基线、批量 AI 重写和自定义自由状态。

## 实施阶段

### 第一阶段：协议与确定性目录

- [x] 在 shared 定义 versioned inventory wire types，直接复用 `MarkdownReferenceTarget`。
- [x] 扩展 project-core 的资源适配器以覆盖本地治理文档和页面配置字段；复用引用图建模外部 `wb://` 声明边。
- [x] 定义 canonical 序列化、catalogFingerprint 和正交状态转换。
- [x] 明确项目级配置在一期只作为项目摘要，不伪造 `wb://config` URI。
- [x] 补齐 Unicode 页面 ID、嵌套/数组 Schema 定义路径、删除状态和请求级 unavailable 投影测试。

### 第二阶段：覆盖资产与 Authority

- [x] 定义并校验 `project.inventory-overrides.json`。
- [x] 将覆盖资产加入 Workspace 资源注册、Authority 版本/审计/备份范围，明确排除发布。
- [x] 提供 project-core 校验与 Author API 写入口，使用 revision/hash CAS。
- [x] 实现字段级 merge、清空、确认和 orphan 恢复规则。

### 第三阶段：派生索引与生成协议

- [x] 在 knowledge-service 建立 inventory generations、annotations、jobs 和资源级 FTS 表，复用既有 SQLite/FTS 运维基础。
- [x] 实现 Authority 健康快照读取、幂等 reconcile、active generation 原子切换和 superseded 防线。
- [x] 实现项目/页面证据适配器接口、受限证据读取、固定 JSON 输出和 sourceFingerprint。
- [x] 复用文档 aiSummary 与配置 Schema 原生语义，不重复调用 AI。
- [x] 实现失败回退、失败任务可重试、手动刷新和派生索引的既有备份/重建基础。

### 第四阶段：查询、上下文和工具

- [x] 提供鉴权后的列表/搜索 API，并在过滤后执行 FTS 排序。
- [x] 将当前编辑会话的页面清单和知识索引 L3 输出收敛到统一 inventory 投影，避免重复注入。
- [x] 实现 query-aware 12,000 字符预算、截断元数据和 unavailable 显式状态。
- [x] 增加 `searchProjectInventory`，继续使用原有工具按需读取正文。
- [x] 保留项目/页面公约在 projectRules 槽位，验证资源摘要不能覆盖规则或工具权限。

### 第五阶段：编辑 UI 与可观测性

- [x] 提供清单查看、简介覆盖、确认和恢复入口；刷新策略作为系统状态保留。
- [x] 将桌面端主视图收敛为分组概览，改为按需右侧编辑面板，补齐未保存保护和 CAS 冲突重基线交互。
- [x] 展示正交状态、freshness、证据 locator 与有限错误信息。
- [ ] 增加生成延迟、失败率、索引新鲜度、查询命中率、L3 截断率和人工复核积压指标。
- [x] 管理入口只展示聚合与脱敏数据，不记录或回显来源正文。

### 第六阶段：迁移与验收

- [ ] 为当前活动入口项目生成第一版清单并人工确认（需要在真实项目和可用生成器凭据下执行）。
- [x] 当前编辑会话已删除被统一 inventory 投影替代的重复 L3 注入；无项目/会话的旧上下文仅保留原有兜底路径。
- [x] 完成桌面端资源清单组件与文档视图宿主交互测试，覆盖概览、编辑、只读、保存、刷新阻止、CAS 冲突和离开保护。
- [x] 更新 AI 对话、知识库、引用协议和独立知识服务的长期项目文档及对应索引。
- [ ] 覆盖“有哪些入口”“入口怎么配置”“引用目标是否可读”“索引不可用”等端到端回归（目前完成单元/服务级回归）。
- [ ] 完成一次索引库删除后全量重建演练，验证人工覆盖和项目事实不丢失（当前仅完成可重建设计与临时库测试）。

## 验收标准

### 功能

1. 新项目无需人工填写完整资源表，即可生成身份、名称、层级和 URI 完整的确定性目录。
2. 项目和页面可以生成带 sourceFingerprint 与 evidence locator 的 AI 草稿；文档和配置不发生重复 AI 摘要。
3. 人工覆盖按字段生效，自动更新不覆盖任何 human 字段；清空单字段可正确回退。
4. 源对象变化后，`auto` 条目最终刷新，`manual` 条目明确待刷新；人工确认可确定性转为 `review_recommended`。
5. 项目级持久外部声明与会话级 `referencedProjects` 不互相污染。
6. `searchProjectInventory` 能按名称、别名、简介、URI、类型和 scope 返回稳定排序及匹配原因。
7. Agent 首轮能从紧凑投影发现当前项目、当前页面和高相关资源，无需读取页面源码或遍历知识库。

### 一致性与恢复

8. active 目录 generation 的 rootHash 与观察到的 Authority 快照一致；过时目录或注解任务不能覆盖新状态。
9. 同一任务键重复执行不产生重复记录或额外 AI 调用。
10. AI 生成失败、knowledge-service 重启或 SQLite 删除后，确定性目录仍可重建，人工覆盖仍完整保留。
11. 对象删除、恢复、重命名和稳定 ID 改变均按既定规则处理，不产生幽灵条目或错误迁移。
12. 并发编辑覆盖文件时使用 CAS，冲突可见且不丢失任一用户修改。

### 安全与权限

13. 所有列表、搜索、证据和上下文均先鉴权后排序；未授权目标不会通过名称、摘要、snippet、错误原因或缓存泄露。
14. 外部目标每次读取重新授权；权限撤销后旧缓存不能继续暴露目标正文语义。
15. 来源文本中的指令不能改变生成任务 Schema、项目规则、工具权限或写入边界。
16. 清单不记录完整 HTML、源码、配置值、敏感引用内容、绝对路径、Cookie、凭据或 execution ticket。
17. Agent 无法直接修改 generated 或 human；人工覆盖只能由有治理编辑权限的用户经 Authority 提交。

### 性能与可维护性

18. L3 inventory 投影始终满足 12,000 字符、40 条和单条长度上限，并在截断时显式报告。
19. 目录重建、AI 生成和 FTS 更新可独立测试；替换摘要模型不改变 wire schema、canonical URI 或人工覆盖。
20. 一期不引入第二个搜索服务/技术栈、第二套资源 URI 或第二个项目事实存储；资源 FTS 与知识正文 FTS 职责不重叠。

## 验证矩阵

| 层级          | 重点验证                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------ |
| 单元测试      | URI 唯一键、目录适配器、canonical hash、字段级 merge、状态转换、指纹稳定性、排序、预算截断 |
| 属性/模糊测试 | Unicode ID、URI encode/decode、嵌套 Schema fieldPath、异常简介、超长元数据              |
| 集成测试      | Authority snapshot → generation → FTS → active 切换；覆盖 CAS；失败重试；删除与恢复        |
| 权限测试      | 项目角色、治理编辑权限、跨项目授权撤销、统一 unavailable 投影、证据过滤                    |
| Agent 回归    | 活动入口发现、页面用途、配置字段用途、按需引用读取、公约冲突、inventory unavailable        |
| 故障演练      | AI 超时、服务重启、丢失事件、过时任务、SQLite 损坏/删除、Authority external drift          |
| 性能测试      | 10/100/1000 页面与大量配置字段下的重建时间、查询延迟、L3 大小、增量 AI 调用数              |

质量指标：

- inventory freshness lag（P50/P95）；
- 生成成功率、重试率和每次 rootHash 变化的 AI 调用数；
- 查询命中率、零结果率、首次回答前工具调用次数；
- L3 字符数和截断率；
- 人工覆盖保留率、`review_recommended` 积压和误报率；
- 无权限资源泄露事件数，目标必须为 0。

## 风险与控制

| 风险                        | 控制                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| AI 生成简介与资源事实不一致 | 多来源 evidence、固定 Schema、默认 unreviewed、人工覆盖优先                 |
| 自动更新导致成本和版本噪声  | generated 只存派生库、sourceFingerprint 去重、文档/配置不默认调用 AI        |
| 一个状态字段产生组合爆炸    | source/generation/review/freshness 分开持久，外部 availability 按请求计算   |
| 双目录或双事实源逐渐漂移    | ResourceDirectory 为本地目录基础，knowledge-service 只保存可重建 generation |
| 外部摘要在权限变化后泄露    | 不后台读取外部正文、不持久化用户级可读性、每次请求重新授权                  |
| L3 随项目增长失控           | query-aware 排序、固定字符/条目预算、分页查询工具                           |
| 事件丢失导致索引长期过期    | 领域事件快速唤醒 + rootHash 周期 reconcile                                  |
| 旧任务覆盖新项目状态        | rootHash 二次校验、不可变 generation、active 原子切换                       |
| 自由编辑名称破坏真实对象    | 原生名称只读展示；源对象重命名走原领域操作                                  |

## 相关事实来源

- `packages/shared/src/markdown-reference/types.ts`、`uri.ts`：`wb://` 目标与 canonical 编解码。
- `packages/project-core/src/markdown-references/`：ResourceDirectory、引用图和索引版本。
- `packages/project-core/src/workspace-resource-registry.ts`：工作区资源注册、单资源 hash 与 rootHash。
- `packages/author-site/src/lib/agent/scan-workspace.ts`、`system-prompt.ts`：当前 L3、知识索引和公约注入。
- `packages/agent-service/src/backends/pi-tools/markdown-reference-tool.ts`：`readProjectReference` 的 URI、授权和不可信资料边界。
- `packages/knowledge-core/src/index.ts`：知识条目、信任、权限、关系和索引任务模型。
- `packages/knowledge-service/src/sqlite-catalog.ts`：当前 FTS5/BM25、generation-like 同步和 rootHash 去重基础。
- `docs/项目文档/创作端/09-知识库/技术/03_项目页面文档引用与双向链接.md`：项目资源引用协议与权限语义。

## 进度记录

- 2026-09-11：完成首版问题分析，提出项目清单与 AI/人工摘要覆盖。
- 2026-09-11：按当前代码与项目文档完成架构复查。确认一期不引入向量检索；将方案重构为确定性资源目录、语义注解、权限查询投影三层；明确复用 `wb://`、ResourceDirectory、Authority revision/rootHash 与 FTS5/BM25；拆分正交状态，确定人工覆盖和派生索引的存储边界，并补齐并发、恢复、权限、预算和验收矩阵。
- 2026-09-11：完成 shared/project-core/knowledge-service/author-site/agent-service/ai-chat-shared 的首版实现：资源清单、字段级 Authority 覆盖、SQLite generation/FTS、受权限过滤的 L3 与 `searchProjectInventory`、设置页和回归测试；真实项目首版生成、全链路 E2E、指标持久化和删除库演练留待部署验收。
- 2026-09-11：按“先浏览、后补充语义”的需求背景重构桌面端清单：主视图改为项目/页面/配置项/文档分组概览，编辑收敛到右侧面板；补充显式保存、刷新阻止、目录离开保护和 CAS 冲突按字段保留本地修改，并完成组件与宿主交互测试。
- 2026-09-11：按语义模型收敛决策完成 inventory v2：人工覆盖、AI 生成、resolved/L3、FTS 和 Agent 查询统一只保留可选 `summary`（界面称“简介”）；原生名称及类型、来源、刷新状态保留为只读系统信息；旧版覆盖数据按空覆盖处理，不做迁移。
