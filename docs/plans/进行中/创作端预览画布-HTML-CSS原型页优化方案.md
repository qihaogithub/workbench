# 创作端预览画布 - HTML/CSS 原型页落地方案

## 当前状态

本文档已从方向讨论收敛为可实施方案，并已完成创作端 MVP：系统支持 `prototype-html-css` 原型页运行时、轻量画布渲染、原型页基础属性编辑、配置项绑定、高保真页对照验证项目、发布/viewer 支持、面向 AI 的页面运行时转换入口、转换状态/失败重试提示、AI 文件生成后的 runtime API 收口、原型闸门自动修复/升级指令反馈，以及画布中原型页按设计画板整体等比缩放。

## 当前结论

创作端页面需要分为两种运行时类型，但产品上仍统一称为“页面”：

| 页面类型 | 系统类型 | 默认性 | 用户感知 | 核心目标 | 承载方式 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 原型页 | `prototype-html-css` | 系统默认通道 | 默认不显示标识 | 低成本表达页面结构、信息架构和布局方案 | 受清洗 HTML + CSS，优先轻量 DOM/Shadow DOM |
| 高保真页 | `high-fidelity-react` | 触碰运行时隔离红线后升级 | 显示低调“高保真”标识 | 承载必须隔离的运行时代码、复杂组件状态、真实交互和发布验收 | React/TSX + preview runtime/iframe |

原型页不是低能力页面，而是低运行时页面。系统限制脚本、复杂运行时和不可控资源，不限制布局表达。原型页可以使用 flex、grid、absolute、sticky、复杂嵌套、响应式布局、表格、表单、列表、静态弹窗和图表占位。

原型页和高保真页在创作端都必须具备属性编辑和配置项能力：

- 高保真页继续使用现有 iframe visual edit、React/TSX 改写和 `config.schema.json` 配置项机制。
- 原型页使用 Shadow DOM 内节点采集、右侧属性面板和本地 HTML 写回机制，文本、图片、链接和常用样式可直接编辑。
- 原型页配置项同样写入 `config.schema.json`，通过 `data-bind-*` 属性或 `{{fieldKey}}` 插值绑定到 `prototype.html`，页面配置面板改值后应立即反映到原型预览。
- 两种页面在用户侧都称为“页面”，属性编辑和配置项不应成为区分原型页/高保真页的能力差异；差异只体现在运行时成本、交互真实性和发布验收边界。

默认策略：用户不需要决策页面类型，AI 也不需要先做页面类型判断。新建项目后，AI 先按原型页产出 HTML/CSS；系统闸门基于产物判断是否可以无脚本、安全地内嵌到画布。只有触碰运行时隔离红线时，系统才升级为需要 iframe 隔离的高保真页。

## 产品目标

1. 降低多页面画布的冷启动、内存、编译和 postMessage 成本。
2. 让用户在项目早期快速得到完整页面结构，而不是等待每页 React runtime 启动。
3. 把页面类型决策从 AI 前置判断改为系统闸门校验：默认原型页，触碰隔离红线才升级高保真页。
4. 保持原型页与高保真页之间可切换，不把原型页做成一次性草图。
5. 页面类型对用户尽量低噪声：原型页默认无标识，高保真页只给低调识别。
6. 让系统闸门、AI、页面列表、预览区和项目数据协议都理解同一套页面类型，避免只在某个 UI 层临时分叉。

## 用户规则

### 原型优先闸门规则

新建或修改页面时，AI 默认生成 `prototype-html-css` 产物。系统闸门对产物做确定性判断，而不是要求 AI 先判断“该用原型还是高保真”。

闸门只输出三类结果：

| 结果 | 含义 | 系统动作 |
| :--- | :--- | :--- |
| `accept_prototype` | HTML/CSS 合法，且可无脚本安全内嵌 | 保存为原型页 |
| `repair_prototype` | 存在小问题但仍属于原型页能力范围 | 允许 AI 修复一次后重跑闸门 |
| `upgrade_to_high_fidelity` | 触碰运行时隔离红线 | 基于当前原型与用户目标重新生成高保真页 |

