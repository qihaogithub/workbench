# 项目多 Demo 页面支持方案

> 版本：v6.1
> 创建日期：2026-05-03
> 更新日期：2026-05-04（v6.1：移除 config.data.json 持久化层，配置值统一从 Schema default 推导；v6.0：基于代码实测纠正预览/embed/Session/agent prompt 等事实性错误；项目未上线，砍除全部旧版本兼容；强化 Props 同步、Schema 冲突等核心可靠性机制）
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
| 工作空间粒度 | 用户进入编辑创建临时 workspace（`workspaces/{userId}/{projectId}/{wsId}`），内含所有 Demo 的副本；Session（`sessions/{userId}/{projectId}/{sid}`）只保存元数据，通过 `workspaceId` 引用临时 workspace |
| 版本粒度 | 以 Project 为单位（保存一次 = 所有 Demo 的集体快照） |
| 代码独立性 | 每个 Demo 的代码和配置独立存放于自己的子目录 |
| **AI 编辑模式** | **全域编辑**：AI 拥有整个工作空间的读写权限，同时操作多个页面 |
| **页面路由** | 用户通过**自然语言**告诉 AI 操作哪个页面，无需手动切换 Demo |

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
    └── demos/               ← 所有 Demo 页面的根目录
        ├── {demoId1}/
        │   ├── index.tsx
        │   └── config.schema.json   ← 页面级配置定义
        ├── {demoId2}/
        │   ├── index.tsx
        │   └── config.schema.json
        └── .../
```

#### 项目级配置 vs 页面级配置

| 层级 | 文件 | 作用范围 |
|:-----|:-----|:---------|
| **项目级** | `workspace/project.config.schema.json` | 所有页面共享的配置（如Logo、品牌色、联系方式） |
| **页面级** | `workspace/demos/{demoId}/config.schema.json` | 仅当前页面使用的配置（如标题、内容、布局） |

配置值由配置面板（使用/预览页面）统一管理，运行时通过 `getDefaultValues(schema)` 从 Schema 的 `default` 字段推导。

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

> 项目尚未上线，所有类型变更**直接替换**，不保留任何旧类型 / `@deprecated` 兼容。

#### 替换类型：DemoFiles → MultiDemoFiles

当前 `DemoFiles`（`code` + `schema` 单文件对）已不再适用，**整体替换为** `MultiDemoFiles`：

```typescript
/**
 * 单个页面的代码 + Schema 对，仅作为 MultiDemoFiles 的子结构使用
 */
interface DemoFiles {
  code: string
  schema: string
}

/**
 * 多页面文件集合（取代旧的 DemoFiles）
 */
interface MultiDemoFiles {
  demos: Record<string, DemoFiles>   // demoId -> { code, schema }
  projectConfigSchema?: string       // project.config.schema.json 内容
}
```

所有 Session/Workspace 相关函数和 API 一次性切换为新类型，前端代码同步更新。**不做向后兼容层。**

#### 新增类型：DemoPageMeta

```typescript
/**
 * Demo 页面元数据
 */
interface DemoPageMeta {
  id: string            // 唯一标识，格式 "demo_{timestamp}_{random6}"，同时作为目录名
  name: string          // 显示名称，如 "首页"、"详情页"
  order: number         // 在页面列表中的展示顺序（小者在前）
  createdAt: number     // 创建时间戳
  updatedAt: number     // 最后更新时间戳
}
```

> **设计决策**：
> - 移除原方案中的 `path` 字段。路径可由 `id` 推导（`demos/{id}/`），冗余字段增加数据不一致风险。统一使用工具函数 `getDemoDirPath(demoId: string)` 生成路径。
> - 页面 ID 添加 6 位随机后缀（与现有 `workspaceId` 风格一致），避免快速 AI 操作中毫秒级时间戳碰撞。
> - `name` 等元数据持久化在每个页面目录下的 `.demo.json` 文件中，保存时由后端扫描 `demos/` 目录 + 读取各 `.demo.json` 合并得到完整 `demoPages` 数组。这样既以文件系统为真相来源，又能保留人类可读的 name。

#### 更新类型：Project

```typescript
interface Project {
  id: string
  name: string
  description?: string
  workspacePath: string
  demoPages: DemoPageMeta[]          // 【新增】Demo 页面列表
  versions: VersionInfo[]
  createdAt: number
  updatedAt: number
  lockedDependencies?: Record<string, string>
  thumbnail?: string
}
```

> **设计决策**：不引入 `hasProjectConfig` 字段。是否存在项目级配置由 `fs.existsSync(workspace/project.config.schema.json)` 实时判定，避免冗余字段与文件系统不一致。
>
> 也不引入 `migratedToMultiDemo` 字段——项目尚未上线，无旧数据需迁移。

#### 新增类型：DemoPageDetail

```typescript
/**
 * Demo 页面完整数据（含代码和页面级配置内容）
 */
interface DemoPageDetail {
  meta: DemoPageMeta
  code: string          // index.tsx 内容
  schema: string        // config.schema.json 内容
}

/**
 * 创建 Demo 页面请求
 */
interface CreateDemoPageRequest {
  name: string
}

/**
 * 更新 Demo 代码/配置请求（v6.0 按职责拆分为三种）
 */
interface UpdateDemoPageFilesRequest {
  code?: string                          // index.tsx 内容
  schema?: string                        // config.schema.json 内容
}

interface PatchDemoPageMetaRequest {
  name?: string
  order?: number
}
```

#### 新增类型：ProjectConfig

```typescript
/**
 * 项目级共享配置
 */
