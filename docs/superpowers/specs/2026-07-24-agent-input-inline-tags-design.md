# Agent 对话输入框内联标签设计

## 概述

在 agent 对话输入框中支持内联 `@项目名` 和 `@元素名` 原子标签。标签以蓝色系内联渲染，按 Backspace 时删除整个标签，光标不可进入标签内部。图片和附件保持现有 Header 区域展示方式不变。

## 动机

1. "+" 按钮菜单新增 "引用其他项目"，以 `@项目名` 标签插入输入框
2. 编辑面板"添加到对话"选中的元素改为 `@元素名` 内联标签插入输入框，不再显示在 Header 区域
3. 统一引用语义：项目/元素都以 `@` 标签形式在输入框中呈现

## 范围

- **`packages/ai-chat-shared/`**：新增 `InlineTagInput` 组件、`ProjectReferencePicker` 组件，修改 `ChatInput`
- **`packages/ai-chat-shared/src/index.ts`**：导出新组件和类型
- **`packages/author-site/src/app/demo/[id]/edit/page.tsx`**：传递项目列表到 AIChat

## 不改动的范围

- 图片/附件上传与展示保持现有逻辑（`PromptInputHeader` + `Attachments`）
- `prompt-input.tsx` 不对 textarea 做破坏性变更
- `ElementSelectionChip` 组件保留但不在 ChatInput 中使用
- 编辑页 `handleAddToChat`、`buildVisualSelectionPrompt` 逻辑不变
- `@workbench/agent-client` 类型不变

---

## 数据结构

### InlineTag

```ts
// packages/ai-chat-shared/src/chat/inline-tag-input.tsx
export interface InlineTag {
  id: string;
  type: "project" | "element";
  label: string;
  context: string; // 发送给 AI 的上下文
}
```

### ChatElementRef（保留不变）

```ts
// packages/ai-chat-shared/src/chat/element-selection-chip.tsx（现有，不变）
export interface ChatElementRef {
  id: string;
  label: string;
  context: string;
}
```

### ProjectReference（轻量项目引用）

```ts
// packages/ai-chat-shared/src/chat/inline-tag-input.tsx
export interface ProjectReference {
  id: string;
  name: string;
}
```

---

## 组件设计

### 1. InlineTagInput

**文件**：`packages/ai-chat-shared/src/chat/inline-tag-input.tsx`

基于 `<div contenteditable="true">` 实现，支持内联文本与原子标签混排。

#### Props

```ts
interface InlineTagInputProps {
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  disabled?: boolean;
  className?: string;
  /** 外部可调用方法 */
  controller?: React.MutableRefObject<InlineTagInputHandle | null>;
  /** 值变化时回调，用于父组件获取当前文本+标签 */
  onValueChange?: (value: InlineTagInputValue) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
}
```

#### InlineTagInputHandle

```ts
interface InlineTagInputHandle {
  insertTag(tag: InlineTag): void;
  clear(): void;
  focus(): void;
  getValue(): InlineTagInputValue;
}
```

#### InlineTagInputValue

```ts
interface InlineTagInputValue {
  text: string;
  tags: InlineTag[];
}
```

#### 内部数据模型

使用 `InputSegment` 表示内容片段：

```ts
type InputSegment =
  | { type: "text"; value: string }
  | { type: "tag"; tag: InlineTag };
```

#### 关键行为

| 行为 | 实现 |
|------|------|
| 插入标签 | `insertTag()` 在当前光标位置插入标签 DOM 节点，后跟一个空格文本节点 |
| Backspace 删除标签 | 检测光标前是否为标签节点，若是则删除整个标签节点 |
| 光标跳过标签 | 标签设置 `contenteditable="false"`，光标自动跳过 |
| 粘贴 | 拦截 paste 事件，提取纯文本后插入，洗掉所有 HTML 格式 |
| IME 组合输入 | 监听 `compositionstart`/`compositionend`，组合期间不触发内部同步 |
| Enter 提交 | 通过 `onKeyDown` 透传给父组件（`ChatInput`），Shift+Enter 换行 |
| 自适应高度 | 与当前 `PromptInputTextarea` 一致，minHeight/maxHeight 控制 |

#### 标签样式

**项目标签（`type: "project"`）**：

- 背景：`bg-blue-100 dark:bg-blue-900`
- 文字：`text-blue-700 dark:text-blue-300`
- 图标：`FolderKanban` (lucide-react)
- 形状：`inline-flex rounded-full px-2 py-0.5`

**元素标签（`type: "element"`）**：

- 背景：`bg-teal-100 dark:bg-teal-900`
- 文字：`text-teal-700 dark:text-teal-300`
- 图标：`MousePointer2` (lucide-react)
- 形状：`inline-flex rounded-full px-2 py-0.5`

两者标签前自动渲染 `@` 字符（作为标签内部文本的一部分），如 `@项目A`。

#### 悬停交互

