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
  - packages/shared/src/types.ts
  - packages/shared/src/workspace.ts
  - packages/project-core/src/types.ts
  - packages/project-core/src/service.ts
  - packages/project-core/src/__tests__/service.test.ts
  - packages/author-site/src/lib/api.ts
  - packages/author-site/src/lib/authoring-feature-flags.ts
  - packages/author-site/src/lib/sketch-editor-engine.ts
  - packages/author-site/src/lib/sketch-editor-engine.test.ts
  - packages/author-site/src/lib/user-authoring-preferences.ts
  - packages/author-site/src/lib/__tests__/user-authoring-preferences.test.ts
  - packages/author-site/src/app/api/user/authoring-preferences/route.ts
  - packages/author-site/src/components/settings/settings-button.tsx
  - packages/author-site/src/lib/openpencil-adapter.test.ts
  - packages/author-site/src/app/api/openpencil/image-proxy/route.ts
  - packages/author-site/src/app/api/openpencil/image-proxy/route.test.ts
  - packages/author-site/src/lib/editor-diagnostics/types.test.ts
  - packages/shared/src/diagnostics.ts
  - packages/shared/src/openpencil-adapter.ts
  - packages/shared/package.json
  - packages/sketch-openpencil-editor/src/adapter.ts
  - packages/sketch-openpencil-editor/src/index.ts
  - packages/sketch-openpencil-editor/tsconfig.sdk.json
  - packages/author-site/src/app/api/demos/[id]/route.ts
  - packages/author-site/src/app/api/projects/[projectId]/resources/[kind]/[resourceId]/versions/route.ts
  - packages/author-site/src/app/api/projects/[projectId]/resources/[kind]/[resourceId]/versions/route.test.ts
  - packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts
  - packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.test.ts
  - packages/author-site/src/app/demo/[id]/edit/components/SketchEditorEngineHost.tsx
  - packages/author-site/src/app/demo/[id]/edit/components/OpenPencilSpikeFrame.tsx
  - packages/author-site/src/app/demo/[id]/edit/components/OpenPencilSpikeFrame.test.tsx
  - packages/author-site/src/app/demo/[id]/edit/lib/openpencil-patch-summary.ts
  - packages/author-site/src/app/demo/[id]/edit/lib/openpencil-save-error.ts
  - packages/author-site/src/app/demo/[id]/edit/hooks/useVersionControl.ts
  - packages/author-site/src/app/demo/[id]/edit/page.tsx
  - packages/author-site/src/app/demo/[id]/edit/__tests__/openpencil-patch-summary.test.ts
  - packages/author-site/src/app/demo/[id]/edit/lib/openpencil-save-error.test.ts
  - packages/author-site/src/app/demo/[id]/edit/__tests__/useVersionControl.test.tsx
  - packages/agent-service/src/routes/collab.ts
  - packages/agent-service/src/collab/workspace-file-persistence.ts
  - packages/agent-service/tests/unit/collab-room-manager.test.ts
  - packages/sketch-openpencil-editor/src/OpenPencilSpikeApp.vue
  - packages/sketch-openpencil-editor/vite.config.ts
  - packages/sketch-openpencil-editor/scripts/check-openpencil-assets.mjs
  - packages/sketch-openpencil-editor/package.json
  - packages/author-site/tsconfig.json
  - test/sketch-playground/sketch-playground.spec.ts
  - test/openpencil-spike/openpencil-spike.spec.ts
  - test/openpencil-spike/playwright.config.ts
  - test/创作端E2E回归测试/openpencil-author-regression.spec.ts
  - test/创作端E2E回归测试/openpencil-author.playwright.config.ts
  - test/创作端E2E回归测试/support/e2e-auth.ts
  - test/创作端E2E回归测试/sketch-page-regression.spec.ts
---

# 草图绘图 SDK

> 更新日期：2026-07-06
> 适用模块：手绘页面运行时（当前底层仍为 `SketchSceneDocument`）、独立 SDK 开发环境、未来创作端接入准备

## 1. 包边界

草图绘图能力拆成三个 workspace 包：

| 包 | 职责 |
| :--- | :--- |
| `@workbench/sketch-core` | 维护 `SketchSceneDocument` 协议、scene 校验、patch reducer、配置绑定、几何计算、命中测试、视觉 hash 和 SVG/HTML 只读渲染 |
| `@workbench/sketch-react` | 提供受控 React 预览与编辑组件、编辑状态机、selection/history hooks，以及可拆分挂载的画布、浮动工具栏、图层列表和属性检查面板 |
| `@workbench/sketch-playground` | 提供独立开发 app，用与创作端手绘编辑态同源的编辑部件验证 SDK，同时保留 fixtures、JSON、配置数据和性能入口，不依赖创作端登录或项目会话 |

`packages/shared` 和 `packages/demo-ui` 仍保留旧导出路径，但它们只是兼容层。新服务端代码直接依赖 `sketch-core`；需要编辑器的前端代码依赖 `sketch-react`；只读使用端优先依赖 `sketch-react/preview`，避免加载编辑器交互代码。创作端接入在 SDK 开发完成前默认暂停，author-site 通过 `NEXT_PUBLIC_SKETCH_SCENE_AUTHORING_ENABLED` 控制是否开放入口与 API。

## 2. 数据与渲染流

手绘页面的权威数据当前始终是 `SketchSceneDocument`。编辑器只产生 scene patch 或更新后的 scene，不把 React 状态、Moveable/Selecto 状态或 DOM 结构写入存储格式。

默认草图 scene 也必须遵守同一份协议校验。`createDefaultSketchScene` 接收任意正数页面尺寸时，都要生成正尺寸节点，并尽量把默认标题和便签放在页面内；小画布、缩略图或测试 fixture 不能因为固定边距导致默认 scene 本身无效。

只读渲染遇到无效 scene 时也要保留输入里合法的页面尺寸。渲染层可以用默认内容替换非法节点集合，但不能因为单个非法节点把 `320×180`、缩略图或其他宿主传入尺寸突然退回全局默认画布，否则截图、使用端预览和视觉 hash 会看到错误画幅。HTML 预览文档还需要先验证宿主传入的 `previewSize`，再回退到 scene 里的合法 `pageSize`，最后才使用全局默认尺寸；外层 CSS 尺寸和内部 SVG fallback 必须使用同一份安全尺寸，不能输出 `NaNpx`、负数宽高或 wrapper 与 SVG 画幅不一致的预览。

React 主入口和轻量 preview 入口在接收外部 scene 时，必须先完成协议校验再进入渲染、选区和属性层。如果传入 scene 不是合法 `SketchSceneDocument`，入口层应使用有效默认 scene 兜底，并尽量沿用合法的页面尺寸；不能让 SVG 渲染看到 fallback 内容，而图层、选区或属性面板继续基于无效节点工作。

