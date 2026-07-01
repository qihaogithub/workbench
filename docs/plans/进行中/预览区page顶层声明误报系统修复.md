# 预览区 page 顶层声明误报系统修复

## 背景

多个创作端页面各自使用 `const page` 作为页面内部普通变量时，预览区出现“顶层声明 page 重复，浏览器会拒绝导入该模块”的报错。正常 ES Module 下不同页面模块的顶层作用域相互隔离，跨页面同名变量不应被判定为页面代码错误。

## 目标

- 预览编译、Project Admin CLI runtime validation 与 author-site 编译 API 只拦截单个页面模块内真实重复的顶层声明。
- 普通页面变量名如 `page`、`theme`、`accentMap` 不作为系统保留名。
- 若冲突来自编译器包装、JSX runtime 转换或 import 重写等系统生成产物，错误归因为系统生成模块冲突，而不是提示用户删除重复页面拼接块。
- 补齐回归测试和长期项目文档。

## 范围

- 涉及 `@opencode-workbench/preview-contract` 的运行契约和编译链路。
- 涉及 project-core/CLI 的项目级多页面校验测试。
- 涉及 author-site 的编译 API / PreviewPanel 诊断传递测试。
- 不继续批量修改业务项目页面源码，保留当前项目规避版本。

## 方案

1. 在 preview-contract 中区分用户 authoring 源码重复声明与编译产物生成冲突。
2. 增加单页 `const page` 兼容、单页真实重复 `const page` 阻断、多页面各自声明 `const page` 通过的测试。
3. 增强编译 API / PreviewPanel 诊断中携带的页面定位与 hash 信息。
4. 更新配置与预览模块技术文档，说明 module preflight 的诊断边界。

## 任务清单

- [x] 梳理当前 preview contract、compile API、PreviewPanel 和 CLI runtime validation 链路。
- [x] 修改 preview-contract 诊断边界与错误码归因。
- [x] 补充 preview-contract、project-core/CLI、author-site 相关测试。
- [x] 更新 `docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md`。
- [x] 运行验证命令并记录结果。

## 进度记录

- 2026-07-01：创建任务文档；已确认现有文档把页面代码、配置、截图任务参数定义为按页面 ID 隔离。
- 2026-07-01：完成 preview-contract 分类调整：真实源码重复声明仍用 `DUPLICATE_TOP_LEVEL_DECLARATION`，编译生成产物冲突使用 `GENERATED_MODULE_BINDING_CONFLICT`；补充 preview-contract、project-core、project-cli、author-site 回归测试。
- 2026-07-01：更新配置与预览技术文档，明确不同页面可各自使用普通顶层变量名。
- 2026-07-01：验证结果：`check:project-cli` 通过；`check:project-core` 通过；`pnpm --filter @opencode-workbench/author-site typecheck` 通过；author-site 定向测试 `PreviewPanel.test.tsx` 与 `preview-runtime-policy.test.ts` 通过。全量 `check:author` 在既有 `user-choice-card`、`preview-canvas-interaction-mode`、`home-page` 测试超时/交互断言处失败，失败点与本次预览契约改动无直接关联。

## 验证方式

- `pnpm --filter @opencode-workbench/preview-contract test`
- `pnpm check:project-cli`
- `pnpm check:author`

## 风险与待确认事项

- 当前仓库已有大量无关 dirty changes，本任务必须只改与预览契约和文档相关的文件。
- 若现有测试环境存在与本任务无关的失败，需要在最终结果中明确区分。
