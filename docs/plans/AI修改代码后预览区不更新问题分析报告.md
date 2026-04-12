# 问题分析报告：AI 修改代码后预览区不更新

## 一、问题描述

**现象**：在编辑页的 AI 会话区，让 AI 修改代码后，预览区（PreviewPanel）不会自动更新显示最新的代码效果。

**具体案例**：AI 声称删除了 banner，但预览区依然显示 banner

**影响范围**：所有通过 AI 对话修改代码的场景

---

## 二、问题根因分析

### 核心结论：代码更新流程正常，但需要验证代码是否真正被修改

经过深入分析，发现以下关键事实：

1. ✅ **`SandpackProvider` 的 `key={code}` 已实施**（PreviewPanel.tsx 第 137 行）
2. ✅ **代码更新监听逻辑已优化**（ai-chat.tsx 使用精确路径匹配）
3. ✅ **防抖时间已优化为 300ms**（ai-chat.tsx 第 413 行）
4. ⚠️ **文件系统代码可能未真正被 AI 修改**（根本原因）

### 2.1 已实施的修复

#### 修复 1：`key={code}` 属性强制重新渲染

**位置**：`packages/web/components/demo/PreviewPanel.tsx` 第 137 行

```tsx
<SandpackProvider
  key={code}  // ✅ 已添加
  template="react-ts"
  files={files}
  // ...
>
```

**效果**：当 `code` 状态变化时，React 会销毁旧组件并创建新组件，确保 Sandpack 重新初始化。

#### 修复 2：精确路径匹配

**位置**：`packages/web/src/components/ai-elements/ai-chat.tsx` 第 368-382 行

```tsx
const normalizedPath = file.path.replace(/\\/g, "/");
const isCodeFile =
  normalizedPath.endsWith("index.tsx") ||
  normalizedPath.endsWith("index.ts") ||
  normalizedPath.endsWith("Demo.tsx") ||
  normalizedPath.endsWith("Demo.ts");

if (isCodeFile && file.content) {
  console.log("[AIChat] Code update detected:", file.path);
  onCodeUpdate?.(file.content);
}
```

**效果**：避免误匹配（如 `index.tsx.bak`），提高检测准确性。

#### 修复 3：优化防抖时间

**位置**：`packages/web/src/components/ai-elements/ai-chat.tsx` 第 413 行

```tsx
fileUpdateTimer = setTimeout(() => {
  processRealtimeFiles();
  fileUpdateTimer = null;
}, 300);  // ✅ 从 100ms 增加到 300ms
```

**效果**：避免批量更新被拆分，确保多个文件变更一起处理。

### 2.2 当前问题分析

#### 数据流完整路径

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
      ├─ 写入 realtimeFilesRef
      └─ 防抖 300ms
            │
            ▼
      processRealtimeFiles()
            │
            ├─ onFilesChange?.(files)
            └─ onCodeUpdate?.(file.content)  ← 关键调用点
                  │
                  ▼
edit/page.tsx handleCodeUpdate
      │
      ├─ setCode(newCode)
      ├─ setEditorContent(...)
      └─ validateAll(...)
            │
            ▼
PreviewPanel 接收到新的 code prop
      │
      ▼
key={code} 触发 Sandpack 重新渲染 ✅
      │
      ▼
