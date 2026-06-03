# AI 对话记忆功能 — 用户编辑入口方案

> 版本：v2.1  
> 创建日期：2026-06-03  
> 更新日期：2026-06-03  
> 状态：方案设计  
> 类型：功能增强  
> 变更：v2.0 → v2.1 补充代码块、引用块支持 + 改用 prosemirror-markdown 保真导入

---

## 一、背景

memory.md 已实现 AI 自动维护（L4 记忆层），但用户缺少编辑入口。当前状态：

| 现状 | 问题 |
|---|---|
| "代码"Tab 中能看见 memory.md | 点击后是只读的，`isFileEditable()` 白名单未包含 `.md` |
| AI 编辑 memory.md 后静默完成 | 用户不知道记忆文件已变更，错过了解内存变化的机会 |
| WorkspaceCodeDialog 用 CodeMirror 展示 | 纯源码编辑，非技术人员难以使用 Markdown 格式 |

---

## 二、方案概述

三个改动点，各自独立可拆分实施：

1. **"代码"Tab 支持编辑 .md 文件** — `isFileEditable()` 加白名单 + `getFileEditorType()` 驱动编辑器选择
2. **Markdown 富文本编辑器** — 基于已有 TipTap v3 生态，新增扩展实现 WYSIWYG Markdown 编辑
3. **AI 记忆更新推送 + 查看弹窗** — 监听 `file_operation` 事件，在对话流中提示 memory.md 变更

---

## 三、详细设计

### 3.1 改动一：.md 文件在"代码"Tab 中可编辑

#### 涉及文件

- `packages/author-site/src/lib/workspace-file-utils.ts`
- `packages/author-site/src/components/demo/WorkspaceCodeDialog.tsx`

#### 核心思路

不再做 `if (filePath === "memory.md")` 的硬编码分支，而是引入 **文件编辑器类型判定函数** `getFileEditorType()`，让 `WorkspaceCodeDialog` 根据文件扩展名自动选择对应编辑器。

```
getFileEditorType(filePath) → "code" | "markdown"
```

未来任何 `.md` 文件都可自动获得 Markdown 编辑器，无需逐个添加分支。

#### 具体变更

**workspace-file-utils.ts** — 新建 `getFileEditorType()` + 扩展 `isFileEditable()`：

```ts
/** 编辑器类型 */
export type FileEditorType = "code" | "markdown";

/** 可编辑文件的正则白名单 */
const EDITABLE_PATTERNS: RegExp[] = [
  /^demos\/[^/]+\/index\.tsx$/,
  /^demos\/[^/]+\/config\.schema\.json$/,
  /^project\.config\.schema\.json$/,
  /^memory\.md$/,           // ← 新增
];

/**
 * 根据文件扩展名返回编辑器类型
 * 只需在此函数添加新类型，WorkspaceCodeDialog 无需改动
 */
export function getFileEditorType(filePath: string): FileEditorType {
  if (filePath.endsWith(".md")) return "markdown";
  return "code";
}
```

**WorkspaceCodeDialog.tsx** — 用 `getFileEditorType()` 驱动渲染：

```
const editorType = getFileEditorType(filePath);

{editorType === "markdown" ? (
  <MemoryMarkdownEditor value={editContent} onChange={handleChange} readOnly={!editable} />
) : (
  <CodeEditor
    value={editContent}
    onChange={editable ? handleChange : undefined}
    language={language}
    readOnly={!editable}
    height="100%"
  />
)}
```

> 说明：WorkspaceFileTree 通过 `onFileSelect(filePath, isFileEditable(filePath))` 回调（`WorkspaceFileTree.tsx:124`）。白名单添加后，memory.md 的可编辑状态自动生效，且编辑器类型也由扩展名自动判定。

---

### 3.2 改动二：Markdown 编辑器组件

#### 关键决策：组件为什么放在 author-site 而不是 shared

`packages/shared` 的 TipTap 版本是 **v2.1.13**，而 `packages/author-site` 是 **v3.22.5**，两者 API 不兼容。`MemoryMarkdownEditor` 需要 `@tiptap/pm`（仅在 author-site 有），且需要使用 v3 的 Extension API。因此**组件放在 author-site**，避免跨版本冲突。

#### 涉及文件

- 新建 `packages/author-site/src/components/demo/MemoryMarkdownEditor.tsx`
- 新建 `packages/author-site/src/components/ui/toolbar-button.tsx`（从 shared 迁移，或直接 import）

> 现有 `RichTextEditor` 的 `ToolbarButton` 在 `packages/shared/src/demo/RichTextEditor.tsx` 内部定义。如果不想从 shared 导入 v2 组件，可在 author-site 中提取独立的 `ToolbarButton` UI 组件。

#### 方案选择：为什么不用 `@hocuspocus/tiptap-markdown`

