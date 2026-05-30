# 使用端预览区与配置面板一致性问题修复方案

> 创建日期：2026-05-30
> 关联方案：`使用端完全解耦静态化方案.md`（第三阶段 viewer-site 静态化改造）
> 状态：待审批

---

## 一、问题诊断

### 1.1 核心问题

原方案第三阶段为 viewer-site 设计了**独立的简化组件**（`StaticPreviewPanel`、`StaticConfigPanel`），而非复用 author-site 的完整组件。这导致使用端的预览区和配置面板与创作端**完全不一致**。

### 1.2 差异清单

#### A. 预览面板（PreviewPanel vs StaticPreviewPanel）

| 维度 | author-site `PreviewPanel` (476行) | viewer-site `StaticPreviewPanel` (78行) |
|:-----|:-----|:-----|
| **缩放逻辑** | `computePreviewScale()` — 保持设计稿宽高比(375×812)等比缩放，`transform: scale()` + `transformOrigin: top left` | ❌ 无缩放，iframe 直接 `w-full h-full` |
| **容器尺寸监听** | `ResizeObserver` 追踪容器宽高变化，动态计算缩放比 | ❌ 无 |
| **图片URL解析** | `resolveImageUrls()` — 将 `/api/sessions/...` 相对路径补全为完整 URL | ❌ 无（使用端不需要，但需确认预编译代码中的路径是否正确） |
| **滚动条隐藏** | `hideIframeScrollbar()` — 隐藏 iframe 内部滚动条 | ❌ 无 |
| **代码校验** | `isValidCode()` — 校验代码有效性 | ❌ 无 |
| **编译状态** | 编译中 loading 动画 | ❌ 无 loading 状态 |
| **错误展示** | 编译错误 + 运行时错误，红色错误面板 | ❌ 无错误展示 |
| **消息过滤** | `event.source !== iframe.contentWindow` 过滤非目标 iframe 消息 | ❌ 无过滤，所有 `READY` 消息都会触发 |
| **configData ref** | `configDataRef` 避免编译 effect 闭包问题 | ✅ 有 |
| **iframe 外层** | `containerRef` + `wrapperStyle` + `iframeStyle` + 圆角边框 | 裸 iframe，无容器包裹 |

**影响**：使用端预览区无法正确缩放，组件渲染尺寸与设计稿不一致；无错误反馈，出错时用户看到空白。

#### B. 配置面板（ConfigFormNew vs StaticConfigPanel）

| 维度 | author-site `ConfigFormNew` (1039行) | viewer-site `StaticConfigPanel` (264行) |
|:-----|:-----|:-----|
| **字段分组** | `detectGroup()` 智能分组（颜色配置/尺寸设置/文本内容/图片资源/显示选项/动画效果/布局设置/基础配置） | ❌ 无分组，平铺列表 |
| **可折叠分组** | `Collapsible` + `Badge` 显示字段数量 | ❌ 无 |
| **字段类型检测** | 三层优先级：`ui:widget` → `format` → `type` | ❌ 仅 `type` 一层 |
| **ui:widget 支持** | `file`/`image` → FileUploadWidget, `imageList` → ImageListWidget, `richtext` → Textarea | ❌ 不支持 |
| **format 支持** | `format: "image"` → FileUploadWidget, `format: "color"` → 颜色选择器 + Input | ❌ 不支持 |
| **array 类型** | ImageListWidget（图片列表控件） | ❌ 不支持 |
| **number 类型** | 有 min/max → Slider + 数值显示 + 单位推断；无 min/max → Input | ❌ 仅原生 `<input type="number">` |
| **boolean 类型** | shadcn/ui `Switch` 组件 | ❌ 自制 toggle 按钮（视觉不同） |
| **enum 类型** | shadcn/ui `Select` 组件 + `enumNames` 支持 | ❌ 原生 `<select>`，无 `enumNames` |
| **string 类型** | `maxLength > 100` → Textarea；否则 → shadcn/ui `Input` | ❌ 原生 `<input type="text">` |
| **颜色选择** | `format: "color"` → 原生颜色选择器 + Input 组合 | ❌ 不支持 |
| **拖拽排序** | `@dnd-kit` 拖拽排序 + 上下移动按钮 + 恢复默认顺序 | ❌ 不支持 |
| **字段备注** | `NoteButton`/`NoteDialog`/`NotePreview` | ❌ 不支持 |
| **UI 组件库** | shadcn/ui 全套（Badge, Switch, Slider, Input, Textarea, Label, Select, Tooltip, ScrollArea, Separator, Collapsible, Button） | ❌ 原生 HTML 元素 |
| **ScrollArea** | shadcn/ui `ScrollArea` | ❌ 原生 `overflow-y-auto` |
| **配置作用域** | `ConfigScopeWrapper` 区分项目级/页面级配置 | ❌ 简单 Tab 切换 |