配置绑定后的可见性也属于画布交互边界。`visible` 绑定解析为 false 时，只读 preview 不能为该节点绘制外部选框；编辑画布即使从图层面板选中了该节点，也不能显示选框、缩放手柄、框选命中、拖拽移动或方向键移动，属性面板也只能查看而不能写入内容、位置、尺寸、旋转、填充或绑定。工具栏同样要按配置后的可见性禁用写入类动作：配置隐藏对象不能被复制、删除、锁定、切换基础 visible、层级调整、对齐或分布；静态隐藏对象仍可通过显示隐藏按钮恢复。分组选中后展开复制或删除 children 时，也必须按同一份配置数据过滤子层：配置隐藏子层不能被复制出来，也不能因为删除父 group 被误删。controller 对宿主派发 selection 时也必须用同一份配置数据计算可见 bounds：图层选择仍可保留节点 id，但配置隐藏对象的 bounds 必须为 `null`；如果宿主每次渲染传入新的 `configData` 对象但选区结果没有变化，SDK 不能重复派发相同 selection 造成渲染循环。底层 `hitTestSketchScene` 接收配置数据时也必须按同一份绑定结果过滤命中目标，避免 SDK 消费方点中最终 SVG 中不存在的对象。图层行仍可保留对象入口，方便用户理解 scene 结构，但画布上的可见性必须和最终 SVG 输出一致。

只读渲染统一从 `sketch-core` 生成 SVG/HTML。screenshot-service、viewer-site、author-site 预览和 playground 都使用同一套解析、绑定和视觉 hash 规则。视觉 hash 必须以最终 SVG 输出为准：不影响画面的 metadata、未使用配置字段、隐藏 group 或其他不会渲染的协议字段不能触发截图重建；已绑定并实际改变 SVG 的配置值必须改变 hash。SVG 文本节点和控件标签的多行 `tspan` 必须沿用当前文本锚点，不能把子行重置到画布 `x=0`，否则编辑态和截图会出现文本横向漂移。按钮、输入框、卡片、便签等由外框和标签组成的控件，内部标签必须继承外框的透明度和旋转 transform，否则旋转控件会出现外框转动但文字留在原位的错位。箭头节点的 marker 必须跟随线条 stroke 渲染，不能在 `<defs>` 中写死箭头头部颜色，否则配置绑定或样式修改后会出现箭身与箭头头部颜色不一致。只读预览的外部选中框只能根据可见节点计算；按钮、卡片等控件内部文字需要保留可回溯到父节点的命中标记，轻量 `@workbench/sketch-react/preview` 入口也必须遵守同一规则。重叠对象的命中测试必须与 SVG 绘制顺序一致：优先命中更高 `zIndex`，相同 `zIndex` 时以后绘制的节点为上层；带旋转的节点要按旋转后的视觉几何命中，不能继续使用未旋转的原始外接矩形判断。

Scene patch reducer 是服务端、Agent 和编辑器共享的最后一道写入门槛。`add`、`update`、`duplicate`、`group`、`set-locked` 和 `set-visible` 这类会生成候选节点集合的操作必须通过 scene 校验后才提交；非法几何、非有限坐标、协议外节点类型或会让整份 scene 无效的节点变更应被跳过，不能把有效 scene 污染成只读渲染 fallback。scene 协议层要求所有节点的 `x`/`y` 坐标非负，防止 Agent、服务端 patch 或外部 JSON 绕过编辑器清洗，把对象写到页面左上边界之外。`path` 节点必须包含非空路径数据；缺少路径数据的节点不能通过校验，也不能在只读渲染中退化成普通矩形。`image` 节点必须包含非空静态 `src`，或声明 `src` 配置绑定；如果绑定在当前配置数据中没有解析出字符串图片地址，最终 SVG 不输出图片，core 命中测试、主 preview 和轻量 preview 的选区 bounds 也必须把该图片当作不可见对象处理。编辑器写入入口也必须沿用同一份运行时可渲染性判断：工具栏按钮、键盘复制/删除、锁定、显隐切换，以及分组复制或删除展开 children 时，都不能改写这类未渲染图片。`add` 只表示新增不存在的节点 id；如果候选节点 id 已存在，必须跳过该 patch，不能把已有对象静默替换成另一种类型或另一份几何。无效 patch、目标不存在的 patch 或与当前节点集合完全一致的 patch 不应刷新 scene，也不应更新 `updatedAt`；React 编辑器 history 只记录实际替换了 scene 的操作，避免撤销栈出现没有视觉变化的空历史步。`add` 和 `duplicate` 生成的新对象默认进入当前层级顶部，避免新画或复制出的对象被旧 `zIndex` 压在已有对象下面。`reorder` 不只调整节点数组顺序，还必须把新顺序写回连续的 `zIndex`，保证工具栏层级命令、只读渲染、视觉 hash 和图层面板看到同一个层级结果；`reorder.nodeIds` 可以是局部重排列表，但必须非空、不能重复、且每个 id 都存在，否则跳过 patch，不能因为空列表或未知 id 把现有层级归一化成另一组 `zIndex`。

节点样式、配置绑定和运行时可选字段也属于协议校验边界。`rotation`、`zIndex` 必须是有限数，`locked`、`visible` 必须是布尔值；`style` 中的数值字段必须是有限数，虚线数组只能包含非负有限数；`bindings` 只能把协议支持的属性映射到字符串形式的配置字段名。渲染时配置数据还必须匹配被绑定属性的值类型：`visible` 只接受布尔值，`text`、`src`、`fill`、`stroke`、`color` 和 `variant` 只接受字符串；类型不匹配时回退到节点原值，不能把对象、数组、数字或字符串 `"false"` 直接写进 SVG。编辑器或 Agent 通过 patch 写入这些字段时同样要先形成候选 scene 并通过校验，避免非法状态进入 SVG 输出、排序或视觉 hash。

`group.children` 是节点之间的引用关系，而不是自由文本列表。只有 group 节点能声明 children；每个 group 必须至少引用一个 child；每个 child id 必须指向当前 scene 中存在的节点，不能引用自身，不能在同一 group 内重复出现，也不能形成 group 到 group 的循环引用。`group`、`delete` 和 `ungroup` 这类会改变节点集合的 patch 必须通过校验后才提交，并在删除节点时同步清理其他 group 中的 child 引用，避免图层语义和只读渲染看到悬空分组。当删除最后一个 child 后，空 group 必须被移除，不能作为隐藏空图层继续留在 scene 中；如果多层 group 因此连续变空，清理需要向上级联，并从仍保留的父 group.children 中移除被清理的 group 引用。底层 `ungroup` 只允许移除目标 group 节点并保留 children；如果目标不是 group，必须作为无效 patch 跳过，不能误删普通绘图对象。语义 group 可以承载线条或箭头带来的零宽或零高选区，但仍必须保持非负几何、至少一个轴有长度、隐藏且未锁定。scene 校验层要求 group 明确 `visible: false` 且不能 `locked: true`；只读渲染层也必须忽略 group 自身，即使 group 的 `visible` 绑定被配置数据解析成 true，也不能输出额外图形、命中测试目标或可见选区 bounds。底层 `set-visible` / `set-locked` patch 和编辑器工具栏都不能把 group 自身变成可见图形或可锁定对象。混选 group 与普通节点时，可见性和锁定切换只作用于普通节点。图层列表和属性面板优先展示节点 `text`，没有文本时展示 `name`，最后才回退到类型名，确保被命名的分组可被识别。

## 3. 编辑器能力

