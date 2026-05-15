# Figma 导入页面内容与其他页面相同 — 问题分析报告

> **创建日期**: 2026-05-14  
> **更新日期**: 2026-05-15（问题未完全修复，更新根因分析）  
> **状态**: 修复不完整 — 存在更深层根因，问题仍可复现  
> **关联文档**: [Figma插件导出格式改造方案](./Figma插件导出格式改造方案.md)  
> **关联项目**: `proj_1776526720347`（测试123）

---

## 1. 问题背景

### 问题描述
用户从 Figma 导入页面后，编辑器预览区显示的是第一个页面的内容，而非用户实际导入的页面内容。即使用户手动通过侧边栏或下拉框切换到新导入的页面并点击，刷新页面后预览区又回到第一个页面的内容。更严重的是，保存操作会将正在编辑的内容覆盖写入第一个页面，导致多页面内容同质化。

### 发生场景
- **项目**：`proj_1776526720347`（测试123）
- **操作**：用户在编辑器左侧「页面列表」点击「添加 → 从 Figma 导入」，粘贴 Figma 插件导出的 Markdown 格式内容
- **触发条件**：
  1. 导入新页面后，编辑器**初始加载**或**页面刷新**时预览区总是显示第一个页面
  2. 通过侧边栏或顶部下拉手动切换到新页面后，内容可正常显示，但刷新即失效
  3. **点击「保存」后，第一个页面的内容被覆盖为当前编辑页面的内容**（数据被错误写入）

### 预期行为
导入新页面后，编辑器应显示新导入页面的代码和预览内容。刷新页面后，应保持当前正在编辑的页面不变。保存操作应仅影响当前编辑的页面，不应覆盖其他页面。

### 实际行为
编辑器的预览区始终显示第一个页面（demos 列表中排序第一的页面）的内容，包括代码编辑器和预览面板。通过侧边栏切换后可短暂看到正确的导入内容，但刷新页面后立即回到第一个页面。**保存操作会将当前编辑的代码和 schema 写入第一个页面**，造成两个页面内容完全一致。

### 数据证据

**新导入的页面 `demo_1778751411983_7h2rpo`（「麦克风权限」页面）**：
- `data-figma-id="4069:145340"` — 与项目内其他页面**完全不同**的 Figma 设计源
- 包含麦克风权限申请、功能列表等 UI 元素，约 84 行完整 JSX
- 内容与其他页面**确实不同**，证明 Figma 侧导出和系统侧写入均正常

**第一个页面 `demo_1777965200000_x8k2p9`（「手机」）**：
- 已被最近一次保存操作覆盖，当前内容与 `demo_1778751411983_7h2rpo` 相同
- 这说明每次保存时，Session 临时工作空间中第一个页面的内容可能被同步传播到其他页面

**关键事实**：文件系统层面，导入的代码确实写入了正确的目录，导入流程本身工作正常。**问题有双重根因：展示层 + 保存层。**

---

## 2. 根因分析

### 双重根因

经过两轮深入调查，发现两个独立但共同导致问题现象的根本原因：

| 序号 | 根因 | 层级 | 影响 |
|------|------|------|------|
| 1 | **编辑器初始加载固定展示第一个页面** | 展示层（前端） | 刷新后预览区回到第一页 |
| 2 | **保存 API 始终写入第一个页面** | 保存层（前端+后端） | 保存导致其他页面内容被覆盖 |

### 根因 1：编辑器初始加载固定展示第一个页面（已尝试修复）

**位置**：`packages/author-site/src/app/demo/[id]/edit/page.tsx:259-267`

**修复前逻辑**：
```typescript
const firstDemoId = Object.keys(multi.demos)[0];
const firstDemo = multi.demos[firstDemoId];
loadedCode = firstDemo.code;
loadedSchema = firstDemo.schema;
setActiveDemoId(firstDemoId);
```

**修复后逻辑**（2026-05-14）：
```typescript
const demoIds = Object.keys(multi.demos);
const targetDemoId = demoIds.includes(demoId as string)
  ? demoId as string
  : demoIds[0];
const currentDemo = multi.demos[targetDemoId];
loadedCode = currentDemo.code;
loadedSchema = currentDemo.schema;
setActiveDemoId(targetDemoId);
```

**修复有效性评估**：
- ✅ 当 URL 以页面 ID 结尾时（`/demo/demo_xxx/edit`），能正确匹配并加载该页面
- ❌ 当 URL 以项目 ID 结尾时（`/demo/proj_xxx/edit`），项目 ID 无法匹配任何 demo，仍回退第一个
- ❌ 侧边栏切换页面时 URL 不会更新，刷新后丢失当前页面位置
- **结论**：此修复部分有效，但未解决 URL 路由缺失的根本问题。

