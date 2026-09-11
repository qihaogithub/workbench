# AI 对话与 Agent：项目清单体验与语义生成方案

## 背景

项目清单的定位是给 Agent 提供一份低成本、可检索的项目入口目录和简短简介。它只维护项目、页面和资源的语义补充，不替代项目公约，也不修改页面内容、配置值或文档正文。

当前页面已经收敛为“项目清单 + 简介”模型，但界面仍沿用了较重的手动编辑流程：标题区域右侧同时放置刷新、保存和状态操作；简介说明被限制在左侧标题列；顶部还展示页面、配置项、文档和索引 freshness 统计。这些信息没有帮助用户完成“浏览资源、补充简介”这两个核心任务，反而分散了注意力。

同时，页面中的项目和页面条目长期显示“生成中”。这不是因为复用了某个很慢的对话 Agent，而是当前生成链路只完成了任务入队：

1. `buildWorkspaceInventory` 为项目和页面生成 `generationRequests`，并将未命中生成基线的条目标记为 `pending`。
2. `reconcileProjectInventory` 向 knowledge-service 发布目录快照并创建 generation jobs。
3. knowledge-service 暴露了 claim、annotation、fail 接口，也实现了 `runInventoryGeneration` 领域函数。
4. 仓库中没有运行时调用 `runInventoryGeneration` 或 `/api/inventory/jobs/claim` 的 worker。任务没有被消费，因此状态不会从 `pending` 进入 `ready` 或 `failed`。

这说明问题的根因是缺少生成执行者和状态回读机制，而不是需要把对话 Agent 换成另一个 Agent。

## 目标

1. 项目清单编辑改为自动保存，用户不再寻找或点击保存按钮。
2. 让标题说明成为清单头部的完整宽度说明，不被右侧操作区挤压。
3. 删除不参与决策的统计条，只保留需要用户处理的提示和筛选能力。
4. 让项目、页面简介生成任务有明确的后台消费者、超时、失败、重试和状态回写。
5. 生成使用独立、无工具、无会话历史的模型调用；复用当前模型配置，但不复用对话 Agent 实例。
6. 生成完成后清单能够自动看到最新状态，不要求用户手动反复刷新。
7. 保持现有显式 Authority 写入、CAS 冲突、权限控制、离开保护和 knowledge-service 派生索引边界。

## 范围

### 本次范围

- `ProjectInventoryView` 的自动保存、状态提示、头部布局和统计信息收敛。
- 项目清单人工简介覆盖的 debounce 保存与并发合并。
- inventory generation job 的 worker、模型适配、证据读取、失败重试和 stale job 恢复。
- 清单生成状态的自动回读。
- 相关共享类型、knowledge-service client/API、agent-service worker、Author UI 测试和项目文档。

### 非本次范围

- 不恢复展示名称、职责、标签、摘要、使用说明或刷新模式等人工字段。
- 不把项目清单升级为项目公约或新的写入入口。
- 不让生成 worker 读取任意磁盘路径、配置值、凭据、Cookie、完整 HTML 或会话附件。
- 不引入 embedding、向量数据库、跨项目全局语义搜索或新的资源身份协议。
- 不改变知识库、反馈系统及其他模块已有的 `tags` 字段。
- 不迁移旧版清单覆盖数据；旧数据继续按当前 schema 规则处理。

## 现状证据与根因

### 自动保存问题

`ProjectInventoryView` 当前通过 `dirty` 比较本地 `overrides` 与 `savedOverrides`，但 `save()` 只有两个 UI 入口：清单头部的“保存覆盖”按钮和简介编辑面板底部的“保存覆盖”按钮。虽然父层已经通过 `onDirtyChange` 提供离开保护，但没有 debounce 自动提交机制。

因此，用户看到“已保存”只能说明上一次显式保存完成；编辑输入不会自动进入 Authority 覆盖文件。

### 布局与信息密度问题

标题和操作区使用左右分栏，说明文案位于左侧 `min-w-0` 容器中，并设置了有限的最大宽度。操作按钮越多，说明可用宽度越小。其下方的统计条同时呈现数量和 freshness，但这些信息既不能直接完成筛选，也不能帮助用户判断下一步动作。

### 生成问题

`runInventoryGeneration` 已经包含读取有界 evidence、调用 `InventorySummaryGenerator`、校验固定输出、写入 annotation 和标记失败的完整领域流程，但它只在 knowledge-service 测试中被调用。knowledge-service 进程启动时只运行知识库 reconcile 和 backup 定时器，没有启动 inventory generation worker。

因此当前流程是：

```text
Author reconcile
  → publish inventory snapshot
  → create generation jobs
  → 无 worker claim jobs
  → 条目持续 generationState=pending
```

## 方案决策

### 1. UI：本地草稿 + debounce 自动保存

继续使用现有 `PUT /inventory/overrides` 和 Workspace Authority，不新增另一套保存协议。