`SketchPageEditor` 是兼容旧用法的受控组合组件。宿主传入 `scene`、`configData` 和 `previewSize`，编辑器通过 `onSceneChange` 输出下一份 scene，通过 `onSelectionChange` 输出当前选择态。

`mode="preview"` 是只读模式，只显示画布内容与选中反馈，不渲染编辑工具栏或属性编辑面板，也不能通过快捷键、画布指针或旁路控件写入 scene。需要修改 scene 的宿主必须显式使用 `mode="edit"`。

选择态回调必须基于最终渲染后的 scene 派发。新增、复制、粘贴等操作会先产生新节点再选中新节点，不能在 setter 中用旧 scene 即时计算 bounds，否则宿主会收到空选区并导致外部属性面板或联动逻辑短暂失真。撤销、重做或外部受控 scene 替换后，选择态必须自动过滤当前 scene 中不存在的节点 id，避免工具栏和宿主继续认为已选择被删除对象。选择事件中的 `nodeIds` 保留图层面板当前选中的对象，包括隐藏对象和语义 group；`bounds` 只描述当前可见选区，隐藏对象或语义 group 单选时必须返回 `null`，避免宿主在画布外层绘制不存在的可见选框。可见选区的 bounds 必须来自节点渲染后的视觉外接框，带旋转的节点不能继续把未旋转的原始矩形暴露给宿主或选框。宿主回调函数身份变化不能单独触发重复选择派发，SDK 只在选择态本身变化时通知宿主。宿主直接替换 scene 时，编辑器 history 必须清空当前撤销/重做栈；同一个 controller 不能把上一个 fixture、页面或项目的历史带到新 scene 中。

面向未来创作端三栏布局时，宿主使用 `useSketchEditorState` 创建同一份编辑 controller，再分别挂载 `SketchEditorCanvas`、`SketchEditorToolbar`、`SketchLayerPanel` 和 `SketchPropertyPanel`。这样中间栏只承载页面画布和浮动工具栏，左侧栏显示手绘对象图层，右侧栏显示当前对象属性；手绘页面编辑态与高保真页、原型页的单页编辑框架保持一致。图层面板的显示顺序必须跟只读 SVG 渲染、命中测试和层级命令共享同一套视觉层级规则：高 `zIndex` 位于上方，相同 `zIndex` 时后绘制的节点位于上方。

共享编辑部件的交互外观对齐 Figma 式设计工具：深色工作区承载画布，选中态使用蓝色高亮，工具栏以底部浮动工具组呈现，属性面板按 Design inspector 的 Content、Position、类型适配颜色、Bindings 等分区组织。创作端和 playground 不应各自维护两套视觉控件。

拆分挂载后的编辑器快捷键必须带有当前编辑器作用域。`SketchEditorCanvas` 负责注册可响应快捷键的编辑器，画布、图层面板、工具栏和属性面板的用户操作都会激活同一个 controller；当页面上同时存在多个草图编辑器时，Delete、方向键、复制和粘贴只作用于最近激活的编辑器，不能把隐藏编辑器、并排预览或另一个页面实例中的选区一并改掉。只有页面上只存在一个编辑器且尚无显式激活对象时，才允许沿用单编辑器默认快捷键行为。

当前编辑器支持：

- 绘制矩形、圆形、线条、箭头、文本、图片、便签、按钮、输入框和卡片占位。
- 单选、多选、框选、拖拽、缩放、旋转、复制、删除、层级调整、左/顶对齐和水平分布。
- 锁定、隐藏、撤销、重做、方向键微调和对象属性编辑。
- 展示节点配置绑定，并从属性面板移除绑定；新增配置字段仍由宿主负责写入 `config.schema.json`。

拖拽和缩放属于连续指针操作：编辑器在移动对象、框选或拖动缩放手柄开始时捕获当前 pointer，结束或取消时释放，保证用户把指针拖出画布或工具按钮范围后仍能继续收到移动和松手事件，避免交互状态卡住。编辑器在首次产生有效位移时记录拖拽前 scene，移动过程只更新当前画面，松手后撤销会一次性回到拖拽前位置，避免一次拖动产生大量历史记录。如果指针移动没有让 scene 发生实际变化，不能创建空撤销历史步。指针坐标必须先通过舞台尺寸和有限数值校验，校验失败时不写入 scene，防止 `NaN` 坐标污染草图协议并触发只读渲染 fallback。方向键微调和画布拖拽共享同一套平移规则，移动后的 X/Y 不能小于 0；线条和箭头还必须同时保持 `x + width` / `y + height` 终点不小于 0，平移夹取只能收缩本次位移，不能改写有向向量本身，避免负向线段被快捷键或拖拽推到页面左上边界之外后触发 scene 校验失败。多选平移必须先用整个可编辑选区计算一次有效位移，再把同一个位移应用到所有对象，不能让靠近页面原点的对象单独停住而其它对象继续移动，导致选区内部相对位置被拉散。控件内部标签文本必须能反查到所属草图节点，用户点在卡片标题或按钮文字上时仍应选中和拖拽整个对象；线条和箭头的点选命中需要按线段距离和描边宽度留出容差，不能要求用户精确点在零高度或零宽度的几何线上；线类对象即使几何 bounds 某一维为 0，也必须显示有最小可视尺寸的选框；未旋转线条和箭头单选时，resize 手柄应显示在起点和终点上，避免用八向矩形手柄误导用户；拖拽线类端点时必须保持另一端锚定，并在当前有向向量协议允许的范围内更新线段，端点拖过另一端时也要保留新的方向，不能把向左或向上的箭头归一化成向右或向下；框选线条和箭头时必须判断框选区域是否真正碰到线段，不能只看线类对象的外接矩形，否则斜线外接框角落会被误选；框选带旋转的普通节点时必须判断框选区域是否碰到旋转后的视觉多边形，不能只看旋转后的外接矩形角落；左/顶对齐和水平分布必须按旋转后的视觉 bounds 计算，不能把旋转对象的本地 `x`/`y`/`width` 当作可见边缘；如果用户按住当前多选中的任意对象拖拽，编辑器应保留多选状态并移动当前可编辑选区。Shift 点击已选对象只负责取消选择，不能继续启动拖拽并误移动剩余选区。

