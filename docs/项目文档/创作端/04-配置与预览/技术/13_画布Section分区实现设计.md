---
covers:
  - packages/demo-ui/src/types.ts
  - packages/demo-ui/src/PreviewCanvas.tsx
  - packages/demo-ui/src/CanvasToolbar.tsx
  - packages/demo-ui/src/CanvasPageItem.tsx
  - packages/demo-ui/src/CanvasSectionItem.tsx
  - packages/demo-ui/src/canvas-layout.ts
  - packages/demo-ui/src/canvas-clipboard.ts
  - packages/demo-ui/src/canvas-utils.ts
  - packages/author-site/src/lib/canvas-layout-file.ts
  - packages/author-site/src/app/api/sessions/[sessionId]/canvas-layout/route.ts
  - packages/author-site/src/components/demo/useCanvasWorkspace.ts
  - packages/author-site/src/lib/canvas-state-rebase.ts
  - packages/author-site/src/app/demo/[id]/edit/page.tsx
  - packages/agent-service/src/backends/pi-tools/canvas-layout-tool.ts
  - packages/demo-ui/src/canvas-section.test.ts
  - packages/demo-ui/src/canvas-clipboard.test.ts
  - packages/demo-ui/src/canvas-geometry.performance.test.ts
  - packages/author-site/src/lib/canvas-layout-file.test.ts
  - packages/author-site/src/lib/canvas-state-rebase.test.ts
  - packages/agent-service/tests/unit/canvas-layout-tool.test.ts
  - test/创作端E2E回归测试/canvas-section.spec.ts
---

# 画布 Section（分区）实现设计

> 状态：已实施（协议、归一化、布局解析、创建/重命名、完整包裹自动收纳与越界自动释放、嵌套、样式、释放式删除、复制粘贴、Option/Alt 拖拽复制、自动排版、协作重放、无障碍标识、性能基线与浏览器 E2E 均已落地）  
> 更新日期：2026-08-28

