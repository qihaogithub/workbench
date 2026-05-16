# Figma 导入代码与预览界面不匹配 — 问题分析报告

> **创建日期**: 2026-05-16
> **状态**: 待修复
> **关联项目**: `proj_1776526720347`（测试123）
> **关联文档**: [Figma导入页面内容重复-分析报告](./Figma导入页面内容重复-分析报告.md)

---

## 1. 问题概述

### 1.1 问题描述

用户在编辑器中点击「查看代码」弹窗显示的代码内容，与预览区实际渲染的界面**明显不一致**：

| 视图 | 内容 | 来源文件 |
|------|------|----------|
| **代码弹窗** | 麦克风权限页面（状态栏 + 麦克风图标 + 功能列表） | `demo_1778751411983_7h2rpo/index.tsx` |
| **预览区** | 炫彩世界页面（渐变色卡片列表） | `demo_1778077850198_fjxwmf/index.tsx` |

### 1.2 项目 Demo 页面清单

| Demo ID | 名称 | order | 内容 |
|---------|------|-------|------|
| `demo_1777965200000_x8k2p9` | 手机 | 4 | 麦克风权限（与 demo_1778751411983_7h2rpo 重复） |
| `demo_1778077850198_fjxwmf` | 横屏 iPad mini | 5 | 炫彩世界（预览区渲染） |
| `demo_1778751411983_7h2rpo` | 从Figma导入的页面 | 7 | 麦克风权限（代码弹窗显示） |

---

## 2. 核心结论

**问题根因：「查看代码」弹窗与预览区指向了不同的页面。**

- **「查看代码」弹窗**：显示用户右键点击的指定页面代码
- **预览区**：渲染当前 `activeDemoId` 对应的页面代码

当两者不一致时，用户看到的代码与预览自然不同。这是 UI 交互设计问题，非渲染 Bug。

---

## 3. 问题机制分析

### 3.1 渲染管线验证

通过代码审查确认以下关键点：

**PreviewPanel 直接使用 `code` prop**
```tsx
// PreviewPanel 直接将 code prop 发送到编译 API
const body = sessionId ? { sessionId, code } : { code };
// 编译 API 优先使用 code 参数，不读取文件系统
```

**文件读取函数不涉及项目级文件**
- `getWorkspaceMultiDemoFiles()`、`getWorkspaceDemoPageFiles()`、`compileSession()` 均只读取 `demos/` 子目录
- `workspace/index.tsx` 从未被预览渲染管线读取

### 3.2 两个独立的代码展示通道

| 通道 | 触发方式 | 代码来源 |
|------|----------|----------|
| **「查看代码」弹窗** | 右键菜单 `onViewCode` | `/api/sessions/{sessionId}/files/{pageId}` |
| **预览区** | `PreviewPanel` 组件 | 当前 `activeDemoId` 对应的 `code` 状态 |

### 3.3 初始加载页面顺序问题

`loadDemo()` 中使用 `Object.keys(multi.demos)[0]` 选择初始页面，但：

1. `Object.keys()` 顺序依赖文件系统，不保证按 `order` 排序
2. 页面列表 UI 按 `order` 排序，用户看到的首项可能与实际渲染的页面不同

`pickFirstDemoFiles()` 存在相同问题。

---

## 4. 问题全貌

```
用户右键「从Figma导入的页面」→ 点击「查看代码」
    │
    ├─→ [查看代码弹窗]
    │   onViewCode(demo_1778751411983_7h2rpo)
    │   → 显示「麦克风权限」代码 ✅
    │
    └─→ [预览区]
        code 来自当前 activeDemoId
        → activeDemoId = demo_1778077850198_fjxwmf
        → 预览显示「炫彩世界」 ✅

→ 两者指向不同页面，预期行为但用户误解为 Bug

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

初始加载时：
  loadDemo() → Object.keys(multi.demos)[0] ← 未排序
  → 可能选中 demo_1778077850198_fjxwmf（炫彩世界）
  → 但页面列表首项是 demo_1777965200000_x8k2p9（手机）
  → 用户看到首项高亮但预览显示非首项内容

→ 初始页面选择与 UI 排序不一致，属于 Bug
```

