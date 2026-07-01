# Next 开发 ChunkLoadError 反复出现排查

## 背景

创作端本地开发环境在 `http://localhost:3200` 反复出现 Next.js `ChunkLoadError`。浏览器请求的失败 chunk 指向 `streamdown@2.5.0`、`react-dom@18.2.0`、`react@18.2.0` 的 app-pages browser vendor chunk。

## 目标

- 找到 chunk 缺失反复出现的直接原因。
- 恢复本地依赖树与 `pnpm-lock.yaml` 的一致性。
- 降低后续开发启动时复用旧 Next chunk 缓存的概率。

## 范围

- 涉及根依赖声明、author-site/viewer-site React 版本声明和本地开发启动脚本。
- 不改 AI 对话消息渲染业务逻辑，不替换 `streamdown` 渲染方案。
- 不处理 unrelated dirty changes。

## 方案

1. 核对 `streamdown` 的实际导入点，确认报错来自 AI Markdown 渲染相关客户端组件。
2. 比对 lockfile 与 `node_modules`，确认实际安装的 React 版本和 lockfile 解析版本不一致。
3. 用项目指定的 `corepack pnpm` 恢复依赖安装。
4. 将 Next 应用运行相关的 React 版本声明固定到当前 lockfile 解析版本，减少 semver 范围带来的依赖路径漂移。
5. 在 `pnpm dev` 的重启入口清理 Next dev 缓存，避免旧 `.next` chunk 映射残留。

## 任务清单

- [x] 定位失败 chunk 对应依赖和导入组件。
- [x] 检查 `pnpm-lock.yaml` 与 `node_modules` 的 React 版本差异。
- [x] 使用 `corepack pnpm install --no-frozen-lockfile` 恢复本地依赖树。
- [x] 固定 root、author-site、viewer-site 的 React 版本声明。
- [x] 增加 dev 重启时的 Next 缓存清理。
- [x] 运行 author-site 类型检查和相关测试。

## 进度记录

- 2026-07-01：确认失败 chunk 名来自 `streamdown@2.5.0` 在客户端 app-pages vendor chunk 中的依赖路径。
- 2026-07-01：确认 `pnpm-lock.yaml` 中 author-site 解析到 React 18.3.1，但当前 `node_modules` 链接为 React 18.2.0，属于依赖树与 lockfile 不一致。
- 2026-07-01：离线安装因缺少 `@types/ws` tarball 失败；联网授权后 `corepack pnpm install --no-frozen-lockfile` 成功恢复依赖。
- 2026-07-01：将 root、author-site、viewer-site 的 `react` 与 `react-dom` 声明固定为 `18.3.1`；`scripts/dev-restart.mjs` 启动服务前清理 author-site/viewer-site 的 `.next` 缓存。
- 2026-07-01：`corepack pnpm --filter @opencode-workbench/author-site typecheck` 通过。
- 2026-07-01：`corepack pnpm --filter @opencode-workbench/author-site test` 未完全通过，失败集中在现有 `@opencode-workbench/preview-contract` 源码经 Jest 解析时找不到 `./runtime.js`，不属于本次 chunk 路径修复。
- 2026-07-01：授权启动 author-site dev server 后触发重新编译，生成的 `streamdown` chunk 已指向 `react-dom_18_3_1_react_18_3_1`，未再出现旧 `18_2_0` chunk 路径；验证后已停止 3200 监听进程。

## 验证方式

- `node` 读取 root 与 author-site 的 `react`、`react-dom`、`streamdown` 实际安装版本。
- `corepack pnpm --filter @opencode-workbench/author-site typecheck`：已通过。
- `corepack pnpm --filter @opencode-workbench/author-site test`：未完全通过，失败原因见进度记录。
- 授权启动 `corepack pnpm --filter @opencode-workbench/author-site dev`：已确认新生成 chunk 使用 React 18.3.1 依赖路径。

## 风险与待确认事项

- 当前工作区已有大量未归属改动，本次只修改依赖一致性和开发启动缓存相关文件。
- 清理 `.next` 会增加 `pnpm dev` 首次启动后的重新编译时间，但能换取更稳定的 chunk 映射。