### iframe 隔离红线

只要页面产物或明确需求命中以下任一红线，系统就升级为 `high-fidelity-react`，并通过 iframe/preview runtime 隔离：

- 需要执行 JavaScript，包括 React hooks、事件处理、状态切换、表单联动、拖拽、定时器、异步请求或运行时计算。
- 页面可能影响宿主编辑器，例如操作 `window`、`document`、`localStorage`、`history`、全局事件监听、修改 `html/body` 样式、全局 CSS reset 或 `position: fixed` 覆盖编辑器。
- 需要第三方运行时能力，例如图表库、地图、播放器、富文本、WebGL、动态 Canvas 或复杂组件库。
- 包含不适合直接内嵌的资源或能力，例如外部脚本、`iframe`、`embed`、`object`、表单提交、未知外链行为或需要 CSP/sandbox 控制的内容。
- 需要资源和生命周期隔离，例如页面可能卡死、持续重渲染、泄漏事件监听、抛运行时错误，或需要独立刷新/卸载/错误收集。
- 原型校验命中硬性安全规则，例如 `<script>`、内联事件属性、`javascript:` URL、危险资源、HTML/CSS/DOM 超限，并且一次自动修复后仍未通过。

红线之外的复杂视觉、复杂布局、长页面、静态弹窗、静态图表、属性编辑和配置项都继续走原型页，不因为“看起来复杂”而升级。

### 手动覆盖入口

手动设置不是主路径，只作为高级纠偏或明确偏好入口。用户可以通过三类方式覆盖系统默认策略：

1. 对话中告诉 AI，例如“把详情页改成高保真”或“这个页面先降回原型”。
2. 预览区选中某个页面后，右键菜单提供“设为高保真页 / 设为原型页”。
3. 页面列表中点击更多菜单，提供同样的“设为高保真页 / 设为原型页”。

菜单文案只表达用户目标，不暴露系统类型名。若当前页面已经是目标类型，对应菜单项置灰或显示为当前状态。普通创建流程不弹出页面类型选择框，避免把内部 runtime 决策转嫁给用户。

### 页面标识

- 原型页默认不显示标识，避免用户认为它是“低级页面”或“未完成页面”。
- 高保真页在预览区显示低调标识，例如页面卡片标题区右侧的小号中性色 `高保真` chip。
- 标识不使用强色、警告色或大面积图标；悬停 tooltip 可说明“使用高保真运行时，支持真实交互，预览成本更高”。
- 页面列表中不默认展示原型标识；高保真页可在更多菜单或页面详情中展示同一状态，避免列表噪声。

## 切换策略

### 原型页升级为高保真页

升级目标是把当前 HTML/CSS 原型作为设计稿输入，生成符合 preview contract 的 React/TSX 页面。升级只应由运行时隔离红线、用户明确指定或手动覆盖触发，不应由 AI 对“复杂程度”的主观判断触发。

流程：

1. 系统闸门返回 `upgrade_to_high_fidelity`，或用户通过对话、预览右键菜单、页面列表菜单触发升级。
2. 系统把原型页 HTML、CSS、页面尺寸、资源引用和页面名称作为上下文发送给创作端 AI。
3. AI 生成 `high-fidelity-react` 页面源码和必要 schema。
4. 系统运行 preview contract fast gate 和编译预检。
5. 通过后切换页面类型；未通过则保留原型页，并把诊断回流给 AI 修复。

升级后保留原型来源记录，至少保存最近一次原型 HTML/CSS，便于失败回退或追溯设计意图。产品上默认不额外展示“历史草图”，除非后续做版本对比。

### 高保真页降级为原型页

降级优先程序处理，程序无法稳定处理时交给创作端 AI。

