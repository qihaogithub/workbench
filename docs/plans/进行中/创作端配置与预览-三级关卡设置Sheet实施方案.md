# 创作端配置与预览：三级关卡设置 Sheet 实施方案

> 状态：已实施（真实 `PageConfigPanel` 与关卡 Schema 已接入）  
> 创建日期：2026-09-03  
> 适用范围：创作端配置面板、`@workbench/demo-ui` 配置表单组件  
> 关联 Demo：[config-panel-drilldown-demo.html](/Users/qh2/Documents/PGM/1·Work/workbench/config-panel-drilldown-demo.html)

## 一、背景与结论

当前配置面板使用 `ConfigForm → FieldRenderer → ArrayFieldGroup` 递归渲染对象数组和 `oneOf` 变体。关卡模块继续在页面内展开时，三级关卡卡片的字段会变成“卡片套卡片”，并产生重复箭头、过度缩进和较长滚动距离。完全切换成独立二级/三级页面又会让父级上下文消失，返回时容易偏离用户预期。

独立 Demo 与真实配置组件均已验证混合方案：

```text
一级：本页配置（创作端现有页面）
  └─ 二级：关卡模块（本页内现有展开/折叠）
       └─ 三级：关卡设置（子级 Sheet 叠层）
            └─ 三级以后：继续复用同一个 Sheet 路由，不再叠加 Sheet
```

本方案将该交互落到真实配置组件，核心边界是：

1. **一级和二级保持创作端现有实现效果**。页面配置仍是同一面板，关卡模块仍在本页内展开；不新增一级/二级页面，也不为一级、二级渲染 Sheet 面包屑。
2. **只有进入三级及以后才打开 Sheet**。点击具体关卡条目后，在父级面板之上打开一个子级 Sheet；父级内容、滚动位置和选中条目保留在底层。
3. **面包屑只属于 Sheet**。三级 Sheet 的顶部只显示当前条目，例如 `‹ 关卡 01`；`关卡模块 / 关卡列表` 属于 Sheet 外的父级配置栏，不在 Sheet 面板内重复显示。一级、二级页面不显示这套 Sheet 面包屑或额外导航栏。
4. **三级以后不做 Sheet 套 Sheet**。继续下钻时替换当前 Sheet 内容并更新路径，始终只有一个 Sheet 层；返回回到父级列表或上一个 Sheet 路由。

## 二、目标

- 在真实 `PageConfigPanel` 中复用 Demo 已确认的层级体验。
- 保留现有 Schema、配置值、保存、防抖、批注、设计规范、白板和定位编辑能力。
- 消除三级关卡字段的嵌套卡片和重复缩进，同时保持父级列表的上下文可见。
- 让添加、删除、排序、资源替换和坐标修改在 Sheet 中有明确反馈；若 Schema 声明状态枚举则沿用现有状态控件。
- 在桌面约 500px 配置栏和 375px 移动视口下无横向滚动。
- 为后续是否扩展到其他对象数组提供明确的 opt-in 机制，而不是把所有嵌套数组一律改成 Sheet。

## 三、范围与非目标

### 3.1 本次范围

- `@workbench/demo-ui` 的配置面板、数组字段和字段渲染链路。
- 关卡模块 → 关卡列表 → 关卡卡片设置这条真实交互路径。
- Sheet 的打开、关闭、返回、遮罩、Esc、焦点、滚动和响应式行为。
- 三级关卡设置中的图片/动效资源、X/Y/W/H 和“拖动定位”；状态下拉仅在 Schema 声明 `state` 字段时出现，当前进行中关卡 fixture 已移除该字段，不在 UI 层伪造状态值。
- 现有配置 `onChange`、预览联动和持久化链路的透传。

### 3.2 非目标

- 不修改真实配置值的 JSON 结构、接口、保存协议或权限协议。
- 不重写 `ConfigForm`，不替换所有 `ArrayFieldGroup` 的 Accordion/Collapsible 行为。
- 不把一级页面或二级模块改成独立路由或独立全屏页面。
- 不增加数字化兄弟项切换器（如 `01 / 02 / 03`）作为主导航。
- 不在 Sheet 内再嵌套第二个 Sheet；更深层级使用同一个 Sheet 内容区和路由状态。
- 不把当前静态 Demo 直接当作生产组件或接入 Demo 的静态数据。

