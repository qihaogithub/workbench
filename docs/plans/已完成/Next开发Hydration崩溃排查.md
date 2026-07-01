# Next 开发 Hydration 崩溃排查

## 背景

创作端本地开发环境出现 Next.js hydration 阶段报错，浏览器提示服务端 HTML 被客户端内容替换，并在 `<ServerRoot>` 组件上报未捕获异常。当前控制台片段缺少完整异常 message，需要结合本地复现和源码定位根因。

## 目标

- 复现并获取完整客户端异常。
- 定位导致 hydration 或客户端首帧渲染崩溃的代码路径。
- 在不影响无关工作区改动的前提下完成最小修复。
- 运行与改动范围匹配的验证命令。

## 范围

- 重点检查 author-site 的 App Router 页面、预览运行时入口、客户端组件首帧渲染逻辑。
- 同步处理 hydration 修复后暴露的编辑页加载卡死问题，边界限定为画布布局读取和保存。
- 不处理已有 ChunkLoadError 依赖漂移问题，除非复现证明两者同源。
- 不整理或回滚当前工作区已有的无关 dirty changes。

## 方案

1. 读取现有 ChunkLoadError 排查记录，区分本次症状与历史问题。
2. 使用本地 dev server 和浏览器自动化复现，采集完整 console/pageerror。
3. 根据异常栈定位组件或运行时模块，实施局部修复。
4. 补充必要测试或运行既有验证命令。
5. 更新本任务文档的进度、验证结果和剩余风险。

## 任务清单

- [x] 建立本次排查任务文档。
- [x] 复现 hydration 崩溃并获取完整异常。
- [x] 定位根因代码路径。
- [x] 实施最小修复。
- [x] 运行验证命令。
- [x] 更新任务文档结论。

## 进度记录

- 2026-07-01：收到浏览器控制台片段，包含 hydration replacement、`<ServerRoot>` 错误边界提示和 `src/runtime.ts:54` 线索；开始区分本次问题与既有 ChunkLoadError 排查。
- 2026-07-01：在本地 3200 根页与受保护编辑页重定向场景采集到稳定 dev overlay 警告：`packages/preview-contract/src/runtime.ts` 导入的 `typescript` 被 Next/Webpack 按浏览器导出分析，先后出现 default export 与命名导出警告。
- 2026-07-01：将 `preview-contract/src/runtime.ts` 的 TypeScript 引入改为命名空间导入，并在 author-site Next 配置中把 `typescript` 加入服务端组件外部依赖，避免 dev compiler 深入打包 TypeScript CommonJS 包。
- 2026-07-01：在独立 3210 author-site dev server 上刷新根页，已不再出现 `runtime.ts` / `typescript` / hydration / `ServerRoot` 相关 console 事件；仍存在模板截图资源 404，和本次问题无关。
- 2026-07-01：用户反馈登录态项目编辑页仍黑屏后，复用 Chrome 登录态直接打开 `http://localhost:3200/demo/proj_1779608460371/edit`，采集到真实异常：`TypeError: Cannot read properties of undefined (reading 'ES2022')`，调用链为 `preview-contract/src/runtime.ts` -> `author-site/src/lib/agent/system-prompt.ts` -> `stream-service.ts` -> `ai-chat.tsx` -> 编辑页。根因是浏览器可达的 Agent prompt 间接导入了带 TypeScript 静态解析器的 `runtime` 入口。
- 2026-07-01：新增 `@opencode-workbench/preview-contract/rules` 轻量入口，将契约版本、依赖策略和 Agent 创作规则从 `runtime` 拆出；`system-prompt.ts` 改为只导入 `rules`，客户端 bundle 不再加载 TypeScript 编译器对象。同步补齐 author-site Jest 对 `rules` 入口和 `./rules.js` 的映射。
- 2026-07-01：hydration 崩溃消失后，编辑页仍停在 `加载中...`。dev server 日志显示 `/api/sessions/:sessionId/canvas-layout` 读取 `.canvas-layout.json` 时出现 `Unexpected non-whitespace character after JSON`，实际文件为两个 JSON 对象直接拼接。
- 2026-07-01：画布布局接口改为读取多个顶层 JSON 文档并选择 `updatedAt` 最新的有效布局；保存布局时先写临时文件再原子重命名，降低异常中断或并发写入造成拼接/截断文件的概率。
- 2026-07-01：在登录态 Chrome 标签页刷新项目编辑页，已显示完整编辑器、画布/单页工具栏、属性面板和 AI 对话区；浏览器不再出现 `runtime.ts`、hydration replacement 或 `<ServerRoot>` 崩溃。剩余 `Receiving end does not exist` 来自 Chrome 扩展脚本，和项目代码无关。

## 验证方式

- `corepack pnpm --filter @opencode-workbench/preview-contract typecheck`：通过。
- `corepack pnpm --filter @opencode-workbench/preview-contract test`：通过，12 个测试通过。
- `corepack pnpm --filter @opencode-workbench/author-site typecheck`：通过。
- `corepack pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns='canvas-layout/route.test.ts'`：通过，3 个测试通过，覆盖拼接损坏布局文件恢复最新有效布局。
- `corepack pnpm --filter @opencode-workbench/author-site test`：通过，63 个测试套件、475 个测试通过。
- 独立启动 `corepack pnpm --filter @opencode-workbench/author-site exec next dev -p 3210` 后，用 headless Chromium 访问根页采集 console：未再出现 `runtime.ts` / `typescript` / hydration / `ServerRoot` 相关错误。
- 使用本地 3200 dev server 和登录态 Chrome 访问 `http://localhost:3200/demo/proj_1779608460371/edit`：编辑页可见，不再黑屏；console 未再出现本次 hydration/runtime 崩溃。

## 风险与待确认事项

- 当前工作区已有大量无关修改和生成数据，修复时需要严格限制文件范围。
- 编辑页当前预览区域可能仍显示“正在修复预览”，这属于页面源码预览自动修复流程，不再是外层编辑页 hydration 黑屏。
- 若后续再次出现画布布局读取错误，需要检查是否还有其他写入 `.canvas-layout.json` 的路径未走原子写入。