程序处理适用条件：

- 页面能在当前 preview runtime 中成功渲染。
- 页面当前状态可由默认配置、当前 route params 和当前 app state 表达。
- 页面不依赖必须保留的复杂交互、异步数据、动画时间线或运行时副作用。

程序降级流程：

1. 系统在隔离预览环境渲染高保真页的当前默认状态。
2. 抽取静态 DOM 结构、关键文本、图片引用、表单/按钮/列表等语义元素。
3. 生成 scoped CSS 或 Shadow DOM 内 CSS，保留布局、字号、间距、基础颜色、边框和背景。
4. 移除脚本、事件处理、动态状态和不可控资源。
5. 运行 HTML/CSS 清洗、资源白名单和样式隔离校验。
6. 通过后写入原型页；未通过则进入 AI 降级。

AI 降级触发条件：

- 高保真页面无法成功渲染或编译。
- 页面包含程序无法安全静态化的复杂交互、动画、运行时状态或第三方组件。
- 程序抽取结果低于可读性阈值，例如布局明显错位、主要文本缺失或资源无法解析。
- 用户明确要求“保留设计意图”而不是简单静态截图式降级。

AI 降级流程：

1. 系统向创作端 AI 发送降级任务，包含当前 React/TSX 源码、schema、预览截图或 DOM 摘要、页面尺寸和降级目标。
2. AI 生成 `prototype-html-css` 页面，保留页面结构、视觉层级和主要内容，放弃复杂交互。
3. 系统运行 HTML/CSS 原型页校验。
4. 通过后替换为原型页；未通过则保留高保真页，并向用户显示轻量失败状态。

降级不应伪装为无损转换。确认文案应提示：降级会保留静态结构和视觉层级，但复杂交互、运行状态和动画可能被移除。

## 功能范围

### Phase 1：原型页基础能力

- 新增页面类型字段，旧页面默认兼容为 `high-fidelity-react`。
- 新建项目和 AI 默认创建原型页。
- 原型页保存 HTML、CSS、页面尺寸和资源引用。
- 原型页渲染器支持样式隔离、资源白名单、危险属性移除和无脚本执行。
- 画布中原型页直接轻量渲染；离屏原型页仍参与可见页/lazy mount 策略，避免 DOM 过量。
- 高保真页保持现有 preview runtime/iframe/screenshot 策略。
- 原型页和高保真页都支持右侧属性编辑；原型页属性变更直接写回 `prototype.html`，高保真页沿用既有可视化编辑链路。
- 原型页和高保真页都支持添加页面配置项；原型页使用 `data-bind-text`、`data-bind-src`、`data-bind-href`、`data-bind-style-*` 和 `{{fieldKey}}` 插值绑定配置值，高保真页沿用 React Props/schema 机制。
- 原型优先闸门为主，预览区与页面列表的页面类型切换入口只作为高级覆盖能力。
- 高保真页显示低调标识，原型页不显示标识。

### Phase 2：切换闭环

- 原型页升级高保真页：由 AI 基于 HTML/CSS 生成 React/TSX，并走 preview contract。
- 高保真页降级原型页：先尝试程序静态化，失败后发送给创作端 AI。
- 切换失败时保留原页面类型和内容，并提供可重试的轻量状态。
- 页面类型切换事件写入诊断和 AI 上下文，方便后续排查。

### Phase 3：发布与 viewer 策略

- 明确原型页是否允许直接发布。
- 若允许发布，viewer 需要支持原型页静态渲染，并明确不支持真实交互。
- 若不允许发布，发布前 strict gate 应提示哪些页面仍是原型页，并提供批量升级入口。
- 项目包导出、模板产出和发布检查必须识别页面类型。

## 数据与系统设计

### 页面数据模型

建议在页面元数据中新增运行时类型：

```ts
type DemoPageRuntimeType = "prototype-html-css" | "high-fidelity-react";
```

