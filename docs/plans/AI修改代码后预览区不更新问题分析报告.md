# 问题分析报告：AI 修改代码后预览区不更新

## 一、问题描述

**现象**：在编辑页的 AI 会话区，让 AI 修改代码后，预览区（PreviewPanel）不会自动更新显示最新的代码效果。

**影响范围**：所有通过 AI 对话修改代码的场景

---

## 二、问题根因分析

### 核心问题：`sdkFiles` prop 缺失导致预览区无法正常工作

经过详细分析代码，发现 **预览区不更新的核心原因是 `PreviewPanel` 组件缺少必要的 `sdkFiles` prop**。

#### 2.1 代码证据

**调用方**（`packages/web/src/app/demo/[id]/edit/page.tsx` 第 331-336 行）：

```tsx
<PreviewPanel
  code={code}
  configData={configData}
  previewSize={previewSize}
/>
```

**接收方**（`packages/web/components/demo/PreviewPanel.tsx` 第 44-50 行）：

```tsx
export function PreviewPanel({
  code,
  configData,
  sdkFiles,  // ← 声明了此 prop
  onError,
  className,
  previewSize,
}: PreviewPanelProps) {
```

**使用处**（`PreviewPanel.tsx` 第 74-82 行）：

```tsx
const files: Record<string, string> = isValidCode
  ? {
      "/Demo.tsx": code,
      "/App.tsx": entryCode,
      ...sdkFiles,  // ← 展开 sdkFiles
    }
  : {
      "/Demo.tsx": `export default function Demo() { return <div>代码加载失败</div>; }`,
      "/App.tsx": entryCode,
      ...sdkFiles,  // ← 展开 sdkFiles
    };
```

#### 2.2 问题分析

1. **`sdkFiles` 未传递**：父组件在调用 `PreviewPanel` 时没有传递 `sdkFiles` prop
2. **`sdkFiles` 为 `undefined`**：当 prop 未传递时，`sdkFiles` 值为 `undefined`
3. **展开运算符失效**：`{ ...undefined }` 会得到空对象 `{}`，不会报错但也不会添加任何文件
4. **Sandpack 依赖缺失**：SDK 文件（如 React 组件依赖的基础设施文件）未被加载到 Sandpack 沙箱中

#### 2.3 为什么代码更新后预览不刷新？

当 AI 修改代码并通过 `onCodeUpdate` 回调触发 `setCode(newCode)` 时：

1. ✅ `code` 状态正确更新
2. ✅ `PreviewPanel` 接收到新的 `code` prop
3. ✅ `files` 对象重新构建（包含新的 `/Demo.tsx` 内容）
4. ❌ **但 `sdkFiles` 仍为 `undefined`**，可能导致 Sandpack 内部编译失败
5. ❌ Sandpack 可能因为缺少必要的 SDK 文件而无法正确渲染组件

---

## 三、其他潜在问题

### 3.1 文件路径匹配不精确

**位置**：`packages/web/src/components/ai-elements/ai-chat.tsx` 第 327-343 行

```tsx
if (
  (file.path.includes("index.tsx") || file.path.includes("index.ts")) &&
  file.content
) {
  onCodeUpdate?.(file.content);
}
```

**问题**：
- 使用 `includes()` 匹配可能导致误匹配（如 `some/path/index.tsx.bak`）
- 如果 Agent 写入的是相对路径（如 `./index.tsx`），可能与预期路径格式不匹配

**建议**：改用精确匹配，如 `file.path.endsWith("index.tsx")` 或正则表达式

### 3.2 `content` 字段可能缺失

**位置**：`ai-chat.tsx` 第 330-343 行

```tsx
if (
  (file.path.includes("index.tsx") || file.path.includes("index.ts")) &&
  file.content  // ← 如果 content 为 undefined，不会调用 onCodeUpdate
) {
  onCodeUpdate?.(file.content);
}
```

**问题**：如果 `file_operation` 事件中 `content` 字段为空或缺失，`onCodeUpdate` 不会被调用。

**排查建议**：
- 检查 Agent Service 是否在 `file_operation` 事件中正确传递了 `content`
- 查看 `packages/agent-service/src/backends/base-acp.ts` 的 `handleFileOperation` 方法

### 3.3 防抖时间过短可能导致批量更新被拆分

**位置**：`ai-chat.tsx` 第 360-367 行

```tsx
fileUpdateTimer = setTimeout(() => {
  processRealtimeFiles();
  fileUpdateTimer = null;
}, 100);  // ← 100ms 防抖
```

