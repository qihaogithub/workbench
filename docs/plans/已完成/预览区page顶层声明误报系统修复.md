# 预览区 page 顶层声明误报系统修复

## 归档结论

本任务已完成。多个页面各自声明 `const page` 时被误报为顶层声明重复，根因是预览运行契约没有正确区分“单个页面模块内真实重复声明”和“跨页面同名普通变量”。正常 ES Module 下不同页面模块的顶层作用域隔离，跨页面同名变量不应阻断预览。

## 已落地能力

- preview-contract 区分用户源码重复声明与编译生成产物冲突：真实源码重复仍使用 `DUPLICATE_TOP_LEVEL_DECLARATION`，系统生成产物冲突使用 `GENERATED_MODULE_BINDING_CONFLICT`。
- 普通顶层变量名如 `page`、`theme`、`accentMap` 不作为系统保留名。
- 修复同类误报边界：`import type` 不作为运行时依赖；字符串中的 `//` 不破坏默认导出和 import 判断；非默认渲染 helper 内部 `return null` 不阻断页面；重复 `var` 不作为浏览器导入阶段错误。
- 配置与预览技术文档已更新，明确不同页面可各自使用普通顶层变量名。

## 验证结果

- `pnpm --filter @workbench/preview-contract test` 通过。
- `pnpm check:project-core` 通过。
- `pnpm check:project-cli` 通过。
- author-site 定向测试 `PreviewPanel.test.tsx` 与 `preview-runtime-policy.test.ts` 通过。
- 全量 `check:author` 的 typecheck 通过；Jest 失败在既有 UI 测试超时：`preview-canvas-interaction-mode.test.tsx` 2 个文字工具用例、`home-page.test.tsx` 3 个首页项目/模板菜单用例，与本次预览契约改动无直接关联。

## 剩余风险

后续若继续扩展 preview contract，应优先审计仍依赖正则或忽略 TypeScript / ESM 语义的路径，避免再次把系统生成冲突归因为用户页面代码。