## 四、交互规格

### 4.1 层级行为

| 层级 | 用户看到的内容 | 展示方式 | 导航规则 |
| --- | --- | --- | --- |
| 一级 | 本页配置、页面级字段、内容模块列表 | 现有配置面板 | 不显示 Sheet 面包屑；页面顶部/现有返回行为保持不变 |
| 二级 | 关卡模块字段、关卡背景图、引导形象、关卡图列表 | 一级面板内展开的现有模块区域 | 点击模块标题可展开/收起；父级内容仍在原滚动容器中 |
| 三级 | 单个关卡的关卡设置 | 子级 Sheet 叠在二级内容之上 | Sheet 打开后显示面包屑；关闭/返回恢复二级列表上下文 |
| 三级以后 | 更深的关卡子对象（如未来扩展字段） | 替换同一个 Sheet 的内容 | 内部路由路径追加当前条目，顶栏仍只显示当前条目，不新增 Sheet 层 |

### 4.2 Sheet 顶部与面包屑

- 一级、二级永远不渲染 Sheet 顶栏和 Sheet 面包屑。
- 三级 Sheet 顶部只保留：返回按钮、面包屑、修改状态/必要的轻量操作；不放重复的页面导航、模块导航条或兄弟项数字切换器。
- 面包屑只显示当前 Sheet 条目，推荐格式：`‹ 关卡 01`。`关卡模块` 和 `关卡列表` 留在父级配置栏上下文，不在 Sheet 顶栏渲染。
- 当前关卡名称使用 `aria-current="page"`；由于父级节点不在 Sheet 内，返回按钮负责回到二级模块内的关卡列表。若未来进入四级，仍只显示当前条目，返回只退回上一个 Sheet 路由，不关闭整个 Sheet。
- Sheet 内不显示“所有页面 / 本页配置”等一级上下文，避免顶部导航信息过载；父级保留本身已经提供足够上下文。

### 4.3 父级保留与返回恢复

- 打开三级 Sheet 前记录：父级滚动容器、滚动偏移、选中条目稳定 ID、当前展开模块路径。
- Sheet 打开后，右侧配置栏内的父级列表作为视觉 underlay 保留，但设置 `inert`/`aria-hidden`，不允许用户在 Sheet 开启时误操作父级控件；配置栏外页面不纳入 underlay。
- Sheet 关闭、点击遮罩、按 Esc 或点击返回按钮时，恢复父级滚动偏移和选中条目；若条目已被删除，则回到列表顶部或最近邻条目并给出轻量提示。
- 打开 Sheet 后修改字段不应导致父级滚动位置跳动；配置值仍通过已有 `onChange` 向宿主传递。
- 触发 Sheet 的关卡行在关闭后恢复键盘焦点；如果触发元素已被删除，焦点回到关卡列表容器。
- Sheet 只覆盖右侧配置栏内部：面板在容器内保留约 8px 内缩、最大宽度约 500px，并使用配置栏剩余高度独立滚动；蒙层不覆盖中间预览、左侧对话或其他右侧栏外区域，外部页面交互保持可用。

### 4.4 三级关卡设置字段

Sheet 需要覆盖当前截图和 Demo 的主要字段，按平面表单排列：

- 未解锁图、已解锁图、已完成图：缩略图/未配置占位、上传/替换操作。
- SVGA 动效：资源上传/替换和未配置状态。
- 当前状态：若业务 Schema 声明 `state` 枚举则继续使用现有枚举控件；当前进行中关卡 fixture 不含 `state`，因此 Sheet 不额外生成状态字段。
- 自由坐标：X、Y、W、H 数字输入；保留现有一倍坐标与二倍宽高约定。
- “拖动定位”：调用已有 `onEnterPositionEdit` 等定位编辑回调；Sheet 中显示当前定位状态并提供退出入口。
- 字段批注、设计规范和白板入口按现有权限与能力继续显示，不复制到父级。

### 4.5 列表操作