**问题**：100ms 的防抖时间非常短，如果 Agent 在短时间内连续写入多个文件，可能导致部分更新被覆盖。

**建议**：考虑增加到 300-500ms，或使用更智能的批量策略

### 3.4 `finish` 事件中的代码提取可能失败

**位置**：`ai-chat.tsx` 第 440-463 行

```tsx
const codeMatch = accumulatedContent.match(
  /```(?:tsx|tsx?|typescript|javascript)\n([\s\S]*?)```/,
);
if (codeMatch && onCodeUpdate) {
  onCodeUpdate(codeMatch[1].trim());
}
```

**问题**：如果 AI 没有以标准代码块格式回复（例如直接修改文件但回复中没有包含代码块），备选方案会失败。

**影响**：较小，因为主要依赖 `file_operation` 事件，而非从文本中提取

---

## 四、数据流完整路径

```
用户输入 AI 对话
      │
      ▼
Agent Service (WebSocket)
      │
      ▼
AI 修改文件 (index.tsx / config.schema.json)
      │
      ▼
file_operation 事件回传前端（包含 content 字段）
      │
      ▼
ai-chat.tsx 监听 file_operation 事件
      │
      ├─ 如果 file.path 包含 "index.tsx" 且 file.content 存在
      │     → 调用 onCodeUpdate?.(file.content)
      │
      └─ 如果 file.path 包含 "config.schema.json" 且 file.content 存在
            → 调用 onSchemaUpdate?.(file.content)
      │
      ▼
edit/page.tsx 的 handleCodeUpdate 回调
      │
      ├─ setCode(newCode) → 更新 code 状态
      ├─ setEditorContent(...) → 更新编辑器内容
      └─ validateAll(...) → 触发验证
      │
      ▼
PreviewPanel 接收到新的 code prop
      │
      ▼
构建 files 对象：
  {
    "/Demo.tsx": code,        // ← 新代码
    "/App.tsx": entryCode,    // ← 入口代码
    ...sdkFiles               // ← 问题点：sdkFiles 为 undefined
  }
      │
      ▼
SandpackProvider 接收 files
      │
      ▼
SandpackPreview 渲染预览
      │
      ❌ 如果 sdkFiles 缺失，可能导致编译失败或渲染异常
```

---

## 五、解决方案

### 方案 1：修复 `sdkFiles` 传递（推荐）⭐

**步骤**：

1. **在编辑页面中获取 `sdkFiles`**：

```tsx
// packages/web/src/app/demo/[id]/edit/page.tsx

// 添加状态
const [sdkFiles, setSdkFiles] = useState<Record<string, string>>({});

// 在 loadDemo 函数中加载 SDK 文件
const loadDemo = async () => {
  try {
    // ... 现有代码 ...

    // 从 API 加载 SDK 文件
    const sdkRes = await fetch(`/api/sessions/${sessionData.data.sessionId}/sdk-files`);
    if (sdkRes.ok) {
      const sdkData = await sdkRes.json();
      if (sdkData.success) {
        setSdkFiles(sdkData.data.files);
      }
    }
  } catch (error) {
    // ... 错误处理 ...
  }
};
```

2. **传递给 PreviewPanel**：

```tsx
<PreviewPanel
  code={code}
  configData={configData}
  sdkFiles={sdkFiles}  // ← 添加此行
  previewSize={previewSize}
/>
```

3. **如果 SDK 文件是静态资源，可以直接导入**：

```tsx
// 如果 SDK 文件是固定的，可以从静态资源加载
import sdkFiles from '@/config/sdk-files.json';

// 或在组件中定义
const sdkFiles = {
  '/sdk/SomeComponent.tsx': `// SDK 组件代码`,
  // ...
};
```

### 方案 2：优化文件路径匹配逻辑

**位置**：`packages/web/src/components/ai-elements/ai-chat.tsx`

```tsx
// 改进前
if (
  (file.path.includes("index.tsx") || file.path.includes("index.ts")) &&
  file.content
) {
  onCodeUpdate?.(file.content);
}

// 改进后
const isCodeFile = (path: string) => {
  const normalizedPath = path.replace(/\\/g, '/');
  return (
    normalizedPath.endsWith('index.tsx') ||
    normalizedPath.endsWith('index.ts') ||
    normalizedPath.endsWith('Demo.tsx') ||
    normalizedPath.endsWith('Demo.ts')
  );
};