新增对象按实际节点尺寸以点击点为中心落位，不能使用固定偏移，否则不同类型节点会出现点击位置与对象中心不一致。选区缩放手柄需要覆盖北、东北、东、东南、南、西南、西、西北八个方向，并把核心几何计算得到的 `x`、`y`、`width`、`height` 一起回写到 scene；只写宽高会让西侧或北侧缩放丢失位置变化。带旋转的普通节点应按旋转后的视觉选区 bounds 缩放，不能继续使用未旋转的本地矩形增量。多选缩放应以当前可缩放对象的 bounds 为基准做比例缩放，缩放手柄也应挂在同一份 bounds 上；当多选对象在某个轴上的 bounds 为 0 时，只冻结该轴，另一条非零轴仍要继续按比例缩放，避免多条水平线或垂直线完全无法拉伸；缩放线条或箭头时，比例缩放只能改变有向向量长度，不能把负 `width` / `height` 夹成 0 或改成正数，否则向左或向上的线段会在多选缩放后丢失方向。当负向线条或箭头在多选缩放中被压到最小 1px 且终点贴近页面原点时，编辑器应移动起点保留 `-1` 有向向量，使起点和终点仍都在非负坐标内，不能把终点写到 `-1` 导致整个缩放 patch 被 scene 校验拒绝。缩放只作用于可见、未锁定、非 group 的普通绘图对象，不能通过选区手柄改写锁定对象、隐藏对象或语义 group；混选锁定对象、隐藏对象或语义 group 时，这些不可缩放对象不能参与缩放比例基准。缩放到最小尺寸时需要保持对侧边缘锚定；例如从西侧或北侧向内拖到最小尺寸时，只允许宽高被夹住，不能让节点位置继续漂移。从西侧或北侧向外拖过页面原点时，核心几何层必须把 `x`/`y` 夹到 0，并相应回收 `width`/`height`，尽量保持右侧或下侧边缘稳定，避免编辑器写出页面左上边界之外的负坐标。多选缩放也必须先把整体目标 bounds 夹到页面原点内，再按夹取后的 bounds 计算每个对象的比例位置和尺寸，不能用负坐标的虚拟外框参与比例换算后再单独夹每个节点。

锁定对象只能被选中、解锁或切换可见性，不能被属性面板、方向键、删除、复制、层级调整、对齐、分布、画布拖拽或缩放手柄修改。用户在画布上点击锁定对象时仍应选中该对象，方便继续解锁或切换可见性；工具栏、属性面板、键盘快捷键和画布手柄需要共享同一套可编辑对象过滤规则，避免用户通过图层列表选中锁定对象后绕过画布拖拽限制。

语义 group 不是可见绘图对象，属性面板只能展示它的名称、类型和派生位置，不能通过内容、位置、尺寸、旋转、填充或绑定控件直接改写 group 自身；复制、删除和图层选择等分组级操作仍然保留。

删除分组和取消分组必须保持不同语义：用户在编辑器中选中 group 后执行删除，应删除该 group 以及其可编辑、可见子节点；如果子节点被锁定、静态隐藏或被配置隐藏，该子节点必须保留，避免通过删除 group 绕过锁定和可见性保护。底层 `ungroup` patch 仍只移除 group 自身并保留 children，用于未来显式取消分组入口。

隐藏对象仍可在图层面板中保持选择，方便用户重新显示、复制、删除或查看属性；但画布上不能继续绘制隐藏对象的选框和缩放手柄，属性面板也只能查看而不能直接改写隐藏对象，避免不可见对象在工作区留下可交互的编辑框或被属性输入绕过可见性规则。工具栏不能继续允许隐藏对象执行锁定、层级、对齐或分布等几何和状态写入动作；复制隐藏对象时，新副本必须恢复为可见且未锁定，删除隐藏对象则只在用户直接选中该隐藏对象时生效，不能通过删除父 group 间接删除隐藏子层。画布拖拽、方向键、对齐、分布等几何批量操作只作用于当前可见且未锁定的普通绘图对象，不能因为图层面板混选而悄悄移动隐藏图层或语义 group。置顶、置底等层级命令也只重排可见、未锁定的普通绘图对象；命令必须从当前视觉层级顺序出发移动选中对象，并保持未选中对象之间的相对视觉顺序不变，不能因为底层数组顺序与 `zIndex` 不一致而打乱其它图层。当用户只选中 group 时，层级按钮应禁用，但复制和删除仍按分组语义保留。

复制、重复和粘贴生成的新绘图对象必须默认可见且未锁定。即使源对象来自隐藏图层或底层 patch 操作，也不能把隐藏或锁定状态带到普通绘图对象上，否则用户执行复制后会得到看不见或不可编辑的结果。语义 `group` 节点是例外：它只承载分组引用关系，复制或粘贴后仍保持隐藏，不能在画布上变成额外的可见矩形框。编辑器复制入口在用户只选中 group 时需要自动展开该 group 的可复制子节点，保证复制分组会得到可见内容副本，而不是只新增一个隐藏 group；通过 group 展开的子节点只包含可见内容，隐藏子层不会因为复制分组被意外变成可见副本。当一次复制集合包含 group 和它的子节点时，新 group 的 children 必须重映射到同一批新复制出来的子节点，不能继续指向原始对象；提交新增节点时也要先插入被引用的子节点，再插入引用它们的 group，避免 scene 校验拒绝临时悬空引用。

属性面板写入几何值前必须做同一层清洗：空值和非有限数不提交，X/Y 不能小于 0，普通节点宽高至少为 8，线条和箭头宽高允许为 0，旋转值必须是有限整数。这样属性编辑不会绕过 scene 校验，把非法几何写入后触发只读渲染 fallback。属性面板的 Content 控件也必须按节点类型写入真正参与渲染的字段：文本、便签、按钮、输入框和卡片写 `text`，图片写 `src`，矩形、圆形、线条、箭头、路径和语义 group 不显示无效 Content 输入。属性面板的颜色控件必须写入当前节点真正参与渲染的样式字段：文本写 `color`，线条、箭头和路径写 `stroke`，普通形状和控件写 `fill`；图片和语义 group 不显示无效颜色控件，避免用户改了属性但画布没有视觉变化。

线条和箭头的 `width` / `height` 表示从起点到终点的有向向量，可以为正数、负数或单轴为 0；`x` / `y` 起点和 `x + width` / `y + height` 终点都必须保持在页面非负坐标内，且不能同时变成 0×0。无论来自端点手柄、普通选框缩放、多选缩放还是属性面板输入，编辑器都要保留至少 1px 的主轴长度，并保留原有方向符号；斜向线条或箭头被压到最小长度时，需要同时保留两个非零轴的方向，恢复成 `±1` / `±1` 的最小有向向量，而不能退化成水平或垂直线。当缩放把负向终点推到页面原点外时，几何层必须把终点夹回原点，而不是提交会被 scene 校验拒绝的非法节点。带旋转的线条和箭头会使用普通选框缩放路径；即使该路径把负向线段压到最小长度，也必须按原始有向向量恢复为 `-1` 主轴，不能因为手柄方向把向左或向上的线段翻成正向。属性面板改写线条和箭头的 X/Y/W/H 时也必须在写入前同时夹取起点与终点：改 X/Y 时优先保留当前有向向量并移动起点到合法位置，改 W/H 时优先保留起点并收缩向量到合法终点，保证线类节点仍满足 scene 校验且视觉方向不被属性清洗层改写。

## 4. Playground

`@workbench/sketch-playground` 默认使用 3400 端口。它的第一屏是面向 SDK 开发的三栏编辑器：左侧图层、中间深色工作区与底部浮动工具栏、右侧属性检查面板都来自 `@workbench/sketch-react` 的可拆分组件。日常 SDK 开发优先在 playground 调整这套编辑部件，再由创作端编辑模式复用同一批组件获得一致展示。

Playground 只承载草图编辑器本身，不承载创作端的项目级宿主能力；“单页 / 画布”模式切换以及 Figma 式的草稿、文件和页面导航都属于外层宿主能力，不能作为 playground 的常驻 UI。

