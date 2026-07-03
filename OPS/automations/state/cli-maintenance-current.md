# CLI 维护当前状态

> 更新日期：2026-07-02

## 当前结论

`project-cli` 已有独立自动维护文档和长期跟踪记录。下一轮 CLI 定时任务应优先读取：

- `docs/plans/进行中/创作端CLI.md`
- `docs/项目文档/创作端/10-CLI/技术/05_CLI能力自动化清单.md`
- `docs/项目文档/创作端/10-CLI/技术/06_CLI自动维护运行手册.md`

`commands --json`、`packages/project-cli/src/index.ts` 的 `register(...)` 列表与 `packages/project-cli/src/cli-all-commands.test.ts` 末尾的未覆盖守卫继续保持一致；本轮未发现新的注册命令漏登记问题。此前完成的 runtime contract 校验 CLI 对齐仍保持有效：`project validate-runtime`、`page validate-runtime` 已注册，CLI 测试与能力清单保持同步。

当前工作树新增的 HTML/CSS 原型页能力已进入共享层：`page create` 支持 `runtimeType: "prototype-html-css"` 与 `prototypeHtml`、`prototypeCss`、`prototypeMeta`，`page update-prototype` 已注册并纳入 `cli-all-commands` 覆盖。对应的文件读写、版本快照、恢复与校验由 `project-core` 承载，不属于 CLI 侧复制 Web 逻辑；但这条能力当前只确认创作端编辑事务与本地测试链路，不等同于发布、viewer 或本地项目包协议已经完整支持原型页。

外部自动化提示词仍使用旧文件名 `docs/plans/进行中/CLI与创作端能力对齐长期跟踪.md`。仓库内当前事实文档仍以 `docs/plans/进行中/创作端CLI.md` 为准；本轮已补回兼容入口，避免下一次运行因为文件名漂移中断。

根 `package.json` 新增的 `diagnostics:*` 稳定别名当前应指向 `OPS/CLI/src/index.ts`。若 `check:repo` 报告这些别名引用不存在的 `src/index.ts`，按根脚本路径漂移处理，不升级为 CLI 能力缺失。

## 当前缺口

沿用 `CLI与创作端能力对齐长期跟踪.md` 中的当前缺口，不在本 state 重复维护能力清单。

## 下一次检查

- 检查 `project-core` 是否新增会话、工作区、知识文档或截图任务共享能力。
- 检查 `project-cli` 是否新增或缺失对应命令。
- 检查 HTML/CSS 原型页能力是否继续保持 `project-core` 共享承载，并确认能力清单、运行手册与全命令测试同步。
- 检查 `preview compile`、`edit validate` 与 runtime contract 校验输出是否继续保持一致。
- 检查 CLI 全命令测试是否覆盖新增命令。
- 如有改动，运行 `corepack pnpm check:project-cli`；涉及领域服务时追加 `corepack pnpm check:project-core`。

## 最近验证

- 2026-06-30：迁移上下文时未修改 CLI 代码，未运行 CLI 包检查。
- 2026-07-01：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 显示 13 个 active 入口（`tools.json` 3 / `tests.json` 6 / `scripts.json` 4），未发现 CLI 账本漂移。
- 2026-07-01：`corepack pnpm check:project-core` 通过；`corepack pnpm check:project-cli` 通过。期间修复了 `previewHealthcheck` 的 `RequestInit.cache` 类型阻塞。
- 2026-07-02：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口。`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 成功返回当前命令清单，并与 `register(...)` / `cli-all-commands` 覆盖守卫保持一致。
- 2026-07-02：高频轻量检查发现根 `package.json` 的 9 个 `diagnostics:*` 别名误指向仓库根 `src/index.ts`；改为 `OPS/CLI/src/index.ts` 后，`corepack pnpm check:repo` 恢复为仅 9 条既有根目录临时/诊断产物 warning。
- 2026-07-02：`corepack pnpm check:project-core` 通过（27 tests passed）；`corepack pnpm check:project-cli` 通过，确认 `page update-prototype` 已被全命令测试覆盖。
- 2026-07-02：`corepack pnpm check:author` 失败，但失败项集中在既有 `src/components/demo/home-page.test.tsx` 与 `src/components/demo/preview-canvas-interaction-mode.test.tsx` 超时，不属于本轮 CLI 对齐阻塞。
