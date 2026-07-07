---
covers:
  - packages/sketch-core/src/index.ts
  - packages/sketch-core/tests/sketch-core.test.ts
  - packages/sketch-react/src/index.tsx
  - packages/sketch-react/src/preview.tsx
  - packages/sketch-react/tests/sketch-react.test.tsx
  - packages/sketch-playground/src/components/SketchPlaygroundApp.tsx
  - packages/sketch-playground/src/fixtures/sketch-fixtures.ts
  - packages/shared/src/index.ts
  - packages/shared/src/workspace.ts
  - packages/project-core/src/types.ts
  - packages/project-core/src/service.ts
  - packages/project-core/src/__tests__/service.test.ts
  - packages/author-site/src/lib/authoring-feature-flags.ts
  - packages/author-site/src/lib/sketch-editor-engine.ts
  - packages/author-site/src/lib/sketch-editor-engine.test.ts
  - packages/author-site/src/lib/user-authoring-preferences.ts
  - packages/author-site/src/lib/__tests__/user-authoring-preferences.test.ts
  - packages/author-site/src/app/api/user/authoring-preferences/route.ts
  - packages/author-site/src/app/api/demos/[id]/route.ts
  - packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts
  - packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.test.ts
  - packages/author-site/src/app/demo/[id]/edit/components/SketchEditorEngineHost.tsx
  - packages/author-site/src/app/demo/[id]/edit/hooks/useVersionControl.ts
  - packages/author-site/src/app/demo/[id]/edit/page.tsx
  - packages/author-site/src/app/demo/[id]/edit/__tests__/useVersionControl.test.tsx
  - packages/agent-service/src/routes/collab.ts
  - packages/agent-service/src/collab/workspace-file-persistence.ts
  - packages/agent-service/tests/unit/collab-room-manager.test.ts
  - test/sketch-playground/sketch-playground.spec.ts
  - test/创作端E2E回归测试/sketch-page-regression.spec.ts
---

# 草图绘图 SDK

> 更新日期：2026-07-07

本文描述创作端手绘页面的自研 SDK 技术边界。业务侧定位见 [页面模块需求](../页面模块_需求文档.md)，底层文件协议见 [草图页面运行时](./04_草图页面运行时.md)。

## 1. 包边界

草图绘图能力由三个 workspace 包维护：

| 包 | 职责 |
|:---|:---|
| `@workbench/sketch-core` | 维护 `SketchSceneDocument` 协议、scene 校验、patch reducer、配置绑定、几何计算、命中测试、视觉 hash 和 SVG/HTML 只读渲染。 |
| `@workbench/sketch-react` | 提供受控 React 编辑组件、预览组件、编辑状态机、画布、工具栏、图层列表和属性检查面板。 |
| `@workbench/sketch-playground` | 提供独立开发和验证环境，用 fixtures、JSON、配置数据和性能入口验证 SDK，不依赖创作端登录或项目会话。 |

`packages/shared` 保留草图协议的兼容导出，但新服务端代码优先直接依赖 `sketch-core`。需要编辑能力的前端代码依赖 `sketch-react`；只读使用端优先依赖 `sketch-react/preview`，避免加载编辑器交互代码。

创作端手绘入口仍由 `NEXT_PUBLIC_SKETCH_SCENE_AUTHORING_ENABLED` 控制。该开关只控制创作端是否允许编辑和写入手绘 scene，不改变 `sketch-core`、`sketch-react` 和 `sketch-playground` 的保留路线。

## 2. 数据与渲染流

手绘页面的权威数据始终是 `SketchSceneDocument`。编辑器只产生更新后的 scene 或 scene patch，不把 React 状态、DOM 结构或宿主 UI 状态写入存储格式。

默认 scene、外部导入 scene、服务端 patch 结果和只读渲染输入都必须通过同一份协议校验。无效 scene 不能进入编辑状态；只读渲染遇到无效节点时可以使用安全 fallback，但应尽量保留宿主传入的合法页面尺寸，避免截图、预览或视觉 hash 看到错误画幅。

只读渲染统一从 `sketch-core` 生成 SVG/HTML。author-site 预览、viewer-site、screenshot-service 和 playground 使用同一套解析、配置绑定和视觉 hash 规则。视觉 hash 以最终 SVG 输出为准：不会影响画面的 metadata、未使用配置字段或隐藏对象不应触发截图重建；实际改变 SVG 的配置值必须改变 hash。

`sketch-core` 的命中测试与只读渲染保持同一套可见性和配置绑定规则。线条和箭头按起止点线段和描边宽度容差命中；画笔路径如果带有 SDK 采样的 `points`，按相邻采样点线段命中，不把整个路径包围盒都视为可点击区域；图片命中仍受 `src` 或 `src` 绑定解析结果影响，未解析出图片源时不会参与命中。

## 3. 编辑器宿主

创作端编辑页使用 `SketchEditorEngineHost` 承接自研 SDK。host 只负责把当前页面 scene、配置数据和预览尺寸传给 `sketch-react`，并把 `onSceneChange` 写回编辑页状态；工具栏、图层面板和属性面板都共享同一个 `useSketchEditorState` controller。

