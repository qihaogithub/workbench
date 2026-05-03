# 项目多 Demo 页面支持方案

> 版本：v5.0
> 创建日期：2026-05-03
> 更新日期：2026-05-03（v5.0：修复 Session/预览/类型等关键适配缺失，补充迁移与安全细节）
> 状态：方案设计中，现阶段仅规划不实施

---

## 一、背景与目标

### 1.1 现状问题

当前系统采用"**一个项目 = 一个 Demo 页面**"的刚性架构：

- 项目工作空间内仅包含 `index.tsx`（组件代码）和 `config.schema.json`（配置定义）两个文件
- Session 的 `demoId` 直接等于 `projectId`，无多页面概念
- AI 代理指令硬编码「只能操作 index.tsx 和 config.schema.json」
- 编辑页左侧仅「AI 对话」和「代码编辑」两个 Tab

### 1.2 目标

支持在一个项目中创建、编辑、管理**多个独立的 Demo 页面**。每个 Demo 页面拥有自己的组件代码和配置定义，共享项目的版本管理和工作空间隔离机制。

AI 编辑体验的核心要求：
- **AI 可同时编辑多个页面**：无需切换 Demo，AI 天然拥有整个工作空间的读写权限
- **用户通过自然语言指定页面**：如"帮我修改首页的标题"、"给详情页增加一个配置项"
- **AI 可管理页面**：用户可通过自然语言让 AI 创建、删除、重命名页面
- **跨页面共享配置**：支持项目级配置定义，一个配置值（如Logo图片、品牌色）可被所有页面共用，无需重复定义

### 1.3 核心设计理念

```
"一个项目 = 多个页面 + 共享配置，AI 全域编辑，自然语言驱动，版本以项目为单位"
```

---

## 二、架构设计

### 2.1 关系模型

采用 **Demo 作为 Project 的子资源** 模型：

| 维度 | 设计决策 |
|:-----|:---------|
| Demo 与 Project 的关系 | Demo 属于 Project，不可独立存在 |
| 工作空间粒度 | 一个 Session = 一个临时空间，内含所有 Demo 的副本 |
| 版本粒度 | 以 Project 为单位（保存一次 = 所有 Demo 的集体快照） |
| 代码独立性 | 每个 Demo 的代码和配置独立存放于自己的子目录 |
| **AI 编辑模式** | **全域编辑**：AI 拥有整个工作空间的读写权限，同时操作多个页面 |
| **页面路由** | 用户通过**自然语言**告诉 AI 操作哪个页面，无需手动切换 Demo |

**与旧架构的核心区别：**

| 旧架构 | 新架构 |
|:-------|:-------|
| AI 仅在 `demos/{activeDemoId}/` 范围内操作 | AI 在整个工作空间全域操作 |
| 用户先手动切换 Demo，再让 AI 编辑 | 用户直接用自然语言指定要操作哪个页面 |
| 页面管理（增删改名称）仅通过 UI | 页面管理可通过 UI + AI 自然语言双通道 |
| 编辑页有「Demo 列表」栏 + 「代码编辑」底部栏 | 编辑页左侧统一为 3 个 Tab（AI对话 / 代码编辑 / 页面） |

### 2.2 目录结构变更

#### 现有结构

```
projects/{projectId}/
├── project.json
└── workspace/
    ├── index.tsx            ← 单一 Demo 组件
    └── config.schema.json   ← 单一 Demo 配置
```

#### 新结构

```
projects/{projectId}/
├── project.json             ← 含 demoPages 列表
└── workspace/
    ├── project.config.schema.json   ← 【新增】项目级共享配置定义（可选）
    ├── project.config.data.json     ← 【新增】项目级配置值（用户填写）
    └── demos/               ← 所有 Demo 页面的根目录
        ├── {demoId1}/
        │   ├── index.tsx
        │   ├── config.schema.json   ← 页面级配置定义
        │   └── config.data.json     ← 【新增】页面级配置值（用户填写）
        ├── {demoId2}/
        │   ├── index.tsx
        │   ├── config.schema.json
        │   └── config.data.json
        └── .../
```

#### 项目级配置 vs 页面级配置

| 层级 | 文件 | 作用范围 |
|:-----|:-----|:---------|
| **项目级** | `workspace/project.config.schema.json` | 所有页面共享的配置（如Logo、品牌色、联系方式） |
| **页面级** | `workspace/demos/{demoId}/config.schema.json` | 仅当前页面使用的配置（如标题、内容、布局） |

配置值由配置面板（使用/预览页面）统一管理。运行时系统将项目配置和页面配置**合并**后作为组件 Props 传入，如有字段名冲突，页面级配置优先。

**典型场景：**
```
用户上传一张 Logo 图片 → 存入项目级配置
首页组件 Props 中包含 logo
详情页组件 Props 中也包含 logo
用户只需上传一次，所有页面自动可用
```

**采用子目录而非平铺文件命名的原因：**
1. 每个 Demo 可自由扩展（未来可能需要图片、样式等附加资源）
2. 目录结构语义清晰，Agent 友好（读取目录 = 列出所有 Demo）
3. 项目级配置与页面级配置层级分明，职责边界清晰

### 2.3 数据模型变更

#### 更新类型：DemoFiles（破坏性变更）

当前 `DemoFiles` 仅支持单页面文件对，需升级为多页面结构：

```typescript
/**
 * 旧类型（废弃）：单页面文件对
 * 现有代码中广泛使用，需逐步迁移
 */
interface DemoFiles {
  code: string
  schema: string
}

/**
 * 新类型：多页面文件集合
 * 替代 DemoFiles，支持多 Demo + 项目配置
 */
interface MultiDemoFiles {
  demos: Record<string, DemoFiles>   // demoId -> { code, schema }
  projectConfigSchema?: string       // project.config.schema.json 内容
  projectConfigData?: Record<string, unknown>   // 项目配置值
  demoConfigData?: Record<string, Record<string, unknown>>  // demoId -> 页面配置值
}
```

**迁移策略**：`DemoFiles` 保留但标记为 `@deprecated`，新增 `MultiDemoFiles`。所有 Session/Workspace 相关函数逐步切换到新类型，旧 API 端点增加兼容层（详见第六章 API 兼容策略）。

#### 新增类型：DemoPageMeta

```typescript
/**
 * Demo 页面元数据
 */
interface DemoPageMeta {
  id: string            // 唯一标识，格式 "demo_{timestamp}"，同时作为目录名
  name: string          // 显示名称，如 "首页"、"详情页"
  createdAt: number     // 创建时间戳
  updatedAt: number     // 最后更新时间戳
}
```

> **设计决策**：移除原方案中的 `path` 字段。路径可由 `id` 推导（`demos/{id}/`），冗余字段增加数据不一致风险。统一使用工具函数 `getDemoDirPath(demoId: string)` 生成路径。

#### 更新类型：Project

```typescript
interface Project {
  id: string
  name: string
  description?: string
  workspacePath: string
  demoPages: DemoPageMeta[]          // 【新增】Demo 页面列表
  hasProjectConfig: boolean          // 【新增】是否存在项目级共享配置
  migratedToMultiDemo?: boolean      // 【新增】是否已从旧结构迁移
  versions: VersionInfo[]
  createdAt: number
  updatedAt: number
  lockedDependencies?: Record<string, string>
  thumbnail?: string
}
```

#### 新增类型：DemoPageDetail

```typescript
/**
 * Demo 页面完整数据（含代码和页面级配置内容）
 */
interface DemoPageDetail {
  meta: DemoPageMeta
  code: string          // index.tsx 内容
  schema: string        // config.schema.json 内容
  configData?: Record<string, unknown>  // config.data.json 内容（用户填写的配置值）
}

/**
 * 创建 Demo 页面请求
 */
interface CreateDemoPageRequest {
  name: string
}

/**
 * 更新 Demo 代码/配置请求
 */
interface UpdateDemoPageRequest {
  code?: string
  schema?: string
  name?: string
  configData?: Record<string, unknown>
}
```

#### 新增类型：ProjectConfig

```typescript
/**
 * 项目级共享配置
 */
interface ProjectConfig {
  schema: string                          // project.config.schema.json 内容
  data?: Record<string, unknown>          // project.config.data.json 内容
  exists: boolean                         // 是否存在项目级配置
}

/**
 * 创建/更新项目配置请求
 */
interface UpdateProjectConfigRequest {
  schema: string
}
```

#### 新增类型：合并配置视图（运行时使用）

```typescript
/**
 * 运行时传递给页面组件的 Props 来源
 * 由项目配置 + 页面配置合并而成
 */
interface MergedComponentProps {
  // 合并规则：
  // 1. 取 project.config.schema.json 定义的所有字段
  // 2. 取 demos/{pageId}/config.schema.json 定义的所有字段
  // 3. 如有同名字段，页面级覆盖项目级
  // 4. 配置面板展示合并后的所有字段供用户填写
  [key: string]: unknown
}
```

#### 新增类型：合并配置工具函数签名

```typescript
/**
 * 合并项目配置值和页面配置值，返回组件 Props
 * 这是运行时配置合并的核心逻辑
 */
function mergeConfigToProps(
  projectConfigData: Record<string, unknown> | undefined,
  pageConfigData: Record<string, unknown> | undefined,
  projectSchema: string | undefined,
  pageSchema: string
): Record<string, unknown> {
  // 1. 从 projectSchema 提取默认值
  // 2. 从 pageSchema 提取默认值
  // 3. 用 projectConfigData 覆盖项目配置默认值
  // 4. 用 pageConfigData 覆盖页面配置默认值
  // 5. 合并：项目配置 + 页面配置（页面级优先）
  // 6. 返回合并后的 Props 对象
}
```

### 2.4 共享配置的合并机制

页面组件在渲染时接收的 Props 来自两个配置源的合并：

```
┌─────────────────────────────────────────────┐
│              project.config.schema.json      │
│  { logo: string, brandColor: string }       │
│                                              │
│                      +                       │
│                                              │
│         demos/home/config.schema.json        │
│  { title: string, subtitle: string }        │
│                                              │
│                      =                       │
│                                              │
│         传入 home/index.tsx 的 Props          │
│  { logo, brandColor, title, subtitle }      │
└─────────────────────────────────────────────┘
```

