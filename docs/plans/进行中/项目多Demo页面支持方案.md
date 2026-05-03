# 项目多 Demo 页面支持方案

> 版本：v3.0
> 创建日期：2026-05-03
> 更新日期：2026-05-03（v3.0：新增项目级共享配置支持）
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

采用 **Demo 作为 Project 的子资源** 模式：

| 维度 | 设计决策 |
|:-----|:---------|
| Demo 与 Project 的关系 | Demo 属于 Project，不可独立存在 |
| 工作空间粒度 | 一个 Session = 一个临时空间，内含所有 Demo 的副本 |
| 版本粒度 | 以 Project 为单位（保存一次 = 所有 Demo 的集体快照） |
| 代码独立性 | 每个 Demo 的代码和配置独立存放于自己的子目录 |
| **AI 编辑模式** | **全域编辑**：AI 拥有整个工作空间的读写权限，同时操作多个页面 |
| **页面路由** | 用户通过**自然语言**告诉 AI 操作哪个页面，无需手动切换 Demo |

**与上一版本的核心区别：**

| 旧方案（v1.0） | 新方案（v2.0） |
|:--------------|:--------------|
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

#### 新增类型：DemoPageMeta

```typescript
/**
 * Demo 页面元数据
 */
interface DemoPageMeta {
  id: string            // 唯一标识，格式 "demo_{timestamp}"
  name: string          // 显示名称，如 "首页"、"详情页"
  path: string          // 相对路径，如 "demos/demo_001"
  createdAt: number     // 创建时间戳
  updatedAt: number     // 最后更新时间戳
}
```

#### 更新类型：Project

```typescript
interface Project {
  id: string
  name: string
  description?: string
  workspacePath: string
  demoPages: DemoPageMeta[]    // 【新增】Demo 页面列表
  hasProjectConfig: boolean    // 【新增】是否存在项目级共享配置
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
}
```

#### 新增类型：ProjectConfig

```typescript
/**
 * 项目级共享配置
 */
interface ProjectConfig {
  schema: string                // project.config.schema.json 内容
  exists: boolean               // 是否存在项目级配置
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
      │
      ▼
创建 demos/default/ 目录，生成默认 index.tsx + config.schema.json
      │
      ▼
project.json 中记录: demoPages: [{ id: "default", name: "默认页面", ... }]
      │
      ▼
用户进入编辑页，可通过 AI 自然语言或「页面」Tab 新建更多页面
也可通过 AI 自然语言创建项目级共享配置
```

### 3.2 Session 工作流程（AI 全域编辑模式）

```
用户打开项目编辑
      │
      ▼
创建 Session + Workspace（复制整个 workspace/ 含 demos/ 子目录 + project.config.schema.json）
      │
      ▼
AI 代理获得整个工作空间（所有 demos/ 和 project.config.schema.json）的读写权限
      │
      ▼
用户通过自然语言告诉 AI 操作哪个页面或项目配置：
  "帮我修改首页的标题为'欢迎'"
  "给项目增加一个Logo配置，所有页面都要展示"
  "新建一个'关于我们'页面"
      │
      ▼
AI 自主定位目标目录并操作文件（页面目录或项目配置）
如果是页面管理指令（新建/删除/重命名），AI 同步更新 demoPages 元数据
如果操作项目配置，AI 编辑 project.config.schema.json 并更新 hasProjectConfig
      │
      ▼
文件变更追踪器自动检测所有文件变化
右侧面板实时显示所有变更文件列表（按页面分组 + 项目配置独立分组）
      │
      ▼
用户保存 → 所有 Demo + 项目配置作为集体快照保存为统一版本
```

**关键设计理念：**

AI 不再需要 `activeDemoId` 参数。AI 拥有整个项目工作空间的完整上下文：
- 每次对话开始时，系统将当前所有页面的信息（名称、路径、关键摘要）注入到 AI 上下文中
- 用户通过自然语言中的页面名称或描述来指定目标
- AI 根据用户指令自行判断需要操作哪个（哪些）页面的哪些文件

### 3.3 保存流程