- `@hocuspocus/tiptap-markdown` 包体积约 300KB+，主要服务于多人协作场景，对单用户编辑属于过度引入
- TipTap v3 的 `StarterKit` 已内置 Markdown 快捷输入（如 `# + 空格` 自动变 H1），只需开启 heading 扩展即可

**推荐方案**：使用 `prosemirror-markdown`（TipTap 底层依赖 `@tiptap/pm` 已包含）做双向精确转换：

```
导入（Markdown → TipTap 节点）:
  memory.md 原始 Markdown 文本
    → prosemirror-markdown 的 defaultMarkdownParser 解析为 ProseMirror Doc
    → TipTap editor.commands.setContent(doc) 渲染为富文本

导出（TipTap 节点 → Markdown）:
  TipTap editor.state.doc（ProseMirror 文档节点）
    → prosemirror-markdown 的 defaultMarkdownSerializer 序列化
    → 输出干净的 Markdown 文本
```

**为什么不用 turndown（HTML 中间层）的替代方案：**
- HTML→Markdown 会丢失任务列表的 `checked` 属性（`- [x]` → `- [ ]`）
- HTML 无法精确表达 ProseMirror 节点类型（代码块、引用块在 HTML 中只是 `<pre>`/`<blockquote>`，信息有损）
- prosemirror-markdown 直接做 Doc ↔ Markdown 映射，保真所有节点类型和属性

#### 依赖

需新增（在 author-site 下）：

```bash
# TipTap 扩展 — 任务列表、代码块、引用块
pnpm --filter @opencode-workbench/author-site add @tiptap/extension-task-list @tiptap/extension-task-item
pnpm --filter @opencode-workbench/author-site add @tiptap/extension-code-block-lowlight @tiptap/extension-blockquote

# prosemirror-markdown — Markdown ↔ ProseMirror 双向精确转换
pnpm --filter @opencode-workbench/author-site add prosemirror-markdown
```

不新增 `@hocuspocus/tiptap-markdown`、不新增 `turndown`。

已在 author-site 的 package.json 中（无需重复安装）：

```
@tiptap/react, @tiptap/starter-kit, @tiptap/extension-link,
@tiptap/extension-underline, @tiptap/extension-placeholder, @tiptap/pm
```

#### 组件设计

`MemoryMarkdownEditor` 是一个可控组件（受控 value + onChange）：

```
MemoryMarkdownEditor
├── Props
│   ├── value: string          // Markdown 原始文本
│   ├── onChange: (md: string) => void
│   └── readOnly?: boolean     // 默认 false
│
├── 工具栏
│   ├── 加粗 / 斜体 / 下划线
│   ├── 分隔线
│   ├── H1 / H2 / H3 标题
│   ├── 分隔线
│   ├── 无序列表 / 有序列表 / 任务列表
│   ├── 分隔线
│   ├── 代码块 / 引用块
│   ├── 分隔线
│   ├── 链接 / 清除格式
│   └── [预览] 切换按钮 → 只读 Markdown 渲染视图
│
├── 编辑区域
│   ├── 编辑模式：TipTap WYSIWYG（富文本）
│   └── 预览模式：Streamdown 渲染（已安装依赖，零成本复用）
│
└── 状态栏
    └── Markdown 字数统计
```

> 预览模式直接使用已在项目中的 `streamdown`（`assistant-message.tsx` 已安装使用），不引入新的 Markdown 渲染库。

#### 与现有 RichTextEditor 的差异

| | RichTextEditor（现有，shared） | MemoryMarkdownEditor（新增，author-site） |
|---|---|---|
| TipTap 版本 | v2.1.13 | v3.22.5 |
| 存放位置 | `packages/shared/src/demo/` | `packages/author-site/src/components/demo/` |
| 数据格式 | HTML（`editor.getHTML()`） | Markdown（prosemirror-markdown 序列化） |
| 数据导入 | `editor.commands.setContent(html)` | `defaultMarkdownParser` 解析 → setContent |
| 标题 | 不支持（StarterKit 禁用了 heading） | 支持 H1~H3 |
| 任务列表 | 不支持 | 支持（`[x]` / `[ ]`，含 checked 属性） |
| 代码块 | 不支持（StarterKit 禁用了 codeBlock） | 支持（语法高亮，通过 lowlight） |
| 引用块 | 不支持（StarterKit 禁用了 blockquote） | 支持 |
| 预览 | 无 | 分屏 Streamdown 渲染预览 |
| 工具栏组件 | 内联定义 ToolbarButton | 从 author-site 本地复制或抽取公共 UI |

#### 多场景复用

`MemoryMarkdownEditor` 支持：
- memory.md 编辑（WorkspaceCodeDialog 中嵌入）
- 未来任何 `.md` 文件的编辑（由 `getFileEditorType()` 自动路由）

---

### 3.3 改动三：AI 记忆更新推送与查看弹窗

#### 涉及文件