**冲突处理规则：**
- 同名配置项：**页面级优先**（页面配置覆盖项目配置）
- AI 在设计配置时需避免非必要的字段名冲突
- 配置面板以视觉分组区分来源（项目级 / 页面级）

**组件代码规范：**
```tsx
// demos/home/index.tsx — 可以同时使用项目配置和页面配置的字段
interface HomeProps {
  // 来自 project.config.schema.json
  logo: string
  brandColor: string
  // 来自 demos/home/config.schema.json
  title: string
  subtitle: string
}

export default function Home({ logo, brandColor, title, subtitle }: HomeProps) {
  return (
    <div style={{ backgroundColor: brandColor }}>
      <img src={logo} alt="Logo" />
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  )
}
```

### 2.5 配置值（config.data.json）生命周期

Schema 定义与配置值数据分离存储，各自有独立的生命周期：

| 生命周期事件 | Schema（config.schema.json） | 配置值（config.data.json） |
|:------------|:---------------------------|:------------------------|
| **创建时机** | AI 创建页面/项目配置时 | 用户首次在配置面板填写值时 |
| **修改时机** | AI 编辑组件/配置结构时 | 用户在配置面板修改值时 |
| **持久化时机** | 随 Session 保存合并到正式 workspace | 随 Session 保存合并到正式 workspace |
| **版本管理** | 参与版本快照，恢复时一起恢复 | 参与版本快照，恢复时一起恢复 |
| **Session 复制** | 复制到临时 workspace | 复制到临时 workspace |
| **默认值来源** | Schema 中的 `default` 字段 | 无 data.json 时从 Schema default 推导 |

**关键行为：**
- 配置值在用户填写后**立即持久化**到 Session 临时空间的 `config.data.json`，而非仅在保存时
- `config.data.json` 不存在时，系统使用 `getDefaultValues(schema)` 从 Schema 推导默认值（与当前行为兼容）
- 保存 Session 时，`config.data.json` 随其他文件一起合并到正式 workspace
- 版本恢复时，`config.data.json` 随快照一起恢复

---

### 2.6 架构评估

#### 备选方案对比

| 方案 | 描述 | 主要问题 |
|:-----|:-----|:---------|
| **当前方案（分离 Schema + 运行时合并）** | 项目配置和页面配置分离，运行时 Props 合并 | 需要 AI 手动同步所有页面组件 |
| 方案B：平铺 + 前缀约定 | 所有配置平铺在页面 Schema，约定 `project_` 前缀为共享项 | 项目配置变更时需手动同步每个页面；AI 难以记忆哪些字段是共享的 |
| 方案C：继承/组合 Schema | 页面 Schema 通过 `$ref` 引用项目 Schema | JSON Schema 跨文件 `$ref` 支持有限；实现复杂度高 |
| 方案D：运行时 HOC 包装器 | 页面组件外层包裹接收项目配置的 HOC | 架构复杂度高；与"单文件组件"约束冲突；AI 需要理解额外抽象层 |

#### 为什么当前方案是最优的

1. **概念简洁**：Schema 分离是直观的——共享的东西放一起，私有的东西放自己目录
2. **Agent 友好**：agent.md 约束清晰，AI 能理解"项目配置变更时必须同步所有页面"
3. **实现成本低**：不需要扩展 JSON Schema 规范、不需要运行时动态注入
4. **单文件组件约束兼容**：页面组件直接接收合并后的 Props，不需要额外的抽象层

#### AI 约束强化（防止遗漏同步）

当前方案的主要风险是 AI 新增/删除项目配置字段后，**遗漏部分页面组件的更新**。

**约束强化措施：**

```
## 项目级配置管理 - 关键约束

### 新增项目配置字段时
1. 创建或编辑 project.config.schema.json
2. **必须同时更新所有现有页面的 index.tsx Props 接口**
3. **必须同时更新所有现有页面的 index.tsx 渲染逻辑**
4. **必须同时更新所有现有页面的 config.schema.json（保持与 Props 一致）**
5. **禁止遗漏任何页面**
6. 调用 API `POST /api/projects/{id}/demo-pages/sync-config` 更新 hasProjectConfig 标记

### 新增页面时
1. 创建目录和默认文件
2. **必须自动包含当前所有项目配置字段到 Props 接口**
3. **必须在渲染逻辑中使用这些项目配置字段**
4. **必须包含在 config.schema.json 中**（即使为空 schema 也要有基础结构）
```

> **安全机制**：AI 不直接修改 `project.json`，而是通过专用 API 端点（`POST /api/projects/{id}/demo-pages/sync-config`）由后端安全更新 `hasProjectConfig` 和 `demoPages` 字段。详见第五章 AI 代理安全防护。

#### 单文件组件约束的重要性

每个页面的 `index.tsx` 必须是**完全自包含的单文件组件**：
- 不使用 `import './xxx'` 形式的相对路径导入
- 所有样式用 Tailwind CSS（内联或 className）
- 所有依赖通过顶层 import 引入

这个约束对于"运行时合并 Props"方案至关重要：如果页面组件引入了外部资源文件，跨页面的配置共享就变得复杂（需要管理共享资源的路径）。保持单文件约束，配置共享就仅仅是 Props 的合并。

---

## 三、核心流程设计

### 3.1 Project 与 Demo 的创建流程

```
用户新建项目
      │
      ▼
创建项目目录和 project.json
  → demoPages 初始为空
  → hasProjectConfig: false
  → migratedToMultiDemo: true
      │
      ▼
创建 demos/demo_{timestamp}/ 目录，生成默认 index.tsx + config.schema.json
      │
      ▼
project.json 中记录: demoPages: [{ id: "demo_{timestamp}", name: "默认页面", ... }]
      │
      ▼
用户进入编辑页，可通过 AI 自然语言或「页面」Tab 新建更多页面
也可通过 AI 自然语言创建项目级共享配置
```

> **设计决策**：默认页面 ID 统一使用 `demo_{timestamp}` 格式，与后续新建页面格式一致。不使用 "default" 作为 ID，避免两种 ID 风格共存。

### 3.2 Session 工作流程（AI 全域编辑模式）

```
用户打开项目编辑
      │
      ▼
创建 Session + Workspace
  复制整个 workspace/ 含：
  - demos/ 子目录（所有页面的代码和配置）
  - project.config.schema.json（项目配置定义，如存在）
  - project.config.data.json（项目配置值，如存在）
  - 各页面的 config.data.json（页面配置值，如存在）
      │
      ▼
AI 代理获得整个工作空间的读写权限
      │
      ▼
用户通过自然语言告诉 AI 操作哪个页面或项目配置：
  "帮我修改首页的标题为'欢迎'"
  "给项目增加一个Logo配置，所有页面都要展示"
  "新建一个'关于我们'页面"
      │
      ▼
AI 自主定位目标目录并操作文件（页面目录或项目配置）
如果是页面管理指令（新建/删除/重命名），AI 通过专用 API 同步 demoPages 元数据
如果操作项目配置，AI 编辑 project.config.schema.json 并通过 API 更新 hasProjectConfig
      │
      ▼
文件变更追踪器自动检测所有文件变化
右侧面板实时显示所有变更文件列表（按页面分组 + 项目配置独立分组）
      │
      ▼
用户保存 → 所有 Demo + 项目配置 + 配置值作为集体快照保存为统一版本
```

**关键设计理念：**

AI 不再需要 `activeDemoId` 参数。AI 拥有整个项目工作空间的完整上下文：
- 每次对话开始时，系统将当前所有页面的信息（名称、路径、关键摘要）注入到 AI 上下文中
- 用户通过自然语言中的页面名称或描述来指定目标
- AI 根据用户指令自行判断需要操作哪个（哪些）页面的哪些文件

### 3.3 Session 文件读写适配

当前 `getSessionFiles()` / `updateSessionFiles()` 仅支持单页面文件对，需全面升级：

#### 当前实现（需替换）

```typescript
// fs-utils.ts 当前实现 — 仅读写根目录的两个文件
export function getSessionFiles(sessionId: string): DemoFiles | null {
  const sessionPath = getSessionPath(sessionId);
  const codePath = path.join(sessionPath, "index.tsx");
  const schemaPath = path.join(sessionPath, "config.schema.json");
  // ...
}
```

#### 新实现

```typescript
/**
 * 获取 Session 中所有 Demo 页面的文件
 * 替代原 getSessionFiles，支持多页面 + 项目配置
 */
export function getSessionMultiDemoFiles(sessionId: string): MultiDemoFiles | null {
  const sessionPath = getSessionPath(sessionId);
  if (!sessionPath || !fs.existsSync(sessionPath)) return null;

  const demosDir = path.join(sessionPath, "demos");
  const demos: Record<string, DemoFiles> = {};

  // 遍历 demos/ 下所有子目录
  if (fs.existsSync(demosDir)) {
    const entries = fs.readdirSync(demosDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const demoDir = path.join(demosDir, entry.name);
      const codePath = path.join(demoDir, "index.tsx");
      const schemaPath = path.join(demoDir, "config.schema.json");
      if (fs.existsSync(codePath) && fs.existsSync(schemaPath)) {
        demos[entry.name] = {
          code: fs.readFileSync(codePath, "utf-8"),
          schema: fs.readFileSync(schemaPath, "utf-8"),
        };
      }
    }
  }

  // 读取项目配置
  const projectConfigPath = path.join(sessionPath, "project.config.schema.json");
  const projectConfigSchema = fs.existsSync(projectConfigPath)
    ? fs.readFileSync(projectConfigPath, "utf-8")
    : undefined;

  // 读取配置值
  const projectConfigDataPath = path.join(sessionPath, "project.config.data.json");
  const projectConfigData = fs.existsSync(projectConfigDataPath)
    ? JSON.parse(fs.readFileSync(projectConfigDataPath, "utf-8"))
    : undefined;

  const demoConfigData: Record<string, Record<string, unknown>> = {};
  if (fs.existsSync(demosDir)) {
    const entries = fs.readdirSync(demosDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dataPath = path.join(demosDir, entry.name, "config.data.json");
      if (fs.existsSync(dataPath)) {
        demoConfigData[entry.name] = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      }
    }
  }

  return { demos, projectConfigSchema, projectConfigData, demoConfigData };
}

/**
 * 更新 Session 中指定 Demo 页面的文件
 */
export function updateSessionDemoFiles(
  sessionId: string,
  demoId: string,
  files: DemoFiles
): boolean {
  const sessionPath = getSessionPath(sessionId);
  if (!sessionPath) return false;

  const demoDir = path.join(sessionPath, "demos", demoId);
  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }

  fs.writeFileSync(path.join(demoDir, "index.tsx"), files.code, "utf-8");
  fs.writeFileSync(path.join(demoDir, "config.schema.json"), files.schema, "utf-8");
  return true;
}

/**
 * 获取 Session 中单个 Demo 页面的文件（用于代码编辑 Tab 切换）
 */
export function getSessionDemoPageFiles(
  sessionId: string,
  demoId: string
): DemoFiles | null {
  const sessionPath = getSessionPath(sessionId);
  if (!sessionPath) return null;

  const demoDir = path.join(sessionPath, "demos", demoId);
  const codePath = path.join(demoDir, "index.tsx");
  const schemaPath = path.join(demoDir, "config.schema.json");

  if (!fs.existsSync(codePath) || !fs.existsSync(schemaPath)) return null;

  return {
    code: fs.readFileSync(codePath, "utf-8"),
    schema: fs.readFileSync(schemaPath, "utf-8"),
  };
}
```