**影响**：使用端配置面板外观完全不同，功能大量缺失（颜色选择、图片上传、滑块、排序等），用户体验严重降级。

#### C. 页面布局

| 维度 | author-site `/viewer/[projectId]` (493行) | viewer-site `ProjectPreviewPage` |
|:-----|:-----|:-----|
| **预览模式** | 单页/宫格模式切换 | ❌ 仅宫格模式 |
| **宫格列数** | 可配置 2/3/4 列 | ❌ 固定响应式网格 |
| **页面目录** | 左侧 `ScrollArea` 页面列表 | ❌ 无（文件夹/页面混合展示） |
| **URL 参数** | mode, columns, config, configWidth, pages, toolbar, theme, background, configData 等 | ❌ 无 URL 参数支持 |
| **配置面板** | 右侧固定面板，项目级 + 页面级 ConfigScopeWrapper 分区 | ❌ 无配置面板（需进入 Demo 页才有） |
| **设置弹出** | `Popover` 悬浮设置按钮 | ❌ 无 |

| 维度 | author-site `/viewer/[projectId]/[demoId]` (350行) | viewer-site `DemoPreviewPage` |
|:-----|:-----|:-----|
| **配置面板** | 右侧固定面板 + 悬浮 Settings 按钮折叠 | 右侧固定面板 + Header 配置按钮 |
| **配置作用域** | `ConfigScopeWrapper` 区分项目级/页面级 | ❌ 简单 Tab 切换 |
| **Session 支持** | 创建 Session 支持图片上传 | ❌ 无 |
| **页面目录** | 可选左侧页面列表 | ❌ 无 |
| **背景色** | URL 参数控制预览背景色 | ❌ 无 |

#### D. iframe-template

| 维度 | author-site | viewer-site |
|:-----|:-----|:-----|
| **CDN 基地址** | 可配置（`CDN_BASE_URL` 环境变量） | 硬编码 `https://esm.sh` |
| **代码加载模式** | 仅内联代码（Blob URL） | 内联代码 + URL fetch 模式（`isUrl`） |
| **预置代码** | 支持 `compiledCode` 选项直接嵌入 | ❌ 不支持 |
| **模块加载** | 内联 `import()` | 提取 `loadModuleFromCode()` 辅助函数 |
| **console.log** | 大量调试日志 | ✅ 已清理 |

### 1.3 根本原因

原方案的设计思路是**为 viewer-site 创建独立的简化组件**，而非**复用 author-site 的组件**。这种"重新实现"的方式必然导致：

1. **功能缺失**：简化版无法覆盖完整版的所有特性
2. **视觉差异**：使用不同的 UI 原语（原生 HTML vs shadcn/ui）
3. **持续漂移**：两套代码独立演进，差异只会越来越大

---

## 二、解决方案

### 2.1 核心策略：共享组件包

创建 `@opencode-workbench/viewer-ui` 共享组件包，将预览面板、配置面板、iframe 模板等核心 UI 组件提取到共享包中，author-site 和 viewer-site 均从该包导入，从架构层面保证一致性。

### 2.2 为什么选择共享包而非复制代码

| 维度 | 复制代码到 viewer-site | 共享组件包 |
|:-----|:-----|:-----|
| 一致性保证 | ❌ 手动同步，必然漂移 | ✅ 同一源码，天然一致 |
| 维护成本 | ❌ 修改需同步两处 | ✅ 修改一处即生效 |
| 初始工作量 | 较低 | 较高（需创建包、处理依赖） |
| 长期成本 | 高（持续同步） | 低（一次投入） |
| 测试覆盖 | ❌ 需分别测试 | ✅ 共享测试 |

### 2.3 架构设计

