# 项目编辑页 Maximum update depth 排查与修复

## 背景

打开项目编辑页后，前端抛出 `Maximum update depth exceeded`。附件堆栈显示最终触发点在 React 更新队列与 `@radix-ui/react-compose-refs` 的 `setRef`，页面无法正常进入编辑态。

## 目标

- 定位编辑页打开后反复触发 React state 更新的根因。
- 修复无限更新，确保项目编辑页可正常渲染。
- 记录验证方式和剩余风险，便于后续继续排查。

## 范围

- 涉及文件：
  - `packages/author-site/src/app/demo/[id]/edit/page.tsx`
  - `packages/shared/src/demo/PreviewPanel.tsx`
  - `packages/shared/src/demo/PreviewCanvas.tsx`
  - `docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md`
- 不处理现有无关脏数据、历史计划文档和生成文件。

## 方案

`PreviewPanel` 会通过 iframe postMessage 接收 `POSITIONABLE_SIZES_RESULT`。编辑页原先把 iframe 每次上报的新 sizes 对象直接传给 `setPositionableItemSizes`。即使宽高内容未变，新对象也会触发父组件重渲染，进而让预览面板再次执行尺寸采集链路，形成“尺寸上报 -> 父级重渲染 -> 再采集 -> 再上报”的循环。

修复方式是在编辑页增加 sizes 等价判断：当 key 集合与每个元素的 `width`、`height` 均未变化时返回旧 state，避免无意义重渲染。

## 任务清单

- [x] 收集报错堆栈与复现场景。
- [x] 使用 CodeGraph 定位编辑页、画布和预览组件链路。
- [x] 增加 positionable sizes 等价去重。
- [x] 更新长期技术文档中的状态回写约束。
- [x] 运行 author-site 验证。

## 进度记录

- 2026-06-27：确认 CodeGraph 索引可用，定位到编辑页同时挂载 `PreviewCanvas` 和单页 `PreviewPanel`，两处均把 `setPositionableItemSizes` 传给预览组件。
- 2026-06-27：确认 `PreviewPanel` 在 `POSITIONABLE_SIZES_RESULT` 中直接调用 `onPositionableSizes`，iframe 上报对象每次都是新引用。
- 2026-06-27：在编辑页增加 `arePositionableSizesEqual` 和 `handlePositionableSizes`，两处预览入口统一使用等价去重回调。
- 2026-06-27：执行 `pnpm check:author`，TypeScript 通过，Jest 阶段仍有 3 个既有测试套件失败，失败点不在本次改动的尺寸去重逻辑。

## 验证方式

- 已运行 `pnpm check:author`；`tsc --noEmit` 通过，`jest` 失败。
- 如本地服务可用，打开 `/demo/:id/edit` 确认不再出现 `Maximum update depth exceeded`。

## 风险与待确认事项

- 当前修复只过滤尺寸内容完全相同的上报；如果 iframe 内容真实变化导致宽高变化，仍会正常更新配置表单可定位元素尺寸。
- 堆栈最终显示在 Radix ref 组合层，但已定位到更上层的状态回写循环；若仍复现，需要继续检查 Radix Tooltip/Dialog 是否存在独立 ref 抖动。
- 当前 author-site 测试基线存在失败：`session-manager-save.test.ts`、`PreviewPanel.test.tsx`、`preview-canvas-interaction-mode.test.tsx`。其中画布测试失败表现为测试仍查找乱码 aria-label，而实际 DOM 已是中文 label。