旧数据迁移规则：

- 没有 `runtimeType` 的历史页面按 `high-fidelity-react` 读取。
- 新建项目中新建页面默认写入 `prototype-html-css`。
- 用户切换页面类型时，必须同时更新页面内容文件和页面元数据。

原型页文件建议：

| 文件 | 用途 |
| :--- | :--- |
| `prototype.html` | 原型页结构 |
| `prototype.css` | 原型页样式 |
| `prototype.meta.json` | 页面尺寸、资源引用、生成来源、最近转换信息 |

高保真页继续使用现有 `index.tsx` 和 `config.schema.json`。

### 页面文件协议收敛

当前 MVP 中，部分原型页目录会同时出现 `index.tsx`、`config.schema.json`、`prototype.html`、`prototype.css` 和 `prototype.meta.json`。这不是原型页运行的理想常态，而是兼容高保真页、配置项、运行时转换回退和 AI 文件工具的阶段性结果。

文件职责应重新收敛为三层：

| 层级 | 原型页 | 高保真页 | 是否默认展示 |
| :--- | :--- | :--- | :--- |
| 当前运行时源码 | `prototype.html`、`prototype.css` | `index.tsx` | 是 |
| 配置协议 | `config.schema.json`，仅当页面存在页面级配置项时必须写入；无配置时可由系统默认空 schema | `config.schema.json`，同左 | 有内容时展示，空 schema 可弱化或隐藏 |
| 运行时元数据与回退 | 页面尺寸、资源清单、来源 runtime、最近转换信息、旧运行时源码 | 同左 | 否，进入页面元数据或版本/隐藏回退区 |

优化目标：

- 原型页目录的用户可见主文件收敛为 `prototype.html` + `prototype.css`，有配置项时再展示 `config.schema.json`。
- 高保真页目录的用户可见主文件保持 `index.tsx`，有配置项时展示 `config.schema.json`。
- `prototype.meta.json` 不应作为每个原型页都必须显式存在的顶层编辑文件；页面尺寸、资源清单、生成来源和最近转换信息优先进入页面元数据，或在需要追溯时进入版本快照/隐藏元数据区。
- 运行时转换时保留旧运行时源码是必要的，但不应继续放在页面目录顶层干扰用户判断。旧 `index.tsx`、旧 `prototype.html/css` 应进入页面版本、`.runtime-backups/`、或等价隐藏回退区，由系统转换失败回滚和历史追溯使用。
- 文件树默认只展示当前运行时相关文件；需要排查时再通过“显示运行时元数据/回退文件”入口查看隐藏层。

落地顺序建议：

1. [x] 先调整文件树展示策略：按 `runtimeType` 隐藏非当前运行时文件和空 schema，立即降低用户噪声，不迁移磁盘数据。
2. [ ] 再调整 project-core/CLI 的读取规则：允许缺省 `config.schema.json` 和 `prototype.meta.json`，读取时补默认值，写入时只在有实质内容时落盘。
3. [ ] 最后迁移转换回退文件：把旧运行时源码从页面顶层移动到版本快照或隐藏回退区，并保证 runtime API、checkpoint、发布和 viewer 不依赖顶层旧文件。

验收标准：

- 一个无配置项的原型页在文件树中只显示 `prototype.html` 和 `prototype.css`。
- 一个无配置项的高保真页在文件树中只显示 `index.tsx`。
- 新增配置项后，两类页面都显示同一个 `config.schema.json`，避免配置协议分叉。
- 运行时转换失败仍可回退，但回退文件不在默认文件树中增加噪声。

### 校验与清洗

HTML/CSS 原型页必须有共享校验入口，不能只在前端组件中清洗。建议与 preview contract 并列或在 preview contract 中新增原型页入口，供 author-site、project-core、CLI、Agent 工具和发布检查复用。该入口同时承担原型页安全校验和升级闸门职责。