### 根因 2：保存 API 始终写入第一个页面（新发现，2026-05-15）

**这是导致「页面内容相同」的最核心根因！**

**位置**：`packages/author-site/src/app/api/sessions/[sessionId]/files/route.ts:79-158`

后端 PUT 路由为**兼容层**，注释明确说明：

```typescript
/**
 * 兼容层：PUT /api/sessions/[sessionId]/files
 * 旧前端按单页面格式保存（code + schema）。
 * 多页面架构下，将数据保存到 workspace 的第一个页面作为兼容。
 * Stage 4 完成后，前端应改用 PUT /api/sessions/[sessionId]/files/[demoId]。
 */
```

关键代码（`route.ts:149-158`）：
```typescript
// 查找第一个页面作为保存目标
const demoPages = listWorkspaceDemoPages(meta.workspaceId);
// ...
const targetDemoId = demoPages[0].id;  // ← 无论用户编辑哪个页面，总是保存到第一个！
const success = updateWorkspaceDemoFiles(meta.workspaceId, targetDemoId, {
  code,
  schema,
});
```

**执行链路**：
```
用户在编辑器编辑「页面B」→ 点击保存
  → 前端 handleSave() 调用 PUT /api/sessions/{sessionId}/files
  → 后端兼容层 discards 实际编辑的页面信息
  → 取 demoPages[0].id（即第一个页面「页面A」的 ID）
  → 将「页面B」的代码和 schema 写入「页面A」的目录
  → 「页面A」内容被「页面B」覆盖，两个页面对比发现内容相同
```

**正确的 API 已存在但未被使用**：
- `PUT /api/sessions/[sessionId]/files/[demoId]`（位于 `route.ts` 同目录下的 `[demoId]/route.ts`）
- 此 API 接受 URL 参数 `demoId`，将保存操作精确定位到目标页面
- 前端 `handleSave` 使用旧 API 而非此新 API

### 证据链（完整版）

| 证据 | 级别 | 来源 | 说明 |
|------|------|------|------|
| 新导入页面文件内容唯一，`data-figma-id="4069:145340"` | **A** | `data/.../demos/demo_1778751411983_7h2rpo/index.tsx` | Figma 导入写入正确，问题不在导入 |
| 编辑器初始加载取第一个 demo（已尝试修复，部分有效） | **A** | `packages/author-site/src/app/demo/[id]/edit/page.tsx:259-265` | 优先匹配 URL demoId，但项目级 URL 不包含页面 ID |
| **PUT 兼容层 `demoPages[0].id`**（新发现） | **A** | `packages/author-site/src/app/api/sessions/[sessionId]/files/route.ts:158` | **保存时总是写入第一个页面，这是数据被覆盖的直接原因** |
| 前端 `handleSave` 未传 demoId（新发现） | **A** | `packages/author-site/src/app/demo/[id]/edit/page.tsx:406`（修复前） | 前端使用不带 demoId 的旧 API |
| Figma 导入后不自动切换页面（新发现） | **B** | `packages/author-site/src/components/demo/DemoPageTree.tsx:251` | 导入成功但编辑器不联动 |
| 页面切换逻辑（侧边栏/Select）正常工作 | **A** | `page.tsx:858-879` 和 `page.tsx:1020-1041` | 确认问题仅出现在初始加载和保存 |
| `project.json` 的 `demoPages` 为空数组 | **A** | `data/projects/proj_1776526720347/project.json:306` | 元数据同步缺失（次要问题） |
| `syncProjectDemoPagesFromWorkspace()` 全代码库无调用 | **A** | `packages/author-site/src/lib/fs-utils.ts:1293` | 同步函数从未被执行 |
| 存在空目录 `demo_1778637759438_91jm8r` | **B** | `data/.../demos/` | 某次创建操作失败，目录残留 |
| `setActiveDemoId(firstDemoId)` 初始化为第一个 demo | **A** | `packages/author-site/src/app/demo/[id]/edit/page.tsx:265` | 预览面板绑定到错误的 pageId |

### 问题全貌