interface ProjectConfig {
  schema: string                          // project.config.schema.json 内容
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
 * 由项目配置 Schema + 页面配置 Schema 的 default 值推导合并而成
 */
interface MergedComponentProps {
  // 合并规则：
  // 1. 取 project.config.schema.json 定义的所有字段（从 default 提取值）
  // 2. 取 demos/{pageId}/config.schema.json 定义的所有字段（从 default 提取值）
  // 3. 字段必须互斥不重名（写入时已强校验，运行时再兜底检测）
  // 4. 配置面板展示合并后的所有字段供用户填写
  [key: string]: unknown
}
```

#### 新增类型：合并配置工具函数签名

```typescript
/**
 * 合并项目配置和页面配置的 Schema default 值，返回组件 Props
 * 这是运行时配置合并的核心逻辑
 */
function mergeConfigToProps(
  projectSchema: string | undefined,
  pageSchema: string
): Record<string, unknown> {
  // 1. 解析两个 Schema，从 default 字段提取默认值
  // 2. 兜底校验：若两个 Schema 字段集合存在交集，抛出 SchemaConflictError
  // 3. 合并不重名的字段，返回 Props 对象
}
```

### 2.4 共享配置的合并机制

页面组件在渲染时接收的 Props 来自两个配置 Schema 的 default 值合并：

```
┌─────────────────────────────────────────────┐
│              project.config.schema.json      │
│  { logo: { default: "" },                   │
│    brandColor: { default: "#3B82F6" } }     │
│                                              │
│                      +                       │
│                                              │
│         demos/home/config.schema.json        │
│  { title: { default: "首页" },              │
│    subtitle: { default: "副标题" } }        │
│                                              │
│                      =                       │
│                                              │
│         传入 home/index.tsx 的 Props          │
│  { logo: "", brandColor: "#3B82F6",         │
│    title: "首页", subtitle: "副标题" }      │
└─────────────────────────────────────────────┘
```

**冲突处理规则（禁止重名）：**

项目级配置（如 Logo、品牌色）的初衷是"全局共享，一处修改全站生效"。如果允许同名字段且页面级覆盖项目级，会导致"用户改了项目 Logo，但某页面因字段重名卡死在旧值"，与"全局共享"语义直接冲突。

因此采用**最严格的策略**：

- **禁止页面级 Schema 与项目级 Schema 出现同名字段**
- 写入时机校验：`PUT /api/projects/{id}/config`、`PUT /api/projects/{id}/demos/{demoId}` 等所有 Schema 写入入口在落盘前调用 `validateNoSchemaConflict(projectSchema, pageSchema)`，发现重名直接 400 拒绝
- 合并时机校验（兜底）：`mergeConfigToProps()` 检测重名时抛出 `SchemaConflictError`，由 PreviewPanel 捕获后展示明确错误提示
- AI prompt 中显式约束：页面 Schema 不得包含项目配置已有字段
- 配置面板以视觉分组区分来源（项目级 / 页面级），让用户感知字段所属层级

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

### 2.5 配置值推导机制

> **说明**：当前系统不持久化 configData，每次进入编辑页都靠 `getDefaultValues(loadedSchema)`（`packages/web/lib/validator.ts`）实时从 Schema 的 `default` 字段推导。本方案延续这一机制，**不引入 `config.data.json` 持久化文件**。如果未来需要"记住用户填写的配置值"，可在页面目录下新增 `config.data.json`，改动范围局部且向后兼容（找不到 data.json 就回退到 Schema default 推导）。

---

### 2.6 架构评估

#### 备选方案对比

| 方案 | 描述 | 主要问题 |
|:-----|:-----|:---------|
| **当前方案（分离 Schema + 运行时合并 + 运行时 Props 注入）** | 项目配置和页面配置分离，运行时合并 Props 注入到组件；页面组件**不需要**在 Props 接口中声明项目配置字段 | 放弃了项目配置字段的 TypeScript 静态校验，由运行时检测兜底 |
| 方案B：平铺 + 前缀约定 | 所有配置平铺在页面 Schema，约定 `project_` 前缀为共享项 | 项目配置变更时需手动同步每个页面；AI 难以记忆哪些字段是共享的 |
| 方案C：继承/组合 Schema | 页面 Schema 通过 `$ref` 引用项目 Schema | JSON Schema 跨文件 `$ref` 支持有限；实现复杂度高 |
| 方案D：要求 AI 同步所有页面 Props 接口 | AI 新增项目配置字段后，必须更新每个页面的 index.tsx Props 接口和渲染逻辑 | **5+ 页面时几乎必漏改**；token 消耗巨大；可靠性差，不可作为生产方案 |

#### 核心可靠性机制：运行时 Props 注入

> **设计决策（v6.0 关键变更）**：放弃"AI 必须同步所有页面 Props 接口"思路，改用运行时 Props 注入。
>
> **理由**：在 5+ 页面 / 复杂 Schema 场景下，单纯依赖 prompt 约束 AI 批量修改全部页面组件，几乎必然漏改某个页面，且单次响应 token 接近上限。这是核心可靠性问题，不是次要风险。

**机制说明：**

1. **页面组件只声明自己用到的字段**：`demos/{id}/index.tsx` 的 Props 接口里只写页面级字段；项目级字段（如 `logo`、`brandColor`）**不在 Props 接口中显式声明**。
2. **PreviewPanel / embed 编译时统一注入**：渲染前调用 `mergeConfigToProps()` 拿到合并值，作为 Props 整体传入组件。组件可通过 `(props as Record<string, unknown>).logo` 或解构默认值（`const { logo = '', brandColor = '#000', title } = props`）使用项目级字段。
3. **AI 仍需在使用项目级字段的页面组件渲染逻辑里显式取值**，但**不需要**修改其他不使用该字段的页面，AI 也**不需要**改动 Props 接口声明。
4. **TypeScript 静态校验在这一边界放弃**，由运行时合并 + Schema 冲突检测兜底。代价可控，换取强一致性。

**对 AI 的简化约束：**

```
## 项目级配置管理 - 简化约束

### 新增项目配置字段时
1. 创建或编辑 project.config.schema.json，加入新字段
2. 在确实需要展示该字段的页面，编辑 index.tsx 渲染逻辑（从 props 解构使用）
3. 不需要修改不使用该字段的页面
4. 不需要修改任何页面的 Props 接口声明（运行时注入）
5. 不需要把项目级字段写进任何页面的 config.schema.json

### 新增页面时
1. 创建目录和默认 index.tsx + config.schema.json
2. 默认 index.tsx 模板里通过解构方式取项目配置字段（如 const { logo } = props as Record<string, unknown>）
3. 不需要在 Props 接口或 page schema 里重复定义项目配置字段

### 删除项目配置字段时
1. 编辑 project.config.schema.json 移除字段
2. 在使用了该字段的页面渲染逻辑里清理引用
3. 其他页面无需改动
```

**Schema 冲突检测**（与 2.4 节联动）：所有 Schema 写入入口在落盘前运行 `validateNoSchemaConflict`，发现页面 schema 与项目 schema 重名直接拒绝。

#### 单文件组件约束的重要性

每个页面的 `index.tsx` 必须是**完全自包含的单文件组件**：
- 不使用 `import './xxx'` 形式的相对路径导入
- 所有样式用 Tailwind CSS（内联或 className）
- 所有依赖通过顶层 import 引入

这个约束让"运行时合并 + 注入 Props"成立——如果页面组件引入了外部资源文件，跨页面的配置共享会变得复杂（需要管理共享资源的路径）。

---

## 三、核心流程设计

### 3.1 Project 与 Demo 的创建流程

```
用户新建项目
      │
      ▼
创建项目目录和 project.json
  → demoPages 初始为空
  → 不存在 project.config.schema.json（即"无项目级配置"，由文件存在性实时判定）
      │
      ▼
创建 demos/demo_{timestamp}_{rand}/ 目录，生成默认 index.tsx + config.schema.json + .demo.json 元数据
      │
      ▼
project.json 中记录: demoPages: [{ id: "demo_{timestamp}_{rand}", name: "默认页面", order: 0, ... }]
      │
      ▼
用户进入编辑页，可通过 AI 自然语言或「页面」Tab 新建更多页面
也可通过 AI 自然语言创建项目级共享配置
```

> **设计决策**：
> - 默认页面 ID 统一使用 `demo_{timestamp}_{rand6}` 格式（含 6 位随机后缀），避免快速 AI 操作中毫秒级时间戳碰撞，与现有 `workspaceId` 风格一致。
> - 不使用 "default" 作为 ID，避免两种 ID 风格共存。
> - 默认 `order: 0`，新建后续页面递增。

### 3.2 Session 工作流程（AI 全域编辑模式）

```
用户打开项目编辑
      │
      ▼
创建临时 Workspace 并关联 Session
  workspace 路径：workspaces/{userId}/{projectId}/{wsId}/
  Session 路径：sessions/{userId}/{projectId}/{sid}/，仅含 .session.json 元数据，通过 workspaceId 引用 workspace
  workspace 内复制整个正式 workspace/ 含：
  - demos/ 子目录（所有页面的代码和配置）
  - project.config.schema.json（项目配置定义，如存在）
      │
      ▼
AI 代理获得整个 workspace 的读写权限
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
如果操作项目配置，AI 编辑 project.config.schema.json（是否存在项目配置由文件存在性实时判定，无需冗余字段）
      │
      ▼
文件变更追踪器自动检测所有文件变化
右侧面板实时显示所有变更文件列表（按页面分组 + 项目配置独立分组）
      │
      ▼
用户保存 → 整个临时 workspace 合并到正式 workspace 并生成新版本快照（项目维度，包含所有 Demo + 项目配置 + 配置值）
```

**关键设计理念：**

AI 不再需要 `activeDemoId` 参数。AI 拥有整个项目工作空间的完整上下文：
- 每次对话开始时，系统将当前所有页面的信息（名称、路径、关键摘要）注入到 AI 上下文中
- 用户通过自然语言中的页面名称或描述来指定目标
- AI 根据用户指令自行判断需要操作哪个（哪些）页面的哪些文件

> **重要术语说明**：本方案中"Session"专指 `sessions/{userId}/{projectId}/{sid}/` 目录下的元数据 session（含 `.session.json`），文件实际读写发生在其引用的临时 workspace（`workspaces/{userId}/{projectId}/{wsId}/`）。下文所有"Session 文件读写"语义均指通过 sessionId → workspaceId → workspace 文件操作的链路。

### 3.3 Workspace 文件读写适配

> **关键事实**：当前架构下，文件实际读写发生在 `workspaces/{userId}/{projectId}/{wsId}/`，而非 `sessions/{userId}/{projectId}/{sid}/`。
> Session 目录仅含 `.session.json` 元数据，通过 `meta.workspaceId` 引用 workspace。
> `getEditSession()` / `saveEditSession()` 均通过 `meta.workspaceId → findWorkspacePath() → getWorkspaceFiles()` 获取文件。
> 现存 `getSessionFiles()` 直接从 sessionPath 读，是历史遗留函数，**不再被主流程使用，本次升级直接删除**。

当前 `getWorkspaceFiles()` / `updateWorkspaceFiles()` 仅支持单页面文件对，需全面升级。

#### 当前实现（需替换）

```typescript
// fs-utils.ts 当前实现 — 仅读写 workspace 根目录的两个文件
export function getWorkspaceFiles(workspaceId: string): DemoFiles | null {
  const wsPath = findWorkspacePath(workspaceId);
  const codePath = path.join(wsPath, "index.tsx");
  const schemaPath = path.join(wsPath, "config.schema.json");
  // ...
}
```

#### 新实现

```typescript
/**
 * 获取 Workspace 中所有 Demo 页面的文件
 * 替代原 getWorkspaceFiles，支持多页面 + 项目配置
 */
export function getWorkspaceMultiDemoFiles(workspaceId: string): MultiDemoFiles | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath || !fs.existsSync(wsPath)) return null;

  const demosDir = path.join(wsPath, "demos");
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

  // 读取项目配置（存在性即代表"是否有项目级配置"）
  const projectConfigPath = path.join(wsPath, "project.config.schema.json");
  const projectConfigSchema = fs.existsSync(projectConfigPath)
    ? fs.readFileSync(projectConfigPath, "utf-8")
    : undefined;

  return { demos, projectConfigSchema };
}

/**
 * 更新 Workspace 中指定 Demo 页面的文件（含 .demo.json 元数据维护）
 */