当前没有双引擎选择。`resolveSketchEditorEngine` 只会在单页预览、当前页面为 `sketch-scene`、用户进入手绘编辑态且没有查看知识文档时返回 `native`；其他情况返回 `null`。项目级和用户级 `authoringPreferences.sketchEditorEngine` 只接受 `native`，历史持久化中的其他值读取时会被忽略，不再写回新项目。

编辑器能力包括：

- 顶部工具栏提供选择、抓手、矩形、圆形、线条、箭头、画笔、文本、图片、便签、橡皮、撤销和重做；复制、删除、置顶、置底、锁定、显隐、对齐和分布等对象命令不在顶部工具栏重复展示。
- 矩形、圆形、线条、箭头、便签、图片和画笔使用 pointer draft 流程创建：按下记录起点，移动期间只显示预览或采样点，释放后一次性提交 scene；普通点击不会再创建固定尺寸的矩形、圆形、线条、箭头、便签、图片或画笔路径。
- 画笔使用 `path` 节点和 `points` 字段表达自由路径；只读 SVG 渲染、校验和 patch 流程仍以 `SketchSceneDocument` 为唯一权威。当前不做自动平滑，避免隐式改变用户轨迹；属性面板提供显式路径简化，简化结果仍写回 `points` 和 `path`。
- 箭头头部使用 `style.startArrow` 和 `style.endArrow` 表达，取值为 `none` 或 `arrow`。历史箭头节点如果未设置 `endArrow`，只读渲染仍按终点箭头处理；显式设置 `endArrow: "none"` 可渲染为无线头，设置 `startArrow: "arrow"` 可形成双箭头。
- 文本工具支持在画布中创建文本节点并进入内联编辑；新建文本如果空提交或取消，会删除临时文本节点，不留下空文本对象。既有文本、便签、按钮、输入框和卡片仍支持双击内联编辑。
- 文本细样式继续复用 `textStyleRuns`。属性面板的斜体、下划线、删除线、行高和字距会写入覆盖全文的 style run；只读 SVG 渲染使用嵌套 `tspan` 输出这些样式。基础颜色、字号、字重和对齐仍写入节点 `style`，便于简单对象读取和批量理解。
- 矩形和圆形的形状内文本复用节点 `text` 字段，不新增子节点或外部绑定协议。用户双击形状进入画布内联输入；只读 SVG 渲染会把该文本作为居中标签输出；节点 `name` 继续用于对象识别，和显示文本分离。
- 图片工具在 SDK 内提供两类入口：拖拽定界可创建图片占位节点；点击画布选择图片文件、拖入图片、粘贴图片或在属性面板替换图片时，会把图片转成 data URL 写入 `image.src`，并把文件名写入 `alt`。图片地址和 alt 文本仍可在属性面板编辑；`style.imageFit` 控制只读 SVG 的显示策略，支持 `cover`、`contain` 和 `fill`，分别对应裁切填满、完整显示和拉伸填满。编辑器能识别图片源未设置或绑定未解析状态；对已解析但浏览器加载失败的图片，预览层会在图片范围内叠加“图片加载失败”。上传、资产引用和文件大小治理不属于当前 SDK 内部入口。
- 新建矩形、圆形、线条、箭头、画笔路径、文本、图片和便签都会写入可读 `name`；文本、便签、形状内文字和图片同时保留 `text` 或 `alt` 等可推断内容。通过文件导入的图片使用文件名作为 `name` 和 `alt`，便于 Agent 在 scene JSON 中定位对象。
- 绘制过程中的 draft 不写入 scene；`pointerup` 提交后才生成正式节点 id。后续移动、缩放、旋转、端点编辑、属性面板修改、锁定、显隐和绑定更新都通过既有节点 id 做 patch，不因编辑动作替换 id。
- 橡皮工具按一次 pointer 流批量删除命中对象，跳过锁定、隐藏或运行时配置隐藏的对象。
- 画布缩放、滚轮平移、适配页面、缩放到选区和 Space 临时平移；这些只属于编辑器视口状态，不写入 `SketchSceneDocument`。
- 单选、多选、框选、拖拽、缩放、Shift 等比缩放、画布旋转手柄、线条/箭头端点编辑、复制、删除、层级调整、左/顶对齐和水平分布。
- 线条和箭头端点当前只用 `x/y/width/height` 表达起点和终点，不保存端点吸附状态。本阶段不新增对象锚点或吸附绑定协议；后续如果需要让端点绑定到对象、连接点或配置数据，应新增结构化字段并同步校验、只读渲染、命中测试和 patch 摘要。
- 选择工具支持按住 Alt 拖动复制对象：拖动开始时保留原对象，首次有效移动时插入副本并移动副本，一次撤销会移除本次复制结果。
- 锁定、隐藏、撤销、重做、方向键微调、全选、复制、粘贴、复制副本和对象属性编辑。
- 画布右键菜单复用同一套对象命令，支持复制、删除、置顶、置底、锁定、解锁、显示、隐藏、左对齐、顶对齐、水平分布、成组和解组；只读预览态不会打开该菜单。
- 图层列表按视觉层级展示对象。图层项主区域负责选择和 Shift 多选；图层项右键菜单复用对象命令；hover 或键盘聚焦时显示锁定和显隐图标，点击后通过 scene patch 更新对应节点状态。
- 属性面板按单选对象分为通用、内容、几何、线条端点、路径、样式、图片和绑定区域。通用区编辑节点名称、锁定和可见状态；内容区编辑文本、便签、控件、卡片和基础形状的 `text` 字段；几何区编辑位置、尺寸和旋转；线条/箭头端点区写入 `x/y/width/height`；路径区展示 SDK 画笔路径的点数，并用已有 `points` 生成简化后的 `path` 和节点范围，不解析任意外部 SVG path 字符串；样式区写入既有 `style` 字段，包括填充、描边、线宽、透明度、圆角、虚线、箭头头部、文本颜色、字号、字重和对齐；样式区也会用 `textStyleRuns` 写入斜体、文本装饰、行高和字距；图片区编辑 `src`、`alt`、替换文件、源状态和 `imageFit`。多选时，属性面板只显示所有可编辑对象共同支持的 `style` 字段；混合值以“混合”提示呈现，批量写入会保留各对象原有的其他样式字段，不对不适用字段做隐式覆盖。复制、删除、层级、对齐、分组等对象命令仍以右键菜单、图层菜单和快捷键为主入口。
- 文本、便签、按钮、输入框和卡片支持画布内联文本编辑；内联编辑提交后仍通过 scene patch 更新节点文本。
- 展示节点配置绑定，并允许从属性面板移除绑定；新增配置字段仍由宿主写入 `config.schema.json`。