Playground 仍提供基础卡片、营销页线框、表单页、图片页、长页面和配置绑定页 fixtures，并支持：

- 切换和重置 fixture。
- 通过开发数据面板查看、编辑和应用 scene JSON。
- 通过开发数据面板查看、编辑和应用 config JSON。
- 在默认视图内使用完整三栏编辑器。
- 复制 scene JSON。
- 运行 20/50/100 nodes 的只读渲染性能基线。

Playground 的浏览器回归位于 `test/sketch-playground/sketch-playground.spec.ts`，使用 webServer 自动启动，不依赖 author-site。

## 5. 验证入口

草图 SDK 的最小验证矩阵是：

| 范围 | 命令 |
| :--- | :--- |
| core | `corepack pnpm check:sketch-core` |
| React SDK | `corepack pnpm check:sketch-react` |
| playground 类型检查 | `corepack pnpm check:sketch-playground` |
| playground 浏览器冒烟 | `corepack pnpm test:e2e:sketch-playground` |
| OpenPencil 编辑器 SDK 构建 | `corepack pnpm check:sketch-openpencil` |
| OpenPencil 编辑器旧命令兼容 | `corepack pnpm check:openpencil-spike` |
| OpenPencil 映射回归 | `corepack pnpm test:e2e:openpencil-spike` |
| OpenPencil adapter 与图片代理单测 | `corepack pnpm --filter @workbench/author-site test -- --testPathPatterns=openpencil-adapter.test.ts --testPathPatterns=image-proxy/route.test.ts` |
| OpenPencil 宿主属性栏与保存错误单测 | `corepack pnpm --filter @workbench/author-site test -- --testPathPatterns=OpenPencilSpikeFrame.test.tsx --testPathPatterns=openpencil-save-error.test.ts` |
| OpenPencil session 文件 patch 仲裁单测 | `corepack pnpm --filter @workbench/author-site test -- --testPathPatterns='src/app/api/sessions/\[sessionId\]/files/\[demoId\]/route.test.ts'` |
| 创作端手绘引擎决策单测 | `corepack pnpm --filter @workbench/author-site test -- --testPathPatterns=sketch-editor-engine.test.ts` |
| 用户级创作偏好单测 | `corepack pnpm --filter @workbench/author-site test -- --testPathPatterns=user-authoring-preferences.test.ts` |
| OpenPencil 创作端接入与双引擎互开回归 | `corepack pnpm test:e2e:openpencil-author` |
| 全仓契约 | `corepack pnpm check:all` |
| 创作端接入回归 | 仅在重新开放 author-site 手绘页面入口后运行 `corepack pnpm test:e2e -- sketch-page-regression.spec.ts` |

## 6. OpenPencil 编辑器 SDK 边界

OpenPencil 目前作为手绘页面单页编辑体验的独立 SDK 编辑岛接入，不替代正式 `@workbench/sketch-react` 编辑器。正式包名是 `@workbench/sketch-openpencil-editor`，源码位于 `packages/sketch-openpencil-editor/`。宿主仍以 `SketchSceneDocument` 为唯一权威数据；OpenPencil iframe 接收当前 scene、配置数据和预览尺寸，用于验证图层选择、拖拽、缩放和 CanvasKit 运行体验。iframe 内发生图层变更后，会把当前图层重新导出成 draft `SketchSceneDocument` 并通过 dirty-state 消息发回 host；host 展示 dirty 状态和 draft 节点数，并提供“保存手绘”显式提交入口。

创作端 host 通过 `resolveSketchEditorEngine` 统一判断当前手绘编辑引擎，返回值只允许是 `native`、`openpencil` 或空值。当前只有单页预览、当前页面是 `sketch-scene`、用户进入手绘编辑态、且没有切到文档预览时，才会进入手绘编辑引擎；在这个前提下，项目元数据 `authoringPreferences.sketchEditorEngine` 可以把单个项目固定到 `native` 或 `openpencil`。如果项目没有配置偏好，编辑页读取当前账号的 `UserAuthoringPreferences.sketchEditorEngine` 作为默认偏好；如果用户也没有配置，才沿用 `NEXT_PUBLIC_OPENPENCIL_SKETCH_SPIKE_ENABLED` 的默认选择。设置弹窗面向用户只显示“新版手绘编辑器”和“经典手绘编辑器”，不直接暴露 OpenPencil 或自研技术命名；项目级偏好始终高于用户级默认，新版编辑器仍必须由全局 OpenPencil feature flag 放行，不能绕过实验开关。这样 OpenPencil 和自研编辑器的开关条件收敛在同一个纯函数里，页面渲染层只消费决策结果，不再重复拼接条件。

编辑页通过 `SketchEditorEngineHost` 承载双引擎宿主接口。这个 host 接口统一接收当前 engine、scene、配置数据、预览尺寸和保存回调：engine 为 `native` 时挂载 `@workbench/sketch-react` 的画布、工具栏、图层和属性面板；engine 为 `openpencil` 时挂载 OpenPencil iframe，并把图层选择、节点更新、复制、删除、成组、撤回、重做和定位选区等 host command 转发给 iframe。页面主体只负责计算 engine 和提供当前 scene，不再分别维护两套编辑器的状态、命令和面板挂载条件。

项目级手绘编辑引擎偏好保存在项目元数据中，并通过项目列表接口返回给编辑页。`/api/demos/[id]` 的更新接口接受可选 `authoringPreferences.sketchEditorEngine`，只允许 `native` 或 `openpencil`；非法值会被拒绝。用户级默认偏好通过设置弹窗的“创作偏好”入口维护，写入 `/api/user/authoring-preferences` 背后的用户级存储；它只作为没有项目级偏好时的默认值。两类偏好都只影响创作端编辑态，不改变页面 `runtimeType`，也不改变 `SketchSceneDocument` 存储协议。