export function updateWorkspaceDemoFiles(
  workspaceId: string,
  demoId: string,
  files: DemoFiles,
  meta?: Partial<DemoPageMeta>
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;

  const demoDir = path.join(wsPath, "demos", demoId);
  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }

  fs.writeFileSync(path.join(demoDir, "index.tsx"), files.code, "utf-8");
  fs.writeFileSync(path.join(demoDir, "config.schema.json"), files.schema, "utf-8");

  // 更新或写入 .demo.json 元数据（name / order / 时间戳等）
  if (meta) {
    const metaPath = path.join(demoDir, ".demo.json");
    const existing = fs.existsSync(metaPath)
      ? JSON.parse(fs.readFileSync(metaPath, "utf-8"))
      : {};
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ ...existing, ...meta, updatedAt: Date.now() }, null, 2),
      "utf-8",
    );
  }
  return true;
}

/**
 * 获取 Workspace 中单个 Demo 页面的文件（用于代码编辑 Tab 切换）
 */
export function getWorkspaceDemoPageFiles(
  workspaceId: string,
  demoId: string
): DemoFiles | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const demoDir = path.join(wsPath, "demos", demoId);
  const codePath = path.join(demoDir, "index.tsx");
  const schemaPath = path.join(demoDir, "config.schema.json");

  if (!fs.existsSync(codePath) || !fs.existsSync(schemaPath)) return null;

  return {
    code: fs.readFileSync(codePath, "utf-8"),
    schema: fs.readFileSync(schemaPath, "utf-8"),
  };
}
```

#### sessionId → workspaceId 适配层

API 路由若保留 `/api/sessions/[sessionId]/...` 入口语义，内部实现先把 sessionId 解析为 workspaceId，再调用 workspace 维度的函数。统一的适配 helper：

```typescript
// 例：在 sessions/[sessionId]/files 路由内
const session = getEditSession(sessionId);
if (!session) return notFound();
const files = getWorkspaceMultiDemoFiles(session.workspaceId);
```

### 3.4 保存流程

```
用户点击保存
      │
      ▼
备份整个临时 workspace（含 demos/ 下所有子目录 + 各 .demo.json）
  → snapshot/{versionId}/
      │
      ▼
临时 workspace 覆盖正式 workspace/
      │
      ▼
清理系统文件（.opencode、.session.json、.workspace.json）
      │
      ▼
后端重新扫描 demos/ 目录，按"目录列表（真值来源）+ 各 .demo.json（元数据来源）"
合并生成 project.json 中的 demoPages 数组：
  - 目录中存在但 demoPages 数组缺失 → 新增（name 取 .demo.json 中的值，否则用 id 兜底）
  - demoPages 数组中存在但目录已删除 → 移除
  - 两者都存在 → 以 .demo.json 为准更新 name / order / 时间戳
      │
      ▼
"是否存在项目级配置"由文件存在性实时判定，无需在 project.json 中保存任何标记字段
      │
      ▼
记录版本信息，清理旧版本
      │
      ▼
删除临时 workspace 和 Session 元数据，标记会话已保存
```

> **关键改进**：
> - 保存时由后端扫描 `demos/` 目录 + 读取各 `.demo.json` 来同步 `demoPages`，而非依赖前端或 AI 传入。`name` 等元数据通过 `.demo.json` 持久化，避免目录扫描丢失人类可读名称。
> - 不再在 `project.json` 中持久化 `hasProjectConfig` 字段——读取时实时检测 `workspace/project.config.schema.json` 即可，避免冗余字段与文件系统不一致。

### 3.5 版本恢复流程

```
用户选择恢复版本 v{N}
      │
      ▼
备份当前 workspace → 创建新版本 v{N+1}（备注："从 v{N} 恢复"）
      │
      ▼
从 snapshot/{projectId}/v{N}/ 恢复整个 workspace（含所有 Demo + 项目配置）
      │
      ▼
后端重新扫描 demos/ 目录 + .demo.json，同步 project.json 的 demoPages 列表
      │
      ▼
返回新版本号 v{N+1}
```

版本恢复时，所有 Demo 一起恢复到目标版本状态，保证完整性。

> **简化说明**：项目尚未上线，版本快照从一开始就采用新结构（含 `demos/` 子目录），不存在"旧结构快照"，无需任何自动迁移逻辑。

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

> **`[编辑配置]` 按钮行为**：点击后弹出"项目配置 Schema JSON 编辑器"模态（与 Tab 2 代码编辑同款 Monaco 编辑器界面），用于直接编辑 `project.config.schema.json`。**面向高级用户**，普通用户应优先通过 AI 对话「给项目加个 Logo 配置」类自然语言完成。
> **`[+ 新建页面]` 按钮行为**：弹出名称输入框 → 调用 `POST /api/projects/{id}/demos`（必带当前 sessionId）→ 写入临时 workspace 的 `demos/{newId}/`，并刷新页面表格。

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
| **"给项目增加一个Logo配置"** | 编辑 project.config.schema.json（落盘前自动校验字段冲突）；**无需修改任何页面 Props 接口**——运行时 Props 注入会自动把 logo 注入到所有 iframe |
| **"项目配置里再加个品牌色"** | 仅编辑 project.config.schema.json |
| **"删除项目配置中的联系方式"** | 仅编辑 project.config.schema.json；同时弹出"以下页面引用了已删除字段：…"提示用户审视 |

> **重要**：
> - AI 执行页面创建/删除/重命名/排序时，通过**专用 API 端点**同步 `demoPages` 元数据，AI 不直接修改 `project.json`（物理上也修改不到，project.json 不在 workspace 内）
> - AI 增删项目级配置字段时，**只动 `project.config.schema.json` 这一个文件**——运行时 Props 注入机制（详见 4.6/7.5）会自动把项目级字段以 `window.__DEMO_PROPS__` 形式喂到 iframe，组件无需在 Props 接口中显式声明这些字段。这从根本上消除了"AI 必须批量同步所有页面 Props"的可靠性风险。
> - `hasProjectConfig` 标记不存在——是否存在项目级配置由后端 `fs.existsSync(workspace/project.config.schema.json)` 实时判定，无需任何 sync API。

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
| **配置值来源** | 从 Schema 的 `default` 字段推导（`getDefaultValues`），不持久化用户填写值 |
| **表单生成** | 根据 Schema 定义自动生成对应的表单控件（文本 → 输入框、图片 → 上传组件、颜色 → 取色器） |
| **配置值校验** | 根据 JSON Schema 的 type/enum/format 等约束校验用户输入 |

**配置值的来源：**

配置值统一从 Schema 的 `default` 字段推导，不单独持久化：

```
workspace/
├── project.config.schema.json   ← 定义"有什么配置项" + default 值（AI 维护）
└── demos/home/
    ├── config.schema.json       ← 定义"有什么配置项" + default 值（AI 维护）
    └── index.tsx
```

### 4.6 预览机制适配

> **关键事实校正（v6.0）**：当前预览**不**是 Sandpack。`packages/web/components/demo/PreviewPanel.tsx` 用 `<iframe>` + `generateIframeHtml()`（见 `packages/web/src/lib/iframe-template.ts`），通过 `POST /api/compile`（body: `{ sessionId, code }`）拿到编译产物。下文一切适配围绕"iframe + /api/compile"展开。

#### PreviewPanel 适配

当前 PreviewPanel 接收单个 `code` + 配置值，需适配多页面结构：

**单页模式预览流程：**

```
用户选择预览页面（如"首页"）
      │
      ▼
从 workspace 读取 demos/home/index.tsx（组件代码）
      │
      ▼
读取 project.config.schema.json（项目配置 Schema，如存在）
读取 demos/home/config.schema.json（页面配置 Schema）
      │
      ▼
调用 mergeConfigToProps() 从两个 Schema 的 default 值推导合并 Props（运行时注入项目级字段）
      │
      ▼
将 code 提交至 POST /api/compile，得到编译产物
      │
      ▼
