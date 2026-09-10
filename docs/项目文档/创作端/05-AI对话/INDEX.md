# AI 对话模块 - 索引

> 更新日期：2026-09-10
>
> 组件位置说明：2026-07-21 起，AI 对话 UI 组件（原 `packages/author-site/src/components/ai-elements/`）整体迁移至共享包 `packages/ai-chat-shared/`（`@workbench/ai-chat-shared`），供创作端与使用端共用；author-site 保留 `ai-elements/index.ts` re-export 壳并在加载时注入创作端集成（AgentClient、静态 system prompt、L3/L4 上下文拉取，见 `src/lib/ai-chat-setup.ts`）。本模块技术文档中出现的 `ai-elements/` 源码路径按共享包内对应路径理解。
>
> 本模块当前还包含：可视化选区的运行时源码定位、Authority committed/validation/preview 状态回流、晚到 projection ack、RunSummary 阶段指标与脱敏预览观察证据摘要，以及图片自动入库元数据和素材/配置冲突澄清规则。

## 文档列表

### 需求文档

| 文档                                        | 说明                                                          |
| :------------------------------------------ | :------------------------------------------------------------ |
| [AI对话\_需求文档.md](./AI对话_需求文档.md) | AI 对话、流式响应、点阵等待态、回复期间消息排队与超时恢复、工具调用、自动标题与 7 天保留的 Popover 对话历史（右上角轻量新建按钮）、消息编辑与重发、模型偏好、统一加号附件菜单、图片直传、本地文件附件读取与计划审批需求、引用项目（跨项目读取）、图像生成与抠图 |

### 技术文档

| 文档                                                | 说明                                                                                                                                           |
| :-------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| [01\_对话组件设计.md](./技术/01_对话组件设计.md)    | AIChat/HistoryDialog 组件设计、共享加号附件菜单、用户/对话级附件授权与账本关联、图片预览去重展示、DotMatrix 等待态、首轮自动标题、模型偏好、消息队列、会话 busy 防线、审批等待态与历史工具卡终态、可视化图层列表元素引用入口 |
| [02_AIChat分层架构.md](./技术/02_AIChat分层架构.md) | AIChat 四层架构（Hooks/Service/Utils/UI）、WebSocket 事件、Conversation Command ACK/IndexedDB outbox 数据流、finish 文件快照、onSnapshotReady 回调与基于账本 revision 的编辑重发 |
| [03_AI行为约束机制.md](./技术/03_AI行为约束机制.md) | AI 行为的**五层**约束机制、不可覆盖的服务端安全骨架、受管 Markdown 提案/Diff/审批、服务端角色绑定、Schema/配置契约、visibility 专用确认、评论授权隔离、Agent 按需能力加载、发送前 Authority health preflight、fatal 保存熔断、AI preview overlay 与 committed receipt 投影、preview validation、E1 运行时观察契约与断言边界、E1/E2/E3 证据标签、live Workspace bash/子 Agent 防线、知识库与 Skill 安全策略 |
| [04_用户模型配置.md](./技术/04_用户模型配置.md)     | 用户自定义 OpenAI 兼容 API、API Key 加密存储、个人 provider 优先级、会话级配置同步                                                             |
| [05_图片内容预描述.md](./技术/05_图片内容预描述.md) | 非多模态模型的图片转文本预处理、视觉模型配置、缓存与失败边界 |
| [06_AI页面删除工具.md](./技术/06_AI页面删除工具.md) | AI 页面删除的确定性工具、用户确认、失败规则和编辑页同步                                                                                         |
| [07_运行进度与事件日志.md](./技术/07_运行进度与事件日志.md) | AI 运行中的紧凑点阵处理中提示、上下文预检压缩与单次溢出恢复、计划审批独立等待计时、同会话 busy 防线、`run_summary` 的真实提交/投影状态、WebSocket 事件透传、后端 JSONL 事件日志、成功与失败均计入的脱敏预览观察跨运行指标聚合及 facts replay fixtures |
| [08_用户级外部工具授权.md](./技术/08_用户级外部工具授权.md) | Figma MCP 与钉钉 dws 的用户级授权、加密存储、session 注入、工具范围和写操作确认                                                                  |
| [09_草图页AI工具.md](./技术/09_草图页AI工具.md) | 草图页 AI 工具保留实现与默认暂停注册边界 |
| [10_图片生成与抠图工具.md](./技术/10_图片生成与抠图工具.md) | 图片子 Agent 与白板复用的图像生成服务、能力档案、generation/edit 请求、配额/重试/取消，以及语义抠图（extractImageElement）、CLIPSeg 与配置 |
| [11_对话账本与恢复.md](./技术/11_对话账本与恢复.md) | SQLite 权威对话账本、单条幂等 ACK 与 IndexedDB 有界重试、附件事务与删除治理、基于 revision 的编辑/重发/重新生成、Agent 版本化上下文摘要与重建、run 终态、owner 隔离、有界 run artifact、7 天硬删除、备份轮换、可靠性看板与默认关闭的脱敏分析投影 |
