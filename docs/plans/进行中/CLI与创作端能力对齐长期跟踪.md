# CLI 与创作端能力对齐长期跟踪

## 用途

- 本文档只保留 `cli` 自动化下一次执行所需的最小必要信息。
- 不记录逐次流水账。
- 每次执行后直接覆盖当前状态，不追加长段过程描述。

## 下次执行规则

1. 先读取本文档和 `C:\Users\Administrator\.codex\automations\cli\memory.md`。
2. 先复查“当前缺口”是否已被代码关闭。
3. 若缺口关闭，更新状态或移入“已关闭项”。
4. 若发现新缺口，只保留当前仍成立的结论，不补历史叙事。
5. 若验证再次阻塞，只更新当前阻塞现状。

## 当前状态

- 审计结论：`部分缺口`
- 最近更新：`2026-06-27`
- 主线结论：CLI 主干能力已覆盖项目、模板、本地项目包、编辑事务、页面/文件夹、配置、资产、预览基础、发布、AI 摘要、审计和管理员锁定；本轮复查未发现新的 CLI 对齐缺口，仍有 5 个既有 Web 能力缺口待补齐。

## 当前缺口

| 编号 | 状态 | 缺口 | 需要补什么 |
|:-----|:-----|:-----|:-----------|
| GAP-001 | 待处理 | 页面版本历史查询缺失 | 增加 `page version-list`、`page version-get`，并补 `project-core` 对应读取能力 |
| GAP-002 | 待处理 | 会话管理缺失 | 增加项目会话列表、会话详情、会话删除命令 |
| GAP-003 | 待处理 | 工作区管理缺失 | 增加工作区创建、列表、详情、删除命令 |
| GAP-004 | 待处理 | 知识文档 CRUD 缺失 | 增加 `knowledge list/create/get/update/delete` |
| GAP-005 | 待处理 | 截图任务命令缺失 | 增加生成、批量生成、状态、取消、文件访问命令 |

## 已关闭项

- GAP-006：标准验证环境阻塞已关闭。`pnpm check:project-cli`、`pnpm check:project-core`、`pnpm check:project-scaffold` 已可在 2026-06-27 当日复查中直接通过。

## 当前验证状态

- `pnpm check:project-cli`：通过
- `pnpm check:project-core`：通过
- `pnpm check:project-scaffold`：通过
- 未补跑 `pnpm check:author`：本轮未发现新的 author-site / shared 契约变更，仅做静态能力对比即可

## 下次重点检查

- 上述 5 个 GAP 是否已有代码落地。
- `packages/project-cli/src/index.ts` 是否新增 `page version-*`、`session *`、`workspace *`、`knowledge *`、截图任务相关命令。
- `packages/project-core/src/service.ts` 是否补齐共享能力，而不是只留在 author-site 路由层。
- `packages/project-cli/src/cli-all-commands.test.ts` 是否新增缺口对应测试。
- `pnpm check:project-cli`、`pnpm check:project-core`、`pnpm check:project-scaffold` 是否持续稳定可运行。

## 参考

- 单次审计证据：[CLI与创作端能力对齐检查-2026-06-27.md](./CLI与创作端能力对齐检查-2026-06-27.md)
