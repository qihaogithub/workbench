# 创作端草图绘图 SDK 编辑体验提升清单

## 目标模式任务说明

新对话可直接使用以下目标：

> 以 `docs/plans/进行中/创作端草图绘图SDK编辑体验提升清单.md` 为目标模式任务文档，持续完善自研草图绘图 SDK 的编辑体验。先读取本文档、根 `AGENTS.md`、`docs/plans/进行中/AGENTS.md` 和 `docs/项目文档/创作端/02-Demo管理/技术/05_草图绘图SDK.md`，再用 CodeGraph 梳理 `sketch-core`、`sketch-react`、`sketch-playground` 当前实现。按本文档的阶段顺序实施、测试、更新清单和验证状态，直到 P0 编辑手感可在独立 playground 稳定验收，并为后续 P1/P2 留下准确状态。

本目标模式的完成定义：

- P0 条目至少完成一轮可验收实现，`sketch-playground` 中能连续完成缩放导航、绘制、选择、多选、拖拽、缩放、旋转、内联文本编辑、复制粘贴、撤销重做。
- 每个完成条目都有对应单元测试、组件测试或 Playwright 回归；只靠手工点验不算完成。
- `corepack pnpm check:sketch-core`、`corepack pnpm check:sketch-react`、`corepack pnpm check:sketch-playground` 通过；涉及浏览器交互时运行 `corepack pnpm test:e2e:sketch-playground`。
- 本文档的待办、验证状态和风险已同步更新，能准确反映下一位 agent 接手时的真实状态。
- 不打开创作端草图 authoring 暴露面，除非用户明确要求重新接入。

## 当前状态

自研草图绘图 SDK 已完成独立包拆分，当前仍按固定页面编辑器推进，不做无限白板。创作端草图入口仍处于暂停接入状态；下一阶段目标是在独立 `sketch-playground` 中把编辑体验打磨到接近 Excalidraw 的基础操作流畅度，再评估重新接入创作端。

已完成实现细节和长期协议事实以 `docs/项目文档/创作端/02-Demo管理/技术/05_草图绘图SDK.md` 为准。本文档只记录仍需行动的体验提升任务、执行边界、验证要求和接手状态。

## 当前结论

- 目标不是引入 Excalidraw 作为运行时，也不是迁移到 Excalidraw 私有 JSON；长期权威数据仍是 `SketchSceneDocument`。
- 目标是学习成熟绘图工具的编辑手感：选择、拖拽、变换、快捷键、右键菜单、文本编辑、复制粘贴、吸附和性能反馈。
- 不需要实现手绘渲染风格。视觉输出应保持当前产品需要的干净、确定性 SVG/HTML 渲染，避免把草图页变成手绘白板风格。
- 优先在 `@workbench/sketch-react` 与 `@workbench/sketch-playground` 内完成体验和回归；创作端重新开放前，只做必要的 SDK 验证，不扩大 author-site 暴露面。
- 每次改动都要保护协议边界：编辑器状态、pointer 状态、视口状态和第三方参考代码状态不能写入 `SketchSceneDocument`。

## 执行边界

允许优先改动：

- `packages/sketch-core/`：协议校验、patch reducer、几何、命中测试、只读渲染、测试。
- `packages/sketch-react/`：编辑 controller、画布、工具栏、图层栏、属性栏、快捷键、选择/变换状态机、测试。
- `packages/sketch-playground/`：独立调试 UI、fixtures、性能基线、交互验收入口。
- `test/sketch-playground/`：浏览器回归。
- 本文档：任务状态、验证结果、剩余风险。

默认不要改动：

- author-site 草图入口和 AI 暴露开关，除非用户明确要求重新接入。
- `SketchSceneDocument` 长期字段语义，除非同步更新 `sketch-core` 校验、只读渲染、测试和项目文档。
- Excalidraw、tldraw 或其他白板产品的私有 JSON 作为存储格式。
- OpenPencil 相关接入，除非本任务明确转向 OpenPencil 对比或迁移。

如果实现过程中改变了项目当前事实，例如协议字段、SDK 公共 API、验证命令或创作端接入边界，必须同步更新 `docs/项目文档/创作端/02-Demo管理/技术/05_草图绘图SDK.md`；单纯计划推进和过程记录只维护本文档。

## Excalidraw 参考代码策略

建议拉取 Excalidraw 源码作为只读参考，但不要直接引入为依赖，也不要复制它的存储模型。

拉取时机：