原型页闸门至少包含：

- 禁止 `<script>`、内联事件属性、`javascript:` URL。
- 资源 URL 走白名单和工作区资源解析。
- CSS 禁止全局污染选择器，禁止影响创作端外层 UI。
- 默认禁止远程字体、远程脚本、重滤镜、复杂动画和高成本效果。
- 限制 DOM 节点数量、CSS 长度和单页资源数量。
- 检测是否出现运行时隔离红线，并输出 `accept_prototype`、`repair_prototype` 或 `upgrade_to_high_fidelity`。
- 输出结构化 diagnostics，供 AI 修复、升级重生成和 CLI JSON 使用。

### 渲染策略

首选策略是 Shadow DOM 或受控样式作用域。由于原型页不承载 React root，Shadow DOM 不再受 React 组件预览的主要限制影响，应优先进入技术预研。

画布调度规则：

- 原型页：可见页轻量渲染，离屏页懒挂载或轻量占位。
- 高保真页：继续使用现有 iframe/screenshot/sleeping runtime pool。
- 选中原型页时直接展示最新 HTML/CSS。
- 选中高保真页时优先展示最新截图，必要时唤醒真实 preview runtime。
- 画布中原型页必须和高保真 iframe 使用同一类尺寸语义：内部内容先落在 `previewSize` 设计画板上，再按页面框整体等比缩放；用户调整页面框大小时不能让原型 DOM 按新容器宽高重新排版。原型页 CSS 中的 `vh`、`vw`、`vmin`、`vmax` 需要按设计画板宽高换算，不能读取宿主浏览器窗口尺寸。

### 属性编辑与配置项

属性编辑能力不按页面类型降级。原型页与高保真页都应支持选中页面元素、查看图层上下文、修改常用属性和添加配置项，但写回路径不同：

| 能力 | 原型页 | 高保真页 |
| :--- | :--- | :--- |
| 节点选择 | Shadow DOM 内采集 `VisualNodeInfo` | iframe visual edit 采集 `VisualNodeInfo` |
| 属性编辑 | 写回 `prototype.html` 的文本、属性或 inline style | 通过现有 visual edit/AI 改写 React/TSX |
| 配置项添加 | 写入 `config.schema.json`，并在 HTML 中添加 `data-bind-*` 或插值绑定 | 写入 `config.schema.json`，并补齐 React Props 绑定 |
| 配置项预览 | `PrototypePagePreview` 根据 `configData` 应用绑定 | preview runtime 根据 Props/config 渲染 |
| 画布成本 | 轻量 DOM，不占 iframe 预算 | 继续受 iframe/runtime 调度控制 |

原型页属性编辑的 MVP 范围包括文本内容、图片地址、链接地址、颜色、背景色、边框色、边框宽度、圆角、透明度、字号、字重、行高、字距、对齐、布局方向、间距、内边距和裁剪。复杂结构变更、批量组件抽象和交互逻辑仍交由后续 AI 或高保真页能力处理。

## AI 行为规范

AI 在创作端需要遵守原型优先和系统闸门约束：

- 新建页面和普通页面修改默认输出原型页 HTML/CSS。
- AI 不应向用户索要页面类型选择，除非用户明确要求讨论运行时成本或发布验收边界。
- 当前页面是原型页时，普通修改继续输出 HTML/CSS，不应擅自改成 React/TSX。
- 当前页面是高保真页时，普通修改继续输出 React/TSX。
- AI 不负责前置判断“是否该高保真”；只有系统闸门返回 `upgrade_to_high_fidelity`、用户明确指定高保真、或当前页面已经是高保真页时，AI 才生成 React/TSX。
- 自动升级时，AI 回复用户应简短说明触碰的运行时隔离红线，例如“这个页面需要真实状态联动，会用隔离运行时实现”。
- 用户要求降级时，AI 输出静态 HTML/CSS，保留信息架构和视觉层级，删除复杂交互。
- AI 回复用户时不要用“低能力”“简陋页面”等表达；统一用“原型页”“高保真页”。
- AI 不应把高保真页描述为更高级或更优质的页面，只描述为“需要真实运行时能力时使用”的实现方式。

