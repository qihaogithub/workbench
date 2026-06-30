# CLI 维护当前状态

> 更新日期：2026-06-30

## 当前结论

`project-cli` 已有独立自动维护文档和长期跟踪记录。下一轮 CLI 定时任务应优先读取：

- `docs/plans/进行中/CLI与创作端能力对齐长期跟踪.md`
- `docs/项目文档/创作端/10-CLI/技术/05_CLI能力自动化清单.md`
- `docs/项目文档/创作端/10-CLI/技术/06_CLI自动维护运行手册.md`

## 当前缺口

沿用 `CLI与创作端能力对齐长期跟踪.md` 中的当前缺口，不在本 state 重复维护能力清单。

## 下一次检查

- 检查 `project-core` 是否新增会话、工作区、知识文档或截图任务共享能力。
- 检查 `project-cli` 是否新增或缺失对应命令。
- 检查 CLI 全命令测试是否覆盖新增命令。
- 如有改动，运行 `corepack pnpm check:project-cli`；涉及领域服务时追加 `corepack pnpm check:project-core`。

## 最近验证

- 2026-06-30：迁移上下文时未修改 CLI 代码，未运行 CLI 包检查。
