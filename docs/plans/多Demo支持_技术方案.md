# 页面模块多 Demo 支持 - 技术方案

> 版本：v1.0
> 创建日期：2026-04-18
> 状态：草案

---

## 一、背景与目标

### 1.1 当前架构

当前系统采用 **"一个项目 = 一个 Demo"** 的架构：

- **DemoMeta** 包含：`id`, `name`, `createdAt`, `updatedAt`, `thumbnail`
- **DemoFiles** 包含：`code`, `schema`
- 每个 Demo 拥有独立的工作空间和编辑会话

### 1.2 目标

支持 **"一个项目 = 多个 Demo"** 的架构：

- 一个项目（Project）可包含多个 Demo
- 项目编辑页面可同时预览多个 Demo
- AI 对话可同时编辑多个 Demo

---

## 二、数据模型设计

### 2.1 新增/修改的类型定义

```typescript
// packages/shared/src/types.ts

/**
 * 项目定义（顶层容器）
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Demo 元信息（属于某个 Project）
 */
export interface DemoMeta {
  id: string;
  projectId: string;        // 所属项目 ID
  name: string;
  order: number;            // 在项目中的排序
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
export interface EditSession {
  sessionId: string;
  projectId: string;        // 关联项目
  demoIds: string[];        // 同时编辑的多个 Demo ID
  tempWorkspace: string;    // 临时工作空间（项目级别）
  status: 'editing' | 'saved' | 'discarded';
  createdAt: number;
  expiresAt: number;
}
```

### 2.2 目录结构变更

```
现有结构（一个项目一个 Demo）：
projects/
└── {projectId}/
    ├── index.tsx           # Demo 代码
    └── config.schema.json  # Schema 配置

目标结构（一个项目多个 Demo）：
projects/
└── {projectId}/
    ├── project.json        # 项目元信息
    └── demos/
        ├── {demoId1}/
        │   ├── index.tsx
        │   └── config.schema.json
        ├── {demoId2}/
        │   ├── index.tsx
        │   └── config.schema.json
        └── ...
```

---

## 三、路由设计

### 3.1 新路由结构

| 路由 | 说明 | 对应组件 |
|:-----|:-----|:---------|
| `/projects` | 项目列表首页 | `projects/page.tsx` |
| `/projects/[projectId]` | 项目详情页（展示所有 Demo） | `projects/[projectId]/page.tsx` |
| `/projects/[projectId]/edit` | **项目编辑页**（多 Demo 同时编辑） | `projects/[projectId]/edit/page.tsx` |
| `/projects/[projectId]/demos/[demoId]` | 单个 Demo 使用页 | `projects/[projectId]/demos/[demoId]/page.tsx` |
| `/projects/[projectId]/demos/[demoId]/edit` | 单个 Demo 编辑页 | `projects/[projectId]/demos/[demoId]/edit/page.tsx` |

### 3.2 向后兼容

- 保留原有的 `/demo/[id]` 路由（重定向到新的 `/projects/[projectId]/demos/[demoId]`）
- 保留原有的 `/demo/[id]/edit` 路由（重定向到新的对应路由）

---

## 四、页面布局规范

### 4.1 项目编辑页布局（多 Demo 同时编辑）

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [返回]  项目名称                        [保存全部] [放弃全部]           │
├─────────────────────────────────────────┬───────────────────────────────┤
│                                         │                               │
│   AI 对话区                              │     多 Demo 预览区              │
│                                         │                               │
│   输入自然语言指令，                    │   ┌─────────┐  ┌─────────┐    │
│   可指定修改某个 Demo                   │   │ Demo 1  │  │ Demo 2  │    │
│                                         │   │ 预览    │  │ 预览    │    │
│   [输入框]                              │   └─────────┘  └─────────┘    │
│                                         │                               │
│   支持切换对话历史                      │   ┌─────────┐  ┌─────────┐    │
│                                         │   │ Demo 3  │  │ Demo 4  │    │
│                                         │   │ 预览    │  │ 预览    │    │
│                                         │   └─────────┘  └─────────┘    │
├─────────────────────────────────────────┴───────────────────────────────┤
│  [Demo 列表 Tab]  [代码编辑 Tab]  [Schema 编辑 Tab]                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Demo 列表：                                                            │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ ☑ Demo 1   ☑ Demo 2   ☐ Demo 3   ☐ Demo 4   [+ 添加 Demo]      │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   或                                                                   │
│                                                                          │
│   代码 / Schema 编辑区（当前选中的 Demo）                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 多 Demo 预览 Panel 设计

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