## 验收标准

### 产品验收

- 新建项目后，AI 默认生成的页面均为原型页。
- 用户不需要先选择页面类型；系统根据原型页闸门决定接受、修复或升级高保真页。
- 用户通过对话指定高保真时，新建或修改目标页面为高保真页。
- 用户可在预览区右键菜单和页面列表更多菜单覆盖页面类型，但该入口不是创建页面的主路径。
- 原型页无默认标识；高保真页有低调标识，不干扰页面内容浏览。
- 页面类型切换失败时，不丢失原页面内容。

### 技术验收

- 原型页不执行任意 JavaScript。
- 原型页 CSS 不污染创作端系统 UI 和其他页面。
- 原型页闸门能稳定输出 `accept_prototype`、`repair_prototype` 或 `upgrade_to_high_fidelity`。
- 命中运行时隔离红线的页面会升级到 iframe/preview runtime，而不是直接挂到主编辑器 DOM。
- 20 个原型页同时进入画布时，首屏加载、滚动和缩放明显优于 20 个高保真 iframe。
- 高保真页仍通过现有 preview contract、编译和 iframe/runtime 机制运行。
- project-core、CLI、author-site API 和发布检查都能识别页面类型。

### AI 验收

- 默认项目生成不再产出全量高保真 React 页面。
- 对话中不指定页面类型时，AI 默认按原型页写入，由系统闸门决定是否升级。
- 对话中明确指定页面类型后，AI 能按目标类型写入。
- 系统触发升级时，AI 能根据结构化 diagnostics 给出轻量原因，避免用户误以为系统随机改变页面形态。
- 原型升级高保真失败时，AI 能根据 preview diagnostics 继续修复。
- 高保真降级程序处理失败时，AI 能接管生成可读的 HTML/CSS 原型页。

## 待办

- [x] 基于已落地的 `prototypeGate` 补齐自动修复一次、升级重生成和用户侧轻量原因反馈：Agent `writeFile` / `editFile` 反馈会对 `repair_prototype` 给出原型内修复指令，对 `upgrade_to_high_fidelity` 给出高保真重生成路径和轻量原因说明要求。
- [x] 补齐高级手动切换闭环：页面列表更多菜单、单页预览工具栏和画布页面卡片右键菜单已接入 AI 转换任务与 `ai.runtime_conversion_requested` 诊断事件；编辑页会显示转换中、完成和失败状态，失败时提供重试入口。
- [x] 补齐双向转换：原型页升级高保真页由 AI 生成 React 目标文件；高保真页降级原型页会先在当前单页预览 iframe 已加载且同源可读时尝试程序静态化 DOM/CSS，并通过 author-site runtime API 校验写入。静态化不可用或校验失败后，编辑页会自动把失败原因交给 AI 接管生成 `prototype.html/css`；AI 文件刷新后，编辑页会在目标文件齐备但 `runtimeType` 未切换时调用 runtime API 完成校验与元数据更新。
- [x] 采集性能基线实测数据：已提供 `scripts/development/measure-prototype-canvas-performance.mjs`、`scripts/development/create-prototype-canvas-performance-fixtures.mjs`、`pnpm test:prototype-canvas-performance` 和 `pnpm test:prototype-canvas-fixtures`，并已对 20 个高保真 iframe、20 个截图占位、20 个 HTML/CSS 原型页跑出报告。

## 验证状态

