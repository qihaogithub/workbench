# Figma 导入页面内容与其他页面相同 — 问题分析报告

> **创建日期**: 2026-05-14  
> **更新日期**: 2026-05-14（已修复）  
> **状态**: 已修复  
> **关联文档**: [Figma插件导出格式改造方案](./Figma插件导出格式改造方案.md)  
> **关联项目**: `proj_1776526720347`（测试123）

---

## 1. 问题背景

### 问题描述
用户从 Figma 导入页面后，编辑器预览区显示的是第一个页面的内容，而非用户实际导入的页面内容。即使用户手动通过侧边栏或下拉框切换到新导入的页面并点击，刷新页面后预览区又回到第一个页面的内容。

### 发生场景
- **项目**：`proj_1776526720347`（测试123）
- **操作**：用户在编辑器左侧「页面列表」点击「添加 → 从 Figma 导入」，粘贴 Figma 插件导出的 Markdown 格式内容
- **触发条件**：
  1. 导入新页面后，编辑器**初始加载**或**页面刷新**时预览区总是显示第一个页面
  2. 通过侧边栏或顶部下拉手动切换到新页面后，内容可正常显示，但刷新即失效

### 预期行为
导入新页面后，编辑器应显示新导入页面的代码和预览内容。刷新页面后，应保持当前正在编辑的页面不变。

### 实际行为
编辑器的预览区始终显示第一个页面（demos 列表中排序第一的页面）的内容，包括代码编辑器和预览面板。通过侧边栏切换后可短暂看到正确的导入内容，但刷新页面后立即回到第一个页面。

### 数据证据

**新导入的页面 `demo_1778751411983_7h2rpo`（「麦克风权限」页面）**：
- `data-figma-id="4069:145340"` — 与项目内其他页面**完全不同**的 Figma 设计源
- 包含麦克风权限申请、功能列表等 UI 元素，约 84 行完整 JSX
- 内容与其他页面**确实不同**，证明 Figma 侧导出和系统侧写入均正常

**第一个页面 `demo_1777965200000_x8k2p9`（「手机」）**：
- 已被最近一次保存操作覆盖，当前内容与 `demo_1778751411983_7h2rpo` 相同
- 这说明每次保存时，Session 临时工作空间中第一个页面的内容可能被同步传播到其他页面

**关键事实**：文件系统层面，导入的代码确实写入了正确的目录，导入流程本身工作正常。问题出在编辑器**展示**环节。

---

## 2. 根因分析

### 调查过程

1. **验证新导入页面文件** → 确认 `demo_1778751411983_7h2rpo/index.tsx` 包含独特的 Figma 设计内容（`data-figma-id="4069:145340"`），与已有页面不同，**导入流程本身正确**。
2. **审查编辑器页面加载逻辑** → **发现关键缺陷**：`edit/page.tsx` 在多页面模式下始终取 `demos` 对象的第一个键作为默认展示页面，完全忽略 URL 参数和目标 `demoId`。
3. **审查 Figma 导入弹窗代码** → `ImportFromFigmaDialog.tsx` 逻辑正确，解析 Markdown 后正确调用 API 写入文件。
4. **审查导入后端 API** → 创建和写入 API 均使用 `meta.workspaceId` 定位 Session 临时工作空间，校验链路完整。
5. **检查项目元数据** → `project.json` 的 `demoPages` 数组为空，`syncProjectDemoPagesFromWorkspace()` 全代码库无调用。
6. **发现异常目录** → `demo_1778637759438_91jm8r` 为空目录（某次创建操作失败残留）。

### 证据链

