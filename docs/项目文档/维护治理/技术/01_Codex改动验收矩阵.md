---
covers:
  - AGENTS.md
  - package.json
  - scripts/check-repo.mjs
  - data/README.md
---

# 01 Codex 改动验收矩阵

## 设计目标

本矩阵用于把“改了哪里就跑什么验证”从经验判断变成固定规则。它不替代工程判断，但给 Codex 一个最低验证基线。

## 命令入口

本项目声明使用 `pnpm@8.15.0`。在 Codex runtime 或其他可能预装不同 pnpm 版本的环境中，优先使用 `corepack pnpm ...` 执行根脚本，避免裸 `pnpm` 命中不兼容版本。

示例：

- `corepack pnpm check:repo`
- `corepack pnpm check:viewer`
- `corepack pnpm check:author`

## 最低验证矩阵

| 改动范围 | 最低验证 |
|---|---|
| 根目录脚本、工作流、文档索引、仓库卫生规则 | `corepack pnpm check:repo` |
| `docs/` | `corepack pnpm check:repo` |
| `data/` 说明文档 | `corepack pnpm check:repo` |
| `packages/shared/src/` | `corepack pnpm check:author`、`corepack pnpm check:viewer`、`corepack pnpm check:agent`、`corepack pnpm check:screenshot` |
| `packages/shared/src/demo/` | `corepack pnpm check:author`、`corepack pnpm check:viewer` |
| `packages/author-site/src/app/api/` | `corepack pnpm check:author` |
| `packages/author-site/src/components/demo/` | `corepack pnpm check:author`，涉及关键流程时追加 `corepack pnpm test:e2e` |
| `packages/viewer-site/` | `corepack pnpm check:viewer`，涉及发布数据时追加 author-site 相关 API 测试 |
| `packages/agent-service/` | `corepack pnpm check:agent` |
| `packages/screenshot-service/` | `corepack pnpm check:screenshot` |
| `packages/project-core/` | `corepack pnpm check:project-core`，涉及 CLI 时追加 `corepack pnpm check:project-cli` |
| `packages/project-scaffold/` | `corepack pnpm check:project-scaffold`、`corepack pnpm check:project-cli` |
| `packages/project-cli/` | `corepack pnpm check:project-cli` |
| `packages/knowledge-core/` | `corepack pnpm check:knowledge-core` |
| `packages/knowledge-service/` | `corepack pnpm check:knowledge-service` |
| `docker/`、`docker-compose.yml`、部署脚本 | `corepack pnpm check:repo`，必要时运行对应服务 build |

## 跨服务契约检查

协议相关变更应追加运行 `corepack pnpm check:contracts`。该命令当前覆盖：

- viewer 发布数据契约。
- API success/error envelope。
- agent stream event、permission request、models event。
- screenshot generate、batch status 和错误结构。
- project admin result。

## 加严规则

- 改动跨两个以上包时，优先运行相关包的全部 `check:*`，不要只跑单个 typecheck。
- 修改共享类型、API response、stream event 或发布数据结构时，应补充契约测试。
- 修改保存、发布、会话、预览或 AI 对话主流程时，应考虑追加 E2E。
- 只改文档也需要运行 `corepack pnpm check:repo`，用于发现坏链接、编码和脚本路径问题。

## `data/` 诊断规则

`data/` 不进入默认源码判断，但可作为诊断现场按需读取。排查时应优先定位到具体项目、会话、工作区或发布产物路径，避免全量扫描。详细说明见 [data 目录诊断说明](../../../../data/README.md)。