```
┌────────────────────────────────────────────────────────────┐
│                      问题全景图                              │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  [Figma 导入]                                               │
│      │                                                      │
│      ▼                                                      │
│  文件正确写入 demo_C/ 目录 ✅                                │
│      │                                                      │
│      ├─→ [展示层问题 #1]                                     │
│      │   URL = /demo/proj_xxx/edit                          │
│      │   demoId = 项目 ID（非页面 ID）                        │
│      │   → 无法匹配任何 demo，回退第一个页面                    │
│      │   结果：预览区显示第一个页面 ❌                          │
│      │                                                      │
│      └─→ [保存层问题 #2 ← 核心根因]                           │
│          用户手动切换到 demo_C，编辑内容                        │
│          点击「保存」                                         │
│          → 前端调用 PUT /api/sessions/{id}/files            │
│          → 后端兼容层取 demoPages[0].id                      │
│          → 将 demo_C 的内容覆盖写入 demo_A ❌                 │
│          结果：demo_A 和 demo_C 内容相同                      │
│                                                             │
│  [页面刷新]                                                  │
│      URL 仍为 /demo/proj_xxx/edit                           │
│      → 回到问题 #1，展示第一个页面                            │
│      → 用户看到的是被覆盖后的 demo_A（内容=原 demo_C）         │
│      → 看起来像是「导入的内容跑到了第一个页面」                   │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

## 3. 修复记录

### 修复尝试 1（2026-05-14）— 展示层修复

**修改文件**：`packages/author-site/src/app/demo/[id]/edit/page.tsx:259-267`

**修改内容**：编辑器初始加载时改为优先匹配 URL 参数 `demoId`，找不到时回退第一个页面。

**验证**：TypeScript 类型检查通过，ESLint 无新增问题。

**效果**：当 URL 以具体页面 ID 结尾时可正确加载，但项目级 URL（用户入口）仍回退第一个。

### 修复尝试 2（2026-05-15）— 保存层修复

**修改文件 1**：`packages/author-site/src/app/demo/[id]/edit/page.tsx:406`
- `handleSave` 将 `PUT /api/sessions/${sessionId}/files` 改为 `PUT /api/sessions/${sessionId}/files/${activeDemoId}`
- 添加 `activeDemoId` 为空时的校验提示

**修改文件 2**：`packages/author-site/src/components/demo/DemoPageTree.tsx:251`
- `handleImportFigmaCreated` 在添加新页面后调用 `onPageSelect(page.id)`，自动切换到新页面

**验证**：TypeScript 类型检查通过，ESLint 无新增问题。

**待验证**：修复尝试 2 实际运行效果待用户测试反馈。问题仍可复现，说明可能还有未发现的根因，或修复尝试 2 未能覆盖所有场景。

---

## 4. 未解决的问题

### 4.1 URL 路由缺失 — 页面切换不更新 URL

**现状**：用户通过侧边栏手动切换页面后，URL 仍为 `/demo/proj_xxx/edit`（项目级）。刷新页面时 `demoId` 为项目 ID，无法匹配任何 demo page，回退第一个。

**影响**：即使修复了保存问题，刷新后仍需手动重新选择页面。

**可能方案**：页面切换时通过 `router.replace` 将 URL 更新为 `/demo/{pageId}/edit`。需注意与项目级 URL 的兼容性（从项目页进入编辑时 `demoId` 为项目 ID 是合理行为，不应改变此入口行为）。

### 4.2 `syncProjectDemoPagesFromWorkspace` 从未被调用

- **描述**：`saveEditSession()` 保存操作完成后未调用 `syncProjectDemoPagesFromWorkspace()`，导致 `project.json` 的 `demoPages` 数组为空。
- **影响范围**：修改 `packages/author-site/src/lib/session-manager.ts` 的 `saveEditSession()` 函数。
- **风险**：低。该函数已在 `fs-utils.ts:1293` 中完整实现，仅需添加一次调用。
- **复杂度**：**低**（约 3 行代码）

### 4.3 后端兼容层设计缺陷

`PUT /api/sessions/[sessionId]/files` 的兼容层设计为"找不到正确的目标就写第一个页面"，这个静默降级行为在单页面架构下是安全的，但在多页面架构下会导致数据破坏。建议后续阶段移除该兼容层，或改为要求必须传入 `demoId` 参数。

### 4.4 后续建议

1. **清理空目录 `demo_1778637759438_91jm8r`**：手动删除该残留目录，或增加页面创建失败时的自动回滚机制。
2. **增加端到端测试**：覆盖「导入 → 预览 → 保存 → 刷新 → 各页面内容独立」完整链路。
3. **后端兼容层加日志告警**：当 PUT 不带 demoId 时记录 warning 日志，便于后续排查。

---

## 5. 相关代码路径

### 涉及文件

| 文件路径 | 行号 | 说明 |
|---------|------|------|
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L259-267 | **根因 1（已修复，部分有效）**：优先匹配 URL demoId |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L381-451 | **handleSave**：保存逻辑（已改为使用带 demoId 的新 API） |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L858-880 | 侧边栏 DemoPageTree 页面选择（正确的切换逻辑） |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L1020-1041 | 顶部 Select 下拉页面选择（正确的切换逻辑） |
| **`packages/author-site/src/app/api/sessions/[sessionId]/files/route.ts`** | **L79-158** | **根因 2（核心问题）：PUT 兼容层总是保存到第一个页面** |
| `packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts` | L84-231 | **正确的 PUT API**（接受 demoId 参数，前端已改为调用此 API） |
| `packages/author-site/src/components/demo/ImportFromFigmaDialog.tsx` | L39-82 | Figma 导入弹窗逻辑（工作正常） |
| `packages/author-site/src/components/demo/DemoPageTree.tsx` | L251-253 | **Figma 导入后回调**（已添加自动切换到新页面） |
| `packages/author-site/lib/markdown-parser.ts` | L76-160 | Markdown 格式解析器 `parseFigmaMarkdown()` |
| `packages/author-site/src/app/api/projects/[projectId]/demos/route.ts` | L64-192 | 创建页面 API POST |
| `packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/files/route.ts` | L20-193 | 更新页面文件 API PUT |
| `packages/author-site/src/lib/fs-utils.ts` | L1104-1142 | `createWorkspaceDemoPage()` |
| `packages/author-site/src/lib/fs-utils.ts` | L1066-1098 | `updateWorkspaceDemoFiles()` |
| `packages/author-site/src/lib/fs-utils.ts` | L1293-1305 | `syncProjectDemoPagesFromWorkspace()`（定义但从未调用） |
| `packages/author-site/src/lib/session-manager.ts` | L303-428 | `saveEditSession()`（保存时不同步 demoPages） |
| `data/projects/proj_1776526720347/workspace/demos/demo_1778751411983_7h2rpo/` | — | 新导入的「麦克风权限」页面（内容与其他页面不同） |
| `data/projects/proj_1776526720347/workspace/demos/demo_1777965200000_x8k2p9/` | — | 第一个页面「手机」（已被之前保存覆盖为相同内容） |
| `data/projects/proj_1776526720347/workspace/demos/demo_1778637759438_91jm8r/` | — | 空目录（创建失败残留） |

### 调用链

```
[编辑器加载]
  edit/page.tsx:useEffect([demoId])
    → POST /api/sessions {demoId}
    → GET /api/sessions/{sessionId}/files → {demos: {所有页面}, ...}
    → 优先匹配 URL demoId → 找到则加载该页，找不到回退第一个
    → ⚠️ 当 URL 为项目级（/demo/proj_xxx/edit）时，回退第一个页面