generateIframeHtml() 生成 iframe HTML（含 mergedProps 注入），载入 Blob URL 渲染
```

**关键变更点：**

| 当前实现 | 新实现 |
|:---------|:-------|
| `PreviewPanel code={code} configData={configData}` | `PreviewPanel code={activePageCode} configData={mergedProps}` |
| `configData` 来自 `getDefaultValues(schema)` | `configData` 来自 `mergeConfigToProps(projectSchema, pageSchema)`（从 Schema default 推导合并） |
| `/api/compile` 编译根目录 `index.tsx` | `/api/compile` 编译 `demos/{demoId}/index.tsx`（请求体新增 `demoId` 或由前端自行传入对应代码） |
| 切换页面需重新加载 code + schema | 切换页面重新加载 code + schema |

**切换预览页面时的策略（iframe + /api/compile）：**

- 切换页面时把新的 `code` 提交给 `/api/compile`，得到新的编译产物 → 生成新的 Blob URL → 替换 iframe `src`
- 旧的 Blob URL 在替换前 `URL.revokeObjectURL` 释放
- 不存在"销毁/重建 Sandpack 实例"的概念，本质上是"换 iframe 的输入产物"
- 编译结果可基于 `(projectId, demoId, codeHash)` 在前端做短期缓存，避免快速来回切换时反复编译

#### 嵌入页面（embed）适配

> **状态说明**：`/api/embed/[projectId]/iframe` 路由当前**尚未实现**（项目里仅有 `ai/auth/demos/projects/sessions/workspaces/compile/generate-schema` 等路由）。下面所述并非"对旧路由的适配"，而是**本方案一期内全新引入的路由**。

| 行为 | 设计 |
|:-----|:-----|
| 路由 | `GET /api/embed/[projectId]/iframe?page={demoId}`（**一期新建**） |
| `page` 参数 | **必填**，指定要嵌入的页面；缺失时直接返回 400 |
| 读取 | `workspace/demos/{demoId}/index.tsx` + `workspace/demos/{demoId}/config.schema.json` + `workspace/project.config.schema.json`（如存在） |
| 配置合并 | 调用 `mergeConfigToProps()` 合并项目配置和页面配置为运行时 Props |
| 编译 | 复用 `/api/compile`（或同等编译逻辑）生成产物，注入到 iframe 模板 |

> **简化说明**：项目尚未上线，无任何已发布的嵌入链接，因此**不提供** `page` 参数默认值，**不做向后兼容**。所有调用方一律传入显式 `demoId`。

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

**Intersection Observer 驱动的 mount / unmount 策略**：

由于每个宫格内部都是一个 iframe（加载 `/api/compile` 输出的 React 渲染产物），完整持有 React 渲染上下文（DOM + JS 堆 + 事件循环）。5 个以上同时 mount 内存压力显著。

策略（v6.0 明确）：

1. 视口可见的 iframe + 上下各 1 个 buffer 卡片视为"活跃"，正常 mount。
2. 离开活跃区的卡片**直接 unmount**（卸载 iframe 节点 + `URL.revokeObjectURL` 释放对应 Blob URL），位置仍占据格子但不持有任何渲染上下文。
3. 重新进入活跃区时按需 mount：重新申请编译产物（或命中前端短期缓存）→ 生成 Blob URL → 挂载 iframe。
4. 同时活跃数量上限通过 `gridColumns × (visibleRows + 2 buffer)` 推导，例如 3 列 × 3 行可见 + 上下各 1 行 buffer = 同时活跃 9 卡片左右。
5. **不替换为静态截图占位符**——保留实现简单性，未来若需要再补静态预览。

```typescript
// 使用 Intersection Observer 控制 iframe 渲染
const visiblePages = useIntersectionObserver(containerRef, demoPages)
```

`scale = 设计宽度 / 格子实际宽度`，即缩放因子。

**为什么不选其他方案：**

| 方案 | 问题 |
|:-----|:-----|
| Puppeteer 服务端截图 | 需要额外服务、截图延迟、复杂 |
| 多个独立编译产物常驻 mount（无 unmount） | 每个页面一个 iframe + 编译产物常驻，5+ 页面时内存溢出 |
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

### 5.2 AI 代理边界（无需特别防护）

> **关键事实校正（v6.0）**：`project.json` 位于 `projects/{id}/project.json`，**不在 workspace 目录内**。AI 在临时 workspace 里编辑根本看不到也碰不到 `project.json`，因此"AI 误改 project.json"在物理上**不会发生**。
>
> 原方案中的"文件变更追踪器拦截 project.json 修改"、"agent.md 禁止规则"等防护层皆为多余，全部删除。

**实际边界（一句话）：**

> 因 `project.json` 物理上不在 workspace 内，AI 无法直接修改；所有 demoPages 元数据变更必须通过专用 API 端点（创建/删除/重命名页面），保存时由后端扫描 `demos/` 目录 + 各 `.demo.json` 同步生成。

页面管理 API 端点（与 5.3 节保持一致）：

- `POST /api/projects/{id}/demos` — 创建页面
- `DELETE /api/projects/{id}/demos/{demoId}` — 删除页面
- `PATCH /api/projects/{id}/demos/{demoId}` — 更新页面元数据（name/order）

是否存在项目级配置由 `fs.existsSync(workspace/project.config.schema.json)` 实时判定，**无 sync-config API、无 `hasProjectConfig` 字段**。

### 5.3 代理指令更新

> **结构调整（v6.0）**：当前 agent prompt 以模板字符串硬编码在 `packages/web/src/lib/workspace-manager.ts` 的 `injectOpencodeAgentConfig` 函数（22–125 行）中，**不存在外部 markdown 文件**。本方案第一步是把 prompt 抽离为外部模板文件 `packages/web/src/lib/agents/demo-generator.template.md`，由 `injectOpencodeAgentConfig` 在运行时读取并写入 workspace 的 `.opencode/agents/demo-generator.md`。后续所有 prompt 调整都直接编辑这个外部模板，避免在 TS 字符串中维护多页面 / 多场景版本。

抽离完成后，新版 prompt 内容如下（采用运行时 Props 注入约束，简化 AI 心智负担）：

~~~
# Demo Generator Agent

你是 OpenCode Workbench 的项目 Demo 生成专家。
你的工作区是一个完整的项目工作空间，包含多个 Demo 页面。

## 工作空间结构

  workspace/
  ├── project.config.schema.json    ← 项目级共享配置定义（可选）
  └── demos/
      ├── {demoId1}/
      │   ├── index.tsx              ← React 组件代码
      │   ├── config.schema.json     ← 页面级配置定义
      │   └── .demo.json             ← 页面元数据（name / order）
      ├── {demoId2}/
      │   ├── index.tsx
      │   ├── config.schema.json
      │   └── .demo.json
      └── .../

每个页面对应 demos/ 下一个独立子目录。
项目级配置 project.config.schema.json 定义所有页面共享的配置项。
是否存在项目级配置由文件本身的存在性决定，没有冗余字段。

## 页面信息获取

会话开始时你会收到当前项目所有页面的清单（由后端实时构建注入）：

  {
    "projectName": "我的项目",
    "hasProjectConfig": false,
    "pages": [
      { "id": "demo_1714824000000_a1b2c3", "name": "首页", "order": 0 },
      { "id": "demo_1714824100000_d4e5f6", "name": "详情页", "order": 1 }
    ]
  }

> 上下文中的 `hasProjectConfig` 仅作为运行时提示由后端注入，不写回 project.json。

如果需要了解某个页面的当前代码，read 对应的 demos/{id}/index.tsx 和 demos/{id}/config.schema.json。
如果 hasProjectConfig 为 true，可通过 read project.config.schema.json 了解项目级共享配置。

## 页面内容编辑

用户通过自然语言指定要修改哪个页面。你需要自主匹配页面名称：
- "修改首页" → demos/{首页 demoId}/
- "给详情页加个配置" → demos/{详情页 demoId}/

如果页面名称有歧义，请向用户确认。

## 页面管理操作

页面管理（创建 / 删除 / 重命名 / 改顺序）必须通过 API 端点执行：

- 创建页面：调用 `POST /api/projects/{projectId}/demos`，后端创建目录、写入默认 index.tsx + config.schema.json + .demo.json，并更新 demoPages
- 删除页面：调用 `DELETE /api/projects/{projectId}/demos/{demoId}`，后端删除目录并更新 demoPages
- 重命名 / 改顺序：调用 `PATCH /api/projects/{projectId}/demos/{demoId}`，更新 .demo.json 的 name / order

## 项目级配置管理（运行时注入，简化约束）

项目级配置允许定义所有页面共享的配置项（如 Logo、品牌色）。
**关键机制：项目级字段不通过 Props 接口声明，由 PreviewPanel / embed 在编译时统一注入到组件 props。**

### 新增项目配置字段
1. 创建或编辑 workspace/project.config.schema.json，加入新字段
2. 在确实需要展示该字段的页面，编辑 index.tsx 渲染逻辑（从 props 解构使用）
   例：`const { logo = '' } = props as Record<string, unknown>`
3. **不需要**修改不使用该字段的页面
4. **不需要**改动任何页面的 Props 接口声明
5. **不需要**把项目级字段写进任何页面的 config.schema.json

### 删除项目配置字段
1. 编辑 project.config.schema.json 移除字段
2. 在使用了该字段的页面渲染逻辑里清理引用
3. 其他页面无需改动
4. 如果所有共享字段都被删除（properties 数为 0），删除整个 project.config.schema.json 文件

### 修改项目配置字段
1. 编辑 project.config.schema.json 的对应字段属性
2. 无需更新页面组件

### 重要约束（强校验）
- **禁止页面级 Schema 与项目级 Schema 出现同名字段** —— 后端在所有 Schema 写入入口运行 `validateNoSchemaConflict`，重名直接拒绝
- 新建页面时使用默认模板（在 Props 中**只**声明页面级字段，项目级字段通过 props 解构使用）

## 代码质量标准（每个页面内）

每个页面的 index.tsx 要求：
- 使用 TypeScript，Props 接口**只**声明该页面 config.schema.json 中定义的字段
- 项目级字段不在 Props 接口中声明，使用时从 props 解构（运行时注入）
- 使用 Tailwind CSS 进行样式设计
- 可使用 shadcn/ui 组件库、lucide-react 等
- 导出默认组件
- 代码完整可运行，包含必要的 import
- 所有代码在单一文件中，不使用 import './xxx'

每个页面的 config.schema.json 要求：
- 符合 JSON Schema 规范
- properties 与该页面特有的字段一一对应（**严禁**包含项目配置中已有的字段）
- 每个属性有合理的 default 值

## 禁止行为
- ❌ 修改 .session.json、.opencode/、.workspace.json 等系统文件
- ❌ 在页面 config.schema.json 中重复定义项目配置已有的字段（写入会被后端拒绝）
- ❌ 修改任何 .config.data.json（配置值由用户在配置面板中填写，当前版本不持久化）
- ❌ 在单个页面中使用 import './xxx' 相对路径导入
- ❌ 在 Props 接口中重复声明项目级字段（违反运行时注入约定）
~~~

> 关于"AI 不能直接修改 project.json"——这是物理事实（project.json 不在 workspace 内），prompt 中无需也不应再设专门条款。

### 5.4 系统上下文注入

每次创建 Agent 会话时，系统自动注入页面清单。`hasProjectConfig` 由后端实时检测文件存在性得到，**不**从 project.json 读：

```typescript
function buildAgentContext(
  projectName: string,
  demoPages: DemoPageMeta[],
  workspacePath: string,
): string {
  const hasProjectConfig = fs.existsSync(
    path.join(workspacePath, 'project.config.schema.json')
  )

  const pageList = demoPages
    .slice()
    .sort((a, b) => a.order - b.order)
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
页面管理操作（创建/删除/重命名）请通过 API 端点执行。
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

分组展示优先级：项目配置 → 各页面（按 order 升序，再按 name 兜底）

> **简化说明**：不再需要"文件变更追踪器拦截 project.json 修改"——项目元数据物理上不在 workspace 内，AI 既看不到也写不到。`project.json` 的更新由专用 API 和保存流程负责。

### 5.6 Schema 自动生成机制适配

当前编辑页有防抖触发 Schema 自动重新生成的逻辑（`/api/generate-schema`），基于 AI 更新后的代码自动生成对应的 config.schema.json。多 Demo 后需适配：

| 当前行为 | 新行为 |
|:---------|:-------|
| 生成根目录 `config.schema.json` | 生成 `demos/{demoId}/config.schema.json` |
| 请求参数 `{ sessionId }` | 请求参数 `{ sessionId, demoId }` |
| 不区分项目配置/页面配置 | 仅生成页面级 Schema，项目配置 Schema 不自动生成（由 AI 手动管理） |
| 直接采用 AI 推断的全部字段 | 服务端从生成结果中**减去项目级字段**，避免重复定义 |

**API 变更**：

- `POST /api/generate-schema` 增加 `demoId` 必填参数，指定为哪个页面生成 Schema。
- 生成流程在写入页面 schema 前，读取 `workspace/project.config.schema.json`（如存在）的 properties 字段集，自动从生成结果中过滤掉与项目级冲突的字段，并在响应里告知前端"已自动剔除 X 个项目级字段"。
- 写入前再调用一次 `validateNoSchemaConflict` 兜底，与 2.4 节保持一致。这样即使 AI 误把项目级字段写进页面 Props 推断结果，也不会污染最终落盘的 page schema。

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
│   [创建 project.config.schema.json — 定义 logo 字段]        │
│   [更新 demos/home/index.tsx — 渲染逻辑解构使用 logo]        │
│   [更新 demos/detail/index.tsx — 渲染逻辑解构使用 logo]      │
│   [更新 demos/about/index.tsx — 渲染逻辑解构使用 logo]       │
│                                                             │
│   已创建项目级共享配置，定义了 logo 字段。三个页面的渲染逻辑 │
│   都通过 props 解构方式接收 logo（运行时由系统注入），无需   │
│   各自声明 Props 接口字段。用户只需上传一次 Logo，所有页面    │
│   自动展示。                                                 │
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

> 项目尚未上线，**禁止双轨制**。所有路由一次性确定为最终形态：保留 `/api/demos/*`（项目集合操作）+ 新增 `/api/projects/[projectId]/*`（项目内子资源操作）。命名差异是物理目录现状的妥协，后续可统一改名，**不做"一期保留二期废弃三期清理"的过渡方案**。

### 6.1 路由清单（最终形态）

#### 6.1.1 项目集合（沿用 `/api/demos/*` 命名）

| 方法 | 路由 | 说明 |
|:-----|:-----|:-----|
| `GET` | `/api/demos` | 列出所有项目；返回项目摘要（含 `demoCount` 字段） |
| `POST` | `/api/demos` | 创建项目（内部使用新目录结构 `demos/{demoId}/`，初始化一个默认页面） |
| `GET` | `/api/demos/[id]` | 获取项目详情（含 `demoPages` 列表） |
| `PATCH` | `/api/demos/[id]` | 更新项目名称等元数据 |
| `DELETE` | `/api/demos/[id]` | 删除项目 |

#### 6.1.2 项目内 Demo 页面（新增）

| 方法 | 路由 | 说明 |
|:-----|:-----|:-----|
| `GET` | `/api/projects/[projectId]/demos` | 列出项目所有 Demo 页面（含 `DemoPageMeta`，按 `order` 排序） |
| `POST` | `/api/projects/[projectId]/demos` | 在项目中创建新 Demo 页面，**必须**带 `sessionId` 参数（写入临时 workspace，避免绕过版本管理） |
| `GET` | `/api/projects/[projectId]/demos/[demoId]` | 获取页面元信息（不含文件正文） |
| `PUT` | `/api/projects/[projectId]/demos/[demoId]/files` | **拆分专用**：仅更新代码/配置文件（`index.tsx` / `config.schema.json`）。内部调用 `validateNoSchemaConflict` 防字段冲突 |
| `PATCH` | `/api/projects/[projectId]/demos/[demoId]` | **拆分专用**：仅更新元数据（`name` / `order`），不动文件 |
| `DELETE` | `/api/projects/[projectId]/demos/[demoId]` | 删除页面（同时清理 `demoPages` 数组、`.demo.json`、整个 `demos/{demoId}/` 目录） |

> **拆分原因**：原 v5.0 的单一 PUT 同时改 code/schema/name 三类资源，职责过载、缓存策略难定。拆成两个端点后，前端可只调需要的接口，写入冲突也更易定位。

#### 6.1.3 项目级共享配置（新增）

| 方法 | 路由 | 说明 |
|:-----|:-----|:-----|
| `GET` | `/api/projects/[projectId]/config` | 获取项目级共享配置 Schema（不存在返回 `null`） |
| `PUT` | `/api/projects/[projectId]/config` | 更新项目级共享配置 Schema；落盘前调用 `validateNoSchemaConflict` 检测与所有页面 Schema 字段冲突 |
| `DELETE` | `/api/projects/[projectId]/config` | 删除项目级共享配置（直接 `fs.unlinkSync` 移除 `project.config.schema.json`） |

> 已**删除** `POST /api/projects/[projectId]/demo-pages/sync-config`：v6.0 取消了 `hasProjectConfig` 持久字段，运行时直接 `fs.existsSync(project.config.schema.json)` 实时判定（详见审查意见第 23 条），无需单独维护同步端点。

#### 6.1.4 Session 文件路由（多页面适配）

| 方法 | 路由 | 说明 |
|:-----|:-----|:-----|
| `GET` | `/api/sessions/[sessionId]/files` | 返回 `MultiDemoFiles` 结构（所有 Demo 文件 + 项目级 schema + `demoPages` 元数据）。**不再回退 `DemoFiles` 单文件格式** |
| `GET` | `/api/sessions/[sessionId]/files/[demoId]` | 获取 Session 中指定页面的 `DemoFiles`（code + schema） |
| `PUT` | `/api/sessions/[sessionId]/files/[demoId]` | 更新 Session 中指定页面的 `DemoFiles`；内部 `sessionId → workspaceId → 文件操作`，写入临时 workspace |

> Session 与 Workspace 的事实关系（见审查意见第 5 条）：Session 仅持元数据，文件落地点是 `findWorkspacePath(workspaceId)`。所有 Session 文件路由内部必须先解析 `meta.workspaceId`，再走 `getWorkspaceMultiDemoFiles` / `updateWorkspaceDemoFiles`。

#### 6.1.5 嵌入与生成（一次性新建）

| 方法 | 路由 | 说明 |
|:-----|:-----|:-----|
| `GET` | `/api/projects/[projectId]` | 返回结果包含 `demoPages`（**不再**返回 `hasProjectConfig`、`migratedToMultiDemo`，前者改为运行时实时判定，后者已删除） |
| `POST` | `/api/generate-schema` | 接受 `code` + `demoId` + `excludeFields`（项目级字段集合）；自动生成 Schema 时**减去**项目级字段，避免与项目 Schema 字段冲突（与第 6.1.3 节联动） |
| `GET` | `/api/embed/[projectId]/iframe?page={demoId}` | **一次性新建路由**（项目未上线，原本不存在）。`page` 参数**必填**（不设默认值，没有"旧链接"需要兼容） |

### 6.2 前端 API Client（最终版）

```typescript
class ProjectApiClient {
  // ============ 项目集合（沿用 /api/demos/*）============
  async listProjects(): Promise<ProjectSummary[]>
  async createProject(name: string): Promise<Project>
  async getProject(projectId: string): Promise<Project>
  async updateProject(projectId: string, patch: { name?: string }): Promise<void>
  async deleteProject(projectId: string): Promise<void>

  // ============ 项目内 Demo 页面 ============
  async listDemoPages(projectId: string): Promise<DemoPageMeta[]>
  async createDemoPage(
    projectId: string,
    name: string,
    sessionId: string,           // ← 强制要求，写入临时 workspace
  ): Promise<DemoPageMeta>
  async getDemoPageMeta(projectId: string, demoId: string): Promise<DemoPageMeta>

  // 拆分后的更新接口（按职责分流）
  async updateDemoPageFiles(
    projectId: string,
    demoId: string,
    files: { code?: string; schema?: string },
  ): Promise<void>

  async patchDemoPageMeta(
    projectId: string,
    demoId: string,
    patch: { name?: string; order?: number },
  ): Promise<void>

  async deleteDemoPage(projectId: string, demoId: string): Promise<void>

  // ============ 项目级共享配置 ============
  async getProjectConfig(projectId: string): Promise<ProjectConfigSchema | null>
  async updateProjectConfig(projectId: string, schema: string): Promise<void>
  async deleteProjectConfig(projectId: string): Promise<void>

  // ============ Session 文件（多页面） ============
  async getSessionMultiDemoFiles(sessionId: string): Promise<MultiDemoFiles>
  async getSessionDemoPageFiles(sessionId: string, demoId: string): Promise<DemoFiles>
  async updateSessionDemoPageFiles(
    sessionId: string,
    demoId: string,
    files: DemoFiles,
  ): Promise<void>

  // 注意：v5.0 的 syncProjectConfig 已移除（hasProjectConfig 改为运行时实时判定）
}
```

### 6.3 后端共享校验逻辑

为保证多入口写入一致性，所有 Schema 写入端点（`PUT .../config`、`PUT .../files`、`POST /api/generate-schema`）都共享以下校验函数：

```typescript
// packages/web/src/lib/schema-validator.ts
export function validateNoSchemaConflict(
  projectSchema: JsonSchema | null,
  pageSchemas: Record<string, JsonSchema>,
): { ok: true } | { ok: false; conflicts: string[] }

export function validateConfigDataMatchesSchema(
  schema: JsonSchema,
  data: Record<string, unknown>,
): { ok: true } | { ok: false; errors: ValidationError[] }
```

任何写入入口在落盘前必须调用 `validateNoSchemaConflict`，发现重名字段直接返回 400 + 详细错误（前端展示在配置编辑界面）。详见 5.3 节的硬约束规则。

---

## 七、实施计划

### 7.1 实施阶段概览

```
阶段一       阶段二        阶段三           阶段四
数据模型 →   API 路由 →    AI 代理适配 →    前端 UI 改造
+ FS 层      （含校验层）  （prompt 抽离）   （3 Tab + 配置面板）
1-2 天       1-2 天        1 天             2-3 天
```

> 项目未上线，**不做迁移阶段**。新建项目从一开始就是多页面结构，无旧数据。每个阶段都包含明确的测试任务，不放到最后单独跑。
> 总工时 ≈ 5-8 天（v5.0 含阶段五 1 天 + 兼容代码 ≈ 7-10 天，v6.0 砍掉兼容工作量，但增加运行时 Props 注入和 Schema 校验层，净节省 1.5-2 天）。

### 7.2 阶段一：数据模型 + 文件系统层（1-2 天）

**涉及文件：**
- `packages/shared/src/workspace.ts` — 新增 `DemoPageMeta`、`MultiDemoFiles`、`DemoFiles` 等类型；更新 `Project` 接口（无 `migratedToMultiDemo`、无 `hasProjectConfig`）
- `packages/shared/src/index.ts` — 导出新类型
- `packages/web/src/lib/fs-utils.ts` — 新增 Workspace 多页面 CRUD（基于 workspaceId，不基于 sessionId）
- `packages/web/src/lib/schema-validator.ts` — 新建：Schema 冲突校验
- `packages/web/src/lib/runtime-props.ts` — 新建：项目 + 页面 Schema default 值合并（运行时 Props 注入用）
- `packages/web/__tests__/fs-utils-multi-demo.test.ts` — 新建：单元测试

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| 定义新类型 | `DemoPageMeta`（含 `order`）、`DemoFiles`（不再 `@deprecated`，作为单页面文件单元类型保留）、`MultiDemoFiles`、`MergedComponentProps`、`CreateDemoPageRequest`、`UpdateDemoPageFilesRequest` / `PatchDemoPageMetaRequest`（按职责拆分） |
| 更新 `Project` | 添加 `demoPages: DemoPageMeta[]`；**禁止**添加 `hasProjectConfig`、`migratedToMultiDemo` 字段 |
| 新增 Workspace 多页面函数 | `getWorkspaceMultiDemoFiles(workspaceId)`、`updateWorkspaceDemoFiles(workspaceId, demoId, files, meta?)`、`createWorkspaceDemoPage(workspaceId, name)`、`deleteWorkspaceDemoPage(workspaceId, demoId)` —— 均通过 `findWorkspacePath(workspaceId)` 解析路径 |
| 新增项目级配置函数 | `getProjectConfigSchema(workspacePath)`、`saveProjectConfigSchema(workspacePath, schema)`、`deleteProjectConfigSchema(workspacePath)` |
| 新增 Schema 校验层 | `validateNoSchemaConflict(projectSchema, pageSchemas)` 返回 `{ ok, conflicts? }` |
| 新增运行时 Props 合并 | `mergeConfigToProps(projectSchema, pageSchema)` —— 从两个 Schema 的 default 值推导合并；项目级字段与页面级字段禁止重名 |
| 新增 `.demo.json` 元数据持久化 | 每个 `demos/{demoId}/.demo.json` 持有 `name`/`order`/`createdAt`/`updatedAt`；扫描 `demos/` 时合并"目录列表"与".demo.json" |
| 页面 ID 生成 | `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` 防毫秒级碰撞 |
| 更新 `ensureWorkspaceFiles` | 创建 `demos/{generatedId}/` 子结构（不再创建根目录的 `index.tsx`） |
| 更新 `createProject` | 直接生成 `demos/{generatedId}/` 默认结构；初始 `demoPages` 仅含一个默认页面 |
| **删除**旧函数 | 删除 `getSessionFiles()`、`updateSessionFiles()` 等基于 sessionId 直接读 `sessionPath` 的兼容层（实测主流程未使用） |

**测试任务（必做）：**
- 多页面 CRUD（创建/读/更新/删除/列表）单测
- `mergeConfigToProps` 项目级 + 页面级 Schema default 合并 单测
- `validateNoSchemaConflict` 同名字段冲突检测 单测
- 页面 ID 碰撞概率检验（Monte Carlo 1k 次同毫秒生成应 0 重复）
- `.demo.json` 缺失/损坏时的容错测试

### 7.3 阶段二：API 路由扩展（1-2 天）

**涉及文件：**
- `packages/web/src/app/api/projects/[projectId]/demos/route.ts` — 列表/创建（需 `sessionId`）
- `packages/web/src/app/api/projects/[projectId]/demos/[demoId]/route.ts` — GET 元信息 + PATCH 元数据 + DELETE
- `packages/web/src/app/api/projects/[projectId]/demos/[demoId]/files/route.ts` — PUT 文件
- `packages/web/src/app/api/projects/[projectId]/config/route.ts` — 项目配置 Schema CRUD
- `packages/web/src/app/api/sessions/[sessionId]/files/route.ts` — 改为返回 `MultiDemoFiles`（不再回退 `DemoFiles` 单文件格式）
- `packages/web/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts` — 单页面文件读写
- `packages/web/src/app/api/embed/[projectId]/iframe/route.ts` — **新建**（项目原本就没有 embed 路由）
- `packages/web/src/app/api/generate-schema/route.ts` — 增加 `demoId` + `excludeFields` 参数
- `packages/web/src/lib/project-api.ts` — 重写 `ProjectApiClient`（详见 6.2 节）
- `packages/web/__tests__/api/*` — 集成测试

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| 实现项目集合路由 | `/api/demos`、`/api/demos/[id]` 内部统一切换到 `demos/` 子目录读写 |
| 实现 Demo 页面路由 | 严格按 6.1.2 节拆分（GET/POST 列表 + GET/PATCH/DELETE 单条 + 两个独立 PUT 子资源） |
| **强制 `sessionId` 参数** | `POST /api/projects/[projectId]/demos` 路由中校验 `sessionId` 存在且属于当前用户的活跃 Session；写入 `findWorkspacePath(meta.workspaceId)` |
| 实现项目配置路由 | 仅当 `project.config.schema.json` 物理存在时才返回；落盘前调用 `validateNoSchemaConflict` |
| 实现 Session 文件路由 | `GET .../files` 返回 `MultiDemoFiles`；`GET/PUT .../files/[demoId]` 解析 `meta.workspaceId` 后操作 workspace |
| 新建 embed 路由 | `GET /api/embed/[projectId]/iframe?page={demoId}`；**`page` 必填**，省略返回 400 |
| 改造 `generate-schema` | 接收 `excludeFields: string[]`（项目级字段名集合），生成结果中过滤掉 |
| 改造前端 API Client | 完整重写 `ProjectApiClient`（按 6.2 节签名）；删除 `syncProjectConfig` 方法 |
| **删除** `sync-config` 端点 | v5.0 残留的 `/demo-pages/sync-config` 路由不再实现（hasProjectConfig 改运行时实时判定） |

**测试任务（必做）：**
- 每个新增/修改路由的集成测试（200/4xx/5xx 路径）
- Schema 冲突校验在 3 个写入入口（PUT config / PUT files / POST generate-schema）的覆盖测试
- `sessionId` 参数缺失/错误时的拒绝测试
- embed 路由 `page` 参数必填验证测试

### 7.4 阶段三：AI 代理适配（1 天）

**涉及文件：**
- `packages/web/src/lib/agent-prompts/demo-generator.template.md` — **新建**：从 `workspace-manager.ts` 抽离的 prompt 模板（**本阶段第一步**）
- `packages/web/src/lib/workspace-manager.ts` — `injectOpencodeAgentConfig` 改为读取模板文件 + 注入运行时上下文
- `packages/web/src/components/ai-elements/ai-chat.tsx` — 注入全页面清单上下文

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| **第一步：抽离 prompt** | 从 `workspace-manager.ts` 第 22–125 行的 `injectOpencodeAgentConfig` 中把 `agentMd` 模板字符串完整移到 `demo-generator.template.md`；`workspace-manager.ts` 改用 `fs.readFileSync` 读模板 + 字符串替换占位符 |
| 重写 prompt 内容 | 定义工作空间多页面目录结构 + 项目级配置说明；明确"不要修改 `project.json`"（物理上也修改不到，详见 5.5 节）；新增"不要在页面 Schema 中重复定义项目级字段"约束；自然语言定位页面规则 |
| 移除文件变更追踪器拦截 | 删除"AI 改 project.json 拦截"相关代码（伪问题，物理上不可能） |
| AI 对话上下文注入 | 每次创建 Agent 会话时，将项目所有页面清单 + 项目级 schema 字段集合注入系统提示词 |
| 文件变更检测适配 | 支持 `demos/{demoId}/index.tsx` 路径分组；按页面/项目配置分组展示文件变更 |
| AI 增量更新工作流 | prompt 中明确"逐页面增量更新"流程：批量更新>2 个页面时分多轮（兜底，详见审查意见 28；主线靠运行时 Props 注入消除批量更新需求） |

**测试任务（必做）：**
- 模板文件读取 + 占位符替换的端到端测试
- AI 在多页面项目中通过自然语言准确定位页面的样例验证
- AI 不修改 `project.json` 的隔离性验证

### 7.5 阶段四：前端 UI 改造（2-3 天）

**涉及文件：**
- `packages/web/src/app/demo/[id]/edit/page.tsx` — 编辑页重构（核心，当前 814 行）
- `packages/web/src/components/demo-pages-panel.tsx` — 页面管理面板（**新建**，用于 Tab 3）
- `packages/web/src/components/demo/home-page.tsx` — 首页卡片增加页面数量
- `packages/web/components/demo/PreviewPanel.tsx` — 预览面板适配多页面（**iframe + /api/compile** 模式，**非 Sandpack**）
- `packages/web/components/demo/ConfigFormNew.tsx` — 配置面板适配项目级/页面级分层
- `packages/web/components/demo/PreviewGrid.tsx` — **新建**：宫格模式渲染组件
- `packages/web/__tests__/edit-page.e2e.ts` — 新建：端到端测试

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| 编辑页左侧改为 3 Tab | AI 对话 / 代码编辑 / 页面 —— 三个 Tab 切换结构 |
| AI 对话 Tab | 移除 Demo 切换逻辑；注入全页面清单 + 项目级 schema 字段集合到对话上下文；消息提交不再附带 `activeDemoId` |
| 代码编辑 Tab | 增加页面选择器下拉框；切换页面时调用 `getSessionDemoPageFiles()` 重新加载对应文件 |
| 页面 Tab（新建） | 页面表格（名称、文件数、最后修改、`order`、操作按钮）；新建/删除/重命名/查看预览；**项目配置编辑入口指向独立 Schema 编辑器（高级用户专用），不混入 AI 对话** |
| 右侧面板适配 | 文件变更列表按页面/项目配置分组展示；新增「预览页面」下拉选择器 |
| 配置面板适配 | 项目配置区与页面配置区分层展示；切换预览页面时项目配置区不变；配置值从 Schema default 推导 |
| **预览机制（iframe，非 Sandpack）** | 切换页面时**不销毁重建实例**——做法是把当前活跃页面的 `code` 重新 POST 给 `/api/compile`，将编译结果通过 Blob URL 传给 iframe；`mergedProps` 由 `mergeConfigToProps()` 在 iframe HTML 模板中注入 |
| 预览双模式 UI | 预览区顶部增加「单页/宫格」切换按钮；宫格模式工具栏（每行数量下拉框、返回单页按钮） |
| **宫格 mount/unmount 策略** | CSS Grid 布局；**Intersection Observer 驱动 mount/unmount**：可见 ± 1 卡片范围内激活 iframe，离开范围直接销毁 iframe 元素（不替换占位符）；重新进入视口时按需 mount + 触发 `/api/compile`；最大并发 N 个 iframe |
| 宫格交互联动 | 点击页面列表 → 宫格滚动到对应卡片并高亮（`scrollIntoView`）；点击卡片 → 切换单页模式 |
| 首页卡片适配 | 项目卡片增加「N 个页面」标签 |
| 状态管理重构 | 页面列表 + 项目配置状态提取为独立 Context；活跃页面状态作为独立状态组 |
| **运行时 Props 注入实现** | iframe HTML 模板中将 `mergedProps` 通过 `window.__DEMO_PROPS__` 全局注入；组件运行时读取（**避开 AI 同步 Props 接口的可靠性问题**，详见审查意见 14） |

**测试任务（必做）：**
- Tab 切换 + 页面创建/删除/重命名 e2e
- 宫格模式 mount/unmount 内存泄漏测试（创建 20+ 页面后切换单页/宫格模式 100 次，DevTools 内存监控）
- 切换预览页面时 iframe 行为验证（不应销毁实例，仅重新编译）

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
| AI 页面名称匹配失败 | AI 无法确定用户指的是哪个页面 | 注入的页面清单要完整清晰；AI 不确定时主动向用户确认 |
| AI 越权修改无关页面 | AI 可能修改用户未提到的页面 | agent.md 明确约束：仅修改用户指定的页面；文件变更追踪器可检测异常修改并展示给用户 |
| AI 页面管理操作失误 | 用户说"删除 XX"，AI 可能删除错误页面 | AI 执行删除前必须二次确认并说明影响的文件范围 |
| **AI 同步多页面 Props 不可靠** | 5+ 页面时漏改某个页面 | **主线方案：运行时 Props 注入（详见 4.6 / 7.5）**——组件 Props 接口不再声明项目级字段，由 PreviewPanel/embed 编译时通过 `window.__DEMO_PROPS__` 注入。这样 AI 只需修改单页代码，不需要批量同步 Props 接口。AI 增量更新工作流（每轮 1-2 页）作兜底 |
| **配置字段命名冲突** | 项目级与页面级同名字段语义不一致 | **硬约束**：所有 Schema 写入端点（PUT config / PUT files / generate-schema）落盘前调用 `validateNoSchemaConflict`，重名直接 400 拒绝；前端配置编辑界面同步展示冲突字段 |
| **页面 ID 毫秒级碰撞** | AI 快速连续创建页面产生重复 ID | 生成器使用 `demo_${Date.now()}_${random}`；后端创建端点二次校验唯一性 |
| **`.demo.json` 元数据丢失** | 后端扫描 `demos/` 目录拿不到 name | `.demo.json` 缺失时回退使用目录名作为 name，并在后台日志记录；保存时合并"目录列表"与"现有 demoPages" |
| 宫格模式性能问题 | 多个 iframe 同时活跃，内存压力 | **Intersection Observer 驱动 mount/unmount**：可见 ± 1 卡片范围内激活 iframe，离开范围销毁元素；最大并发 N 个 iframe，超出排队 |
| 宫格滚动定位不准 | 点击页面列表后定位偏移 | `element.scrollIntoView({ block: 'center' })` 精确居中；卡片高度固定避免计算偏差 |
| 编辑页 3 Tab 状态管理复杂 | 切换 Tab 时状态不同步 | 页面列表 + 项目配置状态提取为独立 Context；活跃页面状态作为独立状态组 |
| 文件变更分组的性能 | 页面多时变更列表过长 | 默认折叠非活跃页面分组；提供"仅显示有变更的页面"筛选 |
| **embed 路由 page 参数缺失** | iframe 编译失败或返回错误页面 | `page` 参数必填；省略时直接 400 + 详细错误（项目未上线，无遗留链接需要兼容） |
| **Schema 字段冲突跨入口绕过** | 多个写入端点遗漏冲突校验 | 共享 `schema-validator.ts`，3 个写入入口统一调用；CI 中加入单元测试覆盖 |
| `mergeConfigToProps` 项目级缺失字段 | 项目 schema 删字段时 mergedProps 突然丢字段 | 字段从项目 schema 移除后，UI 必须主动提示用户"以下页面引用了已删除的字段：…"，由用户决定是否修改各页面 |

> v5.0 中的"DemoFiles 破坏性变更"、"进行中 Session 不兼容"、"旧数据迁移失败"、"版本快照不一致（旧结构）"四条已移除——项目未上线，相关风险不存在。

---

## 十、后续扩展方向

以下功能不在本方案一期范围内，但架构设计为之预留了扩展空间：

1. **Demo 拖拽排序**：`DemoPageMeta.order` 已存在，后续 UI 增加拖拽手柄即可
2. **Demo 间共享组件**：在 workspace/ 下增加 `shared/` 目录存放共享代码
3. **Demo 搜索与筛选**：Demo 多时提供搜索框快速定位
4. **批量子 Demo 预览**：侧边栏展示所有 Demo 的小缩略图（仪表盘视图）
5. **Demo 依赖锁定**：每个 Demo 可独立锁定 npm 依赖版本
6. **项目配置组**：支持将共享配置分 Tab/分组展示（如"品牌信息"、"联系方式"等分组）
7. **配置预设/模板**：预设常用的项目配置模板（如电商项目配置、企业官网配置）
8. **AI Codemod**：作为运行时 Props 注入的补充，将组件 Props 接口字段也按 schema 自动同步（基于 AST，无需 AI prompt 自觉）

---

## 十一、附录

### A. 相关文件索引

| 文件 | 说明 |
|:-----|:-----|
| `packages/shared/src/workspace.ts` | Project、VersionInfo 等核心类型定义 |
| `packages/shared/src/types.ts` | DemoFiles、SessionMeta 等类型定义 |
| `packages/shared/src/index.ts` | 类型统一导出 |
| `packages/web/src/lib/fs-utils.ts` | 文件系统工具函数（项目/会话/版本 CRUD） |
| `packages/web/src/lib/workspace-manager.ts` | 工作空间管理器（创建/读取/删除 workspace；含 `injectOpencodeAgentConfig`，需抽离 prompt 模板） |
| `packages/web/src/lib/session-manager.ts` | 会话管理器（仅持元数据，文件经 `findWorkspacePath(workspaceId)` 落地） |
| `packages/web/src/lib/agent-prompts/demo-generator.template.md` | **新建**：AI 代理 prompt 模板 |
| `packages/web/src/lib/schema-validator.ts` | **新建**：Schema 冲突校验 |
| `packages/web/src/lib/runtime-props.ts` | **新建**：运行时 Props 合并 |
| `packages/web/src/lib/project-api.ts` | 前端 API 客户端封装 |
| `packages/web/src/app/demo/[id]/edit/page.tsx` | 项目编辑页（核心待改造页面，当前 814 行） |
| `packages/web/src/components/ai-elements/ai-chat.tsx` | AI 对话区组件 |
| `packages/web/components/demo/PreviewPanel.tsx` | 预览面板（**iframe + /api/compile**，非 Sandpack） |
| `packages/web/src/lib/iframe-template.ts` | iframe HTML 模板生成（运行时 Props 注入入口） |
| `packages/web/components/demo/ConfigFormNew.tsx` | 配置表单组件 |
| `packages/web/src/app/api/embed/[projectId]/iframe/route.ts` | **新建**：嵌入页面 HTML 生成（项目原本无此路由） |
| `packages/web/src/app/api/compile/route.ts` | 已有：组件代码编译为可执行 JS |

### B. 项目结构（最终形态）

```
projects/proj_1712345678/
├── project.json           ← demoPages: [...]（无 hasProjectConfig，无 migratedToMultiDemo）
└── workspace/
    ├── project.config.schema.json    ← 可选：项目级共享配置定义
    ├── assets/                       ← 可选：项目级共享资源（如 Logo）
    └── demos/                        ← 必选：所有 Demo 页面
        ├── demo_1712345678_a1b2c3/   ← demo_${ts}_${random}
        │   ├── index.tsx
        │   ├── config.schema.json
        │   └── .demo.json            ← 必选：name/order/createdAt/updatedAt
        ├── demo_1712345789_d4e5f6/
        │   ├── index.tsx
        │   ├── config.schema.json
        │   └── .demo.json
        └── ...
```

> 项目未上线，**没有"迁移前/后"两份示例**，所有项目从一开始就是这个结构。

### C. 设计决策快查

| 决策 | 选项 A | 选项 B | 采用 |
|:-----|:-------|:-------|:-----|
| 多页面 Props 同步 | AI prompt 约束 | 运行时注入 | **运行时注入**（B；可靠性 > AI 自觉） |
| 同名字段处理 | 页面级覆盖 | 项目级优先 | **禁止冲突**（落盘前 400）|
| `hasProjectConfig` | 持久化字段 | 运行时实时判定 | **运行时实时判定**（避免不一致）|
| Session vs Workspace | Session 存文件 | Workspace 存文件 | **Workspace 存文件**（与现状一致）|
| 嵌入路由 page 参数 | 默认第一页 | 必填 | **必填**（项目未上线无遗留链接）|
| API 命名统一 | 双轨过渡 | 一次性最终形态 | **一次性最终形态**（项目未上线）|
| 页面 ID 格式 | `demo_${ts}` | `demo_${ts}_${random}` | **`demo_${ts}_${random}`**（防碰撞）|
| 名称元数据来源 | project.json 维护 | `.demo.json` + 扫描合并 | **`.demo.json` + 扫描合并**（容灾）|

### D. v5.0 → v6.0 变更摘要

| 维度 | v5.0 状态 | v6.0 改动 | 原因 |
|:-----|:----------|:----------|:-----|
| **预览技术** | "Sandpack 适配" | 改为 "iframe + /api/compile 适配" | v5.0 与现状不符（项目未用 Sandpack） |
| **embed 路由** | 标为"适配" | 标为"一次性新建" | v5.0 与现状不符（路由原本不存在） |
| **configData** | "兼容当前行为" | **不引入 config.data.json**，延续 Schema default 推导 | 当前无持久化需求，减少复杂度；未来需要时局部加回 |
| **agent.md** | "重写提示词" | "第一步抽离为 `demo-generator.template.md`，再修改" | v5.0 与现状不符（项目原无外部 .md，prompt 内联在 TS 字符串） |
| **Session vs Workspace** | "复制到 Session 临时空间" | "通过 `findWorkspacePath(workspaceId)` 操作 Workspace" | v5.0 与现状不符（Session 仅持元数据，文件在 Workspace） |
| **`migratedToMultiDemo` 字段** | Project 接口包含 | **删除** | 项目未上线，不存在旧数据 |
| **阶段五（迁移兼容）** | 1 天工作量 | **整段砍掉** | 项目未上线，无需迁移 |
| **`DemoFiles @deprecated`** | 标记为 deprecated | **不再 deprecated**，作为单页面文件单元 | 项目未上线，不留弃用包袱 |
| **API 双轨制** | 一期保留 / 二期废弃 / 三期清理 | **一次性最终形态** | 项目未上线，不做过渡 |
| **`hasProjectConfig` 字段** | Project 持久字段 + sync-config 端点 | **删除字段 + 删端点**，运行时 `fs.existsSync` 实时判定 | 避免冗余 + 不一致风险 |
| **Schema 字段冲突** | "页面级覆盖项目级" | **禁止冲突，落盘前 400** | "项目级 = 全局共享"承诺需硬保障 |
| **AI 同步 Props** | 主要靠 prompt 约束 | **改为运行时 Props 注入**（详 4.6 / 7.5） | 5+ 页面时 AI 漏改几乎必然 |
| **页面 ID 格式** | `demo_${Date.now()}` | `demo_${Date.now()}_${random}` | 防毫秒级碰撞 |
| **`.demo.json` 元数据** | 未定义 | 每个页面持有 name/order/timestamps | 后端扫描时还原元数据 |
| **AI 改 `project.json` 防御** | "拦截器 + 提示词约束" | **删除拦截器**，仅用 prompt 提示 | project.json 物理上不在 workspace 内，伪问题 |
| **页面管理 API** | 未明确 sessionId | **强制要求 `sessionId` 参数** | 写入临时 workspace 而非正式 workspace |
| **PUT 端点职责** | 单 PUT 改 code/schema/name | **拆分为 2 个端点**（files / metadata） | 单一职责 + 缓存策略易定 |
| **`generate-schema` 字段冲突** | 未处理 | 接受 `excludeFields`，从生成结果中减去项目级字段 | 防止生成冲突 schema |
| **embed `page` 参数** | "默认第一页" | **必填** | 项目未上线无遗留链接需要兼容 |
| **测试任务** | 未明确 | 每阶段必有测试任务 | 阶段验收门槛清晰 |
| **风险表** | 含"DemoFiles 破坏性变更"等 | **删除 4 条兼容性风险** | 风险本身已不存在 |