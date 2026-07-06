# AGENTS.md — @workbench/project-cli

> 本文件为 AI 编码代理提供在 Project CLI 包中工作的指南。进入本包前仍需先阅读根目录 `AGENTS.md`。

## 包定位

`@workbench/project-cli` 是创作端项目管理的本地 CLI 入口，面向 Codex、Claude Code、Cursor Agent 等编码代理。它直接调用 `@workbench/project-core`。

## 关键目录

| 路径 | 说明 |
| --- | --- |
| `bin/ow.mjs` | 面向用户和代理的稳定 Node.js CLI 入口 |
| `src/index.ts` | CLI 入口、参数解析和命令注册 |
| `scripts/build.mjs` | 将 TypeScript CLI 源码打包为 `dist/index.mjs` |
| `scripts/run-tests.mjs` | 不依赖 `tsx` 的 CLI 测试运行器 |
| `src/cli.test.ts` | CLI JSON 契约与核心流程测试 |

## 改动边界

- 本包只做 CLI 参数适配、JSON 输出、错误码透传和 Agent 友好提示，不复制 `project-core` 业务逻辑。
- 新增项目管理能力时先确认 `project-core` 是否已有领域方法；没有时先补 `project-core`。
- 所有关键命令必须支持 `--json`，失败时保留稳定 `error.code` 与 `nextActions`。
- 高风险写操作继续复用 `project-core` 的 dry-run、预览计划和 confirm token。
- CLI 不封装通用 `dev/test/build`，本地工程命令仍交给脚手架自身 scripts。

## 验证

优先使用根目录脚本：

```bash
pnpm check:project-cli
```

更小范围验证：

```bash
pnpm --filter @workbench/project-cli typecheck
pnpm --filter @workbench/project-cli test
```