- 做 P0 编辑手感时建议拉取，因为交互状态机、快捷键和右键菜单能直接提供参考。
- 只做现有代码整理、文档维护或小 bug 修复时可以不拉取。
- 如果网络或磁盘环境不方便，先继续基于当前 SDK 实现，不阻塞任务。

建议执行方式：

- 克隆到仓库外的参考目录，例如 `/Users/qh2/Documents/PGM/1·Work/references/excalidraw`。
- 使用 `git clone --depth 1 https://github.com/excalidraw/excalidraw.git /Users/qh2/Documents/PGM/1·Work/references/excalidraw`。
- 只读查看，不加入当前 monorepo workspace，不改当前仓库 `package.json`，不提交第三方源码。
- 先整理一页对照笔记到本文档或临时工作记录：哪些交互可以借鉴、哪些因为固定页面边界必须改写。

适合参考的部分：

- 交互状态机：选择、拖拽、缩放、旋转、文本编辑、工具切换和 pointer 生命周期。
- 快捷键设计：复制、粘贴、删除、撤销重做、全选、成组、锁定、层级和缩放导航。
- UI 细节：右键菜单、浮动工具条、快捷属性、选中框和多选反馈。
- 性能策略：大对象数下的 hit test、渲染缓存、局部更新和输入延迟控制。
- 测试思路：关键编辑行为的单测、浏览器回归和 fixture 组织方式。

不适合照搬的部分：

- Excalidraw 的无限画布模型。
- Excalidraw 私有 scene/schema 作为项目长期存储。
- 手绘风格渲染与 rough 风格视觉输出。
- 与 workbench 创作端保存、配置绑定、截图、发布和 AI 工具边界冲突的架构。

## 阶段 0：实施前基线

- [ ] 用 CodeGraph 梳理 `useSketchEditorState`、`SketchEditorCanvas`、`SketchEditorToolbar`、`SketchLayerPanel`、`SketchPropertyPanel`、`applySketchScenePatchOperations`、命中测试和 playground fixture。
- [ ] 在 `sketch-playground` 记录当前能力基线：工具栏功能、快捷键覆盖、文本编辑入口、选择/变换行为、大 scene 渲染耗时。
- [ ] 明确 P0 首轮实现顺序，并把超过本轮范围的内容留在 P1/P2，不边做边扩大目标。

阶段完成定义：接手 agent 能说清楚当前编辑器已有能力、缺口、涉及文件和最小验证命令。

## P0：先补编辑手感

- [ ] 画布导航：缩放、拖拽平移、适配页面、缩放到选区、Space 临时手型。
- [ ] 选择体验：框选、多选加减选、双击进入文本编辑、Esc 退出、点击空白清选。
- [ ] 变换体验：更顺滑的拖拽、缩放、旋转、等比缩放、线条和箭头端点拖拽。
- [ ] 快捷键体系：Delete、Cmd/Ctrl+C/V/D/Z/Shift+Z、方向键微调、Shift 大步进、Cmd/Ctrl+A。
- [ ] 右键菜单：复制、删除、置顶、置底、锁定、解锁、显示、隐藏、成组、解组。
- [ ] 内联文本编辑：直接在画布上编辑文本和便签，不依赖右侧属性栏输入。

阶段完成定义：playground 中可以连续完成“缩放画布 -> 绘制对象 -> 多选 -> 拖拽/缩放/旋转 -> 内联编辑文本 -> 复制粘贴 -> 撤销重做”，操作过程中没有明显卡顿、误选或历史栈异常。

## P1：补绘图能力

- [ ] 自由绘制和路径工具：统一落到项目自有 `path` 协议，不把第三方私有结构写入 scene。
- [ ] 箭头增强：箭头端点、双箭头、无箭头、线段吸附和文本标注。
- [ ] 样式预设：描边、填充、透明度、线宽、虚线、圆角、字体、字号、粗斜体。
- [ ] 快捷样式复制：支持把一个对象的基础样式应用到同类对象。
- [ ] 对齐与吸附：网格、边缘吸附、中心线吸附、对象间距提示。
- [ ] 图片能力：拖入、粘贴、替换、占位和资源失败提示。

阶段完成定义：用户不需要打开 JSON 或依赖属性面板，就能完成常见线框图、信息结构图和页面草稿的创建与调整。

## P2：补工程与 SDK 化

