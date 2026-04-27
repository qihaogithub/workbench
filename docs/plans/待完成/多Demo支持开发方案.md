---
covers:
  - packages/web/src/app/demo/[id]/edit/page.tsx
  - packages/web/src/components/demo/preview-panel.tsx
  - packages/web/src/components/config/config-form.tsx
  - packages/web/src/components/ai-chat/
---

# 页面模块多 Demo 支持 - 技术方案

> 版本：v2.0
> 创建日期：2026-04-18
> 更新日期：2026-04-19
> 状态：待评审
> 变更说明：v1.1 存在多处与现有代码库不符的描述，v2.0 全面修正

---

## 一、背景与目标

### 1.1 当前架构现状

当前系统采用 **"一个项目 = 一个工作空间 + 版本管理"** 架构：

**已实现的核心能力**：
- **Project 类型**：已定义于 `packages/shared/src/workspace.ts`，包含 `id`, `name`, `workspacePath`, `versions[]` 等字段
- **版本管理**：完整的快照机制（`snapshots/` 目录），支持版本创建、查询、恢复（最多保留 50 个版本）
- **项目编辑**：已有 `/projects/[id]/edit` 路由，采用两栏布局（AI 对话区 / 文件变更状态）
- **数据目录结构**：
  ```
  packages/web/data/
  └── projects/
      └── {projectId}/
          ├── project.json        # 项目元信息（含版本历史）
          └── workspace/          # 正式工作空间
              ├── index.tsx       # Demo 代码
              └── config.schema.json  # Schema 配置
  ```

**当前限制**：
- 一个项目只能包含**一个 Demo**（workspace 目录下只有一套代码和配置）
- 无法在一个项目中同时预览/编辑多个独立 Demo

### 1.2 目标

支持 **"一个项目 = 多个独立 Demo 实例"** 架构：

- 一个项目可包含多个 Demo（如：电商项目包含商品列表Demo、购物车Demo、结算页Demo）
- 项目编辑页面可同时预览多个 Demo
- AI 对话可同时编辑多个 Demo
- **版本管理仍针对整个项目**（所有 Demo 一起版本化，单个 Demo 不需要独立版本）

### 1.3 核心设计决策

| 决策点 | 选择 | 理由 |
|:-------|:-----|:-----|
| Demo 与版本关系 | 项目级别版本化 | 简化版本管理，避免版本爆炸 |
| 目录结构 | `projects/{id}/demos/{demoId}/` | 保持与现有 workspace 结构兼容 |
| 向后兼容 | 保留旧路由并重定向 | 平滑迁移，不破坏现有功能 |

---

## 二、数据模型设计

### 2.1 现有类型（保持不变）

```typescript
// packages/shared/src/workspace.ts - 已存在

export interface Project {
  id: string;
  name: string;
  description?: string;
  workspacePath: string;       // 指向 demos/ 目录（语义变更）
  versions: VersionInfo[];     // 项目级别版本历史
  createdAt: number;
  updatedAt: number;
}

export interface VersionInfo {
  versionId: string;
  savedAt: number;
  savedBy: string;
  sessionId: string;
  snapshotPath: string;        // 快照包含所有 Demo
  fileCount: number;
  note?: string;
}
```

### 2.2 新增类型定义

```typescript
// packages/shared/src/types.ts - 新增

/**
 * Demo 元信息（属于某个 Project）
 */
export interface DemoMeta {
  id: string;
  projectId: string;           // 所属项目 ID
  name: string;
  order: number;               // 在项目中的排序
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

/**
 * Demo 文件内容
 */
export interface DemoFiles {
  code: string;
  schema: string;
}

/**
 * 编辑会话（支持多 Demo）
 */
export interface MultiDemoSession {
  sessionId: string;
  projectId: string;           // 关联项目
  demoIds: string[];           // 同时编辑的多个 Demo ID
  tempWorkspace: string;       // 临时工作空间（项目级别）
  status: 'editing' | 'saved' | 'discarded';
  createdAt: number;
  expiresAt: number;
}
```

### 2.3 目录结构变更

```
现有结构（一个项目一个 Demo）：
projects/
└── {projectId}/
    ├── project.json
    └── workspace/
        ├── index.tsx
        └── config.schema.json

目标结构（一个项目多个 Demo）：
projects/
└── {projectId}/
    ├── project.json
    └── demos/
        ├── {demoId1}/
        │   ├── index.tsx
        │   └── config.schema.json
        ├── {demoId2}/
        │   ├── index.tsx
        │   └── config.schema.json
        └── ...

快照结构（版本化所有 Demo）：
snapshots/
└── {projectId}/
    └── v1/
        └── demos/
            ├── {demoId1}/
            │   ├── index.tsx
            │   └── config.schema.json
            └── {demoId2}/
                ├── index.tsx
                └── config.schema.json
```

