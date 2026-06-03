# 全局配置修改后 Pad 预览不更新 — 问题分析与修复方案

## 问题描述

项目 `proj_1779608458649`（学习页-课后）包含两个 Demo 页面：手机版和平板版，共享一个全局配置 `bannerImage`。

**现象**：
1. 刚进入编辑页，在配置面板修改全局配置（如 bannerImage），**只有手机页面预览更新，平板页面不更新**
2. 在预览区点击平板页面选中后，再修改配置 → **手机和平板都更新**（正常）
3. 继续点击手机页面选中后，再修改配置 → **手机和平板都更新**（正常）

**核心特征**：只有在「从未点击过任何页面」的初始状态下，平板页面才不更新。一旦用户在预览区点选过平板页面，问题就消失了。

---

## 根因分析

### 数据流追踪

```
用户修改全局配置
    ↓
ConfigForm.onChange(data)    ← edit/page.tsx:1324
    ↓
setConfigDataMap(prev => {
  const next = { ...prev };
  for (const pageId of Object.keys(next)) {   // ← 只遍历已有 key
    next[pageId] = { ...next[pageId], ...data };
  }
  return next;
})
    ↓
PreviewGrid 接收 configDataMap
    ↓
每个 GridIframe 接收 configData={configDataMap?.[page.id] ?? {}}
    ↓
useEffect 监听 configData 变化 → postMessage("UPDATE_CONFIG")
```

### 根因：`configDataMap` 初始化只包含活跃页面

**关键代码** — [edit/page.tsx:336-339](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/app/demo/%5Bid%5D/edit/page.tsx#L336-L339)：

```javascript
const defaults = getSafeMergedDefaults(loadedSchema);
if (initialDemoId) {
  setConfigDataMap({ [initialDemoId]: defaults });  // ← 只初始化了第一个页面
}
```

页面加载时，`configDataMap` 只被初始化为 `{ "demo_1779608460500_a1b2c3": { bannerImage: "..." } }`，**平板页面 `demo_1779608461000_d4e5f6` 没有被初始化**。

### 连锁影响

1. **全局配置 onChange 只更新已有 key** — [edit/page.tsx:1325-1330](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/app/demo/%5Bid%5D/edit/page.tsx#L1325-L1330)：

   ```javascript
   for (const pageId of Object.keys(next)) {  // next 中没有平板页面的 key
     next[pageId] = { ...next[pageId], ...data };
   }
   ```

   由于 `configDataMap` 中不存在平板页面的 key，`Object.keys(next)` 不会包含它，全局配置的变更无法传播到平板页面。

2. **PreviewGrid 传给平板 iframe 的是空对象** — [PreviewGrid.tsx:504](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/components/demo/PreviewGrid.tsx#L504)：

   ```javascript
   configData={configDataMap?.[page.id] ?? {}}  // 平板页面拿到的是 {}
   ```

   平板 iframe 收到的 `configData` 始终是 `{}`，即使全局配置变更后也仍是 `{}`（新引用但内容为空），`UPDATE_CONFIG` 发送的是空配置。

3. **点击平板页面后，configDataMap 被补全** — [edit/page.tsx:1289-1293](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/app/demo/%5Bid%5D/edit/page.tsx#L1289-L1293)：

   ```javascript
   setConfigDataMap((prev) => {
     if (prev[pageId]) return prev;
     const defaults = getSafeMergedDefaults(data.data.schema);
     return { ...prev, [pageId]: defaults };  // ← 补全了平板页面的配置
   });
   ```

   用户点击平板页面后，`configDataMap` 新增了平板页面的 key（含全局配置默认值），此后全局配置 onChange 就能遍历到它了。

### 问题总结

| 阶段 | configDataMap 内容 | 全局配置 onChange 能否更新平板 |
|---|---|---|
| 初始加载 | `{ 手机: {...} }` | 不能 — 平板 key 不存在 |
| 点击平板后 | `{ 手机: {...}, 平板: {...} }` | 能 — 平板 key 已存在 |
| 点击手机后 | `{ 手机: {...}, 平板: {...} }` | 能 — 平板 key 仍存在 |

---

## 修复方案

### 修改点 1：初始化时为所有页面填充 configDataMap

**文件**：[edit/page.tsx:336-339](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/app/demo/%5Bid%5D/edit/page.tsx#L336-L339)

**修改前**：
```javascript
const defaults = getSafeMergedDefaults(loadedSchema);
if (initialDemoId) {
  setConfigDataMap({ [initialDemoId]: defaults });
}
```

**修改后**：
```javascript
// 为所有页面初始化配置（合并项目级 + 页面级 Schema 默认值）
const allDefaults: Record<string, Record<string, unknown>> = {};
if (multi.demos) {
  for (const [pageId, demo] of Object.entries(multi.demos)) {
    const pageSchema = typeof demo.schema === 'string' ? demo.schema : JSON.stringify(demo.schema);
    allDefaults[pageId] = getSafeMergedDefaults(pageSchema);
  }
}
setConfigDataMap(allDefaults);
```

### 修改点 2：全局配置 onChange 补全缺失页面

**文件**：[edit/page.tsx:1324-1331](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/app/demo/%5Bid%5D/edit/page.tsx#L1324-L1331)

**修改前**：
```javascript
onChange={(data) => {
  setConfigDataMap((prev) => {
    const next = { ...prev };
    for (const pageId of Object.keys(next)) {
      next[pageId] = { ...next[pageId], ...data };
    }
    return next;
  });
}}
```

**修改后**：
```javascript
onChange={(data) => {
  setConfigDataMap((prev) => {
    const next = { ...prev };
    // 更新已有页面的配置
    for (const pageId of Object.keys(next)) {
      next[pageId] = { ...next[pageId], ...data };
    }
    // 补全尚未初始化的页面（防御性保障）
    for (const page of demoPages) {
      if (!next[page.id]) {
        next[page.id] = { ...data };
      }
    }
    return next;
  });
}}
```

---

## 影响范围

| 影响点 | 说明 |
|---|---|
| 编辑页初始加载 | 所有页面预览 iframe 都能正确获取全局配置默认值 |
| 全局配置修改 | 所有页面（包括未被点击过的）都能收到更新 |
| 页面级配置修改 | 不受影响 — 仍只更新当前活跃页面 |
| 单页预览模式 | 不受影响 — 只有一个 iframe |
| 宫格预览模式 | 修复目标 — 所有 iframe 同步更新 |

---

## 验证步骤

1. 打开项目 `proj_1779608458649` 编辑页
2. 切换到宫格预览模式，确认手机和平板两个预览都可见
3. **不点击任何预览卡片**，直接在配置面板修改全局配置 `bannerImage`
4. 确认手机和平板预览都实时更新
5. 刷新页面，重复步骤 1-4，确认行为一致