- 点击关卡行主体/标题进入三级 Sheet。
- 关卡列表是否显示拖拽手柄由该数组字段的 `$demo.sortable` 独立决定；必须显式声明布尔值，`false` 时仍可进入 Sheet、添加和删除但不允许排序，`true` 时允许排序。启用时拖拽手柄只负责排序，删除按钮、更多菜单、批注/白板入口必须阻止事件冒泡，不能误开 Sheet。
- 添加关卡仍在二级列表完成；新增后可按现有规则展开该行，不自动强制打开 Sheet，除非产品后续明确指定。
- 删除、排序后以稳定条目 ID 维护当前路由；正在编辑的条目被删除时，关闭 Sheet 并提示“关卡已删除”。
- 状态切换、资源替换、坐标修改均提供即时视觉反馈，并沿用既有未保存/已修改状态。

## 五、技术方案

### 5.1 路由与状态模型

在配置面板宿主维护“当前数组展开状态”和“三级 Sheet 路由”两类状态，避免把页面级 detail 状态与 Sheet 混为一谈：

```ts
type ConfigSheetRoute = {
  arrayPath: string;       // 例如 modules[3].levels
  itemId: string;          // 稳定于数组索引的 UI 条目 ID
  itemTitle: string;
  // Full ancestry is retained for route history; the Sheet header only shows
  // the terminal/current item.
  breadcrumb: Array<{ id: string; label: string; level: number }>;
  parentScrollTop: number;
  parentFocusKey?: string;
};

// null 表示当前没有三级 Sheet
const [sheetRoute, setSheetRoute] = useState<ConfigSheetRoute | null>(null);
```

约束：

- `sheetRoute === null` 时只渲染一级/二级现有面板。
- 只有明确标记为三级或更深的数组项才能创建 `sheetRoute`。
- 路由、DND key 和焦点恢复均不得只依赖数组 index；优先使用现有稳定 ID，若数据没有 ID，则在组件内维护稳定的 ephemeral ID 映射。
- 数组重排时移动 ID 映射；删除当前项时先关闭或回退路由，再提交 `onChange`，避免悬挂引用。
- 三级以后沿用同一个 `sheetRoute` 容器，通过替换 `itemId/breadcrumb` 实现“Sheet 内下钻”。
- 代码层由 `ConfigItemDetail` 承载同等信息，并额外提供 `onChangeField`、`getCurrentIndex` 与 `getCurrentItem`，使协同重排/字段更新后仍按稳定条目 ID 回写、生成当前字段路径并显示最新值。

### 5.2 组件职责与文件改动

#### `packages/demo-ui/src/PageConfigPanel.tsx`

- 增加 Sheet 路由、父级滚动快照、触发元素焦点和关闭原因状态。
- 将 Sheet 作为现有配置面板根节点内的容器级浮层挂载，使用绝对定位与内缩尺寸，避免影响配置表单布局和滚动高度。
- 将当前页面配置表单作为父级 underlay；Sheet 打开时只遮罩和禁用右侧配置栏内部，不卸载父级，也不锁定 `body` 或阻断配置栏外页面。
- 提供 `openConfigItemSheet`、`handleSheetBack`、`handleSheetBreadcrumb` 等内部回调给下层字段组件。
- 处理全局 Esc、遮罩点击、滚动锁定、恢复焦点和退出定位编辑的清理。

#### `packages/demo-ui/src/ArrayFieldGroup.tsx`

- 保留现有 `Collapsible`、DND、添加、删除和排序逻辑，默认行为不变。
- 新增显式 opt-in 的条目详情能力，例如 `detailPresentation: "inline" | "sheet"` 与 `onOpenItemDetail`；不要根据“嵌套数组”深度全局推断。
- 二级 `levels` 列表的行主体调用 `onOpenItemDetail`；一级/二级其他数组仍走 `onToggle` 展开。
- 拆分“打开详情”和“拖拽/删除/更多操作”事件区域，保证事件不会串联。
- 将当前 item 的稳定 ID、路径和可见字段上下文传给 Sheet，不把完整 Sheet UI 写进递归渲染分支。

#### `packages/demo-ui/src/FieldRenderer.tsx`

- 透传字段路径、数组层级、详情展示能力解析器和 `onOpenItemDetail`。
- 对直接字段控件的 value/onChange 语义保持不变；Sheet 只是承载容器，不新增第二套字段渲染协议。
- 继续传递 `positionInstanceId`、`positionDomOccurrence`、批注、设计规范、白板和权限参数。