#### Workspace 文件读写同步升级

`workspace-manager.ts` 中的 `getWorkspaceFiles()` / `updateWorkspaceFiles()` 同样需要从单文件对升级为多页面结构，逻辑与 Session 适配一致。

### 3.4 保存流程

```
用户点击保存
      │
      ▼
备份整个 workspace/（含 demos/ 下所有子目录 + config.data.json）→ snapshot/{versionId}/
      │
      ▼
临时空间覆盖正式 workspace/
      │
      ▼
清理系统文件（.opencode、.session.json、.workspace.json）
      │
      ▼
后端重新扫描 demos/ 目录，同步更新 project.json 中的 demoPages 列表
（不依赖 AI 或前端传入的 demoPages，以实际文件为准）
      │
      ▼
更新 project.json 中的 hasProjectConfig 标记（检测 project.config.schema.json 是否存在）
      │
      ▼
记录版本信息，清理旧版本
      │
      ▼
删除临时空间，标记会话已保存
```

> **关键改进**：保存时由后端重新扫描 `demos/` 目录来同步 `demoPages`，而非依赖前端传入。这避免了 AI 直接修改 `project.json` 导致的数据不一致风险。

### 3.5 版本恢复流程

```
用户选择恢复版本 v{N}
      │
      ▼
备份当前 workspace → 创建新版本 v{N+1}（备注："从 v{N} 恢复"）
      │
      ▼
从 snapshot/{projectId}/v{N}/ 恢复整个 workspace（含所有 Demo）
      │
      ▼
检测恢复的 workspace 结构：
  如果是旧结构（无 demos/ 目录）→ 执行自动迁移（见阶段五）
      │
      ▼
后端重新扫描 demos/ 目录，同步 project.json 的 demoPages 列表
      │
      ▼
返回新版本号 v{N+1}
```

版本恢复时，所有 Demo 一起恢复到目标版本状态，保证完整性。

> **关键改进**：恢复旧版本快照后，需检测是否为旧结构并自动迁移。迁移后重新扫描 `demos/` 目录确保 `demoPages` 与实际文件一致。

---

## 四、编辑器 UI 设计

### 4.1 编辑页新布局

编辑页左侧区域改为 **3 个 Tab** 切换：「AI 对话」「代码编辑」「页面」。

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [返回]  项目名称 (3个页面)         基于 v1  用户名      [保存] [放弃]  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────┐  ┌──────────────────────────┐  │
│  │  左栏（Tabs）                        │  │  右栏：实时预览区         │  │
│  │                                     │  │                          │  │
│  │  ┌────────┬────────┬──────┐        │  │  ┌──────────────────┐   │  │
│  │  │AI 对话 │代码编辑│ 页面 │        │  │  │                  │   │  │
│  │  └────────┴────────┴──────┘        │  │  │   当前预览页面    │   │  │
│  │  ┌──────────────────────────┐     │  │  │   (用户可选择)   │   │  │
│  │  │                          │     │  │  │                  │   │  │
│  │  │   Tab 内容区域           │     │  │  │                  │   │  │
│  │  │   (根据选中Tab切换)     │     │  │  └──────────────────┘   │  │
│  │  │                          │     │  │                          │  │
│  │  │                          │     │  │  文件变更列表            │  │
│  │  │                          │     │  │  (按页面分组)            │  │
│  │  │                          │     │  │  ┌─ 首页 ──────────┐   │  │
│  │  │                          │     │  │  │ index.tsx  ✏️   │   │  │
│  │  │                          │     │  │  │ schema.json ✏️  │   │  │
│  │  │                          │     │  │  └─────────────────┘   │  │
│  │  │                          │     │  │  ┌─ 详情页 ────────┐   │  │
│  │  │                          │     │  │  │ index.tsx  ✏️   │   │  │
│  │  │                          │     │  │  └─────────────────┘   │  │
│  │  │                          │     │  │                          │  │
│  │  │                          │     │  │  备注：______________   │  │
│  │  └──────────────────────────┘     │  └──────────────────────────┘  │
│  └─────────────────────────────────────┘                               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 三个 Tab 的职责

#### Tab 1：AI 对话（默认选中）

与当前 AI 对话区功能一致，但**不再需要切换 Demo**：

- 用户可以自由发起对话，AI 理解整个项目的所有页面
- 对话中可通过自然语言指定要操作的页面
- AI 回复中引用具体文件的路径（如 `demos/home/index.tsx`）
- 「新对话」按钮创建新的对话会话（AI 对话会话，非编辑会话）

```
┌─ AI 对话 Tab ────────────────────────────────────────────────────────┐
│                                                                       │
│  🤖 你好！当前项目包含以下页面：                                      │
│     📄 首页 (home)                                                    │
│     📄 详情页 (detail)                                                │
│     📄 关于我们 (about)                                               │
│     项目级配置：未设置                                                │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────   │
│                                                                       │
│  👤 用户：帮我把首页的标题改成"欢迎来到我的网站"                      │
│                                                                       │
│  🤖 AI：好的，已修改 demos/home/index.tsx 中的标题。                 │
│     同时更新了 demos/home/config.schema.json 中对应默认值。           │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────   │
│                                                                       │
│  👤 用户：我需要一个Logo图片在所有页面展示，给我增加项目配置          │
│                                                                       │
│  🤖 AI：已创建 project.config.schema.json，定义了 logo 字段。        │
│     我也更新了所有页面组件，让它们接收并展示 logo Props。             │
│     上传Logo后，所有页面都会自动显示。                                │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────   │
│                                                                       │
│  👤 用户：再帮我新建一个"联系我们"页面                                │
│                                                                       │
│  🤖 AI：已创建 demos/contact/ 目录，包含默认的 index.tsx              │
│     和 config.schema.json。该页面也已包含 logo Props。                │
│     你可以在「页面」Tab 中查看。                                      │
│                                                                       │
│  ─────────────────────────────────────────────────────────────────   │
│                                                                       │
│  ┌──────────────────────────────────────────────────┐                │
│  │  输入你想修改的内容...                      [发送] │                │
│  └──────────────────────────────────────────────────┘                │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

#### Tab 2：代码编辑

与当前代码编辑功能一致，但增加**页面选择器**来切换编辑目标：

- 顶部下拉框或标签选择当前正在查看/编辑的页面
- 下方展示 `index.tsx`（代码编辑器）和 `config.schema.json`（Schema 编辑器）的 Tab 切换
- 代码编辑是**手动辅助**手段，主要编辑方式仍是 AI 对话

```
┌─ 代码编辑 Tab ──────────────────────────────────────────────────────┐
│                                                                       │
│  当前编辑页面：[ 首页 ▾ ]                                            │
│                                                                       │
│  ┌─ 子Tab ──────────────────────────────────────────────────────┐   │
│  │ [index.tsx]  [config.schema.json]               当前文件路径   │   │
│  ├───────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  import React from 'react';                                   │   │
│  │                                                               │   │
│  │  interface HomeProps {                                        │   │
│  │    title: string;                                             │   │
│  │  }                                                            │   │
│  │  ...                                                          │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

#### Tab 3：页面（新增）

展示项目所有页面的管理界面，支持增删改名称操作。