### 2.4 迁移策略

**旧项目兼容**：
- 首次访问旧项目时，自动将其 `workspace/` 目录迁移为 `demos/default/`
- 保留原 `workspace/` 目录作为备份（`workspace-backup/`）
- 更新 `project.json` 中的 `workspacePath` 指向 `demos/` 目录

---

## 三、路由设计

### 3.1 现有路由（保持不变）

| 路由 | 文件路径 | 说明 |
|:-----|:---------|:-----|
| `/projects` | `src/app/projects/page.tsx` | ✅ 已实现 - 项目列表 |
| `/projects/new` | `src/app/projects/new/page.tsx` | ✅ 已实现 - 新建项目 |
| `/projects/[id]/edit` | `src/app/projects/[id]/edit/page.tsx` | ✅ 已实现 - 项目编辑（需重构） |
| `/projects/[id]/versions` | `src/app/projects/[id]/versions/page.tsx` | ✅ 已实现 - 版本历史 |

### 3.2 新增路由

| 路由 | 文件路径 | 说明 |
|:-----|:---------|:-----|
| `/projects/[id]` | `src/app/projects/[id]/page.tsx` | 项目详情页（展示所有 Demo） |
| `/projects/[id]/demos/[demoId]` | `src/app/projects/[id]/demos/[demoId]/page.tsx` | 单个 Demo 使用页 |
| `/projects/[id]/demos/[demoId]/edit` | `src/app/projects/[id]/demos/[demoId]/edit/page.tsx` | 单个 Demo 编辑页 |

### 3.3 向后兼容

- 保留 `/demo/[id]` 路由，添加重定向逻辑：
  - 若 `id` 是旧项目 ID，重定向到 `/projects/[id]/demos/default`
  - 若 `id` 是新 Demo ID，重定向到 `/projects/[projectId]/demos/[demoId]`

---

## 四、页面布局规范

### 4.1 现有项目编辑页布局

**文件路径**：[packages/web/src/app/projects/[id]/edit/page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/app/projects/[id]/edit/page.tsx)

**当前两栏结构**：
```
┌─────────────────────────────────────────────────────────────────┐
│  [返回]  项目编辑                    [保存为新版本] [放弃编辑]   │
├──────────────────────────┬──────────────────────────────────────┤
│                          │                                      │
│  左栏：AI 对话区          │   右栏：文件变更状态                  │
│  (flex-1)                │   (w-80)                             │
│                          │                                      │
│  [AIChat 组件]           │   [文件变更数量]                      │
│                          │   [备注输入框]                        │
│                          │   [保存按钮]                          │
│                          │   [放弃按钮]                          │
│                          │                                      │
└──────────────────────────┴──────────────────────────────────────┘
```

### 4.2 目标多 Demo 编辑页布局