if (isCodeFile(file.path) && file.content) {
  console.log('[AIChat] Code update detected:', file.path);
  onCodeUpdate?.(file.content);
}
```

### 方案 3：增加调试日志

在关键位置添加日志，方便排查问题：

```tsx
// ai-chat.tsx - processRealtimeFiles 函数
const processRealtimeFiles = () => {
  const files = Array.from(realtimeFilesRef.entries()).map(
    ([path, info]) => ({
      path,
      action: info.action as "created" | "modified" | "deleted",
      content: info.content,
    }),
  );

  console.log('[AIChat] processRealtimeFiles called with:', files);

  if (files.length > 0) {
    onFilesChange?.(files);

    for (const file of files) {
      if (
        (file.path.includes("index.tsx") || file.path.includes("index.ts")) &&
        file.content
      ) {
        console.log('[AIChat] Calling onCodeUpdate with content length:', file.content.length);
        onCodeUpdate?.(file.content);
      } else if (
        file.path.includes("config.schema.json") &&
        file.content
      ) {
        console.log('[AIChat] Calling onSchemaUpdate with content length:', file.content.length);
        onSchemaUpdate?.(file.content);
      }
    }
  }
};
```

```tsx
// edit/page.tsx - handleCodeUpdate 函数
const handleCodeUpdate = useCallback(
  (newCode: string) => {
    console.log('[DemoEdit] handleCodeUpdate called, code length:', newCode.length);
    setCode(newCode);
    setEditorContent((prev) =>
      buildFigmaText(newCode, extractSchemaFromFigma(prev) || schema),
    );
    if (schema) {
      const result = validateAll(newCode, schema);
      setValidationResult(result);
    }
  },
  [schema],
);
```

```tsx
// PreviewPanel.tsx
useEffect(() => {
  console.log('[PreviewPanel] code prop changed:', code?.substring(0, 100));
}, [code]);
```

---

## 六、排查步骤建议

1. **检查浏览器控制台**：
   - 打开开发者工具（F12）
   - 搜索 `[AIChat]`、`[DemoEdit]`、`[PreviewPanel]` 日志
   - 查看 `file_operation` 事件是否被触发
   - 确认 `onCodeUpdate` 是否被调用

2. **检查 Agent Service 日志**：
   - 确认 Agent 是否成功写入了 `index.tsx`
   - 确认 `file_operation` 事件是否包含 `content` 字段

3. **验证 workingDir**：
   ```tsx
   console.log('[DemoEdit] tempWorkspace:', tempWorkspace);
   ```

4. **检查 Sandpack 编译错误**：
   - 打开浏览器控制台
   - 查看是否有 Sandpack 相关的编译错误
   - 检查 Network 标签，查看 Sandpack 加载的资源是否正常

5. **手动测试预览区**：
   - 在代码编辑区手动修改代码
   - 观察预览区是否更新
   - 如果手动编辑也不更新，说明问题不在 AI 会话部分，而在 PreviewPanel 本身

---

## 七、总结

| 问题 | 严重程度 | 影响 | 解决难度 |
|------|---------|------|---------|
| `sdkFiles` 未传递 | **高** | 预览区可能无法正常编译和渲染 | 低 |
| 文件路径匹配不精确 | 中 | 可能漏匹配或误匹配 | 低 |
| `content` 字段可能缺失 | 中 | `onCodeUpdate` 不会被调用 | 中 |
| 防抖时间过短 | 低 | 批量更新可能被拆分 | 低 |
| 代码块提取失败 | 低 | 备选方案失效 | 低 |

**建议优先修复 `sdkFiles` 传递问题**，这是最可能导致预览不更新的根因。修复后，再根据实际效果决定是否需要优化其他问题。

---

## 八、相关文件清单

| 文件 | 路径 | 作用 |
|------|------|------|
| 编辑页面 | `packages/web/src/app/demo/[id]/edit/page.tsx` | 父组件，管理状态和回调 |
| AI 聊天组件 | `packages/web/src/components/ai-elements/ai-chat.tsx` | 监听文件变更事件 |
| 预览面板 | `packages/web/components/demo/PreviewPanel.tsx` | Sandpack 预览渲染 |
| 类型定义 | `packages/web/components/demo/types.ts` | Props 类型定义 |
| WebSocket 路由 | `packages/agent-service/src/routes/websocket.ts` | 后端文件事件推送 |
| ACP 连接层 | `packages/agent-service/src/acp/connection.ts` | Agent 文件操作拦截 |
| Base ACP 后端 | `packages/agent-service/src/backends/base-acp.ts` | 文件变更累积 |

---

**报告生成时间**：2026-04-11  
**分析人**：Qwen Code AI Agent
