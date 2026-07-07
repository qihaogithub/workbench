# 创作端手绘删除 OpenPencil 方案目标任务

完成时间：2026-07-06

## 结论

创作端手绘路线已收敛为自研 SDK：`@workbench/sketch-core`、`@workbench/sketch-react`、`@workbench/sketch-playground`。OpenPencil 编辑岛、iframe host、postMessage bridge、图片代理、保存摘要、诊断事件、E2E 配置、workspace 包、脚本和长期项目文档描述已从源码与有效文档中移除。

历史项目若仍保存 `authoringPreferences.sketchEditorEngine` 的旧值，读取层按无效值忽略，不再写入或暴露该偏好。草图页是否在创作端开放仍由自研 SDK 的普通 authoring 开关控制。

## 主要改动

- 删除 `packages/sketch-openpencil-editor/`、`test/openpencil-spike/`、`docs/external/openpencil/`、author-site OpenPencil iframe/API/lib/test 路径和创作端 OpenPencil E2E 配置。
- 根 `package.json`、`pnpm-lock.yaml`、`AGENTS.md` 和 `check:all` 不再包含 OpenPencil workspace、脚本或验证命令。
- `SketchEditorEnginePreference`、项目 CLI/API、用户创作偏好、engine resolver 和设置弹窗均收敛为自研/native 路径。
- 保留 `sketch-core` patch reducer、服务端 patch 校验和 `page.sketch_patch_validated/rejected` 通用诊断事件。
- 使用 `doc-maintainer` 同步更新 `docs/项目文档/` 中草图 SDK、诊断、版本管理、协同保存和 CLI 能力说明。

## 验证

- `corepack pnpm install --lockfile-only`
- `corepack pnpm check:sketch-core`
- `corepack pnpm check:sketch-react`
- `corepack pnpm check:sketch-playground`
- `corepack pnpm check:project-core`
- `corepack pnpm check:project-cli`
- `corepack pnpm check:agent`
- `corepack pnpm check:screenshot`
- `corepack pnpm check:viewer`
- `corepack pnpm --filter @workbench/author-site typecheck`
- `corepack pnpm --filter @workbench/author-site test -- --runInBand`
- `corepack pnpm --filter @workbench/author-site test -- --runInBand --testPathPatterns='src/app/api/sessions/\\[sessionId\\]/files/\\[demoId\\]/route.test.ts'`

`corepack pnpm check:all` 曾在 author-site 默认并行 Jest 阶段受本机长耗时 UI 测试影响失败；改为 author-site serial Jest 后 93 个 suites、631 个 tests 全部通过。 focused sketch E2E 在默认 3200 服务上被草图创作端开关拦截；使用带开关的临时 dev server 验证时，本机 Node 24 + Next 14 出现 `Response body object should not be disturbed or locked`，Node 20 尝试又受当前 `better-sqlite3` 原生模块按 Node 24 编译影响阻塞，未取得稳定浏览器验收结果。

## 收口

源码、测试、脚本、OPS 说明和 `docs/项目文档/` 中已不再保留 OpenPencil 方案入口。`data/` 与 `test/**/test-outputs/` 属于本机运行记录或忽略产物，未纳入源码验收范围。