#### 新增 `packages/demo-ui/src/ConfigDetailSheet.tsx`

- 实现通用 Sheet 壳：支持文档级 portal 和配置栏容器级两种挂载；容器级使用右侧内缩、最大宽度约 500px、配置栏高度和局部蒙层，移动端按可用宽度收缩。
- 提供 `role="dialog"`、`aria-modal`、可访问标题、焦点圈、Esc/遮罩关闭和关闭后焦点返回。
- 接收 `route/breadcrumb` 和单条目字段渲染内容；宿主仅在 route.level >= 3 时传入面包屑，且 Sheet 顶栏只传入/渲染当前条目，父级祖先仅供路由历史使用。
- 支持同一 Sheet 内替换路由，不渲染 Sheet 套 Sheet；减少动画期间的布局抖动。
- 使用 `prefers-reduced-motion` 关闭或缩短动画；Sheet 内容独立滚动但禁止页面横向滚动。

#### `packages/demo-ui/src/schema-parser.ts` / `packages/demo-ui/src/types.ts`

- 优先在字段 UI 元数据中增加显式能力（`ui:options.detailPresentation: "sheet"`、`ui:options.detailBreadcrumbTitle`、`ui:options.itemTitleTemplate`），由解析器统一转成字段展示元数据。
- `FieldConfig` 保留未知 `ui:options`，不改变配置值 Schema；类型侧增加窄化的 UI 展示类型和 Sheet 回调类型。
- 若当前关卡 Schema 没有稳定 item ID，不强行把 UI ID 写回业务配置；建立组件内部 ID 映射，优先按业务 ID、其次按内容指纹复用，并在字段编辑、重排、增删和协同回放时维护。

#### 测试文件

- `packages/demo-ui/src/ArrayFieldGroup.test.tsx`（如不存在则新增）：详情入口、DND/删除事件隔离、稳定 ID、增删排序后的路由行为。
- `packages/demo-ui/src/ConfigDetailSheet.test.tsx`（新增）：当前条目面包屑、返回/遮罩/Esc、焦点、同 Sheet 路由替换、无障碍属性。
- `packages/author-site/src/components/demo/page-config-panel.test.tsx`：真实 `PageConfigPanel` 中一级/二级原行为不变，三级打开 Sheet 并恢复父级上下文。
- 必要时补充现有 `ConfigForm.test.tsx`、`FieldRenderer.test.tsx` 的回调透传断言。

## 六、实施任务清单

### 阶段 0：基线与 Schema 盘点

- [x] 从真实页面 Schema 找到关卡模块、关卡列表和关卡卡片的字段路径。
- [x] 确认当前关卡条目没有稳定业务 ID；ephemeral ID 在组件内生成，并按业务 ID/内容指纹及同位置回退维护生命周期。
- [x] 记录现有 `ArrayFieldGroup` 的添加、删除、排序、`oneOf` 分支和定位字段行为。
- [x] 采用 Schema `ui:options` opt-in，解析为统一的详情展示能力；数组排序另由 `$demo.sortable` 按层级独立声明。

### 阶段 1：Sheet 基础能力

- [x] 新增 `ConfigDetailSheet`，完成 portal、遮罩、滚动锁定、Esc、焦点圈和 reduced-motion。
- [x] Sheet 面板保持不透明，仅使用显式 `transform` 做约 300ms 无过冲缓进缓出，蒙层单独约 320ms 淡入，避免 underlay 透出形成残影；组件以内联过渡时长锁定参数，避免工具类时长回退到默认 150ms；移除 `animate-in/slide-in-from-right` 关键帧组合，`prefers-reduced-motion` 下保持无过渡。
- [x] 实现只允许一个 Sheet 实例的路由替换机制。
- [x] 实现三级 Sheet 面包屑：只在 Sheet 内渲染当前条目；一级/二级父级路径不显示。
- [x] 实现父级 underlay 的 `inert/aria-hidden`、滚动快照和关闭恢复。

### 阶段 2：配置组件接入