```
用户点击保存
      │
      ▼
备份整个 workspace/（含 demos/ 下所有子目录）→ snapshot/{versionId}/
      │
      ▼
临时空间覆盖正式 workspace/
      │
      ▼
清理系统文件（.opencode、.session.json、.workspace.json）
      │
      ▼
更新 project.json 中的 demoPages 列表和 hasProjectConfig 标记
      │
      ▼
记录版本信息，清理旧版本
      │
      ▼
删除临时空间，标记会话已保存
```

### 3.4 版本恢复流程

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
同步更新 project.json 的 demoPages 列表
      │
      ▼
返回新版本号 v{N+1}
```

版本恢复时，所有 Demo 一起恢复到目标版本状态，保证完整性。

---

## 四、编辑器 UI 设计

### 4.1 编辑页新布局

编辑页左侧区域改为 **3 个 Tab** 切换：「AI 对话」「代码编辑」「页面」。

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [返回]  项目名称                   基于 v1  用户名        [保存] [放弃]  │
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
│  │  │   (根据选中Tab切换)     │     │  │  │                  │   │  │
│  │  │                          │     │  │  └──────────────────┘   │  │
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
| **新建页面** | 点击「+ 新建页面」按钮 | 弹出输入框填写页面名称 → 创建 `demos/{newId}/` 目录及默认文件 → 刷新表格 |
| **删除页面** | 点击行末 🗑 按钮 | 二次确认弹窗（显示页面名称）→ 删除 `demos/{demoId}/` 目录 → 刷新表格 |
| **修改名称** | 点击行末 ✏️ 按钮 | 行内名称变为可编辑输入框 → 确认后更新 `project.json` 中的 demoPages 和实际目录名（如需要） |
| **预览页面** | 点击行末 👁 按钮 | 将该页面设为右侧预览区的当前预览页面 |

#### 通道二：AI 自然语言操作（Tab 1 AI 对话）

| 自然语言示例 | AI 行为 |
|:------------|:--------|
| "新建一个叫'产品中心'的页面" | 创建 `demos/demo_xxx/` 目录及默认文件，更新 project.json demoPages |
| "把首页的名字改成'主页'" | 更新 project.json 中对应 DemoPageMeta 的 name 字段 |
| "删除'测试页'这个页面" | 二次确认后删除对应目录，更新 project.json demoPages |
| "帮我看看现在有哪些页面" | 列出所有页面名称和基本状态 |
| **"给项目增加一个Logo配置"** | 创建/编辑 project.config.schema.json，新增 logo 字段；更新所有页面组件以接收 logo Props |
| **"项目配置里再加个品牌色"** | 编辑 project.config.schema.json，新增 brandColor 字段；更新所有页面组件 |
| **"删除项目配置中的联系方式"** | 编辑 project.config.schema.json，移除对应字段；更新所有页面组件 |
| **"项目配置有哪些字段"** | 读取 project.config.schema.json 并列出所有字段及说明 |

> **重要**：AI 执行页面创建/删除/重命名操作时，需要同步更新 `project.json` 中的 `demoPages` 数组。AI 创建/删除项目配置时，需同步更新 `hasProjectConfig` 标记，并确保所有页面组件的 Props 接口和渲染逻辑同步更新。这些写入操作属于编辑会话内操作，会在用户保存时一并合并到正式项目。

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

文件变更列表按**页面分组**展示，清晰展示每个页面有哪些文件被修改或新增。页面被AI删除时标记为「🗑 待删除」；被AI新建时标记为「✨ 新增」。

---

## 五、AI 代理适配

### 5.1 核心理念转变

| 维度 | 旧模式（v1.0） | 新模式（v2.0） |
|:-----|:--------------|:--------------|
| AI 操作范围 | `demos/{activeDemoId}/` 单个目录 | 整个工作空间，所有 `demos/` 子目录 |
| 页面定位 | 通过 `activeDemoId` 参数指定 | 通过自然语言中的页面名称匹配 |
| 文件操作 | `index.tsx` + `config.schema.json` | `demos/{demoId}/index.tsx` + `demos/{demoId}/config.schema.json` |
| 页面管理 | 不允许 AI 创建/删除/重命名页面 | **允许** AI 通过自然语言执行页面管理 |
| 启动时 | 仅告知当前活跃 Demo | 注入**全部页面的清单信息** |

### 5.2 代理指令更新

AI 代理的 `demo-generator.md` 需要从"单页面编辑器"升级为"多页面项目编辑器"：

```
# Demo Generator Agent