| 证据 | 级别 | 来源 | 说明 |
|------|------|------|------|
| 新导入页面文件内容唯一，`data-figma-id="4069:145340"` | **A** | `data/.../demos/demo_1778751411983_7h2rpo/index.tsx` | Figma 导入写入正确，问题不在导入 |
| 编辑器第 259 行 `loadedCode = demos[Object.keys(demos)[0]].code`（已修复） | **A** | `packages/author-site/src/app/demo/[id]/edit/page.tsx:259`（已修改为优先匹配 URL demoId） | 编辑器总取第一个 demo，忽略 URL 的 demoId |
| `setActiveDemoId(firstDemoId)` 初始化为第一个 demo（已修复） | **A** | `packages/author-site/src/app/demo/[id]/edit/page.tsx:265`（已修改为匹配 URL demoId） | 预览面板绑定到错误的 pageId |
| 页面切换逻辑（侧边栏/Select）正常工作 | **A** | `page.tsx:858-879` 和 `page.tsx:1020-1041` | 确认问题仅出现在初始加载，切换后有效 |
| `project.json` 的 `demoPages` 为空数组 | **A** | `data/projects/proj_1776526720347/project.json:306` | 元数据同步缺失（次要问题） |
| `syncProjectDemoPagesFromWorkspace()` 全代码库无调用 | **A** | `packages/author-site/src/lib/fs-utils.ts:1293` | 同步函数从未被执行 |
| 存在空目录 `demo_1778637759438_91jm8r` | **B** | `data/.../demos/` | 某次创建操作失败，目录残留 |

### 根本原因

**根因（唯一）：编辑器初始加载时固定展示第一个页面，忽略 URL 参数**

`packages/author-site/src/app/demo/[id]/edit/page.tsx:259-265`：

```typescript
if (multi.demos && Object.keys(multi.demos).length > 0) {
  // 多页面模式：取第一个页面作为默认
  const firstDemoId = Object.keys(multi.demos)[0];
  const firstDemo = multi.demos[firstDemoId];
  loadedCode = firstDemo.code;
  loadedSchema = firstDemo.schema;
  setActiveDemoId(firstDemoId);
}
```

无论 URL 中的 `demoId` 参数指向哪个页面，编辑器总是取 `demos` 对象中第一个键值对作为展示内容。该逻辑在多页面项目中导致：

1. **初次加载**：URL 为 `/demo/proj_xxx/edit`，`demoId` 参数为项目 ID，但编辑器取第一个 demo 展示
2. **页面刷新**：即使用户当前正在查看新导入的页面，刷新后也会跳回第一个页面
3. **路由导航**：通过 Next.js 路由从一个页面切换到另一个页面时，useEffect 重新执行，又回到第一个页面

**根因说明**：这不是导入流程的问题——文件系统层面，导入的数据写入完全正确。问题出在编辑器的**展示层**：API 返回了所有 demo 页面的数据，但前端代码固定取第一个。侧边栏和 Select 下拉的手动切换使用独立的 `/api/sessions/{sessionId}/files/{pageId}` 接口，因此能正确加载指定页面。但 useEffect 初始加载使用的是 `/api/sessions/{sessionId}/files`（返回全部 demos），且硬编码取第一个。

### 代码执行路径

```
用户打开编辑器
  → Next.js 路由 /demo/[项目ID]/edit
  → useEffect([demoId, toast]) 触发（page.tsx:302）
  → POST /api/sessions {demoId} 创建/复用 Session
  → GET /api/sessions/{sessionId}/files 获取所有页面
  → 返回 {demos: {demo_A: {...}, demo_B: {...}, demo_C: {...}}}
  → ⚠️ 第259行：loadedCode = demos[Object.keys(demos)[0]].code
  → 预览区展示第一个页面内容，忽视 URL 中的 demoId

[正确的切换路径]
  DemoPageTree.onPageSelect(pageId)  [page.tsx:858]
    → GET /api/sessions/{sessionId}/files/{pageId}  ✅ 正确加载
  Select.onValueChange(pageId)  [page.tsx:1020]
    → GET /api/sessions/{sessionId}/files/{pageId}  ✅ 正确加载
```

---

## 3. 修复记录

### 修复内容（2026-05-14）

**修改文件**：`packages/author-site/src/app/demo/[id]/edit/page.tsx:259-267`

修复编辑器初始加载时固定取第一个页面的 Bug，改为优先匹配 URL 参数 `demoId`：

```typescript
// 修复前
const firstDemoId = Object.keys(multi.demos)[0];
const firstDemo = multi.demos[firstDemoId];
loadedCode = firstDemo.code;
loadedSchema = firstDemo.schema;
setActiveDemoId(firstDemoId);

// 修复后
const demoIds = Object.keys(multi.demos);
const targetDemoId = demoIds.includes(demoId as string)
  ? demoId as string
  : demoIds[0];
const currentDemo = multi.demos[targetDemoId];
loadedCode = currentDemo.code;
loadedSchema = currentDemo.schema;
setActiveDemoId(targetDemoId);
```