iframe 由 author-site 的 `OpenPencilSpikeFrame` 托管，目标地址来自 `NEXT_PUBLIC_OPENPENCIL_SPIKE_EDITOR_URL`，默认指向本地 `http://127.0.0.1:3410`。host 等 iframe onLoad 或 OpenPencil ready 消息后再发送 scene，避免在 iframe 仍处于初始页面时发出跨 origin 消息。OpenPencil 编辑器收到文档后只在 iframe 中承载 CanvasKit 画布和命令条，图层列表与属性检查不再挤在预览区内部；导入完成后会执行 `zoomToFit()`，把手绘页面 frame 缩放到当前 iframe viewport 内，首屏不会只露出页面边缘或空白工作区；导入生成的内部 page frame 名称也使用“手绘页面”，不把 `sketch scene` 暴露到图层语义里；debug hook 会暴露该 frame 的 screen bounds 供浏览器回归断言。iframe 会通过 `openpencil-spike/ui-state` 把图层、选区、bridge 状态、导入层数、当前可检查节点和宿主命令可用状态同步给 host，host 用创作端左侧图层抽屉和右侧属性抽屉展示这些信息。右侧属性抽屉默认只展示可编辑属性与宿主命令，Host Bridge 状态、页面 id、配置字段数和图层数等桥接调试字段只在显式 debug 入口开启时显示，避免普通编辑态暴露实现细节。OpenPencil 的 load document、select、command、ui-state、dirty-state 和 error 消息契约集中在 `@workbench/shared/openpencil-adapter`，该 contract 现在同时提供消息类型常量、消息构造器和运行时 guard；load document 还可以携带 host 计算出的同源 `imageProxyUrl`，供 iframe hydrate 远程图片字节时优先走 author-site 代理；iframe、author-site host 和独立浏览器回归都通过这些入口创建或识别 postMessage，避免 host/iframe 各自维护一套字符串协议。`packages/sketch-openpencil-editor/src/adapter.ts` 和 `src/index.ts` 作为 OpenPencil 包的 adapter facade 源入口，构建后通过 `dist/sdk/index.js`、`dist/sdk/adapter.js` 和对应声明文件作为 package exports 对外发布；`dist/` 同时包含 iframe app、CanvasKit wasm 与字体资源。左侧图层点击会通过 `openpencil-spike/select-node` 发回 iframe，让 OpenPencil 内部选中对应节点；右侧属性抽屉的名称、位置、尺寸、旋转、基础颜色、描边、透明度、文本、文本样式 runs、图片 `src`/`alt` 和节点级配置绑定编辑通过通用 `openpencil-spike/command` + `update-node` host command 发回 iframe，再由 OpenPencil 更新节点并重新导出 draft scene；iframe 仍接受旧的 `update-node-style` 命令作为兼容入口。文本样式编辑会优先读取宿主文本框的浏览器选区；存在非折叠选区时，host 会按选区边界拆分现有 `textStyleRuns`、只改写选区内样式并合并相邻同样式 run；没有文本框选区但 iframe 的 `ui-state` 提供 `textSelectionRange` 时，host 会把样式编辑应用到 OpenPencil 画布选区，并在样式面板显示“画布选区样式”；两类选区都不存在时，仍把当前颜色、字号、字重、斜体和下划线/删除线包装成覆盖当前文本长度的整段 run。OpenPencil iframe 会优先读取 OpenPencil 文本编辑器的 `textEditor.getSelectionRange()`，把画布文本选区裁剪到当前文本长度后写入 `textSelectionRange`；读取器已兼容原 tuple 返回值和 `{ cursor, selectionAnchor }` 等对象形态，也会在方法缺失或抛错时跳过该路径，再回落到运行时状态字段探测。独立浏览器回归已覆盖 OpenPencil 文本编辑器选中字词后向宿主回传该范围，也覆盖对象形态返回值仍能归一化为画布选区；后续升级 OpenPencil 时应继续用该回归复核真实 caret 行为。位置输入使用相对手绘页面的协议坐标，iframe 写入 OpenPencil 节点时会换算回内部 frame 偏移，并在写入前过滤非有限数、把 X/Y 夹到非负、把宽高保持为正数；图片资源输入只对 image 节点展示，`src` 改写后会先回到占位填充，再由 iframe 尝试重新 hydrate 图片资源；绑定输入使用 `SketchSceneNode.bindings` 支持的固定键，空值会从节点 pluginData 中移除。右侧属性抽屉还把复制、删除、成组、解组、撤回、重做和定位选区作为宿主命令发送给 iframe；OpenPencil 按当前选区、历史栈和分组类型回传命令可用状态，host 据此禁用不可执行按钮，iframe 收到不可用命令时只回传 ui-state，不产生 dirty draft。OpenPencil 执行会修改 scene 的当前选区操作后继续通过同一套 ui-state 与 dirty-state 回传最新 scene；定位选区只调整 iframe 视口，不触发 dirty-state。收到 dirty-state 后，host badge 会进入 dirty 状态并展示 draft 节点数；如果 iframe 能把加载时 scene 和当前 draft scene 的差异表达为 `SketchScenePatchOperation[]`，它会先用 `applySketchScenePatchOperations` 回放验证，只有验证后才在 dirty-state 中附带 `patchBaseSceneKey` 和 `patchOperations`，host 会保留这份 patch 元信息并在 badge 中显示 patch 数量；如果本次 dirty-state 没有可验证 patch，badge 会显示“临时全量草稿”，明确后续保存会按整份 draft scene fallback 提交。保存成功后如果 iframe 重新加载的是刚提交的 draft scene，badge 保持 saved 状态，避免保存后立即被 document-loaded 覆盖。用户点击“保存手绘”时，host 会先 flush 当前 Workspace 下的协同房间，让 `sketch.scene.json` 这类手绘协同草稿先进入 Workspace 文件；随后如果存在可验证 `sketchPatch`，host 只把 patch、meta 和诊断上下文提交到 session 页面文件 API，不再随请求提交整份 draft scene。服务端读取当前 session scene，检查 patch 基线没有过期，再用 `applySketchScenePatchOperations` 回放 patch 并生成最终 scene；兼容路径如果请求同时提交 draft scene，服务端仍要求回放结果与提交 scene 等价。验证通过后服务端写入最终 `sketch.scene.json` 并触发 workspace 到项目 workspace 的同步。服务端会把 patch 校验结果写入编辑页诊断：成功时记录 `page.sketch_patch_validated`，拒绝记录 `page.sketch_patch_rejected`，只保留操作数、基线标记、当前/目标节点数量、目标来源和失败原因，不写入 scene、operations 或节点内容；如果本次没有可验证 patch，host 在全量草稿保存成功后记录 `page.openpencil_full_draft_fallback`，只保留状态、节点数、operationCount=0 和 `targetSource=client_scene`，帮助诊断导出区分 patch 保存与全量 fallback。页面资源版本接口已能接收同样安全边界下的 `sketchPatchSummary`，把操作数、是否有基线和前后节点数写入资源版本 metadata，作为版本历史的第一段 patch 审计线索。OpenPencil 保存成功后，编辑页会缓存最近一次已验证 patch 摘要；命名版本和自动检查点创建页面资源版本时，只有当前 scene 仍匹配该次 OpenPencil draft，才会把 `sketchPatchSummary` 带入请求，避免后续本地变更复用过期摘要。写入 session sketch scene 的 API 在普通草图 authoring 开关或 OpenPencil spike 开关打开时允许执行。Agent Service 的手绘工具也通过同一份 reducer 写入 `sketch.scene.json`：`patchSketchScene`、`createSketchNodes` 和 `bindSketchConfig` 的结果会返回 patch 基线、操作数、前后节点数、是否真实变更和下一版 scene key；工具 hook 只把真实变更推给文件操作事件和协同房间，no-op patch 不触发外部文件重载。patch 已进入真实保存请求、协同房间 flush、诊断边界、页面资源版本 metadata、前端命名版本/自动检查点请求和 AI 工具审计边界；文件存储格式仍保持整份 scene，但普通 patch 保存请求已经是 patch-first。全量草稿只在 dirty-state 无法生成可验证 patch 时作为 fallback 使用；当服务端用 409 拒绝过期 patch 基线或回放不一致结果时，编辑页会把它转换为“手绘内容已被其他协同或保存更新，请重新加载手绘页面后再保存”的用户提示，OpenPencil 保存浮层会展示失败原因，并提供重试保存、“加载最新手绘内容”和“合并本次手绘改动”。加载最新内容会从当前 session workspace 重新读取 `sketch.scene.json`，更新宿主 scene、协同文本、截图缓存和 iframe 文档，放弃本次过期 draft；合并本次改动会先读取最新 scene，再把本次 dirty-state patch 在最新 scene 上重放，只有预检确认目标节点仍可重放、统一 scene 校验和服务端 patch 回放都通过时才保存合并结果。预检失败时，保存浮层会展示自动合并摘要，列出操作数、受影响图层、逐条冲突操作、缺失图层、重复 ID 和同字段变更路径，以及基线、最新、本次值预览，帮助用户判断是否加载最新内容后重新编辑；摘要出现后，用户可以逐项选择要跳过的冲突操作，系统会保守跳过触碰同一冲突图层的依赖操作，再把剩余 patch 交回服务端回放校验；也可以逐项选择要覆盖为本次值的字段冲突，只有这些被确认的 `nodeId.field` 会从剩余冲突复核中放行，未选择字段、缺失节点和重复 ID 仍然阻断，合并后继续通过统一 scene 校验和服务端 patch 回放；也可以选择“加载最新并手工处理”，在最新 scene 载入后保留冲突参考面板，按冲突操作和字段值预览手工重做需要保留的改动。后续只需继续用真实多人编辑压测确认当前冲突恢复粒度是否足够。