预览区应该更新 ✅
```

#### 为什么 banner 依然存在？

**可能原因**：

1. **AI 没有真正修改文件**
   - AI 声称删除了 banner，但实际上没有调用文件写入操作
   - 或者 AI 修改了其他文件，但没有修改 `index.tsx`

2. **`file_operation` 事件未正确触发**
   - Agent Service 可能没有推送文件变更事件
   - 或者 `content` 字段为空

3. **代码更新路径不匹配**
   - AI 可能修改了其他路径的文件（如 `main.tsx` 而非 `index.tsx`）
   - 导致 `isCodeFile` 检测失败

4. **浏览器缓存**
   - Sandpack 可能缓存了旧的编译结果

### 2.3 证据分析

**文件系统证据**：

检查 `packages/web/data/projects/proj_1775482091324/workspace/index.tsx`，发现：

```tsx
export default function BannerDemo({
  banner,  // ← banner prop 依然存在
  title,
  description,
  theme,
  showBadge
}: BannerDemoProps) {
  // ...
  <img
    src={banner}  // ← banner 渲染代码依然存在
    alt="banner"
    className="w-full h-64 object-cover rounded-lg mb-6"
  />
}
```

**结论**：文件系统中的代码**依然包含 banner**，说明 AI 并没有成功修改文件。

---

## 三、排查步骤

### 3.1 检查浏览器控制台日志

打开开发者工具（F12），搜索以下日志：

```
[AIChat] Code update detected: <file_path>
[AIChat] Calling onCodeUpdate with content length: <length>
[DemoEdit] handleCodeUpdate called, code length: <length>
[PreviewPanel] code prop changed, length: <length>
```

**如果看不到这些日志**，说明代码更新流程未触发。

### 3.2 检查 Agent Service 日志

确认：
- AI 是否真正执行了文件写入操作
- `file_operation` 事件是否包含 `content` 字段
- 文件路径是否为 `index.tsx` 或 `Demo.tsx`

### 3.3 手动测试预览区

1. 在代码编辑区（Code 标签）手动删除 banner 相关代码
2. 观察预览区是否更新

**如果手动编辑也不更新**，说明问题在 PreviewPanel 本身（但 `key={code}` 已修复此问题）。

### 3.4 检查 AI 的实际文件修改

检查以下路径的文件内容：
- `packages/web/data/sessions/<session_id>/index.tsx`
- `packages/web/data/projects/<project_id>/workspace/index.tsx`

**如果这些文件依然包含 banner**，说明 AI 没有真正修改文件。

---

## 四、解决方案

### 方案 0：添加调试日志（最高优先级）⭐⭐⭐

**目的**：确认代码更新流程是否正常工作

**位置**：`packages/web/src/components/ai-elements/ai-chat.tsx`

```tsx
// 在 processRealtimeFiles 函数中添加
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
      const normalizedPath = file.path.replace(/\\/g, "/");
      const isCodeFile =
        normalizedPath.endsWith("index.tsx") ||
        normalizedPath.endsWith("index.ts") ||
        normalizedPath.endsWith("Demo.tsx") ||
        normalizedPath.endsWith("Demo.ts");

      if (isCodeFile && file.content) {
        console.log('[AIChat] Code update detected:', file.path);
        console.log('[AIChat] Content preview:', file.content.substring(0, 100));
        onCodeUpdate?.(file.content);
      } else if (
        normalizedPath.endsWith("config.schema.json") &&
        file.content
      ) {
        console.log('[AIChat] Schema update detected:', file.path);
        onSchemaUpdate?.(file.content);
      }
    }
  }
};
```

**位置**：`packages/web/src/app/demo/[id]/edit/page.tsx`

```tsx
const handleCodeUpdate = useCallback(
  (newCode: string) => {
    console.log('[DemoEdit] handleCodeUpdate called, code length:', newCode.length);
    console.log('[DemoEdit] Code preview (first 200 chars):', newCode.substring(0, 200));
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

### 方案 1：验证 AI 是否真正修改了文件

**步骤**：

1. 在 AI 对话中明确要求 AI 显示它修改的文件路径和内容
2. 检查浏览器控制台的 `[AIChat]` 日志
3. 检查文件系统中的实际文件内容

**如果 AI 没有真正修改文件**：
- 可能是 AI 的提示词问题，需要更明确地要求 AI 修改文件
- 可能是 Agent Service 的文件写入逻辑有问题

### 方案 2：增加文件变更通知的可靠性

**问题**：如果 `file_operation` 事件未正确推送，前端无法感知文件变更。

**解决方案**：
1. 在 AI 对话完成后，主动拉取最新文件
2. 或者增强 Agent Service 的文件变更通知机制

### 方案 3：添加手动刷新按钮

**临时方案**：在预览区添加刷新按钮，用户可以手动触发重新渲染。

```tsx
<Button onClick={() => setCode((prev) => prev + '')}>
  <RefreshCw className="h-4 w-4" />
  刷新预览
</Button>
```

**原理**：通过修改 `code` 状态触发 `key={code}` 重新渲染。

---

## 五、总结

| 问题 | 状态 | 严重程度 | 备注 |
|------|------|---------|------|
| **SandpackProvider 缺少 key 属性** | ✅ 已修复 | 极高 | PreviewPanel.tsx 第 137 行 |
| **文件路径匹配不精确** | ✅ 已修复 | 中 | ai-chat.tsx 使用 endsWith |
| **防抖时间过短** | ✅ 已修复 | 低 | 从 100ms 增加到 300ms |
| **AI 未真正修改文件** | ⚠️ 待验证 | 极高 | 需要检查日志和文件系统 |
| **file_operation 事件未推送** | ⚠️ 待验证 | 高 | 需要检查 Agent Service |

**下一步行动**：

1. ✅ **立即实施方案 0**（增加调试日志）- 确认代码更新流程是否正常工作
2. ⚠️ **验证 AI 是否真正修改了文件** - 检查浏览器控制台和 Agent Service 日志
3. ⚠️ **如果 AI 没有修改文件** - 检查 Agent 的提示词和文件写入逻辑
4. ⚠️ **如果 file_operation 事件未推送** - 检查 Agent Service 的 WebSocket 通知机制

---

## 六、相关文件清单

| 文件 | 路径 | 作用 |
|------|------|------|
| 编辑页面 | `packages/web/src/app/demo/[id]/edit/page.tsx` | 父组件，管理状态和回调 |
| AI 聊天组件 | `packages/web/src/components/ai-elements/ai-chat.tsx` | 监听文件变更事件 |
| 预览面板 | `packages/web/components/demo/PreviewPanel.tsx` | Sandpack 预览渲染（已修复） |
| 类型定义 | `packages/web/components/demo/types.ts` | Props 类型定义 |
| 工作区文件 | `packages/web/data/projects/proj_*/workspace/index.tsx` | 实际代码文件 |
| WebSocket 路由 | `packages/agent-service/src/routes/websocket.ts` | 后端文件事件推送 |

---

**报告更新时间**：2026-04-12
**更新人**：Qwen Code AI Agent
**更新内容**：补充了 banner 未删除的具体案例分析，确认 key={code} 已修复，新增排查步骤和验证方案