```
@opencode-workbench/viewer-ui（新建共享组件包）
│
├── PreviewPanel          ← 从 author-site 提取，支持两种数据源模式
│   ├── compile 模式      ← author-site 使用：调用 /api/compile
│   └── url 模式          ← viewer-site 使用：fetch 预编译 JS URL
│
├── ConfigForm            ← 从 author-site ConfigFormNew 提取
│   ├── 完整模式          ← author-site 使用：含文件上传、备注编辑、Schema 修改
│   └── readonly 模式     ← viewer-site 使用：只读展示，文件上传显示 URL
│
├── ConfigScopeWrapper    ← 从 author-site 提取
├── PreviewGrid           ← 从 author-site 提取
├── FieldRenderer         ← 从 author-site 提取
├── OrderControl          ← 从 author-site 提取
├── widgets.tsx           ← 从 author-site 提取（FileUploadWidget 等）
├── ImageListWidget       ← 从 author-site 提取
├── NoteButton/Dialog/Preview ← 从 author-site 提取
│
├── iframe-template.ts    ← 合并两版，同时支持内联代码和 URL 加载
├── types.ts              ← 共享类型定义
└── utils.ts              ← cn() 等工具函数
```

### 2.4 关键设计决策

#### D1: PreviewPanel 数据源抽象

PreviewPanel 当前硬编码调用 `/api/compile`。需要抽象为可注入的数据源：

```typescript
interface PreviewPanelProps {
  // 数据源模式一：编译 API（author-site）
  code?: string;
  sessionId?: string;
  demoId?: string;

  // 数据源模式二：预编译 URL（viewer-site）
  compiledJsUrl?: string;

  // 通用属性
  configData?: Record<string, unknown>;
  previewSize?: PreviewSize;
  onError?: (error: Error) => void;
  snapshotVersion?: number;
}
```

- 当 `compiledJsUrl` 存在时，走 URL 加载模式（fetch → loadModuleFromCode）
- 当 `code` 或 `sessionId` 存在时，走编译 API 模式
- 两种模式共享：缩放逻辑、错误展示、滚动条隐藏、ResizeObserver

#### D2: ConfigForm 功能分层

ConfigFormNew 的部分功能依赖 author-site 的服务端 API，需要通过 props 控制是否启用：

| 功能 | author-site | viewer-site | 实现方式 |
|:-----|:-----|:-----|:-----|
| 字段分组/折叠 | ✅ | ✅ | 始终启用 |
| 三层字段类型检测 | ✅ | ✅ | 始终启用 |
| Slider/Select/Switch 等 | ✅ | ✅ | 始终启用 |
| 颜色选择器 | ✅ | ✅ | 始终启用 |
| 拖拽排序 | ✅ | ✅ | 始终启用 |
| 字段备注展示 | ✅ | ✅（只读） | `readonly` 时仅展示，不可编辑 |
| 备注编辑 | ✅ | ❌ | `readonly` 时隐藏编辑入口 |
| 文件上传 | ✅ | ❌ | `sessionId` 为空时显示 URL 输入框 |
| 图片列表 | ✅ | ✅（URL 模式） | `sessionId` 为空时仅支持 URL 输入 |
| Schema 修改 | ✅ | ❌ | `onSchemaChange` 为空时隐藏 |

#### D3: iframe-template 合并

合并两版 iframe-template，统一为一个支持所有模式的版本：

```typescript
interface IframeTemplateOptions {
  cssImports?: string[];
  compiledCode?: string;       // 预置代码（author-site 嵌入场景）
  configData?: Record<string, unknown>;
  cdnBaseUrl?: string;         // 可配置 CDN（author-site 用环境变量，viewer-site 用默认值）
  supportUrlMode?: boolean;    // 启用 URL fetch 模式（viewer-site 需要）
}
```

- author-site 调用：`generateIframeHtml({ compiledCode, cdnBaseUrl: getCdnBaseUrl() })`
- viewer-site 调用：`generateIframeHtml({ supportUrlMode: true })`

#### D4: shadcn/ui 组件共享策略

共享包不直接包含 shadcn/ui 组件源码，而是作为 **peerDependencies** 要求宿主包提供：

```json
{
  "peerDependencies": {
    "@opencode-workbench/shared": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.323.0",
    "class-variance-authority": "^0.2.x",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.1",
    "tailwindcss-animate": "^1.0.7"
  }
}
```

shadcn/ui 组件（Button, Switch, Slider, Input 等）需要在 viewer-site 中也安装对应的组件文件。这是因为 shadcn/ui 的设计哲学是"拥有你的组件代码"，每个项目自行管理。

**具体做法**：
- 在 viewer-site 中添加 author-site 已有的 shadcn/ui 组件文件
- 共享包通过 `@/components/ui/xxx` 路径别名引用（两个站点均配置此别名）
- 这确保了 UI 组件代码一致，同时遵循 shadcn/ui 的最佳实践

#### D5: @dnd-kit 依赖