- 用户修改简介后，在约 800ms 无输入时自动提交。
- 删除清单头部和编辑面板中的“保存覆盖”按钮。
- 保留“放弃修改”，仅在本地仍有未提交变更时显示。
- 在标题操作区或编辑面板底部显示轻量状态：`保存中`、`已自动保存`、`保存失败`。
- `onDirtyChange` 和离开保护继续有效；自动保存失败时不能静默放行离开。
- 手动刷新在自动保存进行中时暂不执行；若存在尚未提交草稿，刷新前先 flush 一次自动保存，失败则保留当前页面和本地修改。

自动保存必须避免竞态覆盖：请求开始时固定本次提交的 overrides fingerprint；请求期间产生的新修改不能被响应后的 `load()` 覆盖。提交完成后只确认本次快照，若本地仍有更新则自动排入下一次保存。

CAS 冲突继续采用当前语义：读取最新覆盖，按字段合并本地尚未提交的修改，更新基线并提示用户检查。自动保存不能退化为 last-write-wins。

### 2. UI：头部信息收敛

头部改成三层结构：

```text
项目清单                                      [刷新索引] [自动保存状态]
为 Agent 提供项目资源的目录和简短简介；这里只维护简介，不修改页面内容、配置值或文档正文。
[需要人工处理提示]
[搜索] [类型] [状态]
```

- 标题和操作按钮保留在同一行。
- 说明段落移到标题行下面，使用完整可用宽度，不再被右侧按钮限制。
- 删除“页面数量 / 配置项数量 / 项目文档数量 / 索引 fresh”统计条。
- 保留“语义待处理”提示，因为它可以直接把用户带到待处理筛选结果。
- 保留搜索、类型筛选和状态筛选。
- `freshness` 继续作为后端派生状态和诊断数据保留，但不再在此处作为视觉统计展示。

### 3. 生成：agent-service 中的独立无状态 worker

推荐由 `agent-service` 承担模型调用和 worker 生命周期，knowledge-service 继续只负责派生目录、任务队列、annotation 和 FTS。

worker 不创建或复用 `BackendAgent` / 对话 session，而是复用现有 `ModelManager` 和 `pi-ai.complete` 能力，使用当前服务级 provider/model 配置，并明确传入：

- 固定的语义生成 system prompt；
- 有界且标记为不可信资料的 evidence；
- `tools: []`；
- 固定 JSON 输出 `{ "summary": string }`；
- 有界 max tokens、超时和零或有限重试。

这满足“直接单独调用大模型”的诉求，同时保留服务已有的 provider 配置、API key、超时和模型回退逻辑。生成摘要不是对话 Agent 的任务，不需要会话历史、项目写权限、工具权限或用户消息上下文。

worker 的数据流为：

```text
agent-service worker
  → claim knowledge-service generation job
  → 按受管 workspaceId + wb:// evidence ref 读取有界资料
  → ModelManager 解析当前模型
  → pi-ai.complete(tools=[])
  → 校验 { summary }
  → annotation 或 fail 回写 knowledge-service
  → UI 轮询读取 active snapshot
```

为确保生成证据与目录构建时观察到的工作空间一致，generation request/job 增加内部 `workspaceId`（不进入用户语义模型、不返回 Agent 查询结果）。worker 只能通过已登记的 Workspace Authority workspace 解析路径，拒绝任意客户端路径和不匹配的 `wb://` 目标。

### 4. 任务可靠性

- claim 保持事务性，限制单批数量和 worker 并发数。
- worker 启动时和定期 claim 时恢复超时的 `running` job，避免进程重启后永久悬挂。
- 模型超时、无凭据、响应格式错误和证据读取失败统一转换为有限错误码，不保存 evidence 正文或完整 prompt。
- 失败任务采用有界重试和退避；达到上限后进入 `failed`，UI 显示生成失败，仍保留 native 或上一版 generated 回退。
- annotation 继续使用 canonical URI、sourceFingerprint 和 active generation 校验；过时结果标记 superseded，不得污染当前目录。
- worker 只处理项目和页面 generation job；文档、配置字段和外部引用仍走确定性原生语义，不调用模型。

### 5. UI 状态回读

清单初次读取后，如果存在 `generationState=pending` 的项目或页面，启动低频轮询。轮询只更新条目、generation/review 状态和派生简介，不覆盖本地未提交的 human overlay；用户正在编辑时仍以本地草稿为准。

当所有待生成条目进入 `ready`、`failed` 或 `disabled` 后停止轮询。手动刷新仍保留，用于重新构建目录和处理 Authority 变化，但不再承担“等待生成完成”的唯一职责。

## 实施任务清单

### A. Author UI 自动保存

- [ ] 从清单头部移除“保存覆盖”按钮和保存图标。
- [ ] 从简介编辑面板移除“保存覆盖”按钮及对应 props。
- [ ] 增加自动保存状态模型和 800ms debounce 调度。
- [ ] 处理自动保存请求期间的继续输入，确保响应不覆盖新草稿。
- [ ] 保留并覆盖测试：简介选填、自动保存、放弃修改、离开保护、只读角色、刷新阻止、CAS 冲突。

### B. Author UI 信息收敛

