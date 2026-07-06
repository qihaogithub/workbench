# Agent 自修复优先的预览治理方案

## 归档结论

本任务已完成。最终治理方向不是继续给 AI 增加提示词禁令，而是在页面源码写入后建立统一运行契约和轻量质量闸门：CLI、Codex、导入脚手架、创作端 Agent 和保存/发布动作都应复用同一套 preview contract，坏代码保留在 workspace 中供修复，但不能提升为当前可见预览产物或正式版本。

本次问题源自 CLI / Codex 写入链路，而不是创作端内置 Agent 单独造成。核心坏例是 `proj_1782839405716_tqjl1f` 的 session workspace 中页面源码被重复拼接，浏览器模块导入阶段报 `Identifier 'accentMap' has already been declared`。因此治理入口必须覆盖所有页面写入路径。

## 已落地能力

- `@workbench/preview-contract` 统一 source contract、compile transform 和 module preflight 诊断，module preflight 只做静态解析，不执行用户页面代码。
- project-core / project-cli 对当前事务新增或修改页面返回 `runtimeValidation`，blocking diagnostics 可被 Codex 继续读取并修复；历史未改页面的问题降级为 warning。
- 创作端将 `previewRuntimeError` 兼容升级为 `previewDiagnostic`，fast gate 失败时保留最近一次成功预览，并用系统自动修复任务把技术诊断作为 hidden prompt 交给 Agent。
- Agent `writeFile` / `editFile` 写入页面或 schema 后返回非阻塞 runtime validation 结果；失败时提示继续修复，但不回滚真实文件写入。
- checkpoint、命名版本、项目包导出、模板产出和发布前接入 strict gate，避免坏 session 污染正式版本。

## 关键设计约束

- 即时预览链路只做 100-200ms 预算内的 fast gate；截图、真实浏览器冒烟、全项目扫描和多轮回归不能进入每次 AI 写入后的同步路径。
- 预览 fallback 只用于保持用户可见性，不代表 workspace 回滚，也不能被保存为正式页面内容。
- 自动修复循环必须有限，默认同一页面最多连续 2 轮；成功加载后重置失败计数。
- CLI / Codex 场景没有创作端 Agent 时，不伪造前端自动修复任务，诊断回到 JSON 命令结果。

## 验证结果

- `corepack pnpm check:author` 通过：63 个 Jest test suite、474 个测试。
- `corepack pnpm check:agent` 通过：31 个 Vitest test file、275 个测试。
- `corepack pnpm check:project-core` 通过：2 个 Vitest test file、23 个测试。
- `corepack pnpm check:project-cli` 通过，覆盖 preview-contract 与 project-cli typecheck/test。
- `corepack pnpm --filter @workbench/preview-contract test` 通过：12 个测试，覆盖 TSX、重复顶层声明、多个 default export 和 module preflight 不执行代码。

## 项目文档索引

当前事实已同步到长期项目文档，本归档只保留方案来源和验证摘要：

- [项目总览](../../项目文档/项目总览.md)
- [实时预览机制](../../项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md)
- [AI 行为约束机制](../../项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md)
- [统一创作端页面契约实施方案](./统一创作端页面契约实施方案.md)

## 剩余风险

- module preflight 覆盖浏览器模块导入阶段的确定性硬错误，不替代截图、渲染冒烟或完整 E2E。
- 自动修复计数当前按编辑页内存维护，跨浏览器刷新不会保留失败轮次。