```
┌─ 页面 Tab ──────────────────────────────────────────────────────────┐
│                                                                       │
│  [+ 新建页面]                                                        │
│                                                                       │
│  ┌─ 📋 项目配置 ───────────────────────────────────────────────┐    │
│  │  状态：✅ 已设置（logo, brandColor）            [编辑配置]   │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌─ 📄 页面列表 ───────────────────────────────────────────────┐    │
│  │ # │ 页面名称          │ 文件数 │ 最后修改       │ 操作       │   │
│  ├───┼──────────────────┼───────┼───────────────┼────────────┤   │
│  │ 1 │ 🖊 首页           │   2   │ 刚刚           │ 👁 ✏️ 🗑  │   │
│  │ 2 │ 🖊 详情页         │   2   │ 2分钟前        │ 👁 ✏️ 🗑  │   │
│  │ 3 │ 🖊 关于我们       │   2   │ 未修改         │ 👁 ✏️ 🗑  │   │
│  └────┴──────────────────┴───────┴───────────────┴────────────┘   │
│                                                                       │
│  💡 提示：你也可以通过 AI 对话直接管理页面和项目配置                  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.3 页面管理操作详解

页面管理支持**双通道操作**：UI 手动操作 + AI 自然语言操作，两者效果等效。

#### 通道一：UI 手动操作（Tab 3 页面）

| 操作 | 触发方式 | 行为 |
|:-----|:---------|:-----|
| **新建页面** | 点击「+ 新建页面」按钮 | 弹出输入框填写页面名称 → 调用 `POST /api/projects/{id}/demos` 创建 → 刷新表格 |
| **删除页面** | 点击行末 🗑 按钮 | 二次确认弹窗（显示页面名称）→ 调用 `DELETE /api/projects/{id}/demos/{demoId}` → 刷新表格 |
| **修改名称** | 点击行末 ✏️ 按钮 | 行内名称变为可编辑输入框 → 确认后调用 `PUT /api/projects/{id}/demos/{demoId}` 更新 name |
| **预览页面** | 点击行末 👁 按钮 | 将该页面设为右侧预览区的当前预览页面 |

#### 通道二：AI 自然语言操作（Tab 1 AI 对话）

| 自然语言示例 | AI 行为 |
|:------------|:--------|
| "新建一个叫'产品中心'的页面" | 调用 `POST /api/projects/{id}/demos` 创建页面，后端自动更新 demoPages |
| "把首页的名字改成'主页'" | 调用 `PUT /api/projects/{id}/demos/{demoId}` 更新 name |
| "删除'测试页'这个页面" | 二次确认后调用 `DELETE /api/projects/{id}/demos/{demoId}` |
| "帮我看看现在有哪些页面" | 读取 project.json 或调用 API 列出所有页面 |
| **"给项目增加一个Logo配置"** | 编辑 project.config.schema.json；更新所有页面组件以接收 logo Props；调用 sync-config API |
| **"项目配置里再加个品牌色"** | 编辑 project.config.schema.json；更新所有页面组件 |
| **"删除项目配置中的联系方式"** | 编辑 project.config.schema.json；更新所有页面组件 |

> **重要**：AI 执行页面创建/删除/重命名操作时，通过**专用 API 端点**（而非直接修改 project.json）同步 `demoPages` 元数据。AI 创建/删除项目配置时，通过 `sync-config` API 更新 `hasProjectConfig` 标记。这些写入操作属于编辑会话内操作，会在用户保存时一并合并到正式项目。

### 4.4 右侧面板

```
┌─ 右栏 ────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌─ 预览区 ───────────────────────────────────────────────────┐   │
│  │  预览页面：[ 首页 ▾ ]                      [↗ 新窗口打开] │   │
│  │                                                            │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │                                                    │   │   │
│  │  │            实时渲染组件预览                         │   │   │
│  │  │                                                    │   │   │
│  │  │            (iframe 沙箱环境)                        │   │   │
│  │  │                                                    │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ 文件变更 ─────────────────────────────────────────────────┐   │
│  │  共 5 个文件变更                                             │   │
│  │                                                              │   │
│  │  📋 项目配置                                                 │   │
│  │     ✨  project.config.schema.json  （新增）                 │   │
│  │                                                              │   │
│  │  📄 首页 (home)                                             │   │
│  │     ✏️  demos/home/index.tsx                                │   │
│  │     ✏️  demos/home/config.schema.json                       │   │
│  │                                                              │   │
│  │  📄 详情页 (detail)                                         │   │
│  │     ✏️  demos/detail/index.tsx                              │   │
│  │                                                              │   │
│  │  📄 联系我们 (新增)                                          │   │
│  │     ✨  demos/contact/index.tsx                              │   │
│  │     ✨  demos/contact/config.schema.json                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ 备注 ──────────────────────────────────────────────────────┐   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ 为此次保存添加备注...                                 │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [保存为新版本]  [放弃编辑]                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

文件变更列表按**页面分组**展示，清晰展示每个页面有哪些文件被修改或新增。项目配置作为独立分组展示在最前。页面被AI删除时标记为「🗑 待删除」；被AI新建时标记为「✨ 新增」。

### 4.5 配置面板设计（使用/预览场景）

配置面板在 Demo 使用/预览页面中供终端用户填写配置值，采用**分层展示**布局：

```
┌─ 配置面板 ──────────────────────────────────────────┐
│                                                      │
│  ┌─ 📋 项目配置（所有页面共享）─────────────────┐   │
│  │                                              │   │
│  │  Logo图片  ┌──────────────────────────┐     │   │
│  │            │ [选择文件] [上传]         │     │   │
│  │            │ 📷 current-logo.png       │     │   │
│  │            └──────────────────────────┘     │   │
│  │                                              │   │
│  │  品牌名称  ┌──────────────────────────┐     │   │
│  │            │ 我的品牌                   │     │   │
│  │            └──────────────────────────┘     │   │
│  │                                              │   │
│  │  主题颜色  ┌──────────────────────────┐     │   │
│  │            │ 🎨 #3B82F6                 │     │   │
│  │            └──────────────────────────┘     │   │
│  │                                              │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌─ 📄 当前页面：首页 ─────────────────────────┐   │
│  │                                              │   │
│  │  页面标题  ┌──────────────────────────┐     │   │
│  │            │ 欢迎来到我的网站           │     │   │
│  │            └──────────────────────────┘     │   │
│  │                                              │   │
│  │  副标题    ┌──────────────────────────┐     │   │
│  │            │ 专业的Demo展示平台         │     │   │
│  │            └──────────────────────────┘     │   │
│  │                                              │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  预览页面：[ 首页 ▾ ]                                │
│                                                      │
│  [保存配置]  [重置]                                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**配置面板的关键行为：**

| 行为 | 说明 |
|:-----|:-----|
| **切换预览页面** | 下方「预览页面」下拉框切换，项目配置区不变，页面配置区更新 |
| **修改项目配置** | 一次修改，所有页面立即生效（如修改Logo，首页和详情页同时更新） |
| **配置持久化** | 用户填写后立即保存到 Session 临时空间的 config.data.json |
| **表单生成** | 根据 Schema 定义自动生成对应的表单控件（文本 → 输入框、图片 → 上传组件、颜色 → 取色器） |
| **配置值校验** | 根据 JSON Schema 的 type/enum/format 等约束校验用户输入 |

**配置值的存储：**

Schema 定义与配置值数据分离存储：

```
workspace/
├── project.config.schema.json   ← 定义"有什么配置项"（AI 维护）
├── project.config.data.json     ← 存储"配置项填了什么值"（用户填写）
└── demos/home/
    ├── config.schema.json       ← 定义"有什么配置项"（AI 维护）
    ├── config.data.json         ← 存储"配置项填了什么值"（用户填写）
    └── index.tsx
```

### 4.6 预览机制适配

#### PreviewPanel/Sandpack 适配

当前 PreviewPanel 接收单个 `code` + `configData`，需适配多页面结构：

**单页模式预览流程：**

```
用户选择预览页面（如"首页"）
      │
      ▼
从 Session 临时空间读取 demos/home/index.tsx（组件代码）
      │
      ▼
读取 project.config.data.json（项目配置值）
读取 demos/home/config.data.json（页面配置值）
      │
      ▼
调用 mergeConfigToProps() 合并配置值为 Props
      │
      ▼
将 code + mergedProps 传入 PreviewPanel/Sandpack 编译渲染
```

**关键变更点：**

| 当前实现 | 新实现 |
|:---------|:-------|
| `PreviewPanel code={code} configData={configData}` | `PreviewPanel code={activePageCode} configData={mergedProps}` |
| `configData` 来自 `getDefaultValues(schema)` | `configData` 来自 `mergeConfigToProps(projectConfigData, pageConfigData, projectSchema, pageSchema)` |
| Sandpack 编译根目录 `index.tsx` | Sandpack 编译 `demos/{demoId}/index.tsx` |
| 切换页面需重新加载 code + schema | 切换页面重新加载 code + schema + configData |

**切换预览页面时的 Sandpack 处理策略：**

- **销毁重建**（推荐）：每次切换页面时销毁旧 Sandpack 实例，创建新实例。实现简单，避免状态残留
- 缓存策略暂不实施，待性能测试后决定是否需要

#### 嵌入页面（embed）适配

当前 `/api/embed/[demoId]/iframe` 读取根目录单文件，需适配：

| 当前 | 新实现 |
|:-----|:-------|
| `/api/embed/[projectId]/iframe` | `/api/embed/[projectId]/iframe?page={demoId}` |
| 读取 `workspace/index.tsx` | 读取 `workspace/demos/{demoId}/index.tsx` |
| 读取 `workspace/config.schema.json` | 读取 `workspace/demos/{demoId}/config.schema.json` + `project.config.schema.json` |
| 不合并配置 | 调用 `mergeConfigToProps()` 合并配置值 |

**向后兼容**：`page` 参数默认值为项目的第一个页面（`demoPages[0].id`），旧嵌入链接无需修改即可继续工作。

### 4.7 预览双模式设计

预览区支持两种展示模式：**单页模式**和**宫格模式**。

#### 模式一：单页模式（默认）

```
┌─ 预览区 ──────────────────────────────────────────────────┐
│  [单页模式]  [宫格模式]           预览页面：[ 首页 ▾ ]     │
│                                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │                                                    │   │
│  │                                                    │   │
│  │              实时渲染当前选中页面                    │   │
│  │                                                    │   │
│  │              (iframe 沙箱环境)                      │   │
│  │                                                    │   │
│  │                                                    │   │
│  └────────────────────────────────────────────────────┘   │
│                                                              │
│  [↗ 新窗口打开]                                             │
└──────────────────────────────────────────────────────────────┘
```

- 切换页面：点击页面列表中的项目 → 预览区重新渲染对应页面
- 预览区使用 iframe 沙箱加载页面组件
- 项目配置和页面配置合并后作为 Props 传入组件

#### 模式二：宫格模式

```
┌─ 预览区 ──────────────────────────────────────────────────┐
│  [单页模式]  [宫格模式]           每行：[ 3 ▾ ]  [返回]    │
│                                                              │
│  ┌───────┐  ┌───────┐  ┌───────┐                          │
│  │ 首页  │  │详情页 │  │关于我们│     ← iframe 缩放渲染    │
│  │ ┌───┐ │  │ ┌───┐ │  │ ┌───┐ │                          │
│  │ │   │ │  │ │   │ │  │ │   │ │                          │
│  │ └───┘ │  │ └───┘ │  │ └───┘ │                          │
│  └───────┘  └───────┘  └───────┘                          │
│                                                              │
│  ┌───────┐  ┌───────┐  ┌───────┐                          │
│  │联系...│  │  ...  │  │  ...  │                          │
│  │ ┌───┐ │  │ ┌───┐ │  │ ┌───┐ │                          │
│  │ │   │ │  │ │   │ │  │ │   │ │                          │
│  │ └───┘ │  │ └───┘ │  │ └───┘ │                          │
│  └───────┘  └───────┘  └───────┘                          │
│                                                              │
│  ↑ 上下滚动区域，每个格子等宽，高度固定 16:9                  │
└──────────────────────────────────────────────────────────────┘
```

#### 宫格模式交互细节

| 交互 | 行为 |
|:-----|:-----|
| **点击页面列表中的页面** | 宫格区滚动到对应卡片位置，并高亮该卡片（边框 + 轻微放大） |
| **点击宫格中的卡片** | 切换到单页模式，以该页面为当前选中页面 |
| **调整每行数量** | 下拉框选择 2 / 3 / 4，CSS Grid 列数实时更新 |
| **滚动** | 预览区支持上下滚动，每个卡片固定高度 |
| **高亮状态** | 当前选中的页面卡片有蓝色边框 + `transform: scale(1.02)` |
| **变更标记** | 有文件变更的页面卡片，右上角显示小橙点 |

#### 宫格渲染技术方案

**推荐方案：CSS Grid + iframe 缩放 + Intersection Observer 懒加载**

每个宫格卡片内部是一个 `<iframe>`，加载该页面的实时渲染，使用 `transform: scale(factor)` 缩放到格子尺寸：

```tsx
// 宫格容器
<div
  style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: '16px',
    overflowY: 'auto',
    padding: '16px',
  }}