- `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts`
- `packages/author-site/src/components/ai-elements/ai-chat.tsx`
- `packages/author-site/src/components/ai-elements/chat/services/stream-service.ts`（已有 `onFileOperation` 处理器，只需扩展）

#### 关键现实：现有 `onFileOperation` 已在使用中

`use-chat-stream.ts:270-287` 中 `onFileOperation` 处理器已用于实时追踪文件变更（通过 `realtimeFilesRef` 去抖后触发 `processFileChanges`）。本方案**不替换**该处理器，而是在其**外侧**（ai-chat.tsx 层）增加一层 memory.md 检测逻辑。

#### 数据流

```
AI writeFile("memory.md", ...)
  → Pi Agent 发射 file_operation 事件
  → agent-service 通过 WebSocket 转发 type: "file_operation"
  → StreamService 接收并触发 onFileOperation({ method: "fs/write_text_file", path: "memory.md" })
  → [现有逻辑] use-chat-stream 将文件加入 realtimeFilesRef（无变化）
  → [新增逻辑] ai-chat.tsx 额外检测到 path 以 .md 结尾
  → 累积 memory.md 写入记录到 conversationsMemoryWrites Map<string, boolean>
  → 流结束时（onFinish），若本场对话有 memory.md 写入 → 展示通知
  → 用户点击"查看" → 打开 MemoryPreviewDialog（只读 Streamdown 渲染 + 底部"编辑"按钮）
```

#### 交互与状态管理

AI 回复流结束后，在消息列表底部插入一条通知卡片（非正规 chat message，是系统 UI 条）：

```
┌──────────────────────────────────────────────────┐
│ 📝 AI 更新了项目记忆         [查看变更]  [忽略]  │
└──────────────────────────────────────────────────┘
```

**状态集中管理**：使用 `ai-chat.tsx` 中的一个 `useRef<Set<string>>` 追踪本场对话中已被写入的 .md 文件路径，逻辑内聚在 `ai-chat.tsx` 内，不散落在多个文件中。

#### 关键实现细节

- **检测时机**：在 `onFileOperation` 回调**之外**，通过 `useChatStream` 暴露一个 `memoryFilePathsChangedRef`（`useRef<Set<string>>`），ai-chat.tsx 在流结束后读取并展示通知
- **写入来源对比**：如果是用户手动编辑保存触发的写入（WorkspaceCodeDialog 的 onSave），则不弹出提示。区分方式：检查当前 `isStreaming` 是否为 true（只有 AI 写入时才在 streaming 过程中）
- **去重**：用 `Set<string>` 按文件路径去重，同一 file_operation 事件可能多次到达，只展示一次通知
- **忽略行为**：关闭或点击"忽略"后，通知消失且本场对话不再重现
- **编辑跳转**：点击"查看变更"后直接打开 WorkspaceCodeDialog（编辑模式），复用 MemoryMarkdownEditor

#### 移除冗余：不需要 MemoryPreviewDialog

原 v1.0 方案设计了单独的 MemoryPreviewDialog（只读） + 跳转到 WorkspaceCodeDialog（可编辑），两个弹窗看同一内容属于冗余。直接打开 WorkspaceCodeDialog 的编辑视图即可，用户可选择只查看不保存。

---

## 四、实施建议

### 优先级

| 优先级 | 改动 | 工作量 | 依赖 |
|---|---|---|---|
| P0 | 3.1 `getFileEditorType()` + 白名单 | 小（~30 分钟） | 无 |
| P0 | 3.2 Markdown 编辑器 | 中（~2.5 小时） | `prosemirror-markdown` + TipTap 扩展安装 |
| P1 | 3.3 记忆更新推送 | 中（~1.5 小时） | 需 Markdown 编辑器就绪后联调通知→编辑跳转 |

### 实现顺序

1. **先加 `getFileEditorType()` + 白名单** → 用户立即可用 CodeMirror 编辑 .md 文件纯文本
2. **做 MemoryMarkdownEditor** → 替换 WorkspaceCodeDialog 中 .md 文件的渲染，用户获得富文本体验
3. **最后做推送通知** → 对话流中提示 AI 的记忆变更，完成闭环

---

## 五、风险与缓解

| 风险 | 缓解措施 |
|---|---|
| TipTap v3 的 heading 扩展可能和 StarterKit 的配置冲突 | 在 MemoryMarkdownEditor 中创建独立的 `useEditor()` 实例，不与 RichTextEditor 共享 StarterKit 配置 |
| `prosemirror-markdown` 需手动注册 Mark 和 Node 的序列化规则 | memory.md 内容以标题、段落、列表、代码块、引用块为主，场景覆盖有限，按需注册即可。如遇未注册节点，降级为纯文本输出 |
| `onFileOperation` 在某些后端不发射 | 降级方案：在 `onFinish` 中通过 `result.files` 过滤 `path.endsWith('.md')` 的文件（StreamResult.files 包含所有变更文件） |