## 4. Patch 与保存边界

Scene patch reducer 是服务端、Agent 和编辑器共享的写入门槛。`add`、`update`、`duplicate`、`group`、`ungroup`、`reorder`、`set-locked`、`set-visible`、`bind` 和 `unbind` 等操作都先形成候选 scene，再通过协议校验后提交；非法几何、协议外节点类型、重复 id、悬空 group child 或不会产生实际变化的 patch 不应刷新 scene，也不应更新 `updatedAt`。

`applySketchScenePatchOperationsWithResult` 会随校验结果返回结构化 patch summary。summary 只根据前后 scene 的实际差异生成，记录输入操作数、是否产生变化、前后节点数、新增节点、删除节点、更新节点、更新节点的字段列表和受影响节点数；被校验拒绝或没有造成实际变化的操作不会被误算为已影响节点。Agent 可以用这些字段区分形状文本修改、Alt 拖动复制、图层锁定/显隐、右键菜单复制/删除和属性批量修改等对象级动作。

Session 页面文件 API 保留通用 `sketchPatch` 写入路径。服务端读取当前 session scene，检查 patch 基线是否仍匹配，再用 `applySketchScenePatchOperations` 回放生成最终 scene；如果客户端同时提交目标 scene，服务端还会确认回放结果与目标 scene 等价。验证通过后写入 `sketch.scene.json`，验证失败时返回结构化错误并记录诊断。

诊断事件只保留安全摘要。`page.sketch_patch_validated` 和 `page.sketch_patch_rejected` 记录状态、操作数、是否存在基线 key、当前/目标节点数量、目标来源和失败原因，不保存 scene、operations 或节点内容。

页面资源版本仍可携带 `sketchPatchSummary`，只记录操作数、基线标记和前后节点数，用于资源版本 metadata 审计。该摘要不参与恢复内容，也不携带 scene 或 patch operations。

## 5. 协同与自动保存

手绘 scene 使用 `page-sketch-scene` 协同资源。编辑页本地 scene 变化会进入现有 Workspace 自动保存链路：前端先把 Workspace 标记为待落盘，随后执行 Workspace flush，再通过 `persist-workspace` 推进项目当前 Workspace。

当协同文本回流到编辑页时，前端必须先用 `SketchSceneDocument` 解析；解析失败不能覆盖本地 scene。服务端 flush 前也会用文件哈希基线防止旧协同房间覆盖已经被 AI 工具或其他外部写入推进过的磁盘文件。

## 6. 验证入口

保留的验证入口如下：

| 范围 | 命令 |
|:-----|:-----|
| 协议、patch、渲染和视觉 hash | `corepack pnpm check:sketch-core` |
| React 编辑器与预览组件 | `corepack pnpm check:sketch-react` |
| 独立 playground 类型检查 | `corepack pnpm check:sketch-playground` |
| Playground 浏览器冒烟 | `corepack pnpm test:e2e:sketch-playground` |
| 创作端手绘编辑态回归 | `corepack pnpm test:e2e -- sketch-page-regression.spec.ts` |
| 创作端类型与单测 | `corepack pnpm check:author` |

`corepack pnpm check:all` 应覆盖 `sketch-core`、`sketch-react` 和 `sketch-playground`，不包含已删除的第三方编辑器命令。