你是 OpenCode Workbench 的项目 Demo 生成专家。你的
工作区是一个完整的项目工作空间，包含多个 Demo 页面。

## 工作空间结构

项目工作空间遵循以下目录结构：

  workspace/
  └── demos/
      ├── {demoId1}/           ← 页面1
      │   ├── index.tsx         ← React 组件代码
      │   └── config.schema.json ← 配置定义
      ├── {demoId2}/           ← 页面2
      │   ├── index.tsx
      │   └── config.schema.json
      └── .../

每个页面对应 demos/ 下一个独立子目录。

## 页面信息获取

会话开始时你会收到当前项目所有页面的清单：

```json
{
  "projectName": "我的项目",
  "pages": [
    { "id": "home", "name": "首页", "path": "demos/home/" },
    { "id": "detail", "name": "详情页", "path": "demos/detail/" }
  ]
}
```

如果需要了解某个页面的当前代码，read 对应的 index.tsx 和 config.schema.json。

## 页面内容编辑

用户通过自然语言指定要修改哪个页面。你需要自主匹配页面名称：

- 用户说"修改首页"，你定位到 demos/home/
- 用户说"给详情页加个配置"，你定位到 demos/detail/
- 用户说"把第二个页面改一下"，你根据页面列表顺序定位

如果页面名称有歧义，请向用户确认。

## 页面管理操作

你可以通过自然语言执行以下页面管理操作：

### 创建新页面
用户："新建一个XX页面"

操作步骤：
1. 生成新的 demoId（如 "demo_{timestamp}"）
2. 创建 demos/{demoId}/ 目录
3. 创建默认的 index.tsx 和 config.schema.json
4. 更新 project.json 中的 demoPages 数组，追加新条目

### 删除页面
用户："删除XX页面"

操作步骤：
1. 向用户确认删除操作（不可逆）
2. 删除 demos/{demoId}/ 整个目录
3. 更新 project.json 中的 demoPages 数组，移除对应条目

### 重命名页面
用户："把XX页面改名为YY"

操作步骤：
1. 更新 project.json 中对应 DemoPageMeta 的 name 字段
2. 目录名/id 保持不变（避免路径断裂）

## 代码质量标准（每个页面内）

每个页面的 index.tsx 要求：
- 使用 TypeScript，定义完整的 Props 接口
- 使用 Tailwind CSS 进行样式设计
- 可使用 shadcn/ui 组件库、lucide-react 等
- 导出默认组件
- 代码完整可运行，包含必要的 import
- 所有代码在单一文件中，不使用 import './xxx'

每个页面的 config.schema.json 要求：
- 符合 JSON Schema 规范
- properties 与组件 Props 一一对应
- 每个属性有合理的 default 值

