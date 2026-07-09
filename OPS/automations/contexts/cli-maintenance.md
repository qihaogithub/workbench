# 创作端 CLI 工具维护上下文

## 目标

持续维护创作端 CLI 能力，让编码代理可以通过机器可读命令完成项目、页面、模板、配置、资产、发布前检查等操作。

## 必读

1. [OPS automations 规则](../AGENTS.md)
2. [CLI 当前状态](../state/cli-maintenance-current.md)
3. [CLI 自动维护运行手册](../../../docs/项目文档/创作端/10-CLI/技术/06_CLI自动维护运行手册.md)
4. [CLI 能力自动化清单](../../../docs/项目文档/创作端/10-CLI/技术/05_CLI能力自动化清单.md)
5. [CLI 与创作端能力对齐长期跟踪（兼容入口）](../../../docs/plans/进行中/CLI与创作端能力对齐长期跟踪.md)
6. [CLI 与创作端能力对齐主文档](../../../docs/plans/进行中/创作端CLI.md)

## 扫描对象

| 对象 | 关注点 |
|:-----|:-------|
| `packages/project-cli/src/index.ts` | 命令是否覆盖能力清单 |
| `packages/project-cli/src/cli-all-commands.test.ts` | 新命令是否有基本契约覆盖 |
| `packages/project-core/src/service.ts` | 领域服务是否已有可复用能力 |
| `packages/author-site/src/app/api/` | Web 是否新增项目、页面、配置、资产、发布、AI 或审计入口 |
| CLI 模块文档 | 能力清单、运行手册和模块索引是否同步 |

## 判断规则

- Web 有能力、领域服务有承载、CLI 缺命令：记录为 CLI 缺口。
- Web 有能力、领域服务无承载：不在 CLI 复制 Web 逻辑，记录为领域服务缺口。
- CLI 有命令、测试无覆盖：补测试或记录测试缺口。
- CLI 有命令、能力清单未登记：更新能力清单。
- 涉及发布、删除、回滚、权限、鉴权、管理后台：停止，标记高风险。

## 自动处理范围

可以自动处理：

- 只读查询类 CLI 能力。
- 命令元数据、帮助信息和 JSON 输出整理。
- CLI 命令注册测试和全命令覆盖测试。
- 能力清单和运行状态文档。

需要人工审核：

- 创建、更新、提交、发布相关能力。
- 影响项目版本、审计或远端服务的能力。
- 需要新增业务规则的能力。

## 验证

| 改动 | 命令 |
|:-----|:-----|
| 只改 CLI | `corepack pnpm check:project-cli` |
| 改领域服务 | `corepack pnpm check:project-core`、`corepack pnpm check:project-cli` |
| 改脚手架协议 | `corepack pnpm check:project-scaffold`、`corepack pnpm check:project-cli` |
| 涉及 Web API | `corepack pnpm check:author`、`corepack pnpm check:project-cli` |

## 输出位置

- 当前状态：`OPS/automations/state/cli-maintenance-current.md`
- 长期缺口兼容入口：`docs/plans/进行中/CLI与创作端能力对齐长期跟踪.md`
- 长期缺口主文档：`docs/plans/进行中/创作端CLI.md`
- 具体实施：新建或更新 `docs/plans/进行中/CLI自动维护-*.md`
- 可复用规则：`docs/项目文档/创作端/10-CLI/`
