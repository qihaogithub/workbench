---
covers:
  - packages/sketch-core/src/index.ts
  - packages/sketch-core/tests/sketch-core.test.ts
  - packages/sketch-react/src/index.tsx
  - packages/sketch-react/src/text-utils.ts
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

> 更新日期：2026-09-01

本文描述创作端手绘页面的自研 SDK 技术边界。业务侧定位见 [页面模块需求](../页面模块_需求文档.md)，底层文件协议见 [草图页面运行时](./04_草图页面运行时.md)。

## 1. 包边界

草图绘图能力由三个 workspace 包维护：

| 包 | 职责 |
|:---|:---|
| `@workbench/sketch-core` | 维护 `SketchSceneDocument` 协议、scene 校验、patch reducer、配置绑定、几何计算、吸附计算、命中测试、视觉 hash 和 SVG/HTML 只读渲染。 |
| `@workbench/sketch-react` | 提供受控 React 编辑组件、预览组件、编辑状态机、画布、工具栏、图层列表、属性检查面板、命令面板和快捷键帮助。 |
| `@workbench/sketch-playground` | 提供独立白板体验与浏览器验证环境，默认打开空白画布，不依赖创作端登录或项目会话。 |

`packages/shared` 保留草图协议的兼容导出，但新服务端代码优先直接依赖 `sketch-core`。需要编辑能力的前端代码依赖 `sketch-react`；只读使用端优先依赖 `sketch-react/preview`，避免加载编辑器交互代码。

创作端手绘入口仍由 `NEXT_PUBLIC_SKETCH_SCENE_AUTHORING_ENABLED` 控制。该开关只控制创作端是否允许编辑和写入手绘 scene，不改变 `sketch-core`、`sketch-react` 和 `sketch-playground` 的保留路线。

## 2. 数据与渲染流

手绘页面的权威数据始终是 `SketchSceneDocument`。编辑器只产生更新后的 scene 或 scene patch，不把 React 状态、DOM 结构或宿主 UI 状态写入存储格式。

默认 scene、外部导入 scene、服务端 patch 结果和只读渲染输入都必须通过同一份协议校验。无效 scene 不能进入编辑状态；只读渲染遇到无效节点时可以使用安全 fallback，但应尽量保留宿主传入的合法页面尺寸，避免截图、预览或视觉 hash 看到错误画幅。

只读渲染统一从 `sketch-core` 生成 SVG/HTML。author-site 预览、viewer-site、screenshot-service 和 playground 使用同一套解析、配置绑定和视觉 hash 规则。视觉 hash 以最终 SVG 输出为准：不会影响画面的 metadata、未使用配置字段或隐藏对象不应触发截图重建；实际改变 SVG 的配置值必须改变 hash。

`sketch-core` 的命中测试与只读渲染保持同一套可见性和配置绑定规则。线条和箭头按起止点线段和描边宽度容差命中；画笔路径如果带有 SDK 采样的 `points`，按相邻采样点线段命中，不把整个路径包围盒都视为可点击区域；图片命中仍受 `src` 或 `src` 绑定解析结果影响，未解析出图片源时不会参与命中。

## 3. 编辑器宿主

创作端编辑页使用 `SketchEditorEngineHost` 承接自研 SDK。host 只负责把当前页面 scene、配置数据和预览尺寸传给 `sketch-react`，并把 `onSceneChange` 写回编辑页状态；主工具栏、选区上下文栏与锚定气泡菜单共享同一个 `useSketchEditorState` controller，不再以固定侧栏压缩画布。

当前没有双引擎选择。`resolveSketchEditorEngine` 只会在单页预览、当前页面为 `sketch-scene`、用户进入手绘编辑态且没有查看知识文档时返回 `native`；其他情况返回 `null`。项目级和用户级 `authoringPreferences.sketchEditorEngine` 只接受 `native`，历史持久化中的其他值读取时会被忽略，不再写回新项目。

编辑器能力包括：