- [ ] 将说明文案移出标题左侧列，撑满清单头部可用宽度。
- [ ] 删除页面 / 配置项 / 项目文档 / freshness 统计条。
- [ ] 保留语义待处理提示、搜索和类型/状态筛选。
- [ ] 更新无障碍名称、测试文案和相关模块文档。

### C. generation worker 与内部协议

- [ ] 为 generation request/job 增加受管 `workspaceId` 等必要内部上下文。
- [ ] 扩展 knowledge-service client 的 claim、annotation、fail 和 job 状态方法。
- [ ] 在 agent-service 增加独立 inventory generation worker，不接入对话 Agent session。
- [ ] 复用 `ModelManager` + `pi-ai.complete`，固定无工具调用和输出校验。
- [ ] 实现 evidence ref 到受管 workspace 的安全读取，限制单条和单批字节数。
- [ ] 增加超时、并发上限、有限重试、退避和 stale running 恢复。
- [ ] 为 worker 增加结构化日志和最小诊断指标：claimed、ready、failed、stale、latency、retry count；禁止记录 evidence 正文、prompt、API key 和完整模型响应。

### D. 状态回读与文档

- [ ] 清单存在 pending 条目时启动低频轮询，完成后停止并保留本地草稿。
- [ ] 更新项目清单需求文档、技术文档、模块索引和本计划进度。
- [ ] 在文档中明确：清单生成使用独立无状态模型调用，不复用对话 Agent。

## 验证方式

### 单元与集成测试

- `@workbench/shared` / `@workbench/project-core`：验证内部 generation 上下文、简介覆盖和旧字段不进入 resolved 结果。
- `@workbench/knowledge-service`：验证 job claim、幂等、stale 恢复、annotation、失败重试、过时结果拒绝和 FTS 更新。
- `@workbench/agent-service`：验证 worker 使用固定 `{ summary }` 输出、`tools=[]`、超时/失败回写、模型配置回退和不创建对话 Agent。
- `@workbench/author-site`：验证自动保存 debounce、请求竞态、CAS 冲突、离开保护、刷新行为、只读角色和待生成轮询。

### 桌面端验收

1. 打开项目清单，确认头部只有标题、说明、刷新和自动保存状态，不再出现保存按钮和统计条。
2. 编辑简介后停止输入，确认约 800ms 后自动保存，离开页面不会提示“请先保存”。
3. 连续快速输入并在保存请求进行中继续修改，确认最终文本完整保留。
4. 用两个会话同时修改同一条简介，确认 CAS 冲突能保留本地修改并提示复核。
5. 点击刷新索引后确认 project/page generation job 被 claim，状态从“生成中”进入“已生成”或“生成失败”。
6. 重启 worker 后确认 running job 不会永久停留，超时任务可以恢复或明确失败。
7. 确认生成调用不创建对话消息、不携带项目写工具、不读取未授权外部正文。

## 风险与控制

| 风险 | 控制措施 |
| --- | --- |
| 自动保存请求覆盖用户继续输入的内容 | 以提交快照 fingerprint 判断；成功后只更新本次基线，剩余修改自动进入下一批 |
| 自动保存失败导致用户误以为已保存 | 显示明确失败状态，继续 dirty 和离开保护；不把失败标记成已保存 |
| 多个 worker 重复生成同一条 | knowledge-service claim 使用事务和 running 状态；annotation 使用 sourceFingerprint 幂等校验 |
| worker 重启后任务永久 running | claim 前回收超过阈值的 running job，并记录 stale 指标 |
| 模型输出包含额外字段或提示注入 | 固定不可信资料提示、严格 JSON 校验、只接受 summary、限制证据大小和输出长度 |
| 生成服务不可用影响清单浏览 | 清单目录与 native 语义先可用；生成失败回退 native/上一版 generated，不阻塞读取和编辑简介 |
| worker 读取错误 workspace 或越权资料 | job 绑定受管 workspaceId；只解析注册的 `wb://` evidence ref，拒绝任意文件路径 |
| 轮询覆盖用户本地草稿 | 轮询只合并服务端条目和状态，human overlay 仍以本地 dirty 草稿为准 |

## 当前进度

- [x] 已完成只读代码排查，确认保存按钮是唯一覆盖提交入口。
- [x] 已确认头部说明被标题/操作区左右布局限制宽度。
- [x] 已确认统计条只承担展示，不是清单功能依赖。
- [x] 已确认 generation job 创建链路存在，但没有运行时 worker 消费 claim 队列。
- [ ] 等待方案确认后实施 Author UI 自动保存和信息收敛。
- [ ] 等待方案确认后实施独立 generation worker 和状态回读。

## 待确认事项

1. 是否按“agent-service 独立无状态 worker + `pi-ai.complete(tools=[])`”实施，而不是复用对话 Agent？
2. 自动保存 debounce 是否采用 800ms；默认保留“放弃修改”作为异常或冲突时的本地操作？
3. 清单中的“语义待处理”提示是否保留，仅删除页面/配置项/文档/freshness 统计条？