每个标签悬停时显示小 X 按钮，点击可移除该标签（`contenteditable="false"` 内的按钮依然可点击）。

#### 实现要点

1. **非受控模式**：使用 `ref` 直接操作 DOM，避免 React 重渲染导致光标跳动
2. **标签追踪**：用 `Map<string, HTMLSpanElement>` 追踪每个标签 DOM 节点，通过 MutationObserver 或事件回调同步标签增删
3. **值提取**：遍历 contenteditable 的子节点，区分文本节点和标签节点，构建 `InputSegment[]`，再聚合为 `InlineTagInputValue`
4. **placeholder**：使用 CSS `:empty::before { content: attr(data-placeholder) }` 实现

### 2. ProjectReferencePicker

**文件**：`packages/ai-chat-shared/src/chat/project-reference-picker.tsx`

以 Dialog 形式展示项目列表，支持搜索过滤。

#### Props

```ts
interface ProjectReferencePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectReference[];
  onSelect: (project: ProjectReference) => void;
}
```

#### 行为

- 打开时自动聚焦搜索框
- 实时过滤项目名称
- 点击项目即选中，关闭 Dialog，调用 `onSelect`
- 无匹配项目时显示空状态提示

### 3. ChatInput 改动

**文件**：`packages/ai-chat-shared/src/chat/chat-input.tsx`

#### Props 新增

```ts
interface ChatInputProps {
  // ... 现有 props
  /** 可选项目列表，用于 "引用其他项目" */
  projects?: ProjectReference[];
  /** 外部插入元素标签 */
  selectedElement?: ChatElementRef | null;
  onRemoveElement?: () => void;
}
```

#### 内部状态

```ts
const inputRef = useRef<InlineTagInputHandle | null>(null);
const [projectPickerOpen, setProjectPickerOpen] = useState(false);
```

#### 组件树变化

```
PromptInput
├── PromptInputHeader
│   ├── PromptInputAttachmentsDisplay  ← 不变
│   └── uploadError                    ← 不变
├── PromptInputBody
│   └── InlineTagInput  ← 替换 PromptInputTextarea
├── PromptInputFooter
│   ├── PromptInputTools
│   │   ├── PromptInputAddMenu  ← 新增菜单项
│   │   ├── History
│   │   └── ModelSelectWithGuard
│   └── PromptInputSubmit
└── ProjectReferencePicker  ← 新增（条件渲染）
```

#### selectedElement → 内联标签同步

```ts
useEffect(() => {
  if (selectedElement && inputRef.current) {
    inputRef.current.insertTag({
      id: selectedElement.id,
      type: "element",
      label: selectedElement.label,
      context: selectedElement.context,
    });
    onRemoveElement?.(); // 清除状态
  }
}, [selectedElement?.id]); // 仅在 id 变化时触发
```

#### PromptInputAddMenu 新增菜单项

在 "添加图片" 和 "添加附件" 之后新增：

```tsx
{projects && projects.length > 0 && (
  <button
    type="button"
    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
    onClick={() => {
      setOpen(false);
      setProjectPickerOpen(true);
    }}
  >
    <FolderKanban className="h-4 w-4" />
    引用其他项目
  </button>
)}
```

#### handleSubmit 改动

```ts
const handleSubmit = useCallback(async (message: PromptInputMessage) => {
  // ... 现有附件/图片上传逻辑不变 ...

  // 从 InlineTagInput 获取标签
  const tagValue = inputRef.current?.getValue();
  const tags = tagValue?.tags ?? [];
  
  // 构建用户消息：标签 context 前置
  const tagContexts = tags
    .map((tag) => `[引用${tag.type === "project" ? "项目" : "元素"}: ${tag.label}]\n${tag.context}`)
    .join("\n\n");
  
  const baseText = message.text || fallbackMessage;
  const userMessage = tagContexts
    ? `${tagContexts}\n\n${baseText}`
    : baseText;

  // 提交后清空标签
  inputRef.current?.clear();

  onSubmit(userMessage, images, undefined, files);
}, [...]);
```

#### ProjectReferencePicker 集成

```tsx
{projects && projects.length > 0 && (
  <ProjectReferencePicker
    open={projectPickerOpen}
    onOpenChange={setProjectPickerOpen}
    projects={projects}
    onSelect={(project) => {
      inputRef.current?.insertTag({
        id: `proj-${project.id}-${Date.now()}`,
        type: "project",
        label: project.name,
        context: `项目名称: ${project.name}\n项目ID: ${project.id}`,
      });
      inputRef.current?.focus();
    }}
  />
)}
```

### 4. AIChat 改动

**文件**：`packages/ai-chat-shared/src/ai-chat.tsx`

#### Props 新增

```ts
interface AIChatProps {
  // ... 现有 props
  projects?: ProjectReference[];
}
```

透传 `projects` 到 `ChatInput`。

### 5. 编辑页改动

**文件**：`packages/author-site/src/app/demo/[id]/edit/page.tsx`

