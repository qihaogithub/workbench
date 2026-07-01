# 创作端 CLI 稳定入口优化

## 背景

创作端 CLI 当前通过 `tsx src/index.ts` 运行。Codex 沙箱环境中，`tsx` 启动时会在系统临时目录创建 IPC pipe，触发 `listen EPERM`，导致 `ow doctor --json` 等命令无法稳定执行。

用户要求 CLI 功能给别人使用时简单稳定。

## 目标

- 让 `ow` 和 `opencode-project-admin` 不再直接依赖 `tsx` 运行时。
- 保留 TypeScript 源码开发体验。
- 让本地仓库内使用者可以用简单命令运行 CLI。
- CLI 测试覆盖稳定入口，避免回退到 `tsx` 入口。

## 范围

- 修改 `packages/project-cli` 的 bin 入口、脚本和测试。
- 更新 CLI 技术文档。
- 不改 `project-core` 业务规则和命令语义。
- 不处理全局 npm 发布流程。

## 方案

1. 新增普通 Node.js launcher，作为 `ow` 和 `opencode-project-admin` 的 bin 入口。
2. launcher 在仓库内使用 esbuild 将 `src/index.ts` 打包到 `dist/index.mjs`，再用普通 Node.js 执行。
3. CLI 包增加 `build` 脚本，`start` 改为先构建再运行 dist，`dev` 保留 `tsx` 作为开发调试入口。
4. 测试改为走稳定 launcher，并补充 bin 入口测试。
5. 更新 CLI 实现文档，说明稳定入口与开发入口的边界。

## 任务清单

- [x] 阅读项目规则、`project-cli` 包规则、CLI 模块文档和文档维护规则。
- [x] 新增稳定 launcher 和构建脚本。
- [x] 调整测试覆盖稳定入口。
- [x] 更新 CLI 技术文档。
- [x] 运行验证命令。

## 进度记录

- 2026-07-01：确认当前 `project-cli` 的 `bin` 指向 `src/index.ts`，`start`/测试使用 `tsx`。
- 2026-07-01：确认 CLI 模块长期文档位于 `docs/项目文档/创作端/10-CLI/`。
- 2026-07-01：新增 `packages/project-cli/bin/ow.mjs` 稳定入口、`scripts/build.mjs` 构建脚本和 `scripts/run-tests.mjs` 测试运行器。
- 2026-07-01：`ow` 与 `opencode-project-admin` 的 bin 入口改为普通 Node.js launcher；根目录新增 `pnpm ow` 入口。
- 2026-07-01：`corepack pnpm --filter @opencode-workbench/project-cli build` 通过。
- 2026-07-01：`node packages/project-cli/bin/ow.mjs doctor --json --data-dir tmp/project-cli-smoke-data` 通过。
- 2026-07-01：`corepack pnpm ow doctor --json --data-dir tmp/project-cli-root-script-data` 通过；机器解析时使用 `corepack pnpm --silent ow ...` 可获得纯 JSON。
- 2026-07-01：`corepack pnpm check:project-cli` 通过。
- 2026-07-01：发现打包测试会误触发 `src/index.ts` 自动入口并打印 help 文本，已增加 `PROJECT_CLI_DISABLE_AUTO_RUN` 测试开关；再次运行 `corepack pnpm check:project-cli` 通过且输出干净。

## 验证方式

- 运行 `corepack pnpm --filter @opencode-workbench/project-cli build`。
- 运行稳定入口 `node packages/project-cli/bin/ow.mjs doctor --json --data-dir <tmp>`。
- 运行 `corepack pnpm check:project-cli`。

以上验证均已通过。

## 风险与待确认事项

- launcher 依赖仓库已安装的 `esbuild`，如果用户未执行依赖安装，仍需要先运行 `pnpm install`。
- `dist/` 属于生成物，不作为源码提交；launcher 会按需生成。
- `dev` 脚本仍保留 `tsx`，仅用于开发调试；用户和代理应使用 `ow`、`opencode-project-admin` 或 `pnpm --silent ow`。