>
  {demoPages.map(page => (
    <div
      key={page.id}
      ref={activeId === page.id ? scrollRef : undefined}
      className={activeId === page.id ? 'border-2 border-blue-500' : 'border border-gray-200'}
      style={{ aspectRatio: '16/9' }}
    >
      <LazyIframe
        src={`/embed/${projectId}?page=${page.id}`}
        visible={visiblePages.has(page.id)}
        style={{
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          border: 'none',
        }}
      />
    </div>
  ))}
</div>
```

**Intersection Observer 懒加载**：仅渲染可视区域内的 iframe，离开可视区域的 iframe 替换为静态占位符。每个 Sandpack 实例约 50-100MB 内存，5 个以上同时渲染会严重影响性能。

```typescript
// 使用 Intersection Observer 控制 iframe 渲染
const visiblePages = useIntersectionObserver(containerRef, demoPages)
```

`scale = 设计宽度 / 格子实际宽度`，即缩放因子。

**为什么不选其他方案：**

| 方案 | 问题 |
|:-----|:-----|
| Puppeteer 服务端截图 | 需要额外服务、截图延迟、复杂 |
| 多个独立 Sandpack 实例 | 每个页面一个进程，内存和 CPU 开销大 |
| Canvas 2D 重绘 | 需要自定义渲染引擎，工作量大 |
| 全量 iframe 无懒加载 | 5+ 页面时内存溢出风险 |

**iframe 缩放方案的优点：**
- 技术简单，利用现有 iframe 嵌入机制
- 实时渲染，无需截图延迟
- 页面之间完全隔离，不会相互影响
- Intersection Observer 懒加载控制内存占用

#### 单页 / 宫格模式的状态管理

```typescript
interface PreviewState {
  mode: 'single' | 'grid'
  activePageId: string | null      // 当前选中/高亮的页面
  gridColumns: 2 | 3 | 4           // 宫格每行数量
}
```

- 切换到单页模式：保留 `activePageId`
- 切换到宫格模式：`activePageId` 保持不变，`gridColumns` 恢复为上次的值（默认 3）
- 点击页面列表：无论哪种模式，都更新 `activePageId` 并触发滚动或渲染

### 4.8 首页项目卡片适配

当前首页卡片显示缩略图 + 名称 + 更新时间，多 Demo 后需增加页面数量展示：

| 当前 | 新实现 |
|:-----|:-------|
| 卡片仅显示项目名称 | 卡片增加「N 个页面」标签 |
| 缩略图展示唯一页面 | 缩略图展示第一个页面（或项目级缩略图） |
| 无页面数量信息 | `GET /api/demos` 返回增加 `demoCount` 字段 |

---

## 五、AI 代理适配

### 5.1 核心理念转变

| 维度 | 旧架构 | 新架构 |
|:-----|:-------|:-------|
| AI 操作范围 | `demos/{activeDemoId}/` 单个目录 | 整个工作空间，所有 `demos/` 子目录 |
| 页面定位 | 通过 `activeDemoId` 参数指定 | 通过自然语言中的页面名称匹配 |
| 文件操作 | `index.tsx` + `config.schema.json` | `demos/{demoId}/index.tsx` + `demos/{demoId}/config.schema.json` |
| 页面管理 | 不允许 AI 创建/删除/重命名页面 | **允许** AI 通过自然语言 + 专用 API 执行页面管理 |
| 启动时 | 仅告知当前活跃 Demo | 注入**全部页面的清单信息** |
| 元数据更新 | AI 直接修改 project.json | **AI 通过专用 API 更新**，不直接修改 project.json |

### 5.2 AI 代理安全防护

**核心原则：AI 不直接修改 `project.json`**

AI 直接修改 `project.json` 存在以下风险：
- 写入格式错误的 JSON 导致项目不可用
- 误改 `versions`、`workspacePath` 等关键字段
- `demoPages` 与实际文件不一致

**防护措施：**

1. **专用 API 端点**：页面管理操作通过 API 而非直接文件写入
   - `POST /api/projects/{id}/demos` — 创建页面（后端自动更新 demoPages）
   - `DELETE /api/projects/{id}/demos/{demoId}` — 删除页面（后端自动更新 demoPages）
   - `PUT /api/projects/{id}/demos/{demoId}` — 更新页面名称（后端自动更新 demoPages）
   - `POST /api/projects/{id}/demo-pages/sync-config` — 同步 hasProjectConfig 标记

2. **文件变更追踪器校验**：如果检测到 AI 直接修改 `project.json`，发出警告并拒绝该变更

3. **agent.md 禁止规则**：明确禁止 AI 直接编辑 `project.json`

### 5.3 代理指令更新

AI 代理的 `demo-generator.md` 需要从"单页面编辑器"升级为"多页面项目编辑器"：

```
# Demo Generator Agent

你是 OpenCode Workbench 的项目 Demo 生成专家。你的
工作区是一个完整的项目工作空间，包含多个 Demo 页面。

## 工作空间结构

项目工作空间遵循以下目录结构：

  workspace/
  ├── project.config.schema.json    ← 项目级共享配置定义（可选）
  └── demos/
      ├── {demoId1}/                ← 页面1
      │   ├── index.tsx              ← React 组件代码
      │   └── config.schema.json     ← 页面级配置定义
      ├── {demoId2}/                ← 页面2
      │   ├── index.tsx
      │   └── config.schema.json
      └── .../

每个页面对应 demos/ 下一个独立子目录。
项目级配置 project.config.schema.json 定义所有页面共享的配置项。

## 页面信息获取

会话开始时你会收到当前项目所有页面的清单：

```json
{
  "projectName": "我的项目",
  "hasProjectConfig": false,
  "pages": [
    { "id": "home", "name": "首页" },
    { "id": "detail", "name": "详情页" }
  ]
}
```

如果需要了解某个页面的当前代码，read 对应的 demos/{id}/index.tsx 和 demos/{id}/config.schema.json。
如果 hasProjectConfig 为 true，可通过 read project.config.schema.json 了解项目级共享配置。

## 页面内容编辑

用户通过自然语言指定要修改哪个页面。你需要自主匹配页面名称：

- 用户说"修改首页"，你定位到 demos/home/
- 用户说"给详情页加个配置"，你定位到 demos/detail/
- 用户说"把第二个页面改一下"，你根据页面列表顺序定位

如果页面名称有歧义，请向用户确认。

## 页面管理操作

你可以通过自然语言执行以下页面管理操作。
**重要：页面管理操作必须通过 API 端点执行，不要直接修改 project.json。**

### 创建新页面
用户："新建一个XX页面"

操作步骤：
1. 调用 API `POST /api/projects/{projectId}/demos` 创建页面（后端自动更新 demoPages）
2. API 返回新页面的 demoId 和目录路径
3. 编辑 demos/{demoId}/index.tsx 和 config.schema.json

### 删除页面
用户："删除XX页面"

操作步骤：
1. 向用户确认删除操作（不可逆）
2. 调用 API `DELETE /api/projects/{projectId}/demos/{demoId}`（后端自动更新 demoPages）

### 重命名页面
用户："把XX页面改名为YY"

操作步骤：
1. 调用 API `PUT /api/projects/{projectId}/demos/{demoId}` 更新 name
2. 目录名/id 保持不变（避免路径断裂）

## 项目级配置管理

项目级配置允许定义所有页面共享的配置项（如Logo、品牌色）。典型场景：用户在配置面板上传一次Logo，所有页面自动展示。

### 创建项目配置
用户："给项目增加一个Logo配置" / "我需要所有页面都能展示Logo"

操作步骤：
1. 创建或编辑 workspace/project.config.schema.json
2. 定义共享字段（如 logo: { type: "string", format: "image", title: "Logo图片" }）
3. 更新所有 demos/*/index.tsx 的 Props 接口，加入新字段
4. 更新所有 demos/*/index.tsx 的渲染逻辑，使用新字段
5. 确保新增页面时也自动包含这些共享字段
6. 调用 API `POST /api/projects/{projectId}/demo-pages/sync-config` 更新 hasProjectConfig

### 删除项目配置字段
用户："删除项目配置中的联系方式"

操作步骤：
1. 编辑 project.config.schema.json，移除指定字段
2. 更新所有页面组件的 Props 接口和渲染逻辑
3. 如果所有共享字段都被删除，删除 project.config.schema.json，调用 sync-config API 更新 hasProjectConfig = false

### 修改项目配置字段
用户："把Logo改成必填"

操作步骤：
1. 编辑 project.config.schema.json 的对应字段属性
2. 无需更新页面组件（Props 接口不变）

### 重要约束
- 新增或删除项目配置字段时，**必须更新所有页面组件**
- 新增页面时，**必须自动包含当前所有项目配置字段**
- 不要修改 project.config.schema.json 以外的 .config 文件
- **禁止直接修改 project.json**，页面管理操作通过 API 端点执行

## 代码质量标准（每个页面内）

每个页面的 index.tsx 要求：
- 使用 TypeScript，定义完整的 Props 接口（包含项目配置 + 页面配置的所有字段）
- 使用 Tailwind CSS 进行样式设计
- 可使用 shadcn/ui 组件库、lucide-react 等
- 导出默认组件
- 代码完整可运行，包含必要的 import
- 所有代码在单一文件中，不使用 import './xxx'