- [x] 在 `PageConfigPanel` 增加 Sheet 路由与父级上下文状态。
- [x] 在 `FieldRenderer`/`ArrayFieldGroup` 增加 opt-in 详情回调并透传完整字段上下文。
- [x] 将关卡列表行主体接入三级 Sheet；按 `$demo.sortable` 条件显示拖拽手柄，并保持删除和菜单的独立事件。
- [x] 将关卡卡片字段平面化渲染到 Sheet，接通现有资源、坐标和定位回调；状态控件遵循 Schema 声明，当前 fixture 未声明则不伪造。
- [x] 验证现有批注、设计规范、白板和只读权限在 Sheet 内仍遵循原能力矩阵。

### 阶段 3：交互打磨与兼容

- [x] 验证返回后父级滚动、展开项和焦点均恢复；条目删除/页面切换时路由失效并回到列表容器。
- [x] 验证新增、删除及（启用 `$demo.sortable` 时的）排序操作中稳定 ID 与 Sheet 路由不漂移；删除当前项能安全回退。
- [x] 验证 Sheet 打开时父级控件不可交互，关闭后恢复交互。
- [x] 组件壳适配移动端全宽与桌面约 500px 面板，内容独立滚动且不产生横向布局。
- [x] 右侧配置栏容器边界已接入：Sheet 比配置栏略窄、只占配置栏内容高度，蒙层不覆盖配置栏外页面且不锁定 `body`。
- [x] 沿用现有字段控件的 hover、focus-visible、禁用态、错误态、上传中和未保存态。

### 阶段 4：测试与验收

- [x] 运行 `corepack pnpm check:demo-ui` 等价覆盖（demo-ui typecheck + 全量 Vitest）。
- [x] 运行 `corepack pnpm --filter @workbench/author-site typecheck` 和配置面板定向测试。
- [x] 组件测试走通“本页配置 → 展开关卡模块 → 点击关卡 → 修改字段 → 返回关卡列表”；独立 Demo 已完成桌面/窄屏浏览器走查。
- [x] 验收三级 Sheet 中只存在一个 Sheet，且面包屑只在三级 Sheet 中出现。
- [x] 验收父级内容在 Sheet 下仍可见、滚动位置可恢复、无横向布局；测试环境无控制台错误。
- [x] 运行时采样确认面板位移从约 `440px` 单调收敛到 `0px`，无越界回弹；面板/蒙层时长分别为 `300ms`/`320ms`，underlay 不发生几何位移或缩放。
- [x] 将最终组件契约和当前行为同步到 `docs/项目文档/创作端/04-配置与预览/` 文档。

## 七、验证方案

### 7.1 单元与组件验证

- 层级能力：level 1/2 不创建 Sheet；level 3 创建 Sheet；level 4 替换同一 Sheet，不出现第二个实例。
- 面包屑：无 Sheet 时无 Sheet 面包屑；三级 Sheet 只显示当前条目；当前节点不可误触发重复打开。
- 路由稳定性：数组重排后仍编辑同一 item；删除当前 item 不向已删除路径写入配置。
- 交互隔离：拖拽、删除、更多菜单、批注和白板按钮不会触发行点击。
- 返回语义：返回按钮、遮罩和 Esc 能回到正确层级；焦点回到触发元素或列表容器。父级节点不在 Sheet 顶栏渲染。
- 配置链路：Sheet 内字段修改触发现有 `onChange`，保留 `fieldPath`、`positionInstanceId` 和现有默认值/权限行为。

### 7.2 浏览器验收矩阵

| 场景 | 预期 |
| --- | --- |
| 初始一级 | 页面配置和模块列表正常；没有 Sheet 面包屑 |
| 展开关卡模块 | 二级字段在本页内展开；一级内容未消失；没有 Sheet |
| 点击关卡 1 | 父级仍在底层；只出现一个三级 Sheet；顶部只出现当前条目 `关卡 01`，不重复显示 `关卡模块 / 关卡列表` |
| 修改资源/坐标（及已声明的状态） | 预览和“已修改”状态即时反馈；Sheet 不跳动 |
| 返回关卡列表 | Sheet 关闭，回到二级列表原滚动位置和选中项 |
| 删除/排序 | 列表反馈正确；不会把 Sheet 路由错绑到其他关卡 |
| 375px/500px | 无横向滚动；字段标签、按钮和数值输入可读可操作 |
| Esc/遮罩/键盘 | 关闭语义一致，焦点不丢失，父级不会误操作 |