- 底部居中的主工具栏提供选择、抓手、矩形、菱形、圆形、线条、箭头、画笔、文本、图片、便签、橡皮、撤销和重做；画布保持浅色点阵背景，缩放、适配页面与命令入口位于右下角。复制、删除、置顶、置底、锁定、显隐、对齐和分布等对象命令不在主工具栏重复展示。
- 对象命令、视图命令、工具命令、样式命令和历史命令由 SDK 内部 action registry 统一组织。右键菜单、命令面板、快捷键和帮助面板读取同一批动作定义，确保命令名称、禁用条件和快捷键提示一致。
- 命令面板支持搜索工具与对象命令，并只允许执行当前状态可用的命令；不可执行命令保留在结果中并展示禁用原因。快捷键帮助从 action registry 生成，不单独维护重复文案。
- 矩形、菱形、圆形、线条、箭头、便签、图片和画笔使用 pointer draft 流程创建：按下记录起点，移动期间只显示预览或采样点，释放后一次性提交 scene；普通点击不会再创建固定尺寸的矩形、菱形、圆形、线条、箭头、便签、图片或画笔路径。
- 画笔使用 `path` 节点和 `points` 字段表达自由路径；只读 SVG 渲染、校验和 patch 流程仍以 `SketchSceneDocument` 为唯一权威。当前不做自动平滑，避免隐式改变用户轨迹；属性面板提供显式路径简化，简化结果仍写回 `points` 和 `path`。
- 箭头头部使用 `style.startArrow` 和 `style.endArrow` 表达，取值为 `none` 或 `arrow`。历史箭头节点如果未设置 `endArrow`，只读渲染仍按终点箭头处理；显式设置 `endArrow: "none"` 可渲染为无线头，设置 `startArrow: "arrow"` 可形成双箭头。
- 文本工具支持在画布中创建空文本节点并进入内联编辑；新建文本默认使用 24px、500 字重、`#111827`，默认宽度按“输入文本”的实际测量宽度、默认高度按单行行高计算。新建临时纯文本在空提交或取消时会删除，不留下空文本对象；既有文本、便签、按钮、输入框和卡片仍支持双击内联编辑。
- 纯文本节点单选时显示专用上下文工具栏，顺序固定为“字号｜加粗 / 斜体 / 下划线｜文字颜色｜对齐方式｜层级｜更多”。字号允许 1–512 的正整数并提供常用值；对齐菜单提供左、居中、右三种节点级对齐；“层级”复用置顶、上移一层、下移一层和置底菜单；“更多”复用删除、剪切、复制、复制样式、粘贴样式和位置与大小菜单。形状节点继续使用原有“填充｜描边｜文本｜层级｜更多”工具栏。
- 纯文本细样式继续复用 `textStyleRuns`。内联编辑时有文字选区，字号、加粗、斜体、下划线和文字颜色只写入选区对应的 run 片段；没有选区时写入节点默认样式，供后续输入继承；对齐始终写入节点级 `style.textAlign`。样式显式关闭值（如 `italic: false`、`textDecoration: "none"`）会通过协议校验并由 SVG 渲染保留。文本颜色面板只提供预设色和原生自定义颜色，不提供“无颜色”，不会写入 `transparent`；图形填充/描边仍沿用原有可选“无颜色”面板。
- 矩形、菱形、圆形、便签、按钮、输入框和卡片新建后只保留可读 `name`，不写入默认显示文案。形状内文本复用节点 `text` 字段，不新增子节点或外部绑定协议；用户双击对象任意可见区域即可进入画布内联输入，命中路径同时支持 SVG 节点标记和 `sketch-core` 几何命中测试。形状编辑框按当前输入行数调整高度，并在形状对象的内边距区域内垂直居中；多行内容超过形状可用高度时显示“文本超出”提示，编辑框内部滚动，形状尺寸和 scene 协议不自动改变。空文本形状提交空内容时只保持空 `text`，不会删除形状；锁定、运行时隐藏和预览态对象不会进入内联编辑。只读 SVG 渲染只在 `text` 或文本绑定有值时输出居中标签；节点 `name` 继续用于对象识别，和显示文本分离。
- 图片工具在 SDK 内提供两类入口：拖拽定界可创建图片占位节点；点击画布选择图片文件、拖入图片、粘贴图片或在属性面板替换图片时，会把图片转成 data URL 写入 `image.src`，并把文件名写入 `alt`。拖拽图片文件到既有图片节点会替换该节点 `src/alt`，并保留尺寸、圆角、配置绑定和层级顺序；拖拽到空白区域仍创建新图片节点。图片地址和 alt 文本仍可在属性面板编辑；属性面板的“裁剪/适配”和画布双击图片后的裁剪/适配编辑条都会写入 `style.imageFit`，控制只读 SVG 的显示策略，支持 `cover`、`contain` 和 `fill`，分别对应裁切填满、完整显示和拉伸填满。属性面板 Image 区显示图片来源、估算资源大小和超过 2 MB 的提示；这些状态是从当前 `src`/绑定派生的 UI 信息，不写入 scene。当前不保存 crop rect、焦点偏移或图片局部裁剪框；后续若加入真实裁剪态，需要扩展 scene 协议、校验、渲染和 patch 摘要。编辑器能识别图片源未设置或绑定未解析状态；对已解析但浏览器加载失败的图片，预览层会在图片范围内叠加“图片加载失败”。上传、资产引用和文件大小治理不属于当前 SDK 内部入口。
- 新建矩形、菱形、圆形、线条、箭头、画笔路径、文本、图片和便签都会写入可读 `name`，但 `name` 不作为画布显示文本兜底；只有用户输入的文本、绑定解析结果和图片 `alt` 等内容会作为可见或可推断内容保留。通过文件导入的图片使用文件名作为 `name` 和 `alt`，便于 Agent 在 scene JSON 中定位对象。
- 绘制过程中的 draft 不写入 scene；`pointerup` 提交后才生成正式节点 id。后续移动、缩放、旋转、端点编辑、属性面板修改、锁定、显隐和绑定更新都通过既有节点 id 做 patch，不因编辑动作替换 id。
- 橡皮工具按一次 pointer 流批量删除命中对象，跳过锁定、隐藏或运行时配置隐藏的对象。
- 画布缩放、滚轮平移、适配页面、缩放到选区和 Space 临时平移；这些只属于编辑器视口状态，不写入 `SketchSceneDocument`。
- 编辑器 stage 始终以 `SketchSceneDocument.pageSize` 作为场景坐标空间；`fillContainer` 只控制预览内容填充宿主容器，不改变 stage 的坐标基准。指针位置按当前 stage 在视口缩放和平移后的实际尺寸反算回 scene 坐标，使窄屏、缩放、平移和反向拖拽保持一致的几何比例。
- 选择工具在 hover 非选中对象时显示轻量高亮；选中对象显示边界、中心点、旋转手柄和 resize handles。选区控制柄统一使用白板 Light 视觉：旋转手柄固定在选区左下角外侧，是白底、浅灰边框的圆形回转箭头按钮；缩放锚点是白底、浅灰边框并带轻阴影的控制点，和蓝色选区边界形成清晰对比。控制柄按 viewport 反向缩放，保持屏幕尺寸和选区外间距稳定，选区边框仍随画布缩放。重叠对象命中时，Cmd/Ctrl 点击会按当前 zIndex 和视觉层级顺序在候选对象间循环选择，解决只能选中最上层对象的问题。语义 group 支持画布钻取：双击组内可见子节点进入组内子节点选择，Esc 返回上一级 group 选择；已经处于该 group 内时再次双击子节点会回到原有文本内联编辑路径。画布快捷键作用域内，Tab/Shift+Tab 会在可见非 group 对象之间前后循环选择；处于 focused group 时仅在该 group 的可见子节点中循环。拖动 line/arrow 端点时，画布会在可连接对象的四边中点和中心点显示候选连接点，并在端点释放到 12px 容差内时写入端点绑定。移动对象时，画布会按页面中心、可见对象中心和同侧边缘显示参考线，并在 4px 场景阈值内自动吸附；网格参考线只作视觉提示，不参与吸附，也不再提供间距参考线。缩放与旋转不启用该自动吸附，Cmd/Ctrl 会同时暂停吸附并隐藏参考线；参考线保留无障碍标签，但不显示“网格”“边缘”“中心线”等视觉文字。Shift/Alt/Option 等拖拽 modifier 提示显示在画布上。空白处拖拽是矩形框选入口，拖拽期间显示虚线选区和“矩形框选”提示；当前不提供自由套索工具，也不扩展 lasso 形状协议。单选、多选、框选、拖拽、缩放、Shift 等比缩放、画布旋转手柄、线条/箭头端点编辑、复制、删除、层级置顶/置底/上移一层/下移一层、左/顶对齐、水平分布和垂直分布都属于编辑器交互层能力；hover 高亮、中心点、控制柄、重叠候选、focused group、Tab 导航、连接候选点、吸附参考线、modifier 提示、框选框和框选提示不写入 `SketchSceneDocument`，端点绑定、对象移动后的连接线几何和手动端点编辑导致的解绑会写入 scene。
- 线条和箭头端点仍用 `x/y/width/height` 表达起点和终点，同时可用 `connections.start` 和 `connections.end` 持久化端点绑定。每个端点绑定保存 `{ nodeId, anchor }`，`anchor` 取 `top`、`right`、`bottom`、`left` 或 `center`，目标只能是可连接的非 group、非线条、非箭头、非 path 对象。拖动被连接目标时，编辑器会按目标锚点实时更新 line/arrow 几何，并在属性面板 Line/Connector 区显示起点或终点绑定状态。手动编辑端点数值会清除对应端点绑定；删除目标节点时，patch reducer 会清理指向该节点的端点绑定。
- 选择工具支持按住 Alt 拖动复制对象：拖动开始时保留原对象，首次有效移动时插入副本并移动副本，一次撤销会移除本次复制结果。
- 锁定、隐藏、撤销、重做、方向键微调、全选、复制、粘贴、复制副本和对象属性编辑。
- 画布右键菜单复用同一套对象命令，支持复制、删除、置顶、置底、上移一层、下移一层、锁定、解锁、显示、隐藏、左对齐、顶对齐、水平分布、垂直分布、成组和解组；只读预览态不会打开该菜单。右键按下不会触发对象拖拽或框选（Stage `onPointerDown` 对非主键只 `preventDefault` 并返回，避免右键误启动拖拽并持有 pointer capture 导致菜单无法点击/关闭），菜单通过 portal 渲染在 `document.body` 上的 backdrop（z-9998）之上（z-9999），点击菜单外任意位置关闭菜单。
- 图层列表按视觉层级展示对象，并优先使用节点 `name` 作为管理标签；没有 `name` 时才回退到画布文本或类型。完整图层列表的搜索筛选、重命名、拖放排序、状态徽标和右键命令保持不变，且不写入 `SketchSceneDocument`；单选上下文工具栏的“层级”入口只提供置顶、上移一层、下移一层和置底，不展开完整图层列表。
- 属性面板继续提供通用、内容、位置、布局/排列、线条/连接器、路径、外观、文本、图片、绑定和导出区域，并保留所有既有字段校验、连续输入 history 和多选共同样式规则。单选图形上下文工具栏固定为“填充｜描边｜文本｜层级｜更多”，纯文本节点改用“字号｜加粗 / 斜体 / 下划线｜文字颜色｜对齐方式｜层级｜更多”，两者都不把复制样式和属性作为顶部独立入口；“更多”按删除、剪切/复制、复制样式/粘贴样式、位置与大小四组展示。填充、描边点击后展开白板 Light 风格颜色菜单，常用颜色、自定义颜色和“无颜色”均可选；“无颜色”使用 `transparent` 场景语义并以斜杠/棋盘格和白色区分。纯文本颜色菜单不提供“无颜色”。位置与大小打开无标题、无关闭文案的紧凑二级面板，按截图式两列布局提供“水平位置”“垂直位置”“宽度”“高度”四个数值输入和宽高比例锁定入口，不加入旋转字段。
- 单选上下文工具栏及其颜色、层级、更多和位置与大小菜单统一使用白色背景、浅灰边框、深色文字、轻阴影和浅色 hover；菜单采用图标、名称、必要快捷键的单列列表，不展示标题、返回、关闭或完成文案。删除、剪切、复制样式、粘贴样式和层级操作复用现有 scene patch、撤销和样式剪贴板能力；粘贴样式只写入目标支持的外观字段，不改变内容、位置、尺寸、层级或绑定，未复制样式或目标不可编辑时禁用。菜单默认定位在工具栏下方，空间不足时翻转到上方；点击外部或 Escape 关闭并保留对象选中状态，打开后首个可用项获得焦点，并支持 Tab、方向键、Enter 和 Space。工具条水平位置默认以选区中心为锚点，并按工具条实际宽度限制在画布容器的左右 16px 安全边距内；选区靠近左侧时整体向右移动，靠近右侧时整体向左移动，不改变按钮内容、顺序或布局。若工具条固有宽度大于画布可用宽度，单纯移动位置无法同时满足两侧安全边距，仍保持原有工具条内容和布局。工具条优先定位在选区上方，顶部空间不足时放在下方，内联文本编辑、拖拽、框选或绘制期间隐藏。
- 纯文本、便签、按钮、输入框、卡片和基础形状支持画布内联文本编辑；纯文本编辑框没有形状内边距，按显式换行分行且不自动换行，宽度取最长行实际测量宽度，高度取所有文本行行高总和，输入、字号和文字样式变化时实时收缩或扩展，`x/y` 保持不变并从左上角向右下方增长。空文本或仅换行内容保留可编辑的最小基准宽度。Enter 在纯文本中换行，失焦一次性提交文本、默认样式、style runs 和宽高，Escape 取消；更多和层级菜单打开前会先提交草稿。形状编辑框仍按对象文本区域定位，保留旋转、字号、字重、颜色、行高和文本对齐等显示线索，按当前输入行数调整高度，在形状对象的内边距区域内垂直居中，内容超出可用高度时显示“文本超出”临时提示并在编辑框内滚动，Enter 仍保留原有提交行为。
- 展示节点配置绑定，并允许从属性面板移除绑定；新增配置字段仍由宿主写入 `config.schema.json`。