---

## 5. 涉及代码路径

### 关键文件

| 文件路径 | 说明 |
|----------|------|
| `packages/author-site/components/demo/PreviewPanel.tsx` | 预览面板，直接使用 `code` prop 编译 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 编辑器页面，`loadDemo()` 所在 |
| `packages/author-site/src/app/api/compile/route.ts` | 编译 API，优先使用 `code` 参数 |
| `packages/author-site/src/lib/compiler.ts` | 编译器，含 `compileCode` 和 `compileSession` |
| `packages/author-site/src/lib/session-manager.ts` | Session 创建，含 `pickFirstDemoFiles()` |
| `packages/author-site/src/lib/fs-utils.ts` | 文件读取，仅遍历 `demos/` 子目录 |

### 调用链

```
[编辑器加载]
  loadDemo() → targetDemoId = Object.keys(multi.demos)[0] ⚠️
  → setCode(targetDemoId 对应的 code)
  → setActiveDemoId(targetDemoId)

[页面切换]
  onPageSelect(pageId) → setActiveDemoId(pageId)
  → GET /api/sessions/{sessionId}/files/{pageId}
  → setCode(data.data.code)
  → PreviewPanel 自动重新编译

[预览渲染 — 单页模式]
  PreviewPanel → POST /api/compile { code }
  → 编译 API 直接编译 code ✅

[预览渲染 — 宫格模式]
  PreviewGrid → POST /api/compile { sessionId, demoId } ⚠️ 不传 code
  → 编译 API 调用 compileSession() 从文件系统读取

[查看代码弹窗]
  onViewCode(pageId) → GET /api/sessions/{sessionId}/files/{pageId}
  → 显示该页面的 code ← 与 activeDemoId 无关
```

---

## 6. 修复建议

### 6.1 短期修复

1. **确认用户操作场景**：区分「页面切换后预览不更新」和「查看代码与预览指向不同页面」
2. **修复 `loadDemo()` 初始页面选择**：使用排序后的第一个页面
3. **修复 `pickFirstDemoFiles()` 排序问题**：按 `order` 排序后取第一个

### 6.2 中期修复

1. **URL 路由支持 demo 页面 ID**：扩展为 `/demo/{projectId}/edit?page={demoId}`
2. **统一初始页面选择逻辑**：`loadDemo()`、`pickFirstDemoFiles()` 均使用排序后的首项
3. **改善「查看代码」弹窗上下文提示**：当显示页面与激活页面不同时，给出提示

### 6.3 长期修复

1. 增加端到端测试，覆盖「导入 → 切换页面 → 预览 → 代码一致性验证」完整链路
2. 增加代码与预览一致性校验，不一致时给出明确提示

---

## 7. 关联问题

- [Figma导入页面内容重复-分析报告](./Figma导入页面内容重复-分析报告.md) — 同一项目下的关联问题
- [Figma插件导出格式改造方案](./Figma插件导出格式改造方案.md) — Figma 插件导出格式规范

---

## 附录：原始分析错误记录

> 以下为初次分析时的错误，已在正文中修正。

| 错误 | 初次判断 | 实际情况 |
|------|----------|----------|
| 预览内容来源 | `workspace/index.tsx` (BannerDemo) | `demo_1778077850198_fjxwmf/index.tsx` (GradientCardsPage) |
| 代码查找机制 | PreviewPanel 通过 demoId 二次查找 | PreviewPanel 直接使用 `code` prop |
| 项目级文件干扰 | workspace/index.tsx 被预览渲染管线读取 | workspace/index.tsx 从未被读取 |
| 根因 | 项目级文件干扰渲染 | 「查看代码」与预览指向不同页面 |