**验证**：TypeScript 类型检查通过，ESLint 无新增问题。

---

## 3b. 解决方案（待处理）

### 方案一：调用 `syncProjectDemoPagesFromWorkspace` 同步元数据

- **描述**：在 `saveEditSession()` 保存操作完成后调用 `syncProjectDemoPagesFromWorkspace()`，确保 `project.json` 的 `demoPages` 与文件系统一致。
- **原理**：`syncProjectDemoPagesFromWorkspace()` 读取 `workspace/demos/` 目录下的所有 `.demo.json` 文件，重写 `project.json` 的 `demoPages` 数组。
- **影响范围**：修改 `packages/author-site/src/lib/session-manager.ts` 的 `saveEditSession()` 函数。
- **风险**：低。该函数已在 `fs-utils.ts` 中完整实现，仅需添加一次调用。
- **复杂度**：**低**（约 3 行代码）

### 后续建议

1. **清理空目录 `demo_1778637759438_91jm8r`**：手动删除该残留目录，或增加页面创建失败时的自动回滚机制。
2. **增加 Figma 导入后的页面焦点切换**：导入成功后自动将编辑器焦点切换到新创建的页面（当前仅更新侧边栏列表，未联动编辑器预览区）。
3. **增加端到端测试**：覆盖「导入 → 预览 → 刷新保留 → 切换页面」完整链路，确保回归不再发生。

---

## 4. 相关代码路径

### 涉及文件

| 文件路径 | 行号 | 说明 |
|---------|------|------|
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L259-265 | **根因**：编辑器多页面加载时固定取第一个 demo |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L858-880 | 侧边栏 DemoPageTree 页面选择（正确的切换逻辑） |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L1020-1041 | 顶部 Select 下拉页面选择（正确的切换逻辑） |
| `packages/author-site/src/components/demo/ImportFromFigmaDialog.tsx` | L39-82 | Figma 导入弹窗逻辑（工作正常） |
| `packages/author-site/lib/markdown-parser.ts` | L76-160 | Markdown 格式解析器 `parseFigmaMarkdown()` |
| `packages/author-site/src/app/api/projects/[projectId]/demos/route.ts` | L64-192 | 创建页面 API POST |
| `packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/files/route.ts` | L20-193 | 更新页面文件 API PUT |
| `packages/author-site/src/lib/fs-utils.ts` | L1104-1142 | `createWorkspaceDemoPage()` |
| `packages/author-site/src/lib/fs-utils.ts` | L1066-1098 | `updateWorkspaceDemoFiles()` |
| `packages/author-site/src/lib/fs-utils.ts` | L1293-1305 | `syncProjectDemoPagesFromWorkspace()`（定义但从未调用） |
| `packages/author-site/src/lib/session-manager.ts` | L303-428 | `saveEditSession()`（保存时不同步 demoPages） |
| `data/projects/proj_1776526720347/workspace/demos/demo_1778751411983_7h2rpo/` | — | 新导入的「麦克风权限」页面（内容与其他页面不同） |
| `data/projects/proj_1776526720347/workspace/demos/demo_1777965200000_x8k2p9/` | — | 第一个页面「手机」（已被最近保存覆盖为相同内容） |
| `data/projects/proj_1776526720347/workspace/demos/demo_1778637759438_91jm8r/` | — | 空目录（创建失败残留） |

### 调用链

```
[编辑器加载 — 已修复 ✅]
  edit/page.tsx:useEffect([demoId])
    → POST /api/sessions {demoId}
    → GET /api/sessions/{sessionId}/files → {demos: {所有页面}, ...}
    → 第259行：优先匹配 URL demoId → 找到则加载该页，找不到回退第一个
    → ✅ 预览区展示正确页面内容

[编辑器加载特殊情形 — 初次访问项目]
  URL 为 /demo/[项目ID]/edit，demoId 为项目 ID 而非页面 ID
    → 找不到匹配项，回退第一个页面（合理行为）

[编辑器加载特殊情形 — 直接访问页面]
  URL 为 /demo/[页面ID]/edit，demoId 为具体页面 ID
    → 匹配成功，加载该页 ✅
  Select.onValueChange(pageId)  [page.tsx:1020]
    → GET /api/sessions/{sessionId}/files/{pageId}  ✅
```

### 相关配置

- 无特殊环境变量。页面数据全部存储在文件系统中。
