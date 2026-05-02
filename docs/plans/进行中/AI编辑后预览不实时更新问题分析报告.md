# AI 编辑后预览不实时更新问题分析报告

> 分析时间：2026-05-02（第三次修订）
> 分析范围：packages/web 前端应用
> 状态：方案 A+、B、C 已实施，但问题依然存在，需进一步调查

---

## 一、问题背景

### 1.1 问题描述

用户在 Demo 编辑页使用 AI 对话功能修改页面代码后，AI 编辑成功完成，但**预览区不会立刻显示最新效果**。用户需要**手动保存页面后，重新打开编辑页**，才能看到最新的预览效果。

### 1.2 预期行为 vs 实际行为

| 维度 | 预期行为 | 实际行为 |
|------|---------|---------|
| AI 编辑完成后 | 预览区应自动更新，显示最新代码效果 | 预览区仍显示旧版本内容 |
| 保存并重新打开后 | 预览区显示最新内容 | 预览区显示最新内容（正常） |

### 1.3 涉及组件

- **编辑页**：[page.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/demo/[id]/edit/page.tsx)
- **AI 聊天组件**：[ai-chat.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/ai-chat.tsx)
- **预览面板**：[PreviewPanel.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/components/demo/PreviewPanel.tsx)
- **编译 API**：[route.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/api/compile/route.ts)
- **编译器**：[compiler.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/lib/compiler.ts)

---

## 二、修复历史

### 2.1 第一次修复（方案 A）

**问题定位**：原分析认为 `code` prop 未传递给 PreviewPanel，导致编译 effect 不触发。

**修复内容**：在 page.tsx 中给 PreviewPanel 传递 `code` prop。

**结果**：修复后问题依然存在。

### 2.2 第二次修复（方案 A+、B、C）

**问题定位**：编译请求只发送 `sessionId`，`code` 被完全忽略；finish 事件正则提取覆盖正确代码；finish 事件清除防抖定时器导致文件变更丢失。

**修复内容**：
- **方案 A+**：PreviewPanel 编译请求同时发送 `code` 和 `sessionId`；编译 API 优先使用 `code` 编译
- **方案 B**：移除 finish 事件中的正则提取逻辑
- **方案 C**：finish 事件先调用 `processRealtimeFiles()` 再清除定时器

**修复状态**：✅ 所有修改已到位（通过代码审查确认）

**结果**：修复后问题依然存在。

---

## 三、当前代码状态

### 3.1 已确认的代码修改

以下修改已确认存在于代码中：

**PreviewPanel.tsx L187-189：**
```typescript
const body = sessionId
  ? { sessionId, code }  // ✅ 已修改
  : { code };
```

**compile/route.ts L13-29：**
```typescript
if (code && typeof code === 'string') {  // ✅ code 优先
  let lockedDependencies: Record<string, string> | undefined;
  if (sessionId && typeof sessionId === 'string') {
    // 从 sessionId 读取 lockedDependencies
  }
  result = compileCode(code, lockedDependencies);
} else if (sessionId) {
  result = compileSession(sessionId);
}
```

**ai-chat.tsx L665-672（方案 C）：**
```typescript
if (fileUpdateTimer) {
  clearTimeout(fileUpdateTimer);
  fileUpdateTimer = null;
  processRealtimeFiles();  // ✅ 先处理再清除
}
```

**ai-chat.tsx 正则提取：** ✅ 已完全移除（代码中无"尝试从内容中提取代码"字样）

### 3.2 问题依然存在的表现

所有预期修复均已实施，但用户反馈 AI 编辑后预览仍然不实时更新。需要重新分析未被识别的根因。

---

## 四、进一步调查方向

### 4.1 待排查的可能性

1. **`handleCodeUpdate` 回调是否真的被调用？**
   - 需要在 `handleCodeUpdate` 入口添加日志，确认 AI 编辑后 `onCodeUpdate` 是否被调用
   - 需要确认 `file_operation` 事件是否真的触发了 `onCodeUpdate`

2. **`code` 状态更新是否被 React 批量更新跳过？**
   - 需要确认 `setCode` 是否真的更新了状态
   - 检查是否有其他地方在 AI 编辑后又把 `code` 设回旧值

3. **编译 effect 是否真的重新触发？**
   - 需要在 effect 入口添加日志
   - 确认依赖数组中的变量是否真的变化了

4. **iframe 的 `UPDATE_CODE` 消息是否被正确处理？**
   - 需要在 iframe 的 `UPDATE_CODE` 处理逻辑中添加日志
   - 确认 iframe 是否真的收到了新代码并重新渲染

5. **`compileCode` 函数是否有缓存导致返回旧结果？**
   - compiler.ts 中有 `compileCache`，如果缓存 key 相同会返回缓存结果
   - 需要确认缓存 key 是否基于 code 内容生成

### 4.2 需要添加的诊断日志

为了准确定位问题，建议在以下位置添加日志：

```typescript
// 1. handleCodeUpdate 入口（page.tsx）
const handleCodeUpdate = useCallback(
  (newCode: string) => {
    console.log("[handleCodeUpdate] 被调用, newCode length:", newCode.length);

    // 2. setCode 之后
    setCode(newCode);
    console.log("[handleCodeUpdate] setCode 调用后，code:", code?.substring(0, 50));

    // ...
  },
  [schema, sessionId],
);

// 3. PreviewPanel 编译 effect 入口
useEffect(() => {
  console.log("[PreviewPanel] 编译 effect 触发, code:", code?.substring(0, 50));
  // ...
}, [code, sessionId, validCode, sendUpdateCode]);

// 4. 编译 API 入口
console.log("[compile API] 收到请求, code length:", code?.length);

// 5. iframe UPDATE_CODE 处理
if (type === 'UPDATE_CODE') {
  console.log("[iframe] 收到 UPDATE_CODE, code length:", code?.length);
}
```

---

## 五、总结

### 5.1 当前状态

- **方案 A+、B、C 已全部实施**：代码审查确认所有修改已到位
- **问题依然存在**：用户反馈 AI 编辑后预览仍不实时更新
- **根因未知**：现有分析未能覆盖真正的断裂点

### 5.2 下一步行动

**建议**：在关键路径添加诊断日志，重新追踪数据流，找到真正的断裂点。

### 5.3 影响范围

- 仅影响 Demo 编辑页的预览实时更新
- 不影响保存、版本管理等其他功能