`sketch-core` 的几何能力仍用于边界计算；本轮移动吸附的页面中心、同侧边缘/中心候选、参考线展示和 modifier 状态由 React 编辑状态统一计算，且不写入 `SketchSceneDocument`。连接器端点绑定属于协议字段，必须通过 `sketch-core` 校验；删除被连接目标时，patch reducer 会同步清理悬空绑定，避免只读渲染或后续编辑遇到无效引用。

质量护栏以 `@workbench/sketch-react` 单测和 sketch playground E2E 双层维护：单测覆盖上下文工具条、纯文本工具栏、选区样式 run、实时自适应尺寸、层级/颜色/对齐菜单、缩放稳定控制柄、菜单自适应锚点、移动吸附（含网格不吸附、Cmd/Ctrl 暂停、无参考线文字、无间距线）、键盘微调、Enter 行为、连接器绑定和端点跟随、主工具栏 200ms Tooltip 等行为；playground E2E 覆盖空白画布、底部工具栏、图形选区编辑、缩放稳定控制柄、菜单定位、双图形对齐吸附与无间距线、主工具栏 Tooltip、纯文本完整编辑流程、图层气泡、缩放和内联文本编辑。性能基准属于自动化测试与开发诊断，不再作为 Playground 的常驻用户界面。

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