Session 页面文件 API 另有 route 回归覆盖服务端仲裁点：协同侧先写入最新 scene 时，旧基线 OpenPencil patch 会被 409 拒绝并写入 `page.sketch_patch_rejected`；基线匹配时，服务端会回放 patch 后保存目标 scene；patch-only 请求不携带 `sketchScene` 时，服务端会从当前 session scene 直接回放生成最终 scene；连续高频仲裁压力场景会重复 8 轮协同侧先写、旧基线拒绝、最新基线保存成功，确认重复冲突不会把旧草稿覆盖到最新 scene。页面文件读取和写入都会校验当前登录用户是否拥有该 session，避免多账号场景下直接读取或写入其他账号的 session 文件；多账号协作通过各自 session 共享项目 live workspace，而不是跨账号复用同一个 session。创作端 OpenPencil production E2E 覆盖真实页面里旧 dirty patch 保存前被协同侧更新插入后的 409 提示、自动合并摘要，以及“加载最新并手工处理”保留冲突参考的恢复路径；多账号多浏览器 production E2E 会注册第二账号，在独立浏览器上下文中创建独立 session，默认连续 10 次写入同一项目最新 scene，再验证旧 OpenPencil dirty 窗口保存被 409 拒绝、生成冲突摘要，并可加载最后一次协同 scene 恢复。该场景支持通过 `E2E_OPENPENCIL_COLLABORATION_STRESS_ITERATIONS` 放大连续写入轮数；真实业务规模观察仍用于评估现有冲突摘要、逐项跳过和逐字段覆盖粒度是否需要继续细化，而不是替代服务端基线校验。

OpenPencil iframe 内的画布渲染依赖 CanvasKit 和 OpenPencil bundled fonts。SDK 的 Vite 服务和生产构建都必须把 `canvaskit.wasm` 以 `application/wasm` 暴露在根路径，并把 OpenPencil 自带的 Inter 与 Noto 字体以真实字体文件暴露在根路径；否则 Vite SPA fallback 会把 HTML 返回给 wasm 或字体加载器，表现为 OpenPencil shell 已加载但中间 canvas 空白、文字缺失或浏览器控制台出现 CanvasKit/font 解析错误。`@workbench/sketch-openpencil-editor` 的 build 已接入 `check:assets`：本地会检查 `dist/` 内 iframe app、SDK facade、CanvasKit wasm 和字体文件是否存在、非空且不是 HTML fallback；如果设置 `OPENPENCIL_ASSET_BASE_URL`，同一个脚本会请求远端 OpenPencil 编辑器地址并校验 wasm/font 的 `Content-Type`、文件大小和二进制头，用于部署后资源探测。远程图片资源由 author-site 的 `/api/openpencil/image-proxy` 代理第一段承接：代理只接受 HTTP/HTTPS 图片 URL，拒绝带凭据、本机、内网和保留地址，按重定向逐跳校验目标，并把成功图片响应补上 CORS 与缓存头；生产环境可以用 `OPENPENCIL_IMAGE_PROXY_ALLOWED_HOSTS` 配置允许代理的域名列表，支持逗号分隔的精确域名和 `*.example.com` 这类子域通配，用 `OPENPENCIL_IMAGE_PROXY_CACHE_MAX_AGE_SECONDS` 配置成功图片响应的 `max-age`，用 `OPENPENCIL_IMAGE_PROXY_RATE_LIMIT_PER_MINUTE` 配置按客户端 IP 的每分钟请求上限；配置为空时保持开发期兼容，仍允许公网图片但继续执行 SSRF 与图片类型校验。host 会把编辑会话、项目、页面和工作区上下文附加到同源图片代理地址上；代理在有上下文时写入 `page.openpencil_image_proxy` 诊断事件，只记录输入/最终域名、代理状态、HTTP 状态、资源类型、大小、耗时、缓存 TTL 和限流余量，不记录完整图片 URL、查询参数或图片内容。iframe 仍保留直接 fetch fallback，用于兼容原本已经允许 CORS 的图片源。Vue 侧还需要确保 `CanvasRoot` 拿到实际 `<canvas>` 引用后再初始化 OpenPencil 渲染器，避免宿主桥接状态已变为 loaded 但 CanvasKit 没有接管画布。当前 iframe 会捕获 Vue 错误、浏览器 `error`、`unhandledrejection` 和文档导入异常，并通过 `openpencil-spike/error` 把错误码、可读文案和可选调试详情发回 host；host 面向用户显示“手绘编辑器加载失败”覆盖层、加载超时文案和重新加载入口，不再把 OpenPencil/Spike 命名暴露为普通界面文案。这样 CanvasKit、字体、图片资源或跨域失败会进入可理解错误态，而不是停留在空白画布。