已完成创作端 MVP 代码验证，当前验证项目为 `proj_1782980494805_klfp75`，包含 30 个复杂 HTML/CSS 原型页和 2 个高保真 React 对照页。原型页已接入轻量画布渲染、配置绑定和单页预览属性编辑；project-core/CLI、author-site session 文件 API、checkpoint/页面版本创建校验和 Agent 文件工具反馈已输出 `prototypeGate` 三态结果，能区分可修复原型问题和运行时隔离红线；Agent 工具反馈已补齐 `repair_prototype` 自动修复指令和 `upgrade_to_high_fidelity` 高保真重生成指令；project-core/CLI 与 author-site session runtime API 已支持页面运行时切换，切换前按目标运行时校验，失败时保留原类型和原内容，成功后保留旧运行时文件作为回退来源，且 author-site runtime API 已补齐请求类型校验、Schema 冲突校验和页面元数据 `runtimeType` 保留逻辑；页面列表更多菜单、单页预览工具栏和画布页面卡片右键菜单已能把运行时转换任务发送给 AI 并记录诊断事件，高保真降级原型页会先尝试当前单页 iframe DOM 静态化，失败后自动转 AI 接管，AI 文件刷新后会自动调用 runtime API 收口目标运行时切换，工具栏显示转换状态并提供失败重试；原型页发布策略已确定为允许直接静态发布，发布产物和 viewer-site 单页/画布渲染已支持 `prototype-html-css`；创作端单页预览已对高保真页显示低调 `高保真` 标识；验证中临时写入的浏览器测试字段和测试文本已还原。

性能基线实测数据：

- 20 个 HTML/CSS 原型页：`tmp/prototype-canvas-performance/prototype-20-1782989884764.json`，20 个原型轻量预览、0 个 iframe、idle 约 60.73 FPS、interaction 约 60.67 FPS。
- 20 个高保真 iframe：`tmp/prototype-canvas-performance/iframe-20-1782989884698.json`，16 个 iframe、0 个截图、idle 约 60.79 FPS、interaction 约 58.81 FPS。
- 20 个截图占位：`tmp/prototype-canvas-performance/screenshot-20-after-state-merge-1782990432023.json`，20 张截图、0 个 iframe、idle 约 60.76 FPS、interaction 约 60.36 FPS。该场景验证了 fast variant 本地 meta fallback 与前端截图状态合并修复。

已验证命令：

- `corepack pnpm --filter @opencode-workbench/author-site typecheck`
- `corepack pnpm check:author`
- `corepack pnpm check:project-core`
- `corepack pnpm check:project-cli`
- `corepack pnpm check:project-scaffold`
- `corepack pnpm check:viewer`
- `corepack pnpm check:agent`
- `corepack pnpm check:screenshot`
- `corepack pnpm check:all`

浏览器验证：

- 在 `http://localhost:3200/demo/proj_1782980494805_klfp75/edit` 登录后进入单页预览，切到右侧属性面板，选中 Shadow DOM 内文本节点，修改文本后确认 `/api/sessions/{sessionId}/files/prototype_mvp_01` 返回 200，`prototype.html` 写回成功。
- 通过属性行“更多 -> 设为配置项”新增页面级文本配置项，确认 `prototype.html` 写入 `data-bind-text`、`config.schema.json` 写入字段，右侧配置面板改值后 Shadow DOM 预览实时更新。

## 风险

- 原型页如果没有共享校验入口，CLI、Codex、author-site 和发布检查会出现规则分叉。
- 高保真降级为原型页不可能保证无损，必须明确静态化边界和用户预期。
- 原型页 DOM 过多也会造成画布卡顿，需要节点数量、资源数量和离屏懒挂载策略。
- 如果原型页允许直接发布，viewer 和发布验收需要补充静态页面语义；如果不允许发布，发布前必须提供批量升级路径。
- 如果把页面类型选择前置给用户或 AI，会造成理解成本和决策噪声；应坚持原型优先闸门升级，手动入口只作为高级覆盖能力。
- 系统升级如果缺少结构化原因记录，后续排查会难以判断是运行时隔离红线触发还是规则过度升级。
