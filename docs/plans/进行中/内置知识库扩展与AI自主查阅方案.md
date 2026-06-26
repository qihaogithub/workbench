# 内置知识库扩展与 AI 自主查阅方案

## 背景

创作端已有知识库功能，工作空间通过 `knowledge/manifest.json` 管理用户项目文档。系统内置知识库如果继续复制到每个工作空间，在文档达到数百篇后会造成磁盘膨胀、升级覆盖和同步时机复杂度。新方案将系统内置知识改为管理后台全局配置，并通过摘要索引和 Agent 虚拟读取提供给 AI。

## 目标

- 支持管理员在管理后台配置全局内置知识库。
- 保持项目知识库仍由用户管理，AI 只读不写。
- AI 每轮对话获得轻量摘要索引，并根据任务自主读取相关文档。
- 避免把大量知识正文直接塞入 System Prompt 或用户消息前缀。
- 避免把大量系统知识正文复制到每个工作空间。
- 更新项目长期文档，使需求、技术契约与代码行为一致。

## 范围

- 创作端知识库初始化、全局系统知识管理、索引扫描和 API 列表读取。
- 管理后台内置知识库页面和 Admin API。
- Agent Service 系统知识快照同步与虚拟读取。
- AI System Prompt 中的知识库查阅规则。
- 知识库与 AI 对话模块文档。
- 不引入向量数据库、外部检索服务或新增 UI 库。

## 方案

采用“管理后台全局知识库 + 摘要索引 + 工作空间用户知识叠加 + Agent 虚拟读取”的方案：

1. 系统内置知识保存到 SQLite `system_knowledge_documents`，管理员可在 `/admin/knowledge` 新增、编辑、删除、启停和重生成摘要。
2. 代码内置 Markdown 仅作为默认种子数据；工作空间 manifest 只保存用户知识文档，不再复制系统正文。
3. L3 只注入标题、管理员描述、AI 摘要、关键词、分类、标签和文件路径，不注入正文。
4. 管理员保存系统文档后自动尝试生成摘要；失败不阻塞保存，索引回退到描述、标签和正文摘录。
5. AI 根据 L2 规则先看索引，再用 `readFile` 或 `readFileWithLines` 查阅最相关文档。
6. Agent Service 接收系统知识快照，读取 `knowledge/{文件名}` 时优先返回虚拟系统文档；用户文档仍从 workspace 文件系统读取。
7. Agent Service 继续保持知识库写保护，防止 AI 修改 `knowledge/`。

## 任务清单

- [x] 建立内置知识库注册表
- [x] 新增管理后台内置知识库配置
- [x] 取消系统知识正文复制到工作空间
- [x] 增加系统知识摘要索引
- [x] 增加 Agent Service 虚拟系统知识读取
- [x] 优化知识库索引输出，适合大规模文档列表
- [x] 强化 AI Prompt 的自主查阅和按需读取规则
- [x] 增加同步与索引测试
- [x] 更新 `docs/项目文档/` 中知识库和 AI 对话相关文档
- [x] 运行匹配验证命令

## 进度记录

- 2026-06-26：完成现状排查。现有知识库由 `author-site` 管理 manifest，AI 对话每轮通过 workspace-context API 注入索引，Agent Service 通过工具钩子记录已读知识库文件并阻止写入。
- 2026-06-26：完成代码改造。新增内置知识注册表、独立 Markdown 资源与同步函数；工作空间初始化、知识库 API、知识内容 API、AI 上下文扫描均会幂等同步系统文档；知识库索引增加分类、标签和按需读取提示；System Prompt 明确 AI 只按任务读取相关知识。
- 2026-06-26：完成相关测试。`fs-utils-multi-demo.test.ts` 覆盖旧工作空间补齐系统文档且保留用户文档；`scan-workspace.test.ts` 覆盖索引格式；`system-prompt.test.ts` 覆盖按需读取规则。
- 2026-06-26：完成项目文档更新。知识库需求、知识库技术文档、AI 行为约束文档、模块索引和项目总览已同步为“系统内置同步 + 轻量索引 + AI 按需读取”的契约。
- 2026-06-26：完成最终结构补强。内置知识正文已从 `fs-utils.ts` 拆为独立 Markdown 资源，注册表与同步逻辑集中在 `packages/author-site/src/lib/knowledge/builtin-documents.ts`，后续新增内置知识不再膨胀通用文件工具。
- 2026-06-26：完成方案升级。系统内置知识改为 SQLite 全局配置和 `/admin/knowledge` 管理；工作空间 manifest 只保留用户知识；AI 索引合并系统摘要与用户文档；agent-service 支持 `knowledge/{文件名}` 虚拟系统文档读取。

## 验证方式

- `pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns="fs-utils-multi-demo.test.ts|scan-workspace.test.ts|system-prompt.test.ts"`：已通过，53 个测试通过。
- `pnpm check:author`：已通过，类型检查通过，44 个测试套件、332 个测试通过。
- `pnpm --filter @opencode-workbench/author-site typecheck`：已通过。
- `pnpm --filter @opencode-workbench/agent-service typecheck`：已通过。
- `pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns="system-knowledge.test.ts|scan-workspace.test.ts|fs-utils-multi-demo.test.ts"`：已通过，36 个测试通过。
- `pnpm --filter @opencode-workbench/agent-service test -- tests/unit/file-tools-permissions.test.ts`：已通过，16 个测试通过。

## 风险与待确认事项

- 大规模内置文档的具体内容仍需由管理员逐批整理；本次先落地承载机制。
- AI 摘要依赖管理后台配置的全局模型供应商；未配置或调用失败时，文档仍保存，索引使用 fallback。
- 未来如果内置文档超过摘要索引的可控规模，可再增加关键字检索 API 或向量索引。
