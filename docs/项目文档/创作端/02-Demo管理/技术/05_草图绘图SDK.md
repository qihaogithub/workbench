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
| `@workbench/sketch-core` | 维护 `SketchSceneDocument` 协议、scene 校验、patch reducer、配置绑定、几何计算、吸附计算、命中测试、视觉 hash 和 SVG/HTML 只读渲染。 |
| `@workbench/sketch-react` | 提供受控 React 编辑组件、预览组件、编辑状态机、画布、工具栏、图层列表、属性检查面板、命令面板和快捷键帮助。 |
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

- 顶部工具栏提供选择、抓手、矩形、菱形、圆形、线条、箭头、画笔、文本、图片、便签、橡皮、撤销和重做；复制、删除、置顶、置底、锁定、显隐、对齐和分布等对象命令不在顶部工具栏重复展示。
- 对象命令、视图命令、工具命令、样式命令和历史命令由 SDK 内部 action registry 统一组织。右键菜单、命令面板、快捷键和帮助面板读取同一批动作定义，确保命令名称、禁用条件和快捷键提示一致。
- 命令面板支持搜索工具与对象命令，并只允许执行当前状态可用的命令；不可执行命令保留在结果中并展示禁用原因。快捷键帮助从 action registry 生成，不单独维护重复文案。
- 矩形、菱形、圆形、线条、箭头、便签、图片和画笔使用 pointer draft 流程创建：按下记录起点，移动期间只显示预览或采样点，释放后一次性提交 scene；普通点击不会再创建固定尺寸的矩形、菱形、圆形、线条、箭头、便签、图片或画笔路径。
- 画笔使用 `path` 节点和 `points` 字段表达自由路径；只读 SVG 渲染、校验和 patch 流程仍以 `SketchSceneDocument` 为唯一权威。当前不做自动平滑，避免隐式改变用户轨迹；属性面板提供显式路径简化，简化结果仍写回 `points` 和 `path`。
- 箭头头部使用 `style.startArrow` 和 `style.endArrow` 表达，取值为 `none` 或 `arrow`。历史箭头节点如果未设置 `endArrow`，只读渲染仍按终点箭头处理；显式设置 `endArrow: "none"` 可渲染为无线头，设置 `startArrow: "arrow"` 可形成双箭头。
- 文本工具支持在画布中创建空文本节点并进入内联编辑；新建文本如果空提交或取消，会删除临时文本节点，不留下空文本对象。既有文本、便签、按钮、输入框和卡片仍支持双击内联编辑。
- 文本细样式继续复用 `textStyleRuns`。属性面板的斜体、下划线、删除线、行高和字距默认写入整段 style run；当画布内联编辑态存在文字选区时，只写入选区对应的 style run 片段。只读 SVG 渲染使用嵌套 `tspan` 输出这些样式。基础颜色、字号、字重和对齐仍写入节点 `style`，便于简单对象读取和批量理解。
- 矩形、菱形、圆形、便签、按钮、输入框和卡片新建后只保留可读 `name`，不写入默认显示文案。形状内文本复用节点 `text` 字段，不新增子节点或外部绑定协议；用户双击对象任意可见区域即可进入画布内联输入，命中路径同时支持 SVG 节点标记和 `sketch-core` 几何命中测试。内联编辑框按当前输入行数自动调整高度，并在形状对象的内边距区域内垂直居中；多行内容超过形状可用高度时显示“文本超出”提示，编辑框内部滚动，形状尺寸和 scene 协议不自动改变。内联编辑态会把 textarea 当前文字选区记录在编辑器本地 controller 中，属性栏 Text 区修改斜体、装饰、行高或字距时只更新该选区对应的 `textStyleRuns` 片段；没有文字选区时仍沿用整段文字样式更新。空文本形状提交空内容时只保持空 `text`，不会删除形状；只有文本工具新建的临时纯文本节点在空提交或取消时会被删除。锁定、运行时隐藏和预览态对象不会进入内联编辑。只读 SVG 渲染只在 `text` 或文本绑定有值时输出居中标签；节点 `name` 继续用于对象识别，和显示文本分离。
- 图片工具在 SDK 内提供两类入口：拖拽定界可创建图片占位节点；点击画布选择图片文件、拖入图片、粘贴图片或在属性面板替换图片时，会把图片转成 data URL 写入 `image.src`，并把文件名写入 `alt`。拖拽图片文件到既有图片节点会替换该节点 `src/alt`，并保留尺寸、圆角、配置绑定和层级顺序；拖拽到空白区域仍创建新图片节点。图片地址和 alt 文本仍可在属性面板编辑；属性面板的“裁剪/适配”和画布双击图片后的裁剪/适配编辑条都会写入 `style.imageFit`，控制只读 SVG 的显示策略，支持 `cover`、`contain` 和 `fill`，分别对应裁切填满、完整显示和拉伸填满。属性面板 Image 区显示图片来源、估算资源大小和超过 2 MB 的提示；这些状态是从当前 `src`/绑定派生的 UI 信息，不写入 scene。当前不保存 crop rect、焦点偏移或图片局部裁剪框；后续若加入真实裁剪态，需要扩展 scene 协议、校验、渲染和 patch 摘要。编辑器能识别图片源未设置或绑定未解析状态；对已解析但浏览器加载失败的图片，预览层会在图片范围内叠加“图片加载失败”。上传、资产引用和文件大小治理不属于当前 SDK 内部入口。
- 新建矩形、菱形、圆形、线条、箭头、画笔路径、文本、图片和便签都会写入可读 `name`，但 `name` 不作为画布显示文本兜底；只有用户输入的文本、绑定解析结果和图片 `alt` 等内容会作为可见或可推断内容保留。通过文件导入的图片使用文件名作为 `name` 和 `alt`，便于 Agent 在 scene JSON 中定位对象。
- 绘制过程中的 draft 不写入 scene；`pointerup` 提交后才生成正式节点 id。后续移动、缩放、旋转、端点编辑、属性面板修改、锁定、显隐和绑定更新都通过既有节点 id 做 patch，不因编辑动作替换 id。
- 橡皮工具按一次 pointer 流批量删除命中对象，跳过锁定、隐藏或运行时配置隐藏的对象。
- 画布缩放、滚轮平移、适配页面、缩放到选区和 Space 临时平移；这些只属于编辑器视口状态，不写入 `SketchSceneDocument`。
- 选择工具在 hover 非选中对象时显示轻量高亮；选中对象显示边界、中心点、旋转手柄和 resize handles。重叠对象命中时，Cmd/Ctrl 点击会按当前 zIndex 和视觉层级顺序在候选对象间循环选择，解决只能选中最上层对象的问题。语义 group 支持画布钻取：双击组内可见子节点进入组内子节点选择，Esc 返回上一级 group 选择；已经处于该 group 内时再次双击子节点会回到原有文本内联编辑路径。画布快捷键作用域内，Tab/Shift+Tab 会在可见非 group 对象之间前后循环选择；处于 focused group 时仅在该 group 的可见子节点中循环。拖动 line/arrow 端点时，画布会在可连接对象的四边中点和中心点显示候选连接点，并在端点释放到 12px 容差内时写入端点绑定。移动或缩放对象时，画布会显示区分网格、对象边缘、中心线和间距的吸附参考线；Cmd/Ctrl 可临时隐藏参考线，Shift/Alt/Option 等拖拽 modifier 提示显示在画布上。当前参考线只提示对齐关系，不自动改写拖拽坐标。空白处拖拽是矩形框选入口，拖拽期间显示虚线选区和“矩形框选”提示；当前不提供自由套索工具，也不扩展 lasso 形状协议。单选、多选、框选、拖拽、缩放、Shift 等比缩放、画布旋转手柄、线条/箭头端点编辑、复制、删除、层级置顶/置底/上移一层/下移一层、左/顶对齐、水平分布和垂直分布都属于编辑器交互层能力；hover 高亮、中心点、控制柄、重叠候选、focused group、Tab 导航、连接候选点、吸附参考线、modifier 提示、框选框和框选提示不写入 `SketchSceneDocument`，端点绑定、对象移动后的连接线几何和手动端点编辑导致的解绑会写入 scene。
- 线条和箭头端点仍用 `x/y/width/height` 表达起点和终点，同时可用 `connections.start` 和 `connections.end` 持久化端点绑定。每个端点绑定保存 `{ nodeId, anchor }`，`anchor` 取 `top`、`right`、`bottom`、`left` 或 `center`，目标只能是可连接的非 group、非线条、非箭头、非 path 对象。拖动被连接目标时，编辑器会按目标锚点实时更新 line/arrow 几何，并在属性面板 Line/Connector 区显示起点或终点绑定状态。手动编辑端点数值会清除对应端点绑定；删除目标节点时，patch reducer 会清理指向该节点的端点绑定。
- 选择工具支持按住 Alt 拖动复制对象：拖动开始时保留原对象，首次有效移动时插入副本并移动副本，一次撤销会移除本次复制结果。
- 锁定、隐藏、撤销、重做、方向键微调、全选、复制、粘贴、复制副本和对象属性编辑。
- 画布右键菜单复用同一套对象命令，支持复制、删除、置顶、置底、上移一层、下移一层、锁定、解锁、显示、隐藏、左对齐、顶对齐、水平分布、垂直分布、成组和解组；只读预览态不会打开该菜单。
- 图层列表按视觉层级展示对象，并优先使用节点 `name` 作为管理标签；没有 `name` 时才回退到画布文本或类型。图层面板支持按图层名称、节点类型标签和节点 id 搜索，并可按当前 scene 中已有节点类型筛选；搜索和筛选只影响面板展示，不写入 `SketchSceneDocument`。图层项主区域负责选择和 Shift 多选；双击图层项可进入重命名输入，提交后只更新节点 `name`，不改变画布显示用的 `text` 或绑定结果。可编辑图层行支持拖放调整层级，面板中的拖放顺序会换算成视觉层级顺序并通过 `reorder` patch 写回 zIndex，节点文本、名称和几何内容保持不变；锁定或运行时隐藏对象不作为拖拽源。图层行常驻显示分组、锁定、隐藏/运行时隐藏和绑定状态徽标，状态标识不依赖 hover；图层项右键菜单复用对象命令，hover 或键盘聚焦时显示锁定和显隐操作按钮，点击后通过 scene patch 更新对应节点状态。
- 属性面板按单选对象分为可折叠的通用、内容、位置、布局/排列、线条/连接器、路径、外观、文本、图片、绑定和导出区域，顶部保持当前对象名称、类型、锁定/可见状态和快捷状态操作；多选时显示数量和共同可编辑样式。通用区编辑节点名称、锁定和可见状态；内容区只作为辅助入口编辑文本、便签、控件、卡片和基础形状的 `text` 字段，形状文本主入口仍是画布双击；位置区编辑位置、尺寸和旋转；布局/排列区复用对象命令能力，提供置顶、置底、上移一层、下移一层、左/顶对齐、水平/垂直分布、成组和解组；线条/箭头端点区写入 `x/y/width/height`；路径区展示 SDK 画笔路径的点数，并用已有 `points` 生成简化后的 `path` 和节点范围，不解析任意外部 SVG path 字符串；外观区写入填充、描边、线宽、透明度、圆角、虚线和箭头头部；文本区写入文本颜色、字号、字重和对齐，并通过 `textStyleRuns` 写入斜体、文本装饰、行高和字距；当画布内联编辑态存在文字选区时，`textStyleRuns` 类字段只作用于选区片段。颜色字段使用色块、HEX 输入、最近色和常用色板共同编辑同一属性；最近色历史是属性面板本地 UI 状态，不写入 `SketchSceneDocument`。属性栏文本、数值和 HEX/color 连续输入首次有效变更前记录 history checkpoint，后续输入以非历史预览提交，blur 或 Enter 结束会话；一次 undo 会回到输入前状态，色板点击、reset 和分段枚举切换仍作为离散历史点。数值字段使用紧凑短标签，X/Y/W/H 等常用几何字段直接显示字段名，旋转、字号、线宽等长标签显示 R、T、S 等短标记，并通过 aria label 和 title tooltip 保留完整含义；数值字段支持 Arrow 微调、Shift+Arrow 快调、Alt/Option+Arrow 0.1 微调、`+10`、`*2`、`/2` 等相对表达式，以及拖拽字段标签进行 scrubber 调整；尺寸字段提供比例锁，锁定时改 W/H 会按当前宽高比同步另一边。字重、文本对齐、线型和箭头端点等枚举字段使用分段按钮呈现，并保留可访问的选择控件。关键样式字段支持独立 reset，reset 会删除对应 `style` 或 `textStyleRuns` key 并通过正常 scene patch/history 生效，不写入额外 UI 状态。多选时，属性面板只显示所有可编辑对象共同支持的 `style` 字段；混合值以“混合”提示呈现，批量写入会保留各对象原有的其他样式字段，不对不适用字段做隐式覆盖。导出区位于面板底部，当前提供 SVG 复制、选区 SVG 导出、整页 SVG 导出和 PNG 复制，并在导出前显示选区尺寸、PNG 输出尺寸、倍率和透明/白色背景模式；倍率、背景模式和导出状态提示属于属性面板本地 UI 状态，不写入 `SketchSceneDocument`。画布右键菜单提供同等的复制 SVG、复制 PNG、导出选区和导出整页入口。SVG 复制在文本剪贴板写入被浏览器阻止时降级为 SVG 下载；PNG 复制通过浏览器 canvas 将 SVG 输出栅格化，浏览器不允许图片剪贴板写入时降级为 PNG 下载，canvas 不可用时降级为 SVG 下载；属性栏 Export 区会显示复制成功或已下载的结果提示。选择对象后，画布会显示轻量悬浮快捷工具条；单选对象提供填充、描边、文本、复制样式和更多入口，多选对象提供左/顶对齐、水平分布、成组、复制、删除和更多入口。工具条只承载高频命令，完整命令仍来自命令面板、右键菜单和属性面板；内联文本编辑、拖拽、框选或绘制期间隐藏，位置按当前选区和视口换算，优先放在选区上方，顶部空间不足时放在下方。样式复制/粘贴使用独立样式剪贴板，按目标对象支持的字段应用填充、描边、线宽、虚线、透明度、文字样式、箭头端点和图片适配等外观字段，不把不适用字段强行写入目标对象。复制、删除、层级、对齐、分组等对象命令仍同时保留在悬浮快捷工具条、右键菜单、图层菜单、命令面板和快捷键中。
- 文本、便签、按钮、输入框、卡片和基础形状支持画布内联文本编辑；内联编辑框按对象文本区域定位，保留旋转、字号、字重、颜色、行高和文本对齐等显示线索，并按当前输入内容自动调整高度。形状对象的编辑框位于对象内边距区域，单行文本默认垂直居中，多行文本在可用高度内增长；内容超过可用高度时显示“文本超出”临时提示并在编辑框内滚动。提交后仍通过 scene patch 更新节点文本；内联编辑期间选中文字后再调整文本细样式，会生成局部 `textStyleRuns`。
- 展示节点配置绑定，并允许从属性面板移除绑定；新增配置字段仍由宿主写入 `config.schema.json`。

`sketch-core` 提供对象边缘、中心点和网格点的吸附计算服务，输出建议位移与参考线。吸附参考线、临时 modifier 状态和编辑器 hover 状态仍属于 React 编辑状态，不写入 `SketchSceneDocument`。连接器端点绑定属于协议字段，必须通过 `sketch-core` 校验；删除被连接目标时，patch reducer 会同步清理悬空绑定，避免只读渲染或后续编辑遇到无效引用。

质量护栏以 `@workbench/sketch-react` 单测和 sketch playground E2E 双层维护：单测覆盖属性栏 aria label、键盘微调、Enter 提交、连接器绑定和端点跟随等行为；playground E2E 维护编辑状态截图走查，并覆盖双击形状文本、属性栏修改、悬浮工具条、图层重命名、导出入口和 P0 编辑验收链路。playground Performance 面板提供 100、500、1000 节点基准入口，表格记录 render、selection、property panel、hit test、drag、input、translate、path render 和 hash 长度；Playwright 大文档性能用例会在 100、500、1000 节点下验证选择、属性栏渲染、拖拽和输入，并附加 `sketch-large-document-performance.json` 指标。

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