### 6.1 新增组件

| 组件 | 路径 | 说明 |
|:-----|:-----|:-----|
| `ProjectHomePage` | `components/project/project-home-page.tsx` | 项目列表首页 |
| `ProjectDetailPage` | `components/project/project-detail-page.tsx` | 项目详情页 |
| `MultiDemoEditPage` | `components/project/multi-demo-edit-page.tsx` | 多 Demo 编辑页 |
| `MultiPreviewPanel` | `components/demo/multi-preview-panel.tsx` | 多 Demo 预览容器 |
| `DemoTabList` | `components/demo/demo-tab-list.tsx` | Demo 列表选择组件 |
| `DemoSelector` | `components/demo/demo-selector.tsx` | Demo 选择器（用于 AI 指令） |

### 6.2 修改组件

| 组件 | 变更说明 |
|:-----|:---------|
| `HomePage` | 重构为 ProjectHomePage |
| `AIChat` | 支持多 Demo 状态管理 |
| `PreviewPanel` | 支持独立的 demoId 属性 |
| `ConfigForm` | 支持独立的 demoId 属性 |

### 6.3 组件接口变更

```typescript
// AIChat 组件新接口
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

// PreviewPanel 组件新接口
interface PreviewPanelProps {
  // ... 现有属性

  // 新增
  demoId?: string;
  demoName?: string;
}
```

---

## 七、API 变更

### 7.1 新增 API

| 方法 | 路径 | 说明 |
|:-----|:-----|:-----|
| GET | `/api/projects` | 获取项目列表 |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/[id]` | 获取项目详情 |
| DELETE | `/api/projects/[id]` | 删除项目 |
| GET | `/api/projects/[id]/demos` | 获取项目下的 Demo 列表 |
| POST | `/api/projects/[id]/demos` | 在项目中创建 Demo |
| DELETE | `/api/projects/[id]/demos/[demoId]` | 删除项目下的 Demo |

### 7.2 修改 API

| 方法 | 路径 | 变更说明 |
|:-----|:-----|:---------|
| POST | `/api/sessions` | 支持传入 `projectId` 和 `demoIds[]` |
| GET | `/api/sessions/[id]/files` | 支持 `demoId` 参数，返回对应 Demo 的文件 |
| PUT | `/api/sessions/[id]/files` | 支持 `demoId` 参数，更新指定 Demo 的文件 |

### 7.3 Session 创建请求变更

```typescript
// 现有
interface CreateSessionRequest {
  demoId: string;
}

// 变更后
interface CreateSessionRequest {
  projectId: string;
  demoIds: string[];  // 可同时编辑多个 Demo
}
```

---

## 八、实施计划

### 8.1 第一阶段：数据模型与 API

1. 新增 `Project` 类型定义
2. 修改 `DemoMeta` 添加 `projectId` 字段
3. 创建项目相关的 API 路由
4. 实现项目与 Demo 的关联关系

### 8.2 第二阶段：页面路由

1. 创建 `/projects` 相关路由
2. 实现项目首页列表
3. 实现项目详情页
4. 设置路由重定向（兼容旧路由）

### 8.3 第三阶段：多 Demo 编辑页

1. 实现 `MultiPreviewPanel` 组件
2. 重构 `AIChat` 支持多 Demo
3. 实现 `DemoTabList` 和 `DemoSelector` 组件
4. 实现指令解析服务

### 8.4 第四阶段：预览与配置

1. 重构 `PreviewPanel` 支持独立状态
2. 实现多 Demo 配置表单隔离
3. 实现预览区网格布局与放大功能

### 8.5 第五阶段：测试与优化

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
| 向后兼容路由 | 低 | 设置 301 重定向 |
| 文件路径变更 | 中 | 提供迁移脚本 |

---

## 十、附录

### 10.1 术语表

| 术语 | 说明 |
|:-----|:-----|
| Project | 项目，顶层容器，可包含多个 Demo |
| Demo | Demo 实例，包含代码和 Schema |
| Session | 编辑会话，支持多 Demo 同时编辑 |
| WorkingDir | 工作目录，Session 级别的临时工作空间 |

### 10.2 参考文档

- 现有页面模块需求文档：`页面模块_需求文档.md`
- 现有 `workspace.ts` 类型定义
- 现有 `agent-client` 实现