[编辑器加载特殊情形 — 初次访问项目]
  URL 为 /demo/[项目ID]/edit，demoId 为项目 ID 而非页面 ID
    → 找不到匹配项，回退第一个页面（合理但不理想的行为）

[编辑器加载特殊情形 — 直接访问页面]
  URL 为 /demo/[页面ID]/edit，demoId 为具体页面 ID
    → 匹配成功，加载该页 ✅

[手动切换页面]
  edit/page.tsx:onPageSelect(pageId)
    → GET /api/sessions/{sessionId}/files/{pageId}
    → 正确加载指定页面 ✅
    → ⚠️ URL 未更新，刷新后丢失

[保存操作 — 2026-05-15 已尝试修复]
  edit/page.tsx:handleSave()
    → PUT /api/sessions/{sessionId}/files/{activeDemoId} ← 改为带 demoId
    → 后端 PUT /api/sessions/[sessionId]/files/[demoId] 正确写入目标页面

[保存操作 — 修复前的错误行为]
  edit/page.tsx:handleSave()
    → PUT /api/sessions/{sessionId}/files（不带 demoId）
    → 后端兼容层 demoPages[0].id  ← 总是写入第一个页面！
    → 目标页面数据丢失或被覆盖

[Figma 导入]
  ImportFromFigmaDialog → POST /api/projects/{projectId}/demos → PUT files
    → 文件正确写入 workspace/demos/{newDemoId}/ ✅
    → DemoPageTree 自动切换到新页面 ✅（2026-05-15 已添加）
```

### 相关配置

- 无特殊环境变量。页面数据全部存储在文件系统中。