- [ ] 稳定编辑器事件契约：`onSceneChange`、`onSelectionChange`、patch 摘要、dirty 状态和 host command。
- [ ] 保持工具栏、图层栏、属性栏可拆分挂载，创作端只负责宿主布局和保存。
- [ ] 建立交互回归：选择、拖拽、缩放、旋转、文本编辑、快捷键、复制粘贴和右键菜单。
- [ ] 建立大 scene 性能基准：100、500、1000 节点下的渲染、命中测试和拖拽帧率。
- [ ] 完善 playground：fixture 切换、交互录制、JSON diff、视觉 hash 和性能面板。
- [ ] 重新接入创作端前做验收：`check:sketch-core`、`check:sketch-react`、`check:sketch-playground`、`test:e2e:sketch-playground` 全部通过。

阶段完成定义：SDK 在独立 playground 中完成主要编辑体验和自动回归后，再显式评估是否打开创作端草图 authoring flag。

## 推荐实施顺序

1. 先做阶段 0 基线，避免把已有能力重复实现。
2. P0 第一轮优先做画布导航、快捷键作用域和内联文本编辑；这三项会影响后续选择、右键和回归设计。
3. 第二轮做选择体验、右键菜单和复制粘贴，让对象操作闭环稳定。
4. 第三轮做变换体验和线箭端点拖拽，因为这部分最容易触碰几何、命中测试和 scene 校验边界。
5. P0 验收稳定后，再进入 P1 的路径、吸附、图片和样式能力。

每轮结束都要更新本文档：已完成项打勾，`验证状态` 写明命令和结果，`风险` 保留仍影响后续接手的事项。

## 验证矩阵

| 范围 | 命令 | 必跑条件 |
| :--- | :--- | :--- |
| sketch-core 协议、几何、patch、命中测试 | `corepack pnpm check:sketch-core` | 改 `packages/sketch-core/` 或影响 scene 校验/渲染 |
| sketch-react 编辑器 | `corepack pnpm check:sketch-react` | 改 `packages/sketch-react/` |
| playground 类型检查 | `corepack pnpm check:sketch-playground` | 改 `packages/sketch-playground/` |
| playground 浏览器回归 | `corepack pnpm test:e2e:sketch-playground` | 改交互、工具栏、快捷键、文本编辑、fixtures 或性能入口 |
| 创作端回归 | `corepack pnpm test:e2e -- sketch-page-regression.spec.ts` | 只有重新开放或改动 author-site 草图接入时运行 |
| 全仓轻量回归 | `corepack pnpm check:all` | 跨包公共 API 或协议行为变化后运行 |

如果某个命令因为环境、依赖或既有失败无法运行，必须在本文档和最终回复中写明原因、失败阶段和剩余风险。

## 浏览器验收脚本口径

P0 浏览器回归至少覆盖：

- 工具栏切换绘制对象后，画布新增对象并自动选中。
- 选中对象后可拖拽移动，撤销一次回到拖拽前位置。
- 多选对象后可整体移动，选区内部相对位置不被拉散。
- 文本或便签可通过画布内联入口编辑，保存到 scene 后刷新仍存在。
- Cmd/Ctrl+C、Cmd/Ctrl+V、Delete、Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z 只作用于当前激活编辑器。
- 右键菜单不会在只读 preview 或非激活编辑器上误写 scene。
- 缩放和平移只改变视口状态，不污染 `SketchSceneDocument`。

## 文档更新规则

- 本文档保留当前行动状态，不记录逐次命令流水。
- 完成的事项打勾后，应压缩为一句当前结论，不追加长过程。
- 新发现的协议事实、SDK 公共 API 或创作端接入边界变化，应同步到 `docs/项目文档/创作端/02-Demo管理/技术/05_草图绘图SDK.md`。
- 如果 P0 完成且进入 P1/P2，应把本文档顶部 `当前状态` 改成新的真实状态。
- 如果任务整体完成，应按 `docs/plans/进行中/AGENTS.md` 要求压缩归档或合并回固定模块文档。

## 验证状态

- 当前文档已升级为目标模式任务说明，尚未开始代码实现。
- 下一步实现前应先完成阶段 0 基线。
- 当前没有为 P0 新增测试；后续每完成一个 P0 条目都必须补测试或 Playwright 回归。

## 风险

- 如果过早复制 Excalidraw 架构，可能把固定页面编辑器重新推回无限白板模型。
- 如果只补 UI 控件不补交互状态机，编辑体验会继续在拖拽、选区、历史栈和文本编辑上暴露割裂感。
- 如果缺少大 scene 性能基准，后续接入创作端后可能在真实页面对象量下出现输入延迟。
- 如果不把快捷键和 pointer scope 做清楚，多编辑器实例或创作端预览态可能互相抢事件。
- 如果实现时改动 `SketchSceneDocument` 协议但没有同步校验、只读渲染、项目文档和回归测试，会造成 SDK、截图、viewer 和 AI 工具行为分裂。
