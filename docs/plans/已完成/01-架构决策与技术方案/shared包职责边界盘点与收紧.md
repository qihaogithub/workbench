# shared 包职责边界盘点与收紧

## 背景

`@opencode-workbench/shared` 曾同时承载协议类型、项目数据结构、配置解析、iframe 模板和 React 预览 UI。后端包多数只需要契约类型，如果继续从含 UI 能力的入口导入，后续维护容易误判包边界。

## 目标

- 收紧 `shared` 为契约和非 React 运行时能力入口。
- 将预览、配置表单、画布等 React UI 迁入前端专用包。
- 更新消费侧配置与项目文档，避免后端继续依赖 UI 能力。

## 范围

- `packages/shared/`
- `packages/demo-ui/`
- `packages/author-site/`
- `packages/viewer-site/`
- `packages/agent-service/`
- `packages/project-core/`
- `packages/screenshot-service/`
- `docs/项目文档/创作端/04-配置与预览/技术/05_共享组件架构设计.md`

## 方案

新增 `@opencode-workbench/shared/contracts` 作为纯契约入口，后端和领域包改从该入口导入类型、错误码和常量。新增 `@opencode-workbench/demo-ui` 前端专用包承接原 `shared/demo` 下的 React 组件、预览面板、配置表单和画布实现。`shared` 仅保留 `./contracts` 与 `./demo/iframe-template`，其中 iframe 模板继续服务截图与预览 HTML 生成。

## 任务清单

- [x] 盘点 `shared` 导出类别和主要消费方。
- [x] 增加纯契约入口 `@opencode-workbench/shared/contracts`。
- [x] 后端与领域包导入切换到 contracts 入口。
- [x] 新增 `@opencode-workbench/demo-ui` 并迁移 React UI。
- [x] 更新 author-site/viewer-site 的依赖、路径、Jest、Tailwind 和 Next transpile 配置。
- [x] 收紧 `shared` package exports 与依赖。
- [x] 更新项目文档。
- [x] 运行匹配验证。

## 进度记录

- 2026-06-28：确认 `shared` 根入口适合保留为契约层，`shared/demo` 中的 React、TipTap、DND、lucide 等能力应迁入前端专用包。
- 2026-06-28：新增 `@opencode-workbench/shared/contracts`，agent-service、project-core 等后端/领域包已切换到该入口；screenshot-service 仅保留 `shared/demo/iframe-template`。
- 2026-06-28：新增 `@opencode-workbench/demo-ui`，author-site 与 viewer-site 已改为从该包消费预览 UI。
- 2026-06-28：`@opencode-workbench/shared` 已移除 React/UI 依赖与 `./demo` 组件导出，只保留 contracts 与 iframe template。
- 2026-06-28：共享组件架构设计、Agent 服务层文档已同步更新。

## 验证方式

- `corepack pnpm check:author`
- `corepack pnpm check:viewer`
- `corepack pnpm check:agent`
- `corepack pnpm check:screenshot`
- `corepack pnpm check:project-core`

## 最终状态

已完成。`shared` 已回到契约层边界，React UI、预览面板、配置表单和画布组件已迁入 `@opencode-workbench/demo-ui`。后续新增跨包类型应优先放入 contracts；新增前端共享 UI 应放入 demo-ui 或更具体的前端包，不再扩张 `shared`。