每个页面的 config.schema.json 要求：
- 符合 JSON Schema 规范
- properties 与该页面特有的 Props 一一对应（不要包含项目配置中的字段）
- 每个属性有合理的 default 值

## 禁止行为
- ❌ 修改 .session.json、.opencode/、.workspace.json 等系统文件
- ❌ **直接修改 project.json**（页面管理操作通过 API 端点执行）
- ❌ 在页面 config.schema.json 中重复定义项目配置已有的字段
- ❌ 修改 config.data.json（配置值由用户在配置面板中填写）
- ❌ 在单个页面中使用 import './xxx' 相对路径导入
```

### 5.4 系统上下文注入

每次创建 Agent 会话时，系统自动注入页面清单：

```typescript
function buildAgentContext(
  projectName: string,
  hasProjectConfig: boolean,
  demoPages: DemoPageMeta[]
): string {
  const pageList = demoPages
    .map(p => `  📄 "${p.name}" → demos/${p.id}/ (index.tsx + config.schema.json)`)
    .join('\n')

  const projectConfigLine = hasProjectConfig
    ? `项目级共享配置：✅ 已设置（project.config.schema.json）`
    : `项目级共享配置：未设置`

  return `
当前项目：「${projectName}」
${projectConfigLine}
包含 ${demoPages.length} 个页面：

${pageList}

用户会通过自然语言告诉你操作哪个页面或项目配置。
如果需要操作某个页面，请在 demos/{id}/ 目录下编辑 index.tsx 或 config.schema.json。
如果用户要求管理项目级共享配置，请编辑 workspace/project.config.schema.json。
页面管理操作（创建/删除/重命名）请通过 API 端点执行，不要直接修改 project.json。
`
}
```

### 5.5 文件变更适配

AI 编辑产生的文件变更路径从「index.tsx」升级为「demos/{demoId}/index.tsx」和「project.config.schema.json」。

**文件变更追踪器**需要适配新的路径格式，自动提取分组信息用于按区域展示：

```
project.config.schema.json   →  项目级配置
demos/home/index.tsx          →  页面「首页」的组件代码
demos/detail/index.tsx        →  页面「详情页」的组件代码
demos/home/config.schema.json →  页面「首页」的配置定义
```

分组展示优先级：项目配置 → 各页面（按名称排序）

**安全校验**：文件变更追踪器检测到 `project.json` 被修改时，发出警告并拒绝该变更（AI 应通过 API 更新元数据）。

### 5.6 Schema 自动生成机制适配

当前编辑页有防抖触发 Schema 自动重新生成的逻辑（`/api/generate-schema`），基于 AI 更新后的代码自动生成对应的 config.schema.json。多 Demo 后需适配：

| 当前行为 | 新行为 |
|:---------|:-------|
| 生成根目录 `config.schema.json` | 生成 `demos/{demoId}/config.schema.json` |
| 请求参数 `{ sessionId }` | 请求参数 `{ sessionId, demoId }` |
| 不区分项目配置/页面配置 | 仅生成页面级 Schema，项目配置 Schema 不自动生成（由 AI 手动管理） |

**API 变更**：`POST /api/generate-schema` 增加 `demoId` 参数，指定为哪个页面生成 Schema。

### 5.7 对话流程示例

```
[系统注入] 当前项目「我的项目」，项目级共享配置未设置，包含：首页、详情页、关于我们

┌─────────────────────────────────────────────────────────────┐
│ 👤 用户：帮我把首页的标题改成"产品展示"，背景改成蓝色     │
│                                                             │
│ 🤖 AI：                                                      │
│   [读取 demos/home/index.tsx]                               │
│   [读取 demos/home/config.schema.json]                      │
│   [编辑 demos/home/index.tsx — 修改标题和背景色]             │
│   [编辑 demos/home/config.schema.json — 更新默认值]          │
│                                                             │
│   已修改「首页」：                                           │
│   • index.tsx — 标题改为"产品展示"，背景色改为蓝色          │
│   • config.schema.json — 同步更新了对应默认值               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 👤 用户：我想所有页面都能用一个统一的Logo，帮我设置一下     │
│                                                             │
│ 🤖 AI：                                                      │
│   [创建 project.config.schema.json — 定义 logo字段]         │
│   [更新 demos/home/index.tsx — Props 加入 logo]             │
│   [更新 demos/detail/index.tsx — Props 加入 logo]           │
│   [更新 demos/about/index.tsx — Props 加入 logo]            │
│   [调用 API sync-config — hasProjectConfig = true]           │
│                                                             │
│   已创建项目级共享配置，定义了 logo 字段。                   │
│   三个页面的组件都已更新，会接收并展示 logo Props。          │
│   用户只需在配置面板上传一次Logo，所有页面自动同步。         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 👤 用户：帮我对比一下首页和详情页的设计风格，看看是否统一   │
│                                                             │
│ 🤖 AI：                                                      │
│   [读取 demos/home/index.tsx]                               │
│   [读取 demos/detail/index.tsx]                             │
│                                                             │
│   对比分析：                                                 │
│   • 首页使用 bg-blue-500，详情页使用 bg-green-400           │
│   • 两个页面使用了不同的颜色方案，建议统一                  │
│   • 要不要把品牌色也放到项目配置中？这样就能保证统一了      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 👤 用户：好建议，把品牌色加到项目配置里，两个页面都统一蓝色 │
│                                                             │
│ 🤖 AI：                                                      │
│   [编辑 project.config.schema.json — 新增 brandColor字段]   │
│   [编辑 demos/home/index.tsx — 统一颜色方案]                │
│   [编辑 demos/detail/index.tsx — 统一颜色方案]              │
│                                                             │
│   已将品牌色纳入项目级配置，首页和详情页颜色已统一为蓝色。    │
│   今后新建页面也会自动包含品牌色。                           │
└─────────────────────────────────────────────────────────────┘
```

此对话流程展示了 **AI 全域编辑 + 项目级共享配置** 的核心优势：一次对话中可以自然地跨页面编辑、对比风格、并建立共享配置，无需任何手动操作。

---

## 六、API 路由设计

### 6.1 API URL 统一策略

当前系统使用 `/api/demos/` 路径（如 `/api/demos`、`/api/demos/[id]`），新功能使用 `/api/projects/` 路径。为避免两套 URL 体系共存，采用以下策略：

| 阶段 | 策略 |
|:-----|:-----|
| **一期实施** | 新增路由使用 `/api/projects/` 前缀；旧 `/api/demos/` 路由保留不动，内部逻辑不变 |
| **二期优化** | 旧 `/api/demos/` 路由标记为 `@deprecated`，前端逐步迁移到 `/api/projects/` 路由 |
| **三期清理** | 移除旧 `/api/demos/` 路由 |

**一期路由规划：**

| 旧路由（保留） | 新路由（新增） | 说明 |
|:--------------|:-------------|:-----|
| `GET /api/demos` | — | 列出所有项目（保留，返回值增加 `demoCount`） |
| `POST /api/demos` | — | 创建项目（保留，内部改用新目录结构） |
| `PATCH /api/demos/[id]` | — | 更新项目名称（保留） |
| `DELETE /api/demos/[id]` | — | 删除项目（保留） |
| — | `GET /api/projects/[projectId]/demos` | 获取项目的所有 Demo 页面列表 |
| — | `POST /api/projects/[projectId]/demos` | 在项目中创建新 Demo 页面 |
| — | `GET /api/projects/[projectId]/demos/[demoId]` | 获取特定 Demo 页面的详细信息 |
| — | `PUT /api/projects/[projectId]/demos/[demoId]` | 更新 Demo 页面（代码/配置/名称） |
| — | `DELETE /api/projects/[projectId]/demos/[demoId]` | 删除 Demo 页面 |
| — | `GET /api/projects/[projectId]/config` | 获取项目级共享配置 Schema |
| — | `PUT /api/projects/[projectId]/config` | 更新项目级共享配置 Schema |
| — | `DELETE /api/projects/[projectId]/config` | 删除项目级共享配置 |
| — | `GET /api/projects/[projectId]/config/data` | 获取项目级配置值 |
| — | `PUT /api/projects/[projectId]/config/data` | 保存项目级配置值 |
| — | `POST /api/projects/[projectId]/demo-pages/sync-config` | 同步 hasProjectConfig 标记 |

### 6.2 Session 文件路由变更

| 方法 | 路由 | 变更 |
|:-----|:-----|:-----|
| `GET` | `/api/sessions/[sessionId]/files` | 返回 `MultiDemoFiles` 结构（包含所有 Demo 文件 + 项目配置） |
| `PUT` | `/api/sessions/[sessionId]/files` | 接受 `MultiDemoFiles` 结构或单页面 `DemoFiles`（兼容旧客户端） |
| `GET` | `/api/sessions/[sessionId]/files/[demoId]` | **新增**：获取 Session 中指定页面的文件 |
| `PUT` | `/api/sessions/[sessionId]/files/[demoId]` | **新增**：更新 Session 中指定页面的文件 |

**向后兼容**：`GET /api/sessions/[sessionId]/files` 在旧结构 Session 中仍返回 `DemoFiles` 格式（仅含 code + schema），前端通过检测返回结构判断是否为多 Demo 模式。

### 6.3 其他路由变更

| 方法 | 路由 | 变更 |
|:-----|:-----|:-----|
| `GET` | `/api/projects/[projectId]` | 返回结果包含 `demoPages`、`hasProjectConfig`、`migratedToMultiDemo` |
| `GET` | `/api/demos` | 项目摘要中增加 `demoCount` 字段 |
| `POST` | `/api/generate-schema` | 增加 `demoId` 参数，为指定页面生成 Schema |
| `GET` | `/api/embed/[projectId]/iframe` | 增加 `page` 查询参数，默认为第一个页面 |

### 6.4 前端 API Client 更新

```typescript
class ProjectApiClient {
  // Demo 页面方法
  async getDemoPages(projectId: string): Promise<DemoPageMeta[]>
  async createDemoPage(projectId: string, name: string): Promise<DemoPageMeta>
  async getDemoPageDetail(projectId: string, demoId: string): Promise<DemoPageDetail>
  async updateDemoPage(projectId: string, demoId: string, data: UpdateDemoPageRequest): Promise<void>
  async deleteDemoPage(projectId: string, demoId: string): Promise<void>
  async syncProjectConfig(projectId: string): Promise<void>