OpenPencil 编辑器的导入映射会把原始草图节点 id 和类型写入 OpenPencil pluginData；导出时优先恢复原始 id，遇到复制节点携带相同 pluginData 时再追加 `-copy-N` 后缀，保证 draft scene 的节点 id 唯一。语义 group 会映射为 OpenPencil `GROUP` 容器，导出时按子图层重建 `children`；image 会在 `src` 可被 iframe 获取时存入 OpenPencil 图片资源并渲染为 `IMAGE` fill，远程 HTTP/HTTPS 图片优先通过 host 传入的图片代理获取字节，代理或直连获取失败时回退为占位图层，但仍通过 pluginData 保留原始 `src` 和 `alt`，且这两个资源字段已能通过宿主属性抽屉改写；path 会从 SVG path 字符串导入为 OpenPencil `VECTOR`，并通过 pluginData 保留原始 `path` 和 `points` 协议字段。节点级 `bindings`、节点级 `metadata`、文档级 `assets`、文档级 `bindings` 和文档级 `metadata` 会在导入导出之间保留，避免编辑岛丢失草图协议的非视觉信息；其中节点级 `bindings` 已能通过宿主属性抽屉改写，仍由统一 scene 协议在导出后承接。文本节点现在支持可选 `textStyleRuns`，用于保留一段文本里的局部颜色、字号、字重、字体、斜体、下划线/删除线、行高和字间距。OpenPencil 导入时会把这些 runs 转成自身的 `styleRuns`；导出时再转回统一 scene 协议。iframe 的 inspector state 会把选中文本节点的当前 `styleRuns` 转回 `textStyleRuns` 交给 host；host 属性栏可把文本框中当前浏览器选区范围转换为新的 runs，选区外样式保持不变，相邻同样式 run 会合并；如果 iframe inspector state 提供 `textSelectionRange`，host 也会把样式改动应用到该画布文本范围；两类选区都不存在时则继续按整段样式写回 OpenPencil。对于 button、input、card、sticky 这类带内部标签的容器节点，runs 会作为协议字段写入容器 pluginData，并同步给 OpenPencil label 展示，导出仍以容器协议字段为准。只读 SVG 渲染会把文本节点和容器 label 的 `textStyleRuns` 裁剪到当前文本长度后输出为嵌套 `<tspan>`，未被 runs 覆盖的字符继续使用节点级基础文本样式；因此 OpenPencil、只读预览、视觉 hash 和发布侧 SVG 能共享同一份复杂文本样式协议。

OpenPencil 编辑器 SDK 的独立验证入口是 `corepack pnpm dev:sketch-openpencil`、`corepack pnpm check:sketch-openpencil` 和 `corepack pnpm test:e2e:openpencil-spike`；`dev:openpencil-spike` 与 `check:openpencil-spike` 作为旧命令兼容别名保留。`check:sketch-openpencil` 会运行正式包 build，确认 `dist/` iframe app、CanvasKit/font 资源、`dist/sdk` adapter facade 和本地资源探测均通过；部署后可用 `OPENPENCIL_ASSET_BASE_URL=<editor-url> corepack pnpm --filter @workbench/sketch-openpencil-editor check:assets` 对远端 wasm/font 响应做 MIME 与二进制头探测。浏览器回归通过 adapter 构造出的 postMessage 向独立 iframe 发送 synthetic `SketchSceneDocument`，验证 group children、image fill、远程图片经 host proxy hydrate、首次加载时页面 frame fit 到 iframe viewport、path vector、节点级 bindings/metadata、复杂文本 `textStyleRuns`、OpenPencil 画布文本选区回传 `textSelectionRange`、`getSelectionRange()` 对象形态兼容、文档级 assets/bindings/metadata、host command 属性、几何、绑定与图片资源编辑、dirty-state patch 回放、复制、删除、成组、解组、撤回、重做、定位选区、命令可用状态和导出 scene 的保真。宿主属性栏单测覆盖选中文本节点的整段样式、文本框选区范围样式和 iframe 回传画布文本选区样式编辑会发出 `textStyleRuns` host command，避免样式控件和 iframe 协议脱节；图片代理单测覆盖允许域名、缓存 TTL、客户端限流和诊断审计摘要；保存错误单测覆盖无 patch dirty-state 会显示“临时全量草稿”并按全量草稿提交，也覆盖 409 冲突会出现加载最新内容、合并本次改动、自动合并摘要、逐条冲突操作、逐项选择跳过冲突操作后合并其余改动、逐项选择同字段冲突并覆盖为本次值、加载最新并手工处理后的冲突参考保留和同字段冲突值预览；诊断单测覆盖全量草稿 fallback 事件只保留安全摘要和 `targetSource=client_scene`、不写入 scene 或 operations；合并预检单测覆盖缺失目标节点、重复新增节点、stale base 后同字段变更、字段值预览、协同与本次最终值一致时不误报冲突、选择覆盖字段后放行对应同字段冲突和可安全重放的 patch。资源版本回归覆盖页面资源版本可记录手绘 patch 摘要，且版本接口会拒绝非法摘要；前端单测覆盖最近 patch 摘要只在 scene 匹配时复用，并覆盖命名版本请求透传 `sketchPatchSummary`；agent-service 协同单测覆盖 `page-sketch-scene` 外部写入重载和旧房间 flush 保护。创作端接入回归入口是 `corepack pnpm test:e2e:openpencil-author`，会自动启动 OpenPencil 编辑器、agent-service 与带 `NEXT_PUBLIC_OPENPENCIL_SKETCH_SPIKE_ENABLED=true` 的 author-site；author-site 默认先构建生产产物，再用专用端口的 `next start` 启动，生产 webServer 等待上限为 420 秒以覆盖本机冷构建耗时；该路径避免 Next dev renderer 偶发把编辑页返回错误壳，同时绕开当前本机 Node 24 下 standalone 目录缺少部分 chunk、vendor chunk 或原生模块产物的问题。该回归通过与 author `.env` 一致的 `JWT_SECRET` 签发本地测试 cookie，默认不调用密码登录接口，从而把验证范围集中在 OpenPencil 创作端链路；如需专门覆盖登录接口，可显式设置 `E2E_AUTH_COOKIE_ONLY=false`。该回归覆盖 iframe 进入 OpenPencil 编辑态、`Duplicate` 产生 dirty draft、host 捕获 dirty-state、显式保存请求携带 `sketchPatch.operations` 和诊断上下文且普通 patch 保存不随请求提交 `sketchScene`、服务端 patch 回放校验、`persist-workspace` 和保存后 session 文件内容，也覆盖项目级偏好切换到 native 后读取 OpenPencil 已保存 scene，以及 native 新增文本经过 autosave 写入 session/project 后再切回 OpenPencil 导入同一份 scene。旧基线冲突场景会在当前页面保持 OpenPencil dirty patch 时，通过请求拦截模拟协同侧在保存 PUT 前写入最新 scene，验证保存返回 409、保存浮层显示用户可理解冲突提示、严格合并生成自动合并摘要，并通过“加载最新并手工处理”把协同侧最新 scene 重新投递给 iframe，同时保留冲突参考面板供用户手工重做本次改动。多账号多浏览器场景会注册第二账号，在独立浏览器上下文中创建独立 session，默认连续 10 次写入同一项目最新 scene，验证旧 dirty 窗口不会覆盖协同侧最后一次写入，并能加载最新恢复；如需压测更多轮次，可设置 `E2E_OPENPENCIL_COLLABORATION_STRESS_ITERATIONS=<轮数>`。native 编辑器的 autosave 在 workspace flush 前会先把当前页面文件 PUT 到 session，确保 `pageSketchMap` 中的 scene 进入 `sketch.scene.json`，再执行协同 flush 和项目持久化。手工真实创作端联调需要同时启动 OpenPencil 编辑器、agent-service 和 author-site，并带上 `NEXT_PUBLIC_OPENPENCIL_SKETCH_SPIKE_ENABLED=true` 与 `NEXT_PUBLIC_OPENPENCIL_SPIKE_EDITOR_URL=http://127.0.0.1:3410`；如果不启动 agent-service，显式保存中的 workspace flush 会失败。当前文件存储格式仍是整份 scene，普通 patch 保存请求已改为 patch-only；后续继续在真实业务规模下观察冲突恢复粒度是否需要细化。