**重构为三栏布局**：

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [返回]  项目名称                        [保存全部] [放弃全部]           │
├──────────────────┬──────────────────────┬───────────────────────────────┤
│                  │                      │                               │
│  左栏：          │   中栏：              │     右栏：                     │
│  功能 Tab 区     │   预览区              │     配置面板                   │
│  (35%)           │   (35%)              │     (30%)                      │
│                  │                      │                               │
│  ┌────────────┐ │                      │   修改配置项，                  │
│  │ ○ AI 对话  │ │                      │   预览区将实时更新              │
│  │ ○ 代码     │ │                      │                               │
│  │ ● 页面     │ │   根据左栏选择        │   [配置表单]                    │
│  └────────────┘ │   显示对应内容        │                               │
│                  │                      │                               │
│  页面 Tab 内容： │   ┌──────────────┐   │                               │
│  ┌────────────┐ │   │  Demo 预览   │   │                               │
│  │ 📄 Demo 1  │ │   │  (单/多宫格) │   │                               │
│  │ 📄 Demo 2  │ │   └──────────────┘   │                               │
│  │ 📄 Demo 3  │ │                      │                               │
│  │ [+ 添加]   │ │                      │                               │
│  ├────────────┤ │                      │                               │
│  │ 显示设置：  │ │                      │                               │
│  │ ○ 仅选中   │ │                      │                               │
│  │ ● 全部显示 │ │                      │                               │
│  │ 每排个数：[3]│ │                     │                               │
│  │ 行高：[200px]│ │                     │                               │
│  └────────────┘ │                      │                               │
└──────────────────┴──────────────────────┴───────────────────────────────┘
```

### 4.3 左栏"页面"Tab 功能

1. **Demo 目录**：
   - 以树形列表展示项目下的所有 Demo
   - 支持勾选/取消勾选控制哪些 Demo 参与预览
   - 支持点击 Demo 项选中编辑目标
   - 支持添加新 Demo

2. **预览显示控制**：
   - **显示模式**：
     - `仅选中`：预览区只显示当前选中的单个 Demo
     - `全部显示`：预览区以宫格形式展示所有勾选的 Demo
   - **宫格布局设置**（仅在"全部显示"模式下可用）：
     - `每排个数`：设置每行显示的 Demo 数量（1-6 个）
     - `行高`：设置每个预览区块的高度（100px-800px）

### 4.4 多 Demo 预览 Panel 设计

每个 PreviewPanel 需要独立的状态：

```typescript
interface PreviewPanelState {
  demoId: string;
  demoName: string;
  code: string;
  schema: string;
  configData: Record<string, unknown>;
  previewSize: PreviewSize;
  validationResult: ValidationResult;
}
```

预览区支持：

- **网格布局**：2x2 或 3x3 网格展示多个 Demo
- **单个放大**：点击某个预览区放大查看
- **实时同步**：AI 修改后对应的预览区立即更新
- **配置隔离**：每个 Demo 有独立的配置表单

---

## 五、AI 对话增强

### 5.1 多 Demo 指令解析

增强 AI 指令解析能力，支持以下指令格式：

```
# 指定单个 Demo
"修改 Demo1 的标题颜色"

# 指定多个 Demo
"同时修改 Demo1 和 Demo2 的背景色"

# 全局修改
"给所有 Demo 添加一个footer组件"
```

### 5.2 指令解析服务

```typescript
// packages/web/src/lib/demo-instruction-parser.ts

interface ParsedInstruction {
  targetDemoIds: string[];  // 目标 Demo ID 列表
  action: string;           // 操作描述
  originalText: string;     // 原始指令
}

/**
 * 解析用户指令，提取目标 Demo
 */
export function parseDemoInstruction(
  instruction: string,
  availableDemos: DemoMeta[]
): ParsedInstruction;
```

### 5.3 多目标文件操作

AI 修改文件时，需要区分目标 Demo：

```typescript
// 工作空间中的文件路径
const demoFilePaths = {
  'demo1': 'temp/{sessionId}/demos/demo1/index.tsx',
  'demo2': 'temp/{sessionId}/demos/demo2/index.tsx',
};

// AI 工具调用时传递目标 Demo 信息
interface FileOperation {
  demoId: string;       // 目标 Demo
  path: string;         // 相对于 demoId 目录的路径
  operation: 'write' | 'read' | 'delete';
  content?: string;
}
```

### 5.4 预览状态更新

```typescript
interface AIChatProps {
  // ... 现有属性

  // 多 Demo 支持：支持多个 Demo 的状态更新
  multiDemoStates?: Record<string, DemoPreviewState>;
  onMultiDemoUpdate?: (demoId: string, updates: Partial<DemoPreviewState>) => void;
}
```

---

## 六、组件变更

### 6.1 现有组件分析

#### 6.1.1 项目编辑页

**文件路径**：[packages/web/src/app/projects/[id]/edit/page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/app/projects/[id]/edit/page.tsx)

**当前布局**：
- 两栏布局（AI 对话区 / 文件变更状态）
- 使用 `flex` 布局，左栏 `flex-1`，右栏 `w-80`
- 顶部导航栏包含返回按钮、项目信息、保存/放弃按钮

**需要重构**：
- 改为三栏布局（功能 Tab / 预览区 / 配置面板）
- 使用 `ResizablePanelGroup` 实现可拖拽调整宽度
- 新增"页面"Tab 支持多 Demo 管理

### 6.2 新增组件

| 组件 | 文件路径 | 说明 |
|:-----|:-----|:-----|
| `ProjectDetailPage` | `packages/web/src/components/project/project-detail-page.tsx` | 项目详情页 |
| `LeftPanelTabs` | `packages/web/src/components/editor/left-panel-tabs.tsx` | 左栏功能 Tab 容器（AI 对话/代码/页面） |
| `DemoDirectory` | `packages/web/src/components/demo/demo-directory.tsx` | Demo 目录树组件 |
| `PreviewDisplayControl` | `packages/web/src/components/demo/preview-display-control.tsx` | 预览显示控制面板 |
| `PreviewGrid` | `packages/web/src/components/demo/preview-grid.tsx` | 宫格预览布局组件 |
| `MultiPreviewPanel` | `packages/web/src/components/demo/multi-preview-panel.tsx` | 多 Demo 预览容器 |
| `ConfigForm` | `packages/web/src/components/config/config-form.tsx` | 配置表单（支持 demoId 隔离） |

### 6.3 修改组件

| 组件 | 文件路径 | 变更说明 |
|:-----|:-----|:---------|
| `ProjectEditPage` | `packages/web/src/app/projects/[id]/edit/page.tsx` | 重构为三栏布局，支持多 Demo |
| `AIChat` | `packages/web/src/components/ai-elements/ai-chat.tsx` | 支持多 Demo 状态管理 |
| `PreviewPanel` | `packages/web/src/components/demo/preview-panel.tsx` | 支持独立的 demoId 属性 |

### 6.4 组件接口变更

#### 6.4.1 AIChat 组件

**现有接口位置**：[packages/web/src/components/ai-elements/ai-chat.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/components/ai-elements/ai-chat.tsx)

```typescript
// 新增多 Demo 支持
interface AIChatProps {
  // ... 现有属性