  // 项目级配置方法
  async getProjectConfig(projectId: string): Promise<ProjectConfig>
  async updateProjectConfig(projectId: string, schema: string): Promise<void>
  async deleteProjectConfig(projectId: string): Promise<void>
  async getProjectConfigData(projectId: string): Promise<Record<string, unknown>>
  async saveProjectConfigData(projectId: string, data: Record<string, unknown>): Promise<void>

  // Session 文件方法（新增多页面支持）
  async getSessionMultiDemoFiles(sessionId: string): Promise<MultiDemoFiles>
  async getSessionDemoPageFiles(sessionId: string, demoId: string): Promise<DemoFiles>
  async updateSessionDemoPageFiles(sessionId: string, demoId: string, files: DemoFiles): Promise<void>
}
```

---

## 七、实施计划

### 7.1 实施阶段概览

```
阶段一     阶段二        阶段三         阶段四        阶段五
数据模型 → API路由 →   AI代理适配  →  前端UI改造  → 迁移兼容
后端基础   扩展                          编辑页重构   测试验证
```

### 7.2 阶段一：数据模型 + 文件系统层（1-2 天）

**涉及文件：**
- `packages/shared/src/workspace.ts` — 新增 `DemoPageMeta`、`MultiDemoFiles` 等类型；更新 `Project` 接口
- `packages/shared/src/types.ts` — `DemoFiles` 标记 `@deprecated`
- `packages/shared/src/index.ts` — 导出新类型
- `packages/web/src/lib/fs-utils.ts` — 新增 Demo CRUD 工具函数 + Session 多页面读写

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| 定义新类型 | DemoPageMeta、DemoPageDetail、ProjectConfig、MultiDemoFiles、MergedComponentProps、CreateDemoPageRequest、UpdateDemoPageRequest |
| 更新 Project | 添加 `demoPages: DemoPageMeta[]`、`hasProjectConfig: boolean`、`migratedToMultiDemo?: boolean` 字段 |
| 新增 fs-utils 函数 | `listDemoPages(projectId)`、`createDemoPage(projectId, name)`、`deleteDemoPage(projectId, demoId)`、`getDemoPageFiles(projectId, demoId)`、`updateDemoPageFiles(projectId, demoId, files)` |
| 新增项目配置 fs-utils | `getProjectConfig(projectId)`、`saveProjectConfig(projectId, schema)`、`deleteProjectConfig(projectId)`、`getProjectConfigData(projectId)`、`saveProjectConfigData(projectId, data)` |
| 新增 Session 多页面读写 | `getSessionMultiDemoFiles(sessionId)`、`updateSessionDemoPageFiles(sessionId, demoId, files)`、`getSessionDemoPageFiles(sessionId, demoId)` |
| 新增配置合并函数 | `mergeConfigToProps(projectConfigData, pageConfigData, projectSchema, pageSchema)` |
| 更新 ensureWorkspaceFiles | 支持创建 `demos/demo_{timestamp}/` 目录结构 |
| 更新 createProject | 默认创建 `demos/demo_{timestamp}/` 及默认文件；初始 hasProjectConfig = false；migratedToMultiDemo = true |
| 保留旧函数兼容 | `getSessionFiles()` / `updateSessionFiles()` 保留但标记 `@deprecated`，内部适配新目录结构 |

### 7.3 阶段二：API 路由扩展（1-2 天）

**涉及文件：**
- `packages/web/src/app/api/projects/[projectId]/demos/route.ts` — Demo 列表/创建
- `packages/web/src/app/api/projects/[projectId]/demos/[demoId]/route.ts` — 单个 Demo CRUD
- `packages/web/src/app/api/projects/[projectId]/config/route.ts` — 项目配置 CRUD（新建）
- `packages/web/src/app/api/projects/[projectId]/config/data/route.ts` — 项目配置值（新建）
- `packages/web/src/app/api/projects/[projectId]/demo-pages/sync-config/route.ts` — 同步配置标记（新建）
- `packages/web/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts` — 单页面文件读写（新建）
- 修改现有 sessions/files 路由以支持 `MultiDemoFiles` 返回结构
- `packages/web/src/lib/project-api.ts` — 新增前端 API 方法

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| GET/POST /api/projects/{id}/demos | 返回 demoPages 列表或在临时 workspace 中创建新 demo |
| GET/PUT/DELETE /api/projects/{id}/demos/{demoId} | 单个 demo 的读取/更新/删除 |
| GET/PUT/DELETE /api/projects/{id}/config | 项目配置 Schema 的读取/更新/删除 |
| GET/PUT /api/projects/{id}/config/data | 项目配置值的读取/保存 |
| POST /api/projects/{id}/demo-pages/sync-config | 同步 hasProjectConfig 标记（后端检测 project.config.schema.json 是否存在） |
| GET/PUT /api/sessions/{id}/files/{demoId} | Session 中单页面文件的读取/更新 |
| 更新 GET /api/sessions/{id}/files | 返回 `MultiDemoFiles` 结构（兼容旧 `DemoFiles` 格式） |
| 更新 POST /api/generate-schema | 增加 `demoId` 参数 |
| 更新 GET /api/embed/{id}/iframe | 增加 `page` 查询参数 |
| 更新 projectApiClient | 添加对应的前端封装方法 |

### 7.4 阶段三：AI 代理适配（0.5-1 天）

**涉及文件：**
- `packages/web/src/lib/workspace-manager.ts` — `injectOpencodeAgentConfig` 更新指令（从"单页面"升级为"多页面项目编辑器"）
- `packages/web/src/components/ai-elements/ai-chat.tsx` — 注入全页面清单上下文

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| 重写 agent.md 提示词 | 定义工作空间目录结构（含项目配置）；说明页面信息获取方式；支持自然语言页面定位；新增页面管理操作指令（通过 API 而非直接修改 project.json）；**新增项目级配置管理指令**；移除单目录范围限制；**禁止直接修改 project.json** |
| 更新 opencode.json | 调整 tools 权限以允许跨 Demo 文件操作和 project.config.schema.json 写入 |
| AI 对话上下文注入 | 每次创建 Agent 会话时，将项目所有页面的清单 + 项目配置状态注入到系统提示词中 |
| 文件变更检测适配 | 支持 `demos/{demoId}/index.tsx` 路径格式；自动按页面分组文件变更列表；**检测 project.json 被修改时发出警告** |

### 7.5 阶段四：前端 UI 改造（2-3 天）

**涉及文件：**
- `packages/web/src/app/demo/[id]/edit/page.tsx` — 编辑页重构（核心，当前 814 行）
- `packages/web/src/components/demo-pages-panel.tsx` — 页面管理面板组件（新建，用于 Tab 3）
- `packages/web/src/components/demo/home-page.tsx` — 首页卡片增加页面数量
- `packages/web/components/demo/PreviewPanel.tsx` — 预览面板适配多页面
- `packages/web/components/demo/ConfigFormNew.tsx` — 配置面板适配项目级/页面级分层

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| 编辑页左侧改为 3 Tab | AI 对话 / 代码编辑 / 页面 —— 三个 Tab 切换结构 |
| AI 对话 Tab | 移除 Demo 切换逻辑；注入全页面清单到对话上下文；消息提交不再附带 activeDemoId |
| 代码编辑 Tab | 增加页面选择器下拉框；切换页面时调用 `getSessionDemoPageFiles()` 重新加载对应代码和 Schema |
| 页面 Tab（新增） | 页面表格（名称、文件数、最后修改、操作按钮）；新建页面按钮 + 弹窗；行内编辑名称；删除页面（二次确认）；查看预览按钮；**项目配置状态显示 + 编辑入口** |
| 右侧面板适配 | 文件变更列表按页面/项目配置分组展示；新增「预览页面」下拉选择器 |
| **配置面板适配** | 配置面板新增项目配置区（与页面配置区分层展示）；切换预览页面时项目配置区不变；配置值与 Schema 分离存储；用户填写后立即持久化到 config.data.json |
| **预览机制适配** | PreviewPanel 接收 `activePageCode` + `mergedProps`；切换页面时销毁重建 Sandpack 实例；`mergedProps` 由 `mergeConfigToProps()` 生成 |
| **预览双模式 UI** | 预览区顶部增加「单页模式/宫格模式」切换按钮；宫格模式工具栏（每行数量下拉框、返回单页按钮） |
| **宫格渲染实现** | CSS Grid 布局；iframe + transform:scale 缩放渲染；Intersection Observer 懒加载；滚动定位逻辑（scrollIntoView） |
| **宫格交互联动** | 点击页面列表 → 宫格滚动到对应卡片并高亮；点击卡片 → 切换单页模式 |
| **首页卡片适配** | 项目卡片增加「N 个页面」标签 |
| **编辑页状态管理** | 当前 20+ 个 useState，多 Demo 后更复杂。建议：页面列表 + 项目配置状态提取为独立 Context；活跃页面状态（activePageId、activePageCode、activePageSchema）作为独立状态组 |

### 7.6 阶段五：向后兼容与迁移（1 天）

**涉及文件：**
- `packages/web/src/lib/fs-utils.ts` — 新增迁移函数
- `packages/web/src/app/api/embed/[demoId]/iframe/route.ts` — 嵌入页面适配

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| 自动迁移函数 | `migrateProjectToMultiDemo(projectId)` — 检测旧结构（workspace 下无 demos/ 目录 或 无 migratedToMultiDemo 标记）；创建 `demos/demo_{timestamp}/` 目录；移动 index.tsx 和 config.schema.json 到新位置；更新 project.json 的 demoPages；设置 migratedToMultiDemo = true |
| 打开项目编辑时触发迁移 | 在 createEditSession 或 openProjectEdit 流程中检测并自动迁移 |
| 迁移标记 | 在 project.json 中记录 `migratedToMultiDemo: true` 避免重复迁移 |
| 版本快照兼容 | 旧版本快照（无 demos/ 子目录）恢复时执行自动迁移：检测 workspace 下是否有 demos/ 目录，若无则执行迁移函数；迁移后重新扫描 demos/ 目录同步 demoPages |
| 进行中 Session 兼容 | 检测 Session 临时空间是否为旧结构，若是则执行迁移（迁移前自动备份） |
| 嵌入页面兼容 | `/api/embed/[projectId]/iframe` 检测 workspace 结构，旧结构读取根目录文件，新结构读取 demos/ 下指定页面 |

**迁移函数伪代码：**

```typescript
function migrateProjectToMultiDemo(projectId: string): boolean {
  const project = readProjectMeta(projectId);
  if (!project || project.migratedToMultiDemo) return false;

  const workspacePath = path.join(getProjectPath(projectId), "workspace");
  const oldCodePath = path.join(workspacePath, "index.tsx");
  const oldSchemaPath = path.join(workspacePath, "config.schema.json");

  // 仅在旧结构存在时迁移
  if (!fs.existsSync(oldCodePath)) return false;

  const demoId = `demo_${Date.now()}`;
  const demoDir = path.join(workspacePath, "demos", demoId);

  // 1. 创建新目录
  fs.mkdirSync(demoDir, { recursive: true });

  // 2. 移动文件
  fs.renameSync(oldCodePath, path.join(demoDir, "index.tsx"));
  fs.renameSync(oldSchemaPath, path.join(demoDir, "config.schema.json"));

  // 3. 更新 project.json
  project.demoPages = [{
    id: demoId,
    name: "默认页面",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }];
  project.hasProjectConfig = fs.existsSync(
    path.join(workspacePath, "project.config.schema.json")
  );
  project.migratedToMultiDemo = true;
  project.updatedAt = Date.now();
  writeProjectMeta(projectId, project);

  return true;
}
```

---

## 八、资源管理策略

### 8.1 资源层级

| 资源类型 | 存储位置 | 作用范围 |
|:---------|:---------|:---------|
| 页面级图片 | `demos/{demoId}/assets/` | 仅当前页面使用 |
| 项目级图片（如 Logo） | `workspace/assets/` | 所有页面共享 |
| Session 上传资源 | Session 临时空间 `assets/images/` | 当前编辑会话 |

### 8.2 保存时资源合并

- 页面级资源随页面目录一起合并到正式 workspace
- 项目级资源随 workspace 根目录合并
- 保存时自动清理未引用的资源文件

---

## 九、风险与对策

| 风险 | 影响 | 对策 |
|:-----|:-----|:-----|
| **AI 页面名称匹配失败** | AI 无法确定用户指的是哪个页面 | 注入的页面清单要完整清晰；AI 不确定时主动向用户确认 |
| **AI 越权修改无关页面** | AI 可能修改用户未提到的页面 | agent.md 明确约束：仅修改用户指定的页面；文件变更追踪器可检测异常修改 |
| **AI 页面管理操作失误** | 用户说"删除XX"，AI 可能删除错误页面或未确认 | AI 执行删除前必须向用户二次确认并说明影响的文件范围 |
| **AI 未同步所有页面组件** | 新增共享配置字段后，部分页面未更新 Props | agent.md 强约束：新增/删除项目配置字段时**必须**更新所有页面；提供批量同步 API 辅助 |
| **AI 直接修改 project.json** | 格式错误导致项目不可用 | **禁止 AI 直接修改 project.json**；页面管理通过专用 API 端点；文件变更追踪器检测并拦截 |
| **配置字段命名冲突** | 项目配置和页面配置有同名字段，用户预期不一致 | 合并机制明确：页面级优先覆盖；配置面板视觉区分来源；AI 设计时避免冲突 |
| **宫格模式性能问题** | 多个 iframe 同时渲染，占用内存和 CPU | 使用 Intersection Observer 懒加载，仅渲染可视区域内的 iframe；页面超过 6 个时限制同时渲染数量 |
| **宫格滚动定位不准** | 点击页面列表后滚动定位偏移 | 使用 `element.scrollIntoView({ block: 'center' })` 精确居中；考虑固定高度的卡片避免计算偏差 |
| **旧数据迁移失败** | 用户无法编辑旧项目 | 迁移前自动备份；迁移失败时回退并提供手动修复入口 |
| **版本快照不一致** | 恢复版本后 demoPages 与实际文件不匹配 | 版本恢复后执行自动迁移（如为旧结构）；后端重新扫描 demos/ 目录同步 meta |
| **编辑页三 Tab 状态管理复杂** | 切换 Tab 时状态不同步 | 页面列表 + 项目配置状态提取为独立 Context；活跃页面状态作为独立状态组 |
| **文件变更分组的性能** | 页面多时变更列表过长 | 默认折叠非活跃页面分组；提供"仅显示有变更的页面"筛选 |
| **DemoFiles 破坏性变更** | 旧 API 客户端无法解析新返回结构 | 旧函数标记 `@deprecated` 但保留；新 API 返回 `MultiDemoFiles`；前端通过返回结构检测兼容 |
| **进行中 Session 不兼容** | 迁移后旧 Session 临时空间无法使用 | Session 加载时检测结构，旧结构自动迁移（迁移前备份） |
| **AI 同步页面组件 token 限制** | 页面多时 AI 单次对话无法更新所有页面 | 提供批量同步 API（`POST /api/projects/{id}/demo-pages/sync-props`），后端自动在所有页面组件中注入/移除项目配置字段 |

---

## 十、后续扩展方向

以下功能不在本方案一期范围内，但架构设计为之预留了扩展空间：

1. **Demo 排序/拖拽**：DemoPageMeta 中添加 `order` 字段，支持拖拽排序
2. **Demo 间共享组件**：在 workspace/ 下增加 `shared/` 目录存放共享代码
3. **Demo 搜索与筛选**：Demo 多时提供搜索框快速定位
4. **批量子 Demo 预览**：侧边栏展示所有 Demo 的小缩略图（仪表盘视图）
5. **Demo 依赖锁定**：每个 Demo 可独立锁定 npm 依赖版本
6. **项目配置组**：支持将共享配置分 Tab/分组展示（如"品牌信息"、"联系方式"等分组）
7. **配置预设/模板**：预设常用的项目配置模板（如电商项目配置、企业官网配置）
8. **批量同步 API**：后端自动在所有页面组件中注入/移除项目配置字段，减轻 AI 同步负担

---

## 十一、附录

### A. 相关文件索引

| 文件 | 说明 |
|:-----|:-----|
| `packages/shared/src/workspace.ts` | Project、VersionInfo 等核心类型定义 |
| `packages/shared/src/types.ts` | DemoFiles、SessionMeta 等类型定义 |
| `packages/shared/src/index.ts` | 类型统一导出 |
| `packages/web/src/lib/fs-utils.ts` | 文件系统工具函数（项目/会话/版本 CRUD） |
| `packages/web/src/lib/workspace-manager.ts` | 工作空间管理器（创建/读取/删除 workspace） |
| `packages/web/src/lib/session-manager.ts` | 会话管理器（创建/保存/丢弃 session） |
| `packages/web/src/lib/project-api.ts` | 前端 API 客户端封装 |
| `packages/web/src/app/demo/[id]/edit/page.tsx` | 项目编辑页（核心待改造页面，当前 814 行） |
| `packages/web/src/components/ai-elements/ai-chat.tsx` | AI 对话区组件 |
| `packages/web/components/demo/PreviewPanel.tsx` | 预览面板（Sandpack 编译渲染） |
| `packages/web/components/demo/ConfigFormNew.tsx` | 配置表单组件 |
| `packages/web/src/app/api/embed/[demoId]/iframe/route.ts` | 嵌入页面 HTML 生成 |

### B. 旧结构示例（迁移前）

```
projects/proj_1712345678/
├── project.json           ← versions: [], demoPages 不存在
└── workspace/
    ├── index.tsx          ← "一个项目 = 一个 Demo"
    └── config.schema.json
