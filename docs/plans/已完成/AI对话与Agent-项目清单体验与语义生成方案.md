# AI 对话与 Agent：项目清单体验与语义生成方案（归档）

## 最终结论

项目清单已完成从“显式保存 + 任务入队”到“自动保存 + 可恢复后台语义生成”的闭环。清单仍是派生资源目录，不替代项目公约，也不写入页面内容、配置值或文档正文。

## 落地边界

- knowledge-service 独占 generation、job、lease、retry、supersede、annotation 与 FTS 状态；本地 worker 负责回收过期租约、领取任务、退避重试和优雅关闭。
- agent-service 只提供受保护的无状态生成端点：按服务级模型配置执行一次 `tools=[]` 调用，读取白名单 `wb://` evidence，严格返回 `{ summary }`，不创建 Agent/session、不读取历史、不反向访问 knowledge-service。
- Author 使用 `DocumentSaveCoordinator` 自动保存 human overlay，保留 CAS 三方合并、同字段冲突、刷新前 flush、只读权限与离开保护；轮询只更新远端派生状态，不覆盖本地草稿。
- generation 提交同时校验 generation、source fingerprint、attempt 与 lease；旧响应只能返回 stale/duplicate，不能污染新目录。
- 头部移除手动保存按钮和低价值统计，保留刷新索引、自动保存状态、待处理提示和筛选器。

## 关键实现文件

- [共享清单契约](../../../packages/shared/src/project-inventory.ts)
- [knowledge-service 队列与 worker](../../../packages/knowledge-service/src/inventory-catalog.ts)、[生成流程](../../../packages/knowledge-service/src/inventory-generation.ts)
- [agent-service 无状态执行器](../../../packages/agent-service/src/services/stateless-model-invoker.ts)、[内部生成路由](../../../packages/agent-service/src/routes/internal-inventory-generation.ts)
- [Author 清单视图](../../../packages/author-site/src/components/demo/ProjectInventoryView.tsx)
- [跨服务集成测试](../../../packages/knowledge-service/src/__tests__/inventory-generation.integration.test.ts)
- [浏览器回归测试](../../../test/创作端E2E回归测试/project-inventory-regression.spec.ts)
- [项目技术文档](../../项目文档/创作端/05-AI对话/技术/12_项目资源清单与语义索引.md)

## 验证证据

- knowledge-service：TypeScript 检查通过；4 个测试文件、17 个测试通过。跨服务 fixture 覆盖 agent 不可用、请求超时、服务重启、配置变化、租约过期和迟到响应 fencing。
- author-site：TypeScript 检查通过；`ProjectInventoryView` 相关 4 个测试通过。
- Playwright：隔离的 author/agent/knowledge 服务通过“发布 → 后台生成终态 → 清单回读 → 自动保存 → CAS 同字段冲突 → 保留/放弃本地草稿”完整流程。
- project-core、agent-service 及相关包级检查已在实施阶段通过；`git diff --check` 通过。

## 可复用经验与剩余风险

- React Strict Mode 会重放 effect；异步加载的 mounted fence 必须在 effect setup 中恢复，保存协调器则必须延迟 dispose，避免把开发期 effect replay 当成真实卸载。
- E2E 必须使用编辑页实际创建的 sessionId 校验自动保存结果，不能继续使用发布前准备 session。
- 真实模型 provider 不可用时，生成条目会进入 `failed` 终态，但清单读取和人工简介保存仍可用；恢复策略已由队列重试和集成测试覆盖。
- 全量 author/agent 套件中仍存在与本方案无关的历史失败项，已在实施阶段记录；本归档只认可本方案相关的定向检查和隔离 E2E 证据。

## 归档后纠偏（2026-09-11）

首次归档遗漏了 Authority 快照新鲜度与实际 job activity 的分离，也未覆盖文档列表的 manifest/正文不一致和共享 SQLite 损坏恢复。后续修复已固定为：只有 revision/rootHash 完全匹配且存在 queued/running job 才显示“生成中”并轮询；fallback pending 显示“待生成”；文档列表独立返回有效 items 与可修复 issues；SQLite 损坏时整体隔离 DB/WAL/SHM 后从事实源重建。当前数据纠偏和验证结论见[AI 对话与 Agent 问题沉淀](../进行中/AI对话与Agent问题沉淀.md#项目清单永久生成中与文档来源不一致2026-09-11)。

归档日期：2026-09-11