  // 多 Demo 支持
  demoRegistry?: Record<string, {
    name: string;
    code: string;
    schema: string;
  }>;
  activeDemoIds?: string[];
  onDemoCodeUpdate?: (demoId: string, code: string) => void;
  onDemoSchemaUpdate?: (demoId: string, schema: string) => void;
}
```

#### 6.4.2 PreviewPanel 组件

**现有接口位置**：[packages/web/src/components/demo/preview-panel.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/components/demo/preview-panel.tsx)

```typescript
interface PreviewPanelProps {
  // ... 现有属性

  // 新增
  demoId?: string;
  demoName?: string;
}
```

#### 6.4.3 LeftPanelTabs 组件（新增）

```typescript
interface LeftPanelTabsProps {
  activeTab: 'ai' | 'code' | 'pages';
  onTabChange: (tab: 'ai' | 'code' | 'pages') => void;
}
```

#### 6.4.4 DemoDirectory 组件（新增）

```typescript
interface DemoDirectoryProps {
  demos: DemoMeta[];
  selectedDemoId: string;
  visibleDemoIds: string[];
  onSelectDemo: (demoId: string) => void;
  onToggleVisibility: (demoId: string) => void;
  onAddDemo: () => void;
}
```

#### 6.4.5 PreviewDisplayControl 组件（新增）

```typescript
interface PreviewDisplayControlProps {
  displayMode: 'single' | 'grid';
  gridColumns: number;
  gridRowHeight: number;
  onDisplayModeChange: (mode: 'single' | 'grid') => void;
  onGridColumnsChange: (columns: number) => void;
  onGridRowHeightChange: (height: number) => void;
}
```

#### 6.4.6 PreviewGrid 组件（新增）

```typescript
interface PreviewGridProps {
  demos: Array<{
    demoId: string;
    demoName: string;
    code: string;
    schema: string;
  }>;
  columns: number;
  rowHeight: number;
  selectedDemoId: string;
  onSelectDemo: (demoId: string) => void;
}
```

---

## 七、API 变更

### 7.1 现有 API（保持不变）

| 方法 | 路径 | 说明 |
|:-----|:-----|:-----|
| GET | `/api/demos` | ✅ 已实现 - 获取项目列表（实际返回 projects） |
| POST | `/api/demos` | ✅ 已实现 - 创建项目 |
| POST | `/api/projects/[id]/edit` | ✅ 已实现 - 打开项目编辑 |
| POST | `/api/sessions/[id]/save` | ✅ 已实现 - 保存项目变更 |
| POST | `/api/sessions/[id]/discard` | ✅ 已实现 - 放弃编辑 |
| GET | `/api/projects/[id]/versions` | ✅ 已实现 - 获取版本历史 |
| POST | `/api/projects/[id]/restore` | ✅ 已实现 - 恢复版本 |

### 7.2 新增 API

| 方法 | 路径 | 说明 |
|:-----|:-----|:-----|
| GET | `/api/projects/[id]/demos` | 获取项目下的 Demo 列表 |
| POST | `/api/projects/[id]/demos` | 在项目中创建 Demo |
| DELETE | `/api/projects/[id]/demos/[demoId]` | 删除项目下的 Demo |
| GET | `/api/projects/[id]/demos/[demoId]/files` | 获取指定 Demo 的文件 |
| PUT | `/api/projects/[id]/demos/[demoId]/files` | 更新指定 Demo 的文件 |

### 7.3 修改 API

| 方法 | 路径 | 变更说明 |
|:-----|:-----|:---------|
| POST | `/api/sessions` | 支持传入 `projectId` 和 `demoIds[]` |
| GET | `/api/sessions/[id]/files` | 支持 `demoId` 参数，返回对应 Demo 的文件 |
| PUT | `/api/sessions/[id]/files` | 支持 `demoId` 参数，更新指定 Demo 的文件 |

### 7.4 Session 创建请求变更

```typescript
// 现有
interface CreateSessionRequest {
  projectId: string;
}

// 变更后
interface CreateSessionRequest {
  projectId: string;
  demoIds: string[];  // 可同时编辑多个 Demo
}
```

---

## 八、实施计划

### 8.1 第一阶段：数据模型与目录结构（1-2 天）

1. 在 `packages/shared/src/types.ts` 中新增 `DemoMeta` 类型
2. 修改 `fs-utils.ts`，新增 Demo 相关文件系统操作函数：
   - `createDemo(projectId, name)`
   - `listDemos(projectId)`
   - `getDemoFiles(projectId, demoId)`
   - `updateDemoFiles(projectId, demoId, files)`
   - `deleteDemo(projectId, demoId)`
3. 实现旧项目迁移逻辑（`workspace/` → `demos/default/`）
4. 编写单元测试

### 8.2 第二阶段：API 路由（1-2 天）

1. 新增 `/api/projects/[id]/demos/route.ts`（GET/POST）
2. 新增 `/api/projects/[id]/demos/[demoId]/route.ts`（DELETE）
3. 新增 `/api/projects/[id]/demos/[demoId]/files/route.ts`（GET/PUT）
4. 修改 `/api/sessions/[id]/files/route.ts` 支持 `demoId` 参数
5. 编写 API 测试

### 8.3 第三阶段：路由与页面（2-3 天）

1. 创建 `/projects/[id]/page.tsx` 项目详情页
2. 创建 `/projects/[id]/demos/[demoId]/page.tsx` Demo 使用页
3. 创建 `/projects/[id]/demos/[demoId]/edit/page.tsx` Demo 编辑页
4. 添加旧路由重定向逻辑

### 8.4 第四阶段：多 Demo 编辑页重构（3-4 天）

1. 实现 `LeftPanelTabs` 组件（左栏功能 Tab）
2. 实现 `DemoDirectory` 组件（Demo 目录树）
3. 实现 `PreviewDisplayControl` 组件（预览显示控制）
4. 实现 `PreviewGrid` 组件（宫格预览布局）
5. 实现 `MultiPreviewPanel` 组件
6. 重构 `ProjectEditPage` 为三栏布局
7. 实现指令解析服务

### 8.5 第五阶段：AI 对话增强（2-3 天）

1. 重构 `AIChat` 组件支持多 Demo 状态管理
2. 实现多 Demo 配置表单隔离
3. 实现预览区网格布局与放大功能
4. 集成指令解析服务

### 8.6 第六阶段：测试与优化（2-3 天）

1. 单元测试
2. 集成测试
3. 性能优化
4. 文档更新

---

## 九、风险与挑战

| 风险 | 影响 | 缓解措施 |
|:-----|:-----|:---------|
| AI 指令解析准确性 | 高 | 提供明确的指令格式，支持模糊匹配 |
| 多 Demo 状态管理复杂度 | 中 | 使用 Context 统一管理，组件按需订阅 |
| 旧项目迁移数据丢失 | 高 | 迁移前自动备份，提供回滚机制 |
| 向后兼容路由 | 低 | 设置 301 重定向 |
| 文件路径变更 | 中 | 提供迁移脚本 |

---

## 十、附录

### 10.1 术语表

| 术语 | 说明 |
|:-----|:-----|
| Project | 项目，顶层容器，可包含多个 Demo |
| Demo | Demo 实例，包含代码和 Schema，属于某个 Project |
| Session | 编辑会话，支持多 Demo 同时编辑 |
| WorkingDir | 工作目录，Session 级别的临时工作空间 |
| Version | 项目版本，快照包含所有 Demo |

### 10.2 参考文档

- 现有页面模块需求文档：`docs/项目文档/Web前端/页面模块/页面模块_需求文档.md`
- 现有页面架构文档：`docs/项目文档/Web前端/页面模块/技术/01_页面架构与路由设计.md`
- 现有会话管理文档：`docs/项目文档/Web前端/会话管理/技术/01_架构设计.md`
- 现有 `workspace.ts` 类型定义：`packages/shared/src/workspace.ts`
- 现有 `agent-client` 实现：`packages/agent-client/src/`