```

### C. 新结构示例（迁移后 / 新建）

```
projects/proj_1712345678/
├── project.json           ← demoPages: [...], hasProjectConfig: true, migratedToMultiDemo: true
└── workspace/
    ├── project.config.schema.json    ← 项目级共享配置
    ├── project.config.data.json      ← 项目级配置值
    ├── assets/                       ← 项目级共享资源（如 Logo）
    └── demos/
        ├── demo_1712345678/          ← 原 index.tsx + config.schema.json（迁移后重命名）
        │   ├── index.tsx
        │   ├── config.schema.json
        │   └── config.data.json
        ├── demo_002/
        │   ├── index.tsx
        │   ├── config.schema.json
        │   └── config.data.json
        └── demo_003/
            ├── index.tsx
            ├── config.schema.json
            └── config.data.json
```

### D. v4.0 → v5.0 变更摘要

| 变更项 | v4.0 | v5.0 |
|:-------|:-----|:-----|
| Session 文件读写 | 未提及 | 新增 `getSessionMultiDemoFiles()` 等函数，完整适配多页面 |
| PreviewPanel 适配 | 未提及 | 新增预览流程、Sandpack 适配、配置合并逻辑 |
| AI 修改 project.json | 允许 AI 直接修改 | **禁止**，改用专用 API 端点 |
| 版本快照兼容 | 仅提及需迁移 | 新增自动迁移检测 + 后端扫描同步机制 |
| DemoFiles 类型 | 未评估影响 | 新增 `MultiDemoFiles`，旧类型标记 `@deprecated` |
| API URL | 新旧两套共存 | 新增统一策略（保留→废弃→清理） |
| config.data.json 生命周期 | 未定义 | 完整定义创建/修改/持久化/版本管理规则 |
| 编辑页重构 | 缺乏细节 | 新增状态管理策略、组件拆分建议 |
| embed 适配 | 未提及 | 新增 `page` 查询参数 + 向后兼容 |
| Schema 自动生成 | 未提及适配 | 新增 `demoId` 参数，仅生成页面级 Schema |
| 资源管理 | 未提及 | 新增项目级/页面级资源分层策略 |
| 首页卡片 | 未提及 | 新增 `demoCount` 展示 |
| DemoPageMeta.path | 包含 path 字段 | 移除，路径由 id 推导 |
| 默认页面 ID | "default" | 统一 `demo_{timestamp}` 格式 |
| 宫格性能 | 仅提懒加载 | 新增 Intersection Observer 具体方案 |
| AI 同步约束 | 纯靠提示词 | 新增批量同步 API 建议 |
| 版本号 | v1.0/v2.0 混用 | 统一为"旧架构/新架构" |