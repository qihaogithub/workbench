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

- 审计结论：`验证失败`
- 最近更新：`2026-06-28`
- 主线结论：本轮对照未发现新的 Web 能力面缺口，既有 5 个 CLI 对齐缺口仍成立；但新增 1 个已覆盖命令回归（`project duplicate`），且最小验证中还暴露出 1 个过期测试预期与 1 个 `pnpm@8` 环境阻塞。

## 当前缺口

| 编号 | 状态 | 缺口 | 需要补什么 |
|:-----|:-----|:-----|:-----------|
| GAP-000 | 新增 | `project duplicate` 命令回归 | 修正 [`packages/project-cli/src/index.ts`](../../packages/project-cli/src/index.ts) 的参数顺序，并补 CLI 类型检查与全命令回归测试 |
| GAP-001 | 待处理 | 页面版本历史/快照查询缺失 | 增加 `page version-list`、`page version-get`、`page version-create`，并补 `project-core` 对应读取/创建能力 |
| GAP-002 | 待处理 | 会话管理缺失 | 增加项目会话创建或复用、项目会话列表、会话详情、会话删除命令 |
| GAP-003 | 待处理 | 工作区管理缺失 | 增加工作区创建、列表、详情、删除命令 |
| GAP-004 | 待处理 | 知识文档 CRUD 缺失 | 增加 `knowledge list/create/get/update/delete` |
| GAP-005 | 待处理 | 截图任务命令缺失 | 增加 `screenshot generate`、`generate-batch`、`status`、`cancel`、`file` 等命令，并复用 author-site 代理或共享服务层 |

## 已关闭项

- GAP-006：标准验证环境阻塞已关闭。`pnpm check:project-cli`、`pnpm check:project-core`、`pnpm check:project-scaffold` 已可在 2026-06-27 当日复查中直接通过。

## 当前验证状态

- `pnpm check:project-cli`：未通过。当前终端中的 `pnpm@11.7.0` 与仓库锁文件不兼容，并在无 TTY 时拒绝清理 `node_modules`
- `pnpm check:project-core`：未通过。阻塞原因同上
- `pnpm check:project-scaffold`：未通过。阻塞原因同上
- 直接替代验证：
- `packages/project-cli` `tsc --noEmit`：失败，[`packages/project-cli/src/index.ts`](../../packages/project-cli/src/index.ts) 第 599 行把 `actor` 误传给 `duplicateProject(..., category?, actor)`
- `packages/project-cli` `src/cli.test.ts`：通过
- `packages/project-cli` `src/cli-all-commands.test.ts`：失败，`project duplicate` 运行时命中同一回归
- `packages/project-core` `tsc --noEmit`：通过
- `packages/project-core` `vitest run`：失败，[`packages/project-core/src/__tests__/service.test.ts`](../../packages/project-core/src/__tests__/service.test.ts) 第 442 行仍断言首次发布版本号为 `v1`，与“发布前自动生成发布快照”的现行语义不一致
- `packages/project-scaffold` `tsc --noEmit`：通过
- `packages/project-scaffold` `src/scaffold.test.ts`：失败，[`packages/project-scaffold/src/scaffold.test.ts`](../../packages/project-scaffold/src/scaffold.test.ts) 第 80 行依赖 `pnpm install --lockfile-only` 返回 0，当前环境会因 `pnpm` 版本不匹配而失败
- 未补跑 `pnpm check:author`：本轮未发现新的 author-site / shared 契约差异，只做静态能力对比即可

## 下次重点检查

- 先修复 GAP-000：`project duplicate` 参数顺序回归。
- 上述 5 个对齐 GAP 是否已有代码落地。
- `packages/project-cli/src/index.ts` 是否新增 `page version-*`、`session *`、`workspace *`、`knowledge *`、`screenshot *` 相关命令。
- `packages/project-core/src/service.ts` 是否补齐共享能力，而不是只留在 author-site 路由层。
- `packages/project-cli/src/cli-all-commands.test.ts` 是否新增缺口对应测试，并覆盖 `project duplicate`。
- `packages/project-core/src/__tests__/service.test.ts` 的发布断言是否已对齐“发布前自动生成发布快照”语义。
- `packages/project-scaffold/src/scaffold.test.ts` 是否改为对 `pnpm@8.15.0` 友好，或在非兼容环境下显式跳过。

## 参考

- 单次审计证据：[CLI与创作端能力对齐检查-2026-06-28.md](./CLI与创作端能力对齐检查-2026-06-28.md)