## 禁止行为
- ❌ 修改 .session.json、.opencode/、.workspace.json 等系统文件
- ❌ 修改 project.json 中除 demoPages 外的其他字段
- ❌ 在单个页面中使用 import './xxx' 相对路径导入
```

### 5.3 系统上下文注入

每次创建 Agent 会话时，系统自动注入页面清单：

```typescript
function buildAgentContext(
  projectName: string,
  demoPages: DemoPageMeta[]
): string {
  const pageList = demoPages
    .map(p => `  📄 \"${p.name}\" → demos/${p.id}/ (index.tsx + config.schema.json)`)
    .join('\n')

  return `
当前项目：「${projectName}」
包含 ${demoPages.length} 个页面：

${pageList}

用户会通过自然语言告诉你操作哪个页面。
如果需要操作某个页面，请在 demos/{id}/ 目录下编辑 index.tsx 或 config.schema.json。
`
}
```

### 5.4 文件变更适配

AI 编辑产生的文件变更路径从「index.tsx」升级为「demos/{demoId}/index.tsx」。

**文件变更追踪器**需要适配新的路径格式，自动提取 `demoId` 用于按页面分组展示：

```
demos/home/index.tsx        →  页面「首页」的组件代码
demos/detail/index.tsx      →  页面「详情页」的组件代码
demos/home/config.schema.json →  页面「首页」的配置定义
```

### 5.5 对话流程示例

```
[系统注入] 当前项目包含：首页、详情页、关于我们

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
│ 👤 用户：帮我对比一下首页和详情页的设计风格，看看是否统一   │
│                                                             │
│ 🤖 AI：                                                      │
│   [读取 demos/home/index.tsx]                               │
│   [读取 demos/detail/index.tsx]                             │
│                                                             │
│   对比分析：                                                 │
│   • 首页使用 Tailwind bg-blue-500，详情页使用 bg-green-400  │
│   • 两个页面使用了不同的颜色方案，建议统一为蓝色系          │
│   • 需要修改详情页的颜色吗？                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 👤 用户：好，把详情页也统一改成蓝色                          │
│                                                             │
│ 🤖 AI：                                                      │
│   [编辑 demos/detail/index.tsx — 统一颜色方案]              │
│                                                             │
│   已将「详情页」颜色方案统一为蓝色，现在两个页面风格一致。    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 👤 用户：这三个页面都挺好的，没什么要改的了                  │
│                                                             │
│ 🤖 AI：                                                      │
│   好的！目前「首页」「详情页」「关于我们」的设计风格统一，    │
│   随时可以保存。如果有需要随时告诉我。                       │
└─────────────────────────────────────────────────────────────┘
```

此对话流程展示了 AI 全域编辑的核心优势：**一次对话中可以自然地跨越多个页面进行编辑和对比**，无需任何手动切换操作。

---

## 六、API 路由设计

### 6.1 新增路由

| 方法 | 路由 | 说明 |
|:-----|:-----|:-----|
| `GET` | `/api/projects/[projectId]/demos` | 获取项目的所有 Demo 页面列表 |
| `POST` | `/api/projects/[projectId]/demos` | 在项目中创建新 Demo 页面 |
| `GET` | `/api/projects/[projectId]/demos/[demoId]` | 获取特定 Demo 页面的详细信息 |
| `PUT` | `/api/projects/[projectId]/demos/[demoId]` | 更新 Demo 页面（代码/配置/名称） |
| `DELETE` | `/api/projects/[projectId]/demos/[demoId]` | 删除 Demo 页面（编辑会话内操作） |

> 注：Demo 页面的增删改在编辑会话的临时工作空间内进行；API 确保路径安全（不允许绕过 Session 访问正式 workspace）。

### 6.2 修改路由

| 方法 | 路由 | 变更 |
|:-----|:-----|:-----|
| `GET` | `/api/sessions/[sessionId]/files` | 返回结构需包含所有 Demo 的文件映射 |
| `GET` | `/api/projects/[projectId]` | 返回结果包含 `demoPages` |
| `GET` | `/api/projects`（项目列表） | 项目摘要中增加 `demoCount` 字段 |

> 不再需要 `activeDemoId` 参数。Session 保持以 Project 为粒度，AI 代理获得整个工作空间的全域权限。

### 6.3 前端 API Client 更新

```typescript
class ProjectApiClient {
  // 新增方法
  async getDemoPages(projectId: string): Promise<DemoPageMeta[]>
  async createDemoPage(projectId: string, name: string): Promise<DemoPageMeta>
  async getDemoPageDetail(projectId: string, demoId: string): Promise<DemoPageDetail>
  async updateDemoPage(projectId: string, demoId: string, data: UpdateDemoPageRequest): Promise<void>
  async deleteDemoPage(projectId: string, demoId: string): Promise<void>
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
- `packages/shared/src/workspace.ts` — 新增 `DemoPageMeta` 等类型；更新 `Project` 接口
- `packages/shared/src/index.ts` — 导出新类型
- `packages/web/src/lib/fs-utils.ts` — 新增 Demo CRUD 工具函数

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| 定义新类型 | DemoPageMeta、DemoPageDetail、CreateDemoPageRequest、UpdateDemoPageRequest |
| 更新 Project | 添加 `demoPages: DemoPageMeta[]` 字段 |
| 新增 fs-utils 函数 | `listDemoPages(projectId)` — 列出所有 Demo；`createDemoPage(projectId, name)` — 创建 Demo 目录；`deleteDemoPage(projectId, demoId)` — 删除 Demo 目录；`getDemoPageFiles(projectId, demoId)` — 获取 Demo 代码和配置；`updateDemoPageFiles(projectId, demoId, files)` — 更新 Demo 代码/配置 |
| 更新 ensureWorkspaceFiles | 支持创建 `demos/default/` 目录结构 |
| 更新 createProject | 默认创建 `demos/default/` 及默认文件 |

### 7.3 阶段二：API 路由扩展（1-2 天）

**涉及文件：**
- `packages/web/src/app/api/projects/[projectId]/demos/route.ts` — Demo 列表/创建
- `packages/web/src/app/api/projects/[projectId]/demos/[demoId]/route.ts` — 单个 Demo CRUD
- `packages/web/src/lib/project-api.ts` — 新增前端 API 方法
- 修改现有 sessions 相关路由以支持多 Demo 文件结构

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| GET /api/projects/{id}/demos | 返回 demoPages 列表（正式 workspace）或临时 workspace 中的 demo 目录列表 |
| POST /api/projects/{id}/demos | 在临时 workspace 中创建新 demo 目录，返回 DemoPageMeta |
| GET /api/projects/{id}/demos/{demoId} | 返回 demo 的 code + schema + meta |
| PUT /api/projects/{id}/demos/{demoId} | 更新 demo 的 code/schema/name |
| DELETE /api/projects/{id}/demos/{demoId} | 删除 demo 目录 |
| 更新 projectApiClient | 添加对应的前端封装方法 |

### 7.4 阶段三：AI 代理适配（0.5-1 天）

**涉及文件：**
- `packages/web/src/lib/workspace-manager.ts` — `injectOpencodeAgentConfig` 更新指令（从"单页面"升级为"多页面项目编辑器"）
- `packages/web/src/components/ai-elements/ai-chat.tsx` — 注入全页面清单上下文

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| 重写 agent.md 提示词 | 定义工作空间目录结构；说明页面信息获取方式；支持自然语言页面定位；新增页面管理操作指令（创建/删除/重命名）；移除单目录范围限制 |
| 更新 opencode.json | 调整 tools 权限以允许跨 Demo 文件操作和 project.json 写入 |
| AI 对话上下文注入 | 每次创建 Agent 会话时，将项目所有页面的清单（名称+路径）注入到系统提示词中 |
| 文件变更检测适配 | 支持 `demos/{demoId}/index.tsx` 路径格式；自动按页面分组文件变更列表 |

### 7.5 阶段四：前端 UI 改造（2-3 天）

**涉及文件：**
- `packages/web/src/app/projects/[id]/edit/page.tsx` — 编辑页重构（核心）
- `packages/web/src/components/demo-pages-panel.tsx` — 页面管理面板组件（新建，用于 Tab 3）

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| 编辑页左侧改为 3 Tab | AI 对话 / 代码编辑 / 页面 —— 三个 Tab 切换结构 |
| AI 对话 Tab | 移除 Demo 切换逻辑；注入全页面清单到对话上下文；消息提交不再附带 activeDemoId |
| 代码编辑 Tab | 增加页面选择器下拉框；切换页面时重新加载对应代码和 Schema |
| 页面 Tab（新增） | 页面表格（名称、文件数、最后修改、操作按钮）；新建页面按钮 + 弹窗；行内编辑名称；删除页面（二次确认）；查看预览按钮 |
| 右侧面板适配 | 文件变更列表按页面分组展示；新增「预览页面」下拉选择器 |
| 保存适配 | 保存逻辑不变（仍以 Project 为单位），但需处理 demos/ 子目录结构 |

### 7.6 阶段五：向后兼容与迁移（1 天）

**涉及文件：**
- `packages/web/src/lib/fs-utils.ts` — 新增迁移函数

**具体任务：**

| 任务 | 说明 |
|:-----|:-----|
| 自动迁移函数 | `migrateProjectToMultiDemo(projectId)` — 检测旧结构（workspace 下无 demos/ 目录）；创建 `demos/default/` 目录；移动 index.tsx 和 config.schema.json 到新位置；更新 project.json 的 demoPages |
| 打开项目编辑时触发迁移 | 在 createEditSession 或 openProjectEdit 流程中检测并自动迁移 |
| 迁移标记 | 在 project.json 中记录 `migratedToMultiDemo: true` 避免重复迁移 |
| 版本快照兼容 | 旧版本快照（无 demos/ 子目录）恢复时也需迁移 |

---

## 八、风险与对策

| 风险 | 影响 | 对策 |
|:-----|:-----|:-----|
| **AI 页面名称匹配失败** | AI 无法确定用户指的是哪个页面 | 注入的页面清单要完整清晰；AI 不确定时主动向用户确认 |
| **AI 越权修改无关页面** | AI 可能修改用户未提到的页面 | agent.md 明确约束：仅修改用户指定的页面；文件变更追踪器可检测异常修改 |
| **AI 页面管理操作失误** | 用户说"删除XX"，AI 可能删除错误页面或未确认 | AI 执行删除前必须向用户二次确认并说明影响的文件范围 |
| **旧数据迁移失败** | 用户无法编辑旧项目 | 迁移前自动备份；迁移失败时回退并提供手动修复入口 |
| **版本快照不一致** | 恢复版本后 demoPages 与实际文件不匹配 | 版本恢复后重新扫描 demos/ 目录同步 meta |
| **编辑页三 Tab 状态管理复杂** | 切换 Tab 时状态不同步 | 页面列表作为全局共享状态；Tab 间通过 URL 参数或 Context 保持同步 |
| **文件变更分组的性能** | 页面多时变更列表过长 | 默认折叠非活跃页面分组；提供"仅显示有变更的页面"筛选 |

---

## 九、后续扩展方向

以下功能不在本方案一期范围内，但架构设计为之预留了扩展空间：

1. **Demo 排序/拖拽**：DemoPageMeta 中添加 `order` 字段，支持拖拽排序
2. **Demo 间共享组件**：在 workspace/ 下增加 `shared/` 目录存放共享代码
3. **Demo 搜索与筛选**：Demo 多时提供搜索框快速定位
4. **批量子 Demo 预览**：侧边栏展示所有 Demo 的小缩略图（仪表盘视图）
5. **Demo 依赖锁定**：每个 Demo 可独立锁定 npm 依赖版本

---

## 十、附录

### A. 相关文件索引

| 文件 | 说明 |
|:-----|:-----|
| `packages/shared/src/workspace.ts` | Project、VersionInfo 等核心类型定义 |
| `packages/shared/src/index.ts` | 类型统一导出 |
| `packages/web/src/lib/fs-utils.ts` | 文件系统工具函数（项目/会话/版本 CRUD） |
| `packages/web/src/lib/workspace-manager.ts` | 工作空间管理器（创建/读取/删除 workspace） |
| `packages/web/src/lib/session-manager.ts` | 会话管理器（创建/保存/丢弃 session） |
| `packages/web/src/lib/project-api.ts` | 前端 API 客户端封装 |
| `packages/web/src/app/projects/[id]/edit/page.tsx` | 项目编辑页（核心待改造页面） |
| `packages/web/src/components/ai-elements/ai-chat.tsx` | AI 对话区组件 |

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
├── project.json           ← demoPages: [...], migratedToMultiDemo: true
└── workspace/
    └── demos/
        ├── default/       ← 原 index.tsx + config.schema.json
        │   ├── index.tsx
        │   └── config.schema.json
        ├── demo_002/
        │   ├── index.tsx
        │   └── config.schema.json
        └── demo_003/
            ├── index.tsx
            └── config.schema.json
```