本文定义项目级画布的 Section 功能。用户需求见[预览系统需求中的画布工作台](../预览系统_需求文档.md#242-画布工作台)；现有画布协同和页面组边界见[协同草稿驱动预览](./08_协同草稿驱动预览.md)。Section 只组织画布对象，不改变页面资源或页面内部草图协议。

## 1. 目标与非目标

Section 的目标是让用户像整理白板一样按“登录流程”“方案对比”“V2 迭代”等语义区域组织页面和素材。它是画布级组织容器，负责边界、标题、颜色和成员关系；成员仍由原有页面、文档、图片和文本对象负责渲染与编辑。Section 可以嵌套，但不能成为页面或页面组的内部对象。

本期不做页面内部 Frame、组件实例、Auto Layout、Section 跨项目引用，也不把 Section 导出为页面代码或草图 scene 节点。Section 不能改变页面 presentation、截图、发布内容、AI 页面上下文或 CLI 页面数据。

## 2. 数据模型

在现有 `.canvas-layout.json` 的 `CanvasState` 中新增 `sections?: Record<string, CanvasSection>`，旧文件没有该字段时按空对象读取。建议结构如下（字段语义而非源代码）：

| 字段 | 含义 |
|---|---|
| `id` | 稳定的 `section_` 前缀 ID |
| `kind` | 固定为 `section` |
| `title` | 标题，默认“Section”，创建后可立即编辑 |
| `layout` | 复用画布布局的 x/y/width/height/zIndex；不复用页面 previewSize 语义 |
| `style` | `color` 与 `fillOpacity`：同一颜色用于不透明边框和半透明填充；透明度只作用于填充 |
| `children` | 集合语义的引用数组：`page`、`node` 或 `section` + 对象 ID；序列化时按 `kind/id` 稳定排序 |
| `createdAt` / `updatedAt` | 服务端生成的审计时间戳；不作为客户端并发裁决依据 |

成员关系只在 Section 的 `children` 中保存，不在页面或自由节点上写反向 `sectionId`，避免移动对象时产生双写不一致。一个对象最多属于一个直接父 Section；嵌套 Section 也只能有一个直接父 Section。`children` 只表达成员资格，不控制画布视觉层级或成员坐标顺序。服务端归一化时去重无效引用、移除悬空 ID、拒绝循环和多父关系，并输出已知字段组成的安全最小结构；未知字段不持久化。

页面组、页面预览 iframe 内部 DOM、草图 scene 节点和文档正文都不是本期可收纳对象，不能被 Section 直接引用。页面组保持其现有“单个当前页面卡片 + 目录”的独立交互，避免出现页面既属于页面组、又属于 Section 的双重可视对象身份。

## 3. 交互与状态机

### 3.1 创建

底部工具栏将抓手与选择工具保留在左侧导航组；Section 与页面跳转热区移入右侧创建组，并分别使用区域面板和路径图标。Section 快捷键为 Shift + S。激活后鼠标显示十字/区域光标；按下记录画布坐标，移动显示半透明边界，释放后以最小尺寸门槛（建议 80×60 画布像素）创建 Section。点击空白不创建零尺寸对象。创建成功后立即选中并聚焦标题输入；取消标题时保留“Section”，不产生空标题。

从空白处拖出一个完整包裹对象外框的矩形时，释放即把这些页面和自由节点写入 `children`，不显示确认弹窗。直接把页面、自由节点或子 Section 拖入已有 Section 时，只有对象完整落入最内层 Section 才归属；任何一边越界即从原父 Section 自动释放。按 Alt/Option 拖动页面或自由节点会在落点创建副本，原对象及原成员关系保持不变，副本按同一规则加入候选 Section。

### 3.2 选择、移动和缩放

选择命中顺序为：标题/边框 → Section 子对象 → 背景空白。选中 Section 显示边界、标题栏、子对象数量和嵌套层级；背景使用 pointer-events 旁路，不能挡住成员选择。浮动工具栏只显示颜色色块、适应成员和删除分区；颜色色块直接反映当前颜色，点击后打开颜色气泡框，并在同一处设置颜色与填充透明度。边框固定为 1px 且始终使用该颜色的完全不透明值，圆角与标题颜色不提供单独设置。拖动标题栏或边框移动 Section 时，容器及其全部直接、嵌套成员以同一位移同步平移，成员在容器内的相对位置不变；这让 Section 成为可整体搬运的画布单元。

缩放只改变容器边界，不缩放或重排成员。一次移动完成或缩放完成后，系统执行一次成员边界校验；边界不再完整覆盖某个直接成员时，该成员自动释放。“适应成员”可主动扩大边界以重新包裹现有成员。Section 自身 resize 不改变页面卡片比例、图片原始比例或文档高度。

### 3.3 收纳、移出和嵌套

收纳候选按对象外框是否完整位于 Section 内计算；多选对象逐个按同一规则重新判定。拖入子 Section 时优先收纳到最内层 Section，并在拖动提示中展示完整路径。

移出通过拖到 Section 外或边界变化后的自动释放完成。删除父 Section 会递归删除其子 Section 容器并释放所有页面和自由节点；Section 删除从不删除项目页面资源或自由节点。页面组不在本期收纳范围内。页面与 Section 标题均可双击重命名：页面名称写回项目页面元数据，Section 名称写回画布布局；两类标题使用同一屏幕可读字号策略。

## 4. 渲染与层级

`PreviewCanvas` 将画布渲染拆为背景层、Section 层、页面/自由节点层、选择反馈层。Section 背景和边框使用 CSS/SVG 轻量绘制，不进入页面截图、iframe 或页面截图 hash。页面与 Section 标题在缩放不低于 0.5x 时保持约 12px 屏幕字号；低于该阈值时停止反向补偿并随画布继续缩小。Section 标题栏的高度和内边距同步补偿，使文字不会被标题栏裁切；过小分区自动隐藏填充，仅保留边框和标题。

所有 Section 均使用画布绝对坐标和全局 `zIndex`；嵌套只表达成员关系，不创建局部坐标或局部层级。渲染时祖先 Section 的背景固定在后代 Section 背景与普通对象之后，且任何 Section 都不能遮挡成员点击。适应屏幕和画布边界计算以所有可见对象的并集计算，Section 外框只在其没有可见成员、或其边界超出成员并集时补充边界，避免重复扩大面积。

自动排版以根 Section 及其全部后代叶子对象作为一个平移单元，并把不属于任何 Section 的对象各自作为单元：排版只改变单元间的位置，单元内相对坐标保持不变；Section 与其后代同步平移，边界尺寸不变。这样既保留已有语义分区，也不会在自动排版后制造成员越界。创作端工具栏与 Agent 的 `arrangeCanvasPages` 都遵守这个单元规则；Agent 只选中同一 Section 的部分页面时会拒绝执行，避免拆散分区。首期不对 Section 内部对象单独重新排版。

## 5. 保存、协同与版本

Section 与 pages、nodes 一起写入 `.canvas-layout.json`，仍沿用画布布局 API、Workspace 草稿和 `canvas-layout` 协同房间。任何创建、重命名、样式修改、收纳、移出、嵌套、移动和缩放都先形成结构化 canvas mutation，并由统一的读入、归一化、校验、Authority 提交入口物化为完整状态；连续 pointer move 只执行容器与成员的轻量坐标平移，不重复归一化整个成员图；pointerup 再进行一次边界校验并提交最终状态。

现有协同房间承载的是完整 JSON 文本，不能承诺字段级 CRDT 合并。编辑器以最近一次已确认的画布快照为 base；收到远端文本后，将本地未确认的结构化差异按记录级重放到远端状态。不同页面、自由节点、Section、页面组和图层记录可以自动合并；同一记录的分叉修改会显示冲突并保留本地草稿，不再以 `updatedAt` 静默覆盖。数组型隐藏状态和 navigation 采用同样的“相同变更可接受、分叉变更显式冲突”规则。重放结果归一化后才重新发布到协同文本；远端回流只由协同文本变化触发，viewport、hover 等本地视图状态不参与内容冲突裁决。自动保存仍由协同房间落盘，版本保存和发布消费其已提交快照。

## 6. 兼容、迁移与安全

读取旧版 `version: 1` 布局时，`sections` 缺失即为空，不迁移已有页面组；本次新增可选字段不要求提升文件版本。新增字段不改变 `pages`、`nodes`、`pageGroups` 的含义。Section 采用字段级容错：单个非法 Section 或引用被丢弃并记录脱敏诊断，其余有效 Section 和页面布局继续恢复；基础 `pages/viewport` 非法时仍按现有失败策略拒绝整个布局。写回一律输出归一化后的已知字段；后续如提升文件版本，必须提供显式升级函数和回退日志。

标题、颜色和 children ID 必须限制长度、数量与字符集；禁止通过 title 注入 HTML。Section 不得携带源码、ticket、Cookie、iframe URL 或页面内容副本。Agent 工具读取画布时返回 Section 的摘要（id、title、bounds、children kind/count、parentId），写入时只能调用同一校验/变更入口，不能直接编辑 JSON 字符串。

## 7. 组件与模块职责

| 模块 | 责任 |
|---|---|
| `demo-ui/types.ts` | 暴露 Section、成员引用和样式，以及画布页面重命名回调 |
| `PreviewCanvas.tsx` | 工具态、完整边界命中、选择反馈、Section 整体拖动、自动收纳/释放、页面重命名接线、颜色色块入口及颜色/透明度气泡框和渲染层级 |
| `CanvasPageItem.tsx` / `CanvasSectionItem.tsx` / `canvas-utils.ts` | 页面与 Section 标题的双击编辑，以及统一的 12px/0.5x 阈值标题尺度 |
| `canvas-section.ts` | 完整边界、嵌套循环、成员树整体平移、自动收纳/释放、单色样式归一化和 Section 单元自动排版纯函数 |
| `canvas-clipboard.ts` | 复制/粘贴 Section，重写 Section 与成员 ID 映射 |
| `canvas-layout-file.ts` / API route / viewer 数据读取 | 读取、字段级容错、校验、Authority 提交和版本化写入；所有消费端使用同一解析器 |
| `useCanvasWorkspace` / 编辑页 | 草稿状态、保存状态、按已确认 base 的记录级 mutation 重放、协同回流、冲突提示和撤销重做接线 |
| Agent canvas tool | Section 摘要查询与同一 mutation 入口；不得直接重写 JSON |

不要把 Section 逻辑放入 `CanvasPageItem` 的页面预览组件，也不要复用草图 SDK 的 group reducer；两者的持久化边界不同。

## 8. 测试与验收

P0 验收已覆盖：Shift + S 创建并自动聚焦标题、标题重命名、绘制完整包裹自动收纳且无确认弹窗、拖入/越界自动释放、嵌套循环拒绝与多父归一化、删除分区释放页面和自由节点、Section 整体移动时页面/自由节点/嵌套 Section 同步平移、刷新和协同回流恢复、并发 mutation 的记录级重放与同记录冲突提示。浏览器回归覆盖 Alt/Option 页面复制、自动收纳、整体拖动、缩放越界释放、重命名、默认删除与自动保存落盘。

P1 验收已覆盖：批量选择与对齐、复制粘贴 ID 重写、Section 单元自动排版、撤销重做、单个损坏 Section 降级、键盘 Tab 导航、页面与 Section 在 0.5x 前的统一标题可读性、页面双击重命名，以及 500 个对象对齐热路径的性能基线。

建议新增 `canvas-section.test.ts`（纯函数）和 `preview-canvas-interaction-mode.test.tsx` 场景，并在 `test/创作端E2E回归测试/` 增加 Section 回归用例。完成实现后至少运行 `corepack pnpm check:demo-ui`、`corepack pnpm check:author` 与对应 Playwright 回归。

## 9. 分阶段交付

1. **协议与纯函数**：类型、归一化、完整边界命中、嵌套校验、patch summary。**已完成：类型、图归一化、自动收纳/释放和单元测试。**
2. **单机交互**：工具栏、绘制、选择、重命名、样式面板、收纳/移出。**已完成：图标化浮动工具栏、单色与填充透明度气泡设置、Shift + S 绘制、完整包裹自动收纳、页面/自由节点拖拽收纳与候选高亮、越界自动释放、Option/Alt 拖拽复制、Section 嵌套、Section 与成员树整体移动/缩放，以及释放式删除。**
3. **持久化与协同**：API 校验、草稿同步、撤销重做、版本恢复、Agent 摘要读写。**已完成：布局字段级容错、协同文本回流，以及以已确认快照为 base 的记录级重放；不同记录自动合并，同记录分叉显示冲突。**
4. **体验完善**：自动排版、复制粘贴、性能优化、无障碍标签、E2E 和文档验收。**已完成：以根 Section 与后代为整体的自动排版（含 Agent 原子单元）、重写 Section/嵌套 Section/页面/节点 ID 的复制粘贴、边缘命中与图标工具栏无障碍标识、500 个对象对齐热路径性能基线，以及 Alt/Option 复制、自动收纳、越界释放、重命名和默认删除的浏览器 E2E。**

Section 的移动语义为“容器携带全部成员树”。独立移动成员仍按完整边界规则重新归属；二者通过拖动目标区分，不能混用。
