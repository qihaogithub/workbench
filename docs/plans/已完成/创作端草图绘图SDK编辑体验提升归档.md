# 创作端草图绘图 SDK 编辑体验提升归档

> 完成日期：2026-07-07

## 结论

自研草图绘图 SDK 的编辑体验提升已完成，并继续保持固定页面编辑、`SketchSceneDocument` 协议、只读 SVG/HTML 渲染、截图 hash 和 Agent patch 审计边界。创作端 authoring 入口仍按既有策略暂停暴露，本次只推进 SDK、独立 playground、协议与测试闭环，不重新开放 author-site 草图入口。

长期事实已同步到 [草图绘图 SDK 技术文档](../../项目文档/创作端/02-Demo管理/技术/05_草图绘图SDK.md)。本归档只保留最终结论、验证和后续边界，不继续维护逐项过程清单。

## 完成范围

- 阶段 0 设计锁定完成：工具语义、命令入口、形状文本、协议扩展和拖拽提交规则已明确。
- P0 绘图状态机完成：矩形、圆形、线条、箭头、便签、图片、画笔、文字和橡皮都不再走旧的点击即插入固定对象主流程。
- P1 工具体验完成：抓手、选择、矩形、圆形、线条、箭头、画笔、文字、图片和橡皮的核心编辑流程已覆盖；图片加载失败会在预览层显示“图片加载失败”。
- P2 属性面板完成：通用、内容、几何、线条端点、路径、样式、图片、文本、多选和绑定分组已按当前协议收口；端点吸附本阶段不建协议字段。
- P3 协议、渲染和 Agent 友好性完成：新增样式字段、path points、图片 fit、文本细样式、命中测试、patch summary、默认可读名称和 id 稳定性都有代码与测试覆盖。
- P4 Playground 和测试验收完成：Debug、Performance、核心工具浏览器验收和对象操作验收已纳入独立 playground 回归。

## 关键边界

- 画笔保留原始采样点，不自动平滑；属性面板提供显式路径简化。
- 形状内文本复用节点 `text` 字段，不创建绑定文本子节点。
- 箭头头部复用 `style.startArrow` 和 `style.endArrow`；图片适配复用 `style.imageFit`。
- 线条和箭头端点只用 `x/y/width/height` 表达起终点；对象锚点吸附若后续需要，应另行设计结构化字段并同步校验、渲染、命中测试和 patch summary。
- 图片当前支持本地文件、拖入、粘贴、替换、alt、适配方式和加载失败提示；上传、资产引用、文件大小限制和外部资源治理仍是后续边界。

## 验证

- `corepack pnpm check:sketch-core` 通过，66 个协议、patch、渲染和命中测试。
- `corepack pnpm check:sketch-react` 通过，118 个 React 编辑器与预览组件测试。
- `corepack pnpm check:sketch-playground` 通过。
- `corepack pnpm test:e2e:sketch-playground` 通过，17 个 Chromium playground 回归。
- 未运行 author-site 手绘回归，因为本次没有重新开放或改动创作端草图 authoring 暴露面。

## 主要代码与文档

- `packages/sketch-core/src/index.ts`
- `packages/sketch-core/tests/sketch-core.test.ts`
- `packages/sketch-react/src/index.tsx`
- `packages/sketch-react/src/preview.tsx`
- `packages/sketch-react/tests/sketch-react.test.tsx`
- `packages/sketch-playground/src/components/SketchPlaygroundApp.tsx`
- `test/sketch-playground/sketch-playground.spec.ts`
- [草图绘图 SDK 技术文档](../../项目文档/创作端/02-Demo管理/技术/05_草图绘图SDK.md)