拖拽排序功能依赖 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`。这些作为共享包的 `dependencies`（非 peer），因为它们不是宿主包直接使用的。

---

## 三、实施步骤

### 3.1 第一阶段：创建共享组件包

**新增文件**：

| 操作 | 文件路径 |
|:-----|:---------|
| 新增 | `packages/viewer-ui/package.json` |
| 新增 | `packages/viewer-ui/tsconfig.json` |
| 新增 | `packages/viewer-ui/src/index.ts` — 统一导出 |

**从 author-site 提取到共享包**：

| 操作 | 源文件 | 目标文件 |
|:-----|:---------|:---------|
| 移动 | `author-site/components/demo/PreviewPanel.tsx` | `viewer-ui/src/PreviewPanel.tsx` |
| 移动 | `author-site/components/demo/PreviewGrid.tsx` | `viewer-ui/src/PreviewGrid.tsx` |
| 移动 | `author-site/components/demo/ConfigFormNew.tsx` | `viewer-ui/src/ConfigForm.tsx` |
| 移动 | `author-site/components/demo/ConfigScopeWrapper.tsx` | `viewer-ui/src/ConfigScopeWrapper.tsx` |
| 移动 | `author-site/components/demo/types.ts` | `viewer-ui/src/types.ts` |
| 移动 | `author-site/components/demo/widgets.tsx` | `viewer-ui/src/widgets.tsx` |
| 移动 | `author-site/components/demo/ImageListWidget.tsx` | `viewer-ui/src/ImageListWidget.tsx` |
| 移动 | `author-site/components/demo/NoteButton.tsx` | `viewer-ui/src/NoteButton.tsx` |
| 移动 | `author-site/components/demo/NoteDialog.tsx` | `viewer-ui/src/NoteDialog.tsx` |
| 移动 | `author-site/components/demo/NotePreview.tsx` | `viewer-ui/src/NotePreview.tsx` |
| 移动 | `author-site/components/demo/RichTextEditor.tsx` | `viewer-ui/src/RichTextEditor.tsx` |
| 移动 | `author-site/components/demo/compile-cache.ts` | `viewer-ui/src/compile-cache.ts` |
| 合并 | `author-site/src/lib/iframe-template.ts` + `viewer-site/src/lib/iframe-template.ts` | `viewer-ui/src/iframe-template.ts` |
| 移动 | `author-site/src/lib/validator.ts`（`getOrderable`, `getDefaultValues`, `getPreviewSize`） | `viewer-ui/src/validator.ts` |
| 移动 | `author-site/src/lib/runtime-props.ts` | `viewer-ui/src/runtime-props.ts` |
| 新增 | — | `viewer-ui/src/utils.ts`（cn() 等工具） |

**开发任务**：

1. 创建 `@opencode-workbench/viewer-ui` 包结构和配置
2. 从 author-site 提取组件到共享包
3. 改造 PreviewPanel：增加 `compiledJsUrl` 数据源模式
4. 改造 ConfigForm：确保 `readonly` 模式下功能正确降级
5. 合并 iframe-template：同时支持内联代码和 URL fetch 模式
6. 更新共享包的 `index.ts` 统一导出

### 3.2 第二阶段：author-site 适配

**修改文件**：

| 操作 | 文件路径 |
|:-----|:---------|
| 修改 | `packages/author-site/package.json` — 新增 `@opencode-workbench/viewer-ui` 依赖 |
| 修改 | `packages/author-site/components/demo/index.ts` — 改为从共享包 re-export |
| 删除 | `packages/author-site/components/demo/` 下的已提取组件文件 |
| 修改 | `packages/author-site/src/app/viewer/[projectId]/page.tsx` — 导入路径更新 |
| 修改 | `packages/author-site/src/app/viewer/[projectId]/[demoId]/page.tsx` — 导入路径更新 |
| 修改 | `packages/author-site/src/app/projects/[id]/edit/page.tsx` — 导入路径更新 |
| 修改 | 其他引用了已提取组件的文件 |

**开发任务**：

1. 添加共享包依赖
2. 将 `components/demo/index.ts` 改为 re-export 共享包
3. 更新所有导入路径
4. 验证 author-site 功能不受影响（编译、预览、配置面板）

### 3.3 第三阶段：viewer-site 适配

**修改文件**：

| 操作 | 文件路径 |
|:-----|:---------|
| 修改 | `packages/viewer-site/package.json` — 新增依赖（viewer-ui, @dnd-kit/*, class-variance-authority） |
| 新增 | `packages/viewer-site/src/components/ui/*.tsx` — 添加缺失的 shadcn/ui 组件 |
| 删除 | `packages/viewer-site/src/components/StaticPreviewPanel.tsx` |
| 删除 | `packages/viewer-site/src/components/StaticConfigPanel.tsx` |
| 删除 | `packages/viewer-site/src/lib/iframe-template.ts` |
| 重写 | `packages/viewer-site/src/components/ViewerApp.tsx` — 使用共享包组件 |

**需要添加到 viewer-site 的 shadcn/ui 组件**：

Badge, Button, Collapsible, Input, Label, Popover, ScrollArea, Select, Separator, Slider, Switch, Textarea, Tooltip

**开发任务**：

1. 添加共享包和 @dnd-kit 依赖
2. 添加缺失的 shadcn/ui 组件文件
3. 重写 `ViewerApp.tsx`：
   - `ProjectPreviewPage`：使用共享包 `PreviewPanel`（url 模式）+ `PreviewGrid`
   - `DemoPreviewPage`：使用共享包 `PreviewPanel`（url 模式）+ `ConfigForm`（readonly）+ `ConfigScopeWrapper`
   - 布局对齐 author-site 的 viewer 页面结构
4. 删除旧的 `StaticPreviewPanel`、`StaticConfigPanel`、`iframe-template.ts`
5. 验证 viewer-site 功能正确

### 3.4 第四阶段：验证与清理

**开发任务**：

1. author-site 全功能回归测试：编辑 → 编译 → 预览 → 配置 → 发布
2. viewer-site 功能验证：项目列表 → 项目预览 → Demo 预览 → 配置交互
3. 对比两个站点的预览区和配置面板，确认视觉一致
4. `pnpm typecheck` 和 `pnpm lint` 通过
5. `pnpm build:viewer` 成功生成 `out/` 目录
6. 更新 `pnpm-workspace.yaml`（如需）
7. 更新原方案文档第三阶段的涉及文件列表

---

## 四、对原方案的修改建议

原方案 `使用端完全解耦静态化方案.md` 第三阶段（4.3 节）需要修改以下内容：

### 4.1 删除的方案设计

- ~~3.4.3 预览引擎：iframe + 预编译 JS~~ → 改为使用共享包 `PreviewPanel`
- ~~3.4.4 iframe 模板适配~~ → 改为使用共享包 `iframe-template`
- ~~3.4.6 配置面板前端实现~~ → 改为使用共享包 `ConfigForm`

### 4.2 新增的方案设计

- **3.4.3 共享组件包**：创建 `@opencode-workbench/viewer-ui`，提取 author-site 的预览和配置组件
- **3.4.4 viewer-site 适配**：安装共享包 + shadcn/ui 组件 + 重写页面组件使用共享包

### 4.3 涉及文件变更

原方案第三阶段的涉及文件列表需要更新为：

| 操作 | 文件路径 |
|:-----|:---------|
| 新增 | `packages/viewer-ui/` — 共享组件包（整体） |
| 修改 | `packages/viewer-site/package.json` — 新增依赖 |
| 新增 | `packages/viewer-site/src/components/ui/*.tsx` — shadcn/ui 组件 |
| 删除 | `packages/viewer-site/src/components/StaticPreviewPanel.tsx` |
| 删除 | `packages/viewer-site/src/components/StaticConfigPanel.tsx` |
| 删除 | `packages/viewer-site/src/lib/iframe-template.ts` |
| 重写 | `packages/viewer-site/src/components/ViewerApp.tsx` |
| 修改 | `packages/author-site/package.json` — 新增共享包依赖 |
| 修改 | `packages/author-site/components/demo/index.ts` — 改为 re-export |
| 删除 | `packages/author-site/components/demo/` 下已提取的组件文件 |
| 修改 | `packages/author-site/` 下引用已提取组件的文件 |

---

## 五、风险与缓解

| 风险 | 影响 | 缓解措施 |
|:-----|:-----|:---------|
| **共享包依赖冲突** | shadcn/ui 组件版本不一致 | 两个站点使用相同版本的 shadcn/ui 组件代码 |
| **author-site 回归** | 提取组件可能破坏现有功能 | 逐文件提取 + 每步验证 + author-site 全功能回归测试 |
| **viewer-site 包体积** | 新增 @dnd-kit 等依赖增大包体积 | @dnd-kit 仅在配置面板使用，tree-shaking 可移除未使用代码 |
| **shadcn/ui 组件同步** | 两个站点的 shadcn/ui 组件代码可能漂移 | 从 author-site 复制到 viewer-site，确保初始一致；后续可考虑提取到共享包 |
| **构建配置复杂度** | 新增 workspace 包增加构建复杂度 | 共享包为纯 TypeScript 源码包（无构建步骤），通过 `transpilePackages` 处理 |