## 八、风险与待确认事项

1. **三级数组识别过度泛化**：如果用数组嵌套深度自动判断，其他业务数组会被意外改成 Sheet。必须采用显式 `ui:options` 或宿主 resolver，并为未声明数组保留 inline 默认值。
2. **稳定 ID 缺失（已缓解）**：当前进行中关卡配置没有业务 ID，组件已按业务 ID、内容指纹和同位置回退维护 ephemeral ID；若未来出现内容完全相同且无业务 ID 的兄弟项，仍应优先补充业务 ID 以消除天然歧义。
3. **DND 与点击竞争（已覆盖）**：拖动手柄与行主体、删除按钮保持独立激活区，现有鼠标、触摸和键盘排序逻辑未被 Sheet 入口改变。
4. **父级交互与无障碍**：视觉上保留父级不等于允许父级操作；Sheet 打开时必须 inert/aria-hidden，并在关闭时恢复。
5. **定位编辑跨层清理（已覆盖）**：Sheet 自身注册表在关闭或字段卸载时触发退出回调，避免画布仍指向已卸载的字段路径。
6. **更深层级信息密度**：三级以后虽然共用一个 Sheet，但要限制顶部只显示一条轻量路径；不要恢复当前 Demo 中被否定的数字兄弟项切换器。
7. **未保存状态与路由切换**：Sheet 内已有修改时切换条目或关闭的确认语义应复用现有未保存状态，不新增另一套草稿协议。
8. **移动端浏览器行为**：需要在真实 375px 视口验证软键盘、`100dvh`、焦点滚动和遮罩滚动锁定，避免仅在桌面 DevTools 模拟下通过。

## 九、当前进度

- [x] 独立 Demo 已完成混合层级交互：一级/二级 inline，三级 Sheet。
- [x] Demo 已验证父级保留、父级滚动位置恢复、当前条目面包屑、无数字兄弟项切换器。
- [x] Demo 已覆盖关卡资源、状态、坐标和拖动定位的主要字段。
- [x] Demo 静态脚本语法检查与 `git diff --check` 已通过；桌面和窄屏浏览器走查无横向滚动、无控制台错误。
- [x] `ConfigDetailSheet` 已作为单实例容器级浮层接入真实 `PageConfigPanel`；`ArrayFieldGroup` 通过显式 `detailPresentation: "sheet"` 打开详情，未声明数组保持原有 inline 行为。
- [x] 真实 `PageConfigPanel` 改为容器级 Sheet：局部蒙层覆盖配置栏内部，Sheet 采用内缩有限宽度/高度，配置栏外页面保持交互。
- [x] 关卡进行中 Schema 已声明 `detailPresentation`、`detailBreadcrumbTitle` 和 `itemTitleTemplate`；当前 fixture 的 `state` 字段已由既有业务修改移除，Sheet 不伪造状态字段。
- [x] 已完成组件类型检查、Sheet/ConfigForm/PageConfigPanel 定向测试；全量 `check:demo-ui`（54 个文件、301 个测试）与 author-site 类型检查/配置面板测试（35 个测试）均通过。

## 十、完成标准

以下条件均已满足，真实实现完成：

- 一级“本页配置”和二级“关卡模块”与创作端现有展开行为一致，父级不会因进入详情而消失。
- 三级“关卡设置”及更深层级只使用一个子级 Sheet；不存在 Sheet 套 Sheet。
- Sheet 的面包屑只在三级 Sheet 内显示，且仅展示当前条目；一级、二级父级路径不在 Sheet 中重复显示。
- 关卡列表可点击进入 Sheet，返回可恢复列表滚动位置、选中项和焦点。
- 关卡设置覆盖 Schema 当前声明的主要资源、SVGA、X/Y/W/H 和拖动定位操作，且配置值仍走现有保存链路；若后续恢复 `state` 枚举，现有控件会按声明自动出现。
- 添加、删除、排序、状态切换和坐标修改均有可感知反馈；排序/删除不会造成错绑。
- 375px 至桌面宽度无横向滚动，键盘、Esc、遮罩和 reduced-motion 行为通过验收。
- `check:demo-ui`、author-site 定向类型检查/测试和独立 Demo 浏览器走查均通过；相关项目文档已同步当前实现事实。
