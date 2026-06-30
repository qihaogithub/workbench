# 测试工具与脚本治理上下文

## 目标

定期维护测试工具、正式测试、开发期诊断脚本和 OPS 工具，确保缺失的测试被补充，失效的脚本被更新，过期或重复的入口被清理。

## 必读

1. [OPS automations 规则](../AGENTS.md)
2. [测试工具当前状态](../state/test-tools-current.md)
3. 根目录 `package.json`
4. `OPS/automations/registry/*.json`
5. `scripts/development/README.md`
6. `test/创作端E2E回归测试/AGENTS.md`
7. `OPS/CLI/README.md`

## 工具分层

| 类型 | 位置 | 维护目标 |
|:-----|:-----|:---------|
| 根质量门禁 | 根 `package.json` 的 `check:*` | 稳定、机器可读、失败信号明确 |
| 包级测试 | 各 package 测试目录 | 贴近源码验证领域规则 |
| 正式 E2E | `test/创作端E2E回归测试/` | 覆盖关键用户流程 |
| OPS 工具 | `OPS/CLI/` | 辅助诊断和 Agent Service 测试 |
| 开发诊断脚本 | `scripts/development/` | 复现、采样、临时报告 |
| 历史脚本 | `docs/plans/测试脚本/` | 历史输入，不作为新自动任务默认入口 |

## 扫描清单

- 根 `check:*` 和 `test:*` 是否仍指向有效脚本。
- `OPS/automations/registry/*.json` 是否覆盖新增或变化的工具、测试和脚本。
- 新增 workspace 包是否有对应检查入口。
- `scripts/development/README.md` 是否覆盖所有开发诊断脚本。
- E2E spec 是否使用统一项目 helper、登录 helper 和清理策略。
- `OPS/CLI` 新增命令是否有帮助信息、JSON 输出和验证覆盖。
- 近期 bug 修复是否缺少回归测试。
- 稳定的诊断脚本是否应该迁移到正式测试或 OPS 工具。

## 补测试规则

建议补测试：

- 修复过真实 bug 但没有回归用例。
- 新增关键用户流程。
- 修改 API response、事件结构、发布数据或项目读写契约。
- 开发诊断脚本已经能稳定断言通过/失败。

补测试前必须确认：

- 测试数据如何隔离和清理。
- 失败断言是否稳定。
- 输出目录是否已忽略。
- 对应验证命令是什么。

## 更新脚本规则

可以自动更新：

- README 与脚本参数不一致。
- 根快捷命令与实际脚本路径不一致。
- 输出路径应归入 `tmp/`、`.tmp/` 或测试输出目录。
- E2E 定位策略因合理 UI 变化失效。

不能为了通过而删除关键断言。关键断言减少时，必须记录原因。

## 删除或停用规则

删除前检查：

- 根 `package.json` 是否引用。
- README、AGENTS、计划文档或自动化配置是否引用。
- 是否仍提供唯一诊断价值。

默认先输出“建议删除/迁移”报告；只有确认无引用、无唯一价值、无真实数据副作用时，才删除。

## 验证

| 改动 | 命令 |
|:-----|:-----|
| 根脚本或文档入口 | `corepack pnpm check:repo` |
| automation registry | `corepack pnpm check:automation` |
| author 测试或 E2E helper | `corepack pnpm check:author`，必要时 `corepack pnpm test:e2e` |
| project CLI 测试 | `corepack pnpm check:project-cli` |
| project-core 测试 | `corepack pnpm check:project-core` |
| 跨包测试策略 | 相关包 `check:*`，必要时 `corepack pnpm check:all` |

## 输出位置

- 当前状态：`OPS/automations/state/test-tools-current.md`
- 具体治理计划：`docs/plans/进行中/测试工具治理-*.md`
- 已关闭问题：`docs/plans/已完成/`
- 可复用规则：相关模块项目文档或测试目录 `AGENTS.md`