#### 传递项目列表

```tsx
// 从 useDemos() 获取项目列表
const { demos } = useDemos();

// 转化为 ProjectReference[]
const projectReferences = useMemo(
  () => demos.map((d) => ({ id: d.id, name: d.name })),
  [demos],
);

// 传递给 AIChat
<AIChat
  // ... 现有 props
  projects={projectReferences}
/>
```

#### handleAddToChat（不改动）

`handleAddToChat` 逻辑不变，仍然设置 `chatElement` 状态。`ChatInput` 内部通过 `useEffect` 监听 `selectedElement.id` 变化自动转为内联标签。

---

## 关键实现细节

### ContentEditable 边界处理

1. **粘贴清洗**：`onPaste` 拦截，取 `clipboardData.getData("text/plain")`，用 `document.execCommand("insertText", false, text)` 或手动插入文本节点
2. **IME 组合**：组合期间设置标志位 `isComposingRef`，在 `compositionend` 后才同步 DOM 状态
3. **光标位置恢复**：`insertTag` 后使用 `Selection API` 将光标定位到新插入标签之后的文本节点
4. **标签不可分割**：标签 `span` 设置 `contenteditable="false"`，浏览器原生阻止光标进入
5. **Backspace 原子删除**：`onKeyDown` 中检测 `Selection.anchorNode.previousSibling` 是否为标签节点，若是则 `e.preventDefault()` 并 `node.remove()`

### 值与提交的桥接

`ChatInput.handleSubmit` 需要同时从两个来源获取数据：
- `message.text` — 来自 PromptInput context 的纯文本（由 InlineTagInput 同步）
- `inputRef.current.getValue().tags` — 所有标签及其 context

#### 文本同步机制

`InlineTagInput` 在 `PromptInputBody` 内部渲染，处于 `PromptInputContext.Provider` 范围内。它通过 `usePromptInput()` 将纯文本同步回 PromptInput context，确保 `PromptInputSubmit` 按钮的启用/禁用状态正确：

```ts
// InlineTagInput 内部
const promptCtx = usePromptInput();

// 每次内容变化时同步纯文本
const handleInput = useCallback(() => {
  const value = extractValueFromDOM();
  promptCtx.setText(value.text);
  onValueChange?.(value);
}, [promptCtx, onValueChange]);
```

#### 提交流程

1. 用户按 Enter 或点击 Submit → `PromptInput` 内部调用 `promptCtx.onSubmit({ text, files })`
2. 这个调用实际执行 `ChatInput.handleSubmit(message: PromptInputMessage)`
3. `handleSubmit` 中：`message.text` 是纯文本，`inputRef.current.getValue().tags` 是标签
4. 构建最终消息：标签 contexts 前置 + 纯文本
5. 调用 `inputRef.current.clear()` 清空标签
6. 调用外部 `onSubmit(userMessage, images, undefined, files)`

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `packages/ai-chat-shared/src/chat/inline-tag-input.tsx` | InlineTagInput 组件 |
| 新增 | `packages/ai-chat-shared/src/chat/project-reference-picker.tsx` | ProjectReferencePicker 组件 |
| 修改 | `packages/ai-chat-shared/src/chat/chat-input.tsx` | 集成 InlineTagInput、新增菜单项、标签插入逻辑、移除 ElementSelectionChip 使用 |
| 修改 | `packages/ai-chat-shared/src/index.ts` | 导出新组件和类型 |
| 修改 | `packages/ai-chat-shared/src/ai-chat.tsx` | 新增 projects prop 透传 |
| 修改 | `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 传递 projects 到 AIChat |

---

## 验证策略

1. **类型检查**：`pnpm check:author`（覆盖 ai-chat-shared 和 author-site）
2. **手动验证清单**：
   - "+" 按钮弹出菜单出现 "引用其他项目" 选项
   - 点击可搜索项目列表，选中后 `@项目名` 标签插入光标位置
   - 编辑面板选中元素"添加到对话"，`@元素名` 标签插入输入框
   - Backspace 删除整个标签，不进入标签内部
   - 粘贴不会带格式，只保留纯文本
   - 多个标签可共存
   - 图片/附件仍在 Header 区域展示
   - 提交后标签 context 正确前置到消息中
   - 标签悬停显示 X 按钮可移除
3. **E2E**：`pnpm test:e2e -- agent-chat-inline-tags.spec.ts`（新建）

---

## 风险

1. **ContentEditable 浏览器兼容性**：Safari/Chrome/Firefox 在光标行为上有细微差异，需手动测试
2. **IME 组合输入**：中文输入法在 contenteditable 中的行为可能不稳定，需验证 compositionstart/end 处理
3. **现有 PromptInput 体系耦合**：InlineTagInput 需要部分脱离 PromptInput context 管理，需确保不影响其他使用方（如 viewer-readonly 场景）
4. **性能**：大批量标签场景（虽然实际场景不会出现 10+ 个标签）需验证
