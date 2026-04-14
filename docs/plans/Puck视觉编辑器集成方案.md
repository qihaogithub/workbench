# Puck 视觉编辑器集成方案

> 版本：v1.1
> 创建日期：2026-04-14
> 更新日期：2026-04-14
> 状态：草稿
> 变更说明：补充临时空间同步机制、集成难度评估、Session 管理架构

---

## 一、背景与目标

### 1.1 背景

当前 Demo 编辑页面采用纯代码编辑模式，用户需要手动编写 React 组件代码和 JSON Schema 配置。这对非技术用户存在较高门槛，且无法直观地看到组件结构。

[Puck](https://github.com/puckeditor/puck) 是一个模块化的 React 视觉编辑器，支持：
- 拖拽式页面构建
- 组件属性可视化编辑
- 实时预览
- 作为 React 组件集成到现有项目

### 1.2 目标

| 目标 | 说明 |
|:-----|:-----|
| 降低编辑门槛 | 通过可视化编辑替代部分代码编写 |
| 提升编辑效率 | 拖拽布局、属性面板编辑比手写代码更快 |
| 保持现有能力 | 不破坏现有的代码编辑和 AI 对话功能 |
| 数据兼容性 | 新旧编辑模式可互相转换 |

---

## 二、技术方案

### 2.1 Puck 简介

Puck 是基于 MIT 许可证的开源视觉编辑器，核心特性：

| 特性 | 说明 |
|:-----|:-----|
| 拖拽编辑 | 内置拖拽机制，支持组件库自定义 |
| 属性面板 | 自动生成组件属性编辑表单 |
| 实时预览 | 所见即所得的预览效果 |
| 数据驱动 | 通过配置定义组件，支持自定义字段类型 |
| 纯 React 组件 | 易于集成到 Next.js 应用 |

### 2.2 集成架构

**现有布局分析**：
当前 Demo 编辑页面采用三栏布局：
- 左栏（35%）：AI 对话 / 代码编辑 Tab 切换
- 中栏（35%）：预览区（Sandpack）
- 右栏（30%）：配置面板（RJSF 表单）

**集成方案**：
右栏增加 Tab 切换功能，原配置面板和 Puck 编辑器共享右栏空间：

```
┌─────────────────────────────────────────────────────────────────┐
│                      Demo 编辑页面                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐   ┌──────────┐   ┌────────────────────────┐   │
│   │          │   │          │   │  右栏 (30%)            │   │
│   │   左栏   │   │   中栏   │   │  ┌──────┬───────────┐  │   │
│   │  (35%)   │   │  (35%)   │   │  │ 配置 │  可视化   │  │   │
│   │          │   │          │   │  │ Tab  │  编辑    │  │   │
│   │ AI对话/  │   │  预览区  │   │  ├──────┴───────────┤  │   │
│   │ 代码编辑 │   │Sandpack  │   │  │                   │  │   │
│   │          │   │          │   │  │  Tab=配置:         │  │   │
│   │          │   │          │   │  │  RJSF 配置表单     │  │   │
│   │          │   │          │   │  │                   │  │   │
│   │          │   │          │   │  │  Tab=编辑:         │  │   │
│   │          │   │          │   │  │  Puck 全屏编辑器   │  │   │
│   │          │   │          │   │  │  (自带左右侧边栏) │  │   │
│   └──────────┘   └──────────┘   │  │                   │  │   │
│                                 │  └───────────────────────┘  │   │
│                                 └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**关键设计**：
- 左栏、中栏布局保持不变
- 右栏使用 Tab 切换，默认选中"配置"
- 切换到"编辑"Tab 时，右栏全屏显示 Puck 编辑器（它自带组件列表+画布+属性面板）
- Puck 编辑器作为独立全屏组件，不复用现有三栏结构

### 2.3 双模式切换

编辑页面支持两种编辑模式：

| 模式 | 入口 | 适用场景 |
|:-----|:-----|:---------|
| **代码模式** | Tab：代码编辑 | 需要精细控制、AI 生成代码 |
| **视觉模式** | Tab：可视化编辑 | 布局调整、属性修改、组件组合 |

切换逻辑：
- 两种模式共享同一份 Demo 数据
- 代码模式修改会自动同步到视觉模式
- 视觉模式修改会自动生成代码并同步到代码模式

---

## 三、数据模型设计

### 3.1 Puck Data 格式

Puck 使用以下数据结构：

```typescript
interface PuckData {
  root: {
    props: Record<string, unknown>;
  };
  content: PuckComponent[];
}

interface PuckComponent {
  type: string;        // 组件名称
  props: {
    children?: PuckComponent[];
    [key: string]: unknown;
  };
}
```

### 3.2 数据转换

#### Demo 代码 → Puck Data

```typescript
// 解析流程
1. 从 Demo 提取 code 和 schema
2. 解析 code 获取组件定义
3. 解析 schema 获取配置项
4. 构建 Puck config 和 initialData
```

#### Puck Data → Demo 代码

```typescript
// 生成流程
1. 从 Puck 提取 content 和 root
2. 遍历组件树，生成 React JSX 代码
3. 从 schema 提取配置项生成默认配置
4. 输出 code 和 schema
```

### 3.3 Puck Config 定义

```typescript
const config = {
  components: {
    // 用户定义的 Demo 组件
    DemoComponent: {
      fields: {
        // 字段定义（映射自 Schema）
        children: { type: 'text' },
        title: { type: 'text' },
        count: { type: 'number' },
        variant: {
          type: 'select',
          options: ['primary', 'secondary'],
        },
      },
      render: ({ children, title, count, variant }) => (
        <DemoComponent
          title={title}
          count={count}
          variant={variant}
        >
          {children}
        </DemoComponent>
      ),
    },
    // Puck 内置组件
    HeadingBlock: {
      fields: {
        children: { type: 'text' },
        level: {
          type: 'select',
          options: ['h1', 'h2', 'h3'],
        },
      },
      render: ({ children, level }) => {
        const Tag = level || 'h1';
        return <Tag>{children}</Tag>;
      },
    },
  },
};
```

---

## 四、页面布局设计

### 4.1 右栏 Tab 切换设计

右栏（30% 宽度）内部使用 Tab 切换：

```
┌─────────────────────────────────────────────────────────────────┐
│  [返回]  Demo 名称 - 编辑模式         [保存] [放弃]              │
├─────────────────────────────────────────────────────────────────┤
│  [AI 对话]  [代码编辑]                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌────────────────────────┐   ┌────────────────────────────┐  │
│   │                        │   │  右栏                      │  │
│   │        预览区           │   │  ┌──────────────────────┐  │  │
│   │      (Sandpack)        │   │  │ [配置]    [编辑]    │  │  │
│   │                        │   │  ├──────────────────────┤  │  │
│   │                        │   │  │                      │  │  │
│   │                        │   │  │   Tab=配置:          │  │  │
│   │                        │   │  │   RJSF 配置表单     │  │  │
│   │                        │   │  │                      │  │  │
│   │                        │   │  │   或                 │  │  │
│   │                        │   │  │                      │  │  │
│   │                        │   │  │   Tab=编辑:          │  │  │
│   │                        │   │  │   Puck 可视化编辑器  │  │  │
│   │                        │   │  │   (全屏占满右栏)     │  │  │
│   │                        │   │  │                      │  │  │
│   └────────────────────────┘   │  └──────────────────────┘  │  │
│                                 └────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         70% 宽度                           30% 宽度
```

**Tab 说明**：
| Tab | 内容 | 说明 |
|:----|:-----|:-----|
| 配置（默认） | RJSF 表单 | 编辑 Demo 配置参数，与 Demo 使用页保持一致 |
| 编辑 | Puck 编辑器 | 可视化拖拽编辑，自带组件列表+画布+属性面板 |

### 4.2 Puck 编辑器内部布局

当切换到"编辑"Tab 时，右栏显示 Puck 编辑器（Puck 自带完整 UI）：

```
┌─────────────────────────────────────────────────────────────────┐
│                         右栏 - 编辑 Tab                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┬─────────────────────────┬────────────────────┐  │
│  │          │                         │                    │  │
│  │ 组件列表 │       画布区域           │     属性面板       │  │
│  │          │                         │                    │  │
│  │ ├─ 组件A │    ┌────────────────┐   │  title: [______]   │  │
│  │ ├─ 组件B │    │                │   │  count: [______]   │  │
│  │ └─ 组件C │    │   可视化编辑   │   │                    │  │
│  │          │    │      区域       │   │  ─────────────────  │  │
│  │          │    │                │   │                    │  │
│  │          │    └────────────────┘   │                    │  │
│  │          │                         │                    │  │
│  └──────────┴─────────────────────────┴────────────────────┘  │
│    20%              50%                   30%                 │
└─────────────────────────────────────────────────────────────────┘
```

**Puck 内置区域**：
| 区域 | 宽度占比 | 功能 |
|:-----|:---------|:-----|
| 组件列表 | 20% | 可用组件拖拽列表 |
| 画布 | 50% | 拖拽放置组件、可视化编辑 |
| 属性面板 | 30% | 选中组件的属性编辑 |

### 4.3 组件来源

Puck 编辑器提供内置的组件选择器，位于编辑 Tab 内部左侧。

**组件列表来源**：
1. **Demo 组件** - 用户定义的 Demo 主组件
2. **子组件** - Demo 内定义的子组件（如 Header、Footer 等）
3. **预设组件** - Puck 内置的布局组件（Heading、Paragraph、Image、Button 等）

---

## 五、实施步骤

### 5.1 第一阶段：基础集成

| 任务 | 说明 | 预估工时 |
|:-----|:-----|:---------|
| 安装 Puck | `npm i @puckeditor/core` | 0.5h |
| 创建 Puck 编辑器组件 | `components/demo/puck-editor.tsx` | 2h |
| 基础数据转换器 | Demo ↔ Puck Data 互转 | 3h |
| 集成到编辑页面 | 添加可视化编辑 Tab | 2h |

### 5.2 第二阶段：数据绑定

| 任务 | 说明 | 预估工时 |
|:-----|:-----|:---------|
| 双向同步机制 | 代码 ↔ 可视化 实时同步 | 3h |
| Schema 到 Fields 映射 | JSON Schema → Puck Fields | 3h |
| 组件库注册 | 注册 Demo 组件到 Puck | 2h |

### 5.3 第三阶段：交互优化

| 任务 | 说明 | 预估工时 |
|:-----|:-----|:---------|
| 预览区集成 | Puck 预览 ↔ Sandpack 预览 | 2h |
| AI 对话集成 | AI 修改代码 → 同步到 Puck | 2h |
| 保存逻辑修改 | 支持 Puck Data 保存 | 2h |

---

## 六、关键实现细节

### 6.1 右栏 Tab 组件封装

```typescript
// components/demo/right-panel.tsx
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfigForm } from "./config-form";
import { PuckEditor } from "./puck-editor";

interface RightPanelProps {
  // 配置相关
  schema: string;
  configData: Record<string, unknown>;
  onConfigChange: (data: Record<string, unknown>) => void;

  // Puck 相关
  puckConfig: PuckConfig;
  puckData: PuckData;
  onPuckChange: (data: PuckData) => void;
}

export function RightPanel({
  schema,
  configData,
  onConfigChange,
  puckConfig,
  puckData,
  onPuckChange,
}: RightPanelProps) {
  return (
    <Tabs defaultValue="config" className="h-full">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="config">配置</TabsTrigger>
        <TabsTrigger value="edit">编辑</TabsTrigger>
      </TabsList>

      <TabsContent value="config" className="h-full">
        <ConfigForm
          schema={schema}
          onChange={onConfigChange}
          initialData={configData}
        />
      </TabsContent>

      <TabsContent value="edit" className="h-full">
        <PuckEditor
          config={puckConfig}
          data={puckData}
          onChange={onPuckChange}
        />
      </TabsContent>
    </Tabs>
  );
}
```

### 6.2 Puck 编辑器组件

```typescript
// components/demo/puck-editor.tsx
"use client";

import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";

interface PuckEditorProps {
  config: PuckConfig;
  data: PuckData;
  onChange: (data: PuckData) => void;
}

export function PuckEditor({ config, data, onChange }: PuckEditorProps) {
  return (
    <div className="h-full w-full">
      <Puck
        config={config}
        data={data}
        onPublish={({ data }) => onChange(data)}
        header={{
          title: "",
          componentsList: { show: true },
          exportBtn: { render: () => null },
        }}
      />
    </div>
  );
}
```

> ⚠️ **注意**：Puck 使用 `onPublish` 回调而非 `onChange`。`onPublish` 在用户每次发布（保存）时触发，而非每次编辑时触发。如需实时同步，需配合 `onChange` 使用。

### 6.3 数据转换器

```typescript
// lib/puck-converter.ts
export function demoToPuck(code: string, schema: object): PuckConfig {
  // 1. 解析 code 获取组件定义
  // 2. 解析 schema 获取字段定义
  // 3. 构建 Puck config
}

export function puckToDemo(data: PuckData): { code: string; schema: object } {
  // 1. 遍历 Puck data.content
  // 2. 生成 React JSX 代码
  // 3. 从组件字段提取 schema
}
```

### 6.4 临时空间同步机制

#### 6.4.1 现有 Session 管理架构

**相关代码**：`packages/web/src/lib/session-manager.ts`

现有 Session 管理采用临时工作空间隔离模式：

```
sessions/{userId}/{projectId}/{sessionId}/
├── .session.json          # 会话元数据
├── index.tsx             # Demo 组件代码
└── config.schema.json     # Demo 配置 Schema
```

**关键流程**：
1. **创建会话**：`createEditSession()` 复制 `workspace/` 到临时目录
2. **读取文件**：`getEditSession()` 从临时目录读取 `index.tsx` 和 `config.schema.json`
3. **保存变更**：`saveEditSession()` 将临时目录内容合并回 `workspace/`

#### 6.4.2 Puck 编辑后的同步策略

Puck 的 `onPublish` 回调仅在用户点击发布时触发，需要实现写入临时空间的同步机制：

```typescript
// 编辑页面处理 Puck 发布
const handlePuckPublish = ({ data }: { data: PuckData }) => {
  // 1. Puck Data → code + schema
  const { code, schema } = puckToDemo(data);

  // 2. 写入临时空间（通过 API）
  fetch(`/api/sessions/${sessionId}/files`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, schema }),
  });

  // 3. 更新前端状态（保持 UI 一致）
  setCode(code);
  setSchema(schema);
};
```

#### 6.4.3 新增 API 端点

需要新增或扩展 Session 文件 API：

```typescript
// PUT /api/sessions/{sessionId}/files
// 更新 Session 临时空间的文件
{
  code: string;      // index.tsx 内容
  schema: string;    // config.schema.json 内容
}
```

**现有 API 参考**：`packages/web/src/app/api/sessions/route.ts`

#### 6.4.4 同步时序图

```
用户点击 Puck 发布
      │
      ▼
onPublish({ data }) 触发
      │
      ▼
puckToDemo(data) 转换
      │
      ├──► code + schema
      │
      ▼
PUT /api/sessions/{sessionId}/files
      │
      ▼
写入临时空间文件
  sessions/{userId}/{projectId}/{sessionId}/
  ├── index.tsx         (更新)
  └── config.schema.json (更新)
      │
      ▼
返回前端状态更新
  setCode(code)
  setSchema(schema)
      │
      ▼
Sandpack 预览自动刷新
```

#### 6.4.5 注意事项

| 方面 | 说明 |
|:-----|:-----|
| **触发时机** | 仅在 `onPublish` 时同步，非实时 |
| **写入路径** | `tempWorkspace/index.tsx` 和 `tempWorkspace/config.schema.json` |
| **API 依赖** | 需扩展现有的 `/api/sessions/{sessionId}/files` PUT 接口 |
| **前端状态** | 同步后需更新 `code` 和 `schema` 状态，触发 Sandpack 刷新 |

---

## 八、风险评估

| 风险 | 等级 | 应对措施 |
|:-----|:-----|:---------|
| Puck 与 Sandpack 冲突 | 中 | 视觉模式和预览模式互斥 |
| 数据转换丢失信息 | 中 | 实现双向转换的 roundtrip 测试 |
| Schema 复杂类型不支持 | 低 | 初期仅支持基础类型字段 |
| 用户体验割裂 | 中 | 保证两种模式的数据一致性 |
| Puck onPublish vs onChange | 中 | Puck 的 `onPublish` 仅在发布时触发，需确认是否需要 `onChange` 实时同步 |
| Puck CSS 样式污染 | 低 | 需隔离 puck.css 避免影响现有样式 |

---

## 七、集成难度评估

### 7.1 总体难度：**中等偏高**

核心难点在于 **Puck 数据模型 ↔ 现有 Figma 格式** 的双向转换。

### 7.2 现有数据流 vs Puck 期望的数据流

| 方面 | 现有系统 | Puck 期望 |
|:-----|:---------|:----------|
| **存储格式** | `=== DEMO CODE ===` + `=== DEMO SCHEMA ===` 分隔符格式 | Puck 专用 JSON |
| **代码位置** | Session 临时目录 `index.tsx` | Puck 内部状态 |
| **预览渲染** | Sandpack（直接运行 `index.tsx`） | Sandpack 或 Puck Render |
| **状态管理** | React `useState` + 实时 Textarea 编辑 | Puck 内部 drag-drop 状态 |

### 7.3 关键技术难点

#### 难点一：Demo 组件注册

Puck 需要将用户的 Demo 组件注册为可拖拽组件，每个 Demo 的 `DemoProps` 不同，需要 **动态生成** config：

```typescript
const config = {
  components: {
    // 用户 Demo 组件（需要动态生成）
    DemoComponent: {
      fields: {
        // 从 config.schema.json 映射字段
        title: { type: 'text' },
        count: { type: 'number' },
      },
      render: ({ title, count }) => (
        <DemoComponent title={title} count={count} />
      ),
    },
  },
};
```

#### 难点二：Puck Data ↔ code+schema 双向转换

```typescript
// Puck Data 结构
{ root: { props: {} }, content: [{ type: 'DemoComponent', props: {...} }] }

// 现有 code+schema 结构
code: "export default function Demo({ title, count }) {...}"
schema: "{ type: 'object', properties: { title: {...}, count: {...} } }"
```

**问题**：
- Puck 的 `content` 是组件树，现有的 `code` 是完整的单个组件文件
- 需要解析 JSX 生成树，或从树生成 JSX
- **信息可能丢失**：Puck 的 field 类型有限（text, number, select），复杂的 JSON Schema 类型无法映射

#### 难点三：Puck onPublish 触发时机

Puck 的 `onPublish` **仅在用户点击发布时触发**，不是实时编辑触发：

| 同步方式 | 优点 | 缺点 |
|:---------|:-----|:-----|
| 仅 onPublish 同步 | 实现简单 | 用户编辑后需等待发布才能预览 |
| 定时轮询 | 实时 | 性能差，不推荐 |
| 接受现状 | 实现简单 | 体验有割裂感 |

### 7.4 难度分级任务表

| 阶段 | 任务 | 难度 | 说明 |
|:-----|:-----|:-----|:-----|
| 基础 | 安装 `@puckeditor/core` | 低 | npm 安装，无特殊配置 |
| 基础 | 右栏 Tab UI 集成 | 低 | 复用现有 shadcn/ui Tabs 组件 |
| **高** | Demo → Puck config 动态转换器 | **高** | 需要解析 JSX 获取组件定义 |
| **高** | Puck Data → code+schema 转换器 | **高** | 需要生成完整 React 组件代码 |
| 中 | `onPublish` 写入临时空间 | 中 | 扩展现有 API 接口 |
| 中 | Schema → Puck Fields 映射 | 中 | 复杂类型可能丢失信息 |

### 7.5 风险与建议

| 风险 | 等级 | 建议 |
|:-----|:-----|:-----|
| 双向转换信息丢失 | 中 | 先做 Demo 版：仅支持简单类型（string, number, boolean, enum） |
| Puck field 类型有限 | 中 | 初期仅支持基础类型字段 |
| 动态 config 生成复杂度 | 高 | 考虑使用 `useMemo` 缓存生成的 config |

### 7.6 实施建议

**建议分阶段实施**：

1. **第一阶段（MVP）**：
   - 仅支持简单类型的 Demo 组件
   - Puck 仅用于属性编辑，不支持拖拽新增组件
   - 验证数据流完整性

2. **第二阶段（完善）**：
   - 支持更多 JSON Schema 类型
   - 支持拖拽新增预设组件（如 Heading、Paragraph）

3. **第三阶段（扩展）**：
   - 支持子组件定义
   - 组件市场导入

---

## 九、后续优化方向

| 优化项 | 说明 |
|:-------|:-----|
| 预设模板 | 提供常用页面模板快速创建 |
| 组件市场 | 支持导入外部组件库 |
| 历史版本 | 可视化编辑历史记录 |
| 协作功能 | 多用户同时编辑 |
| Puck Render 组件 | Puck 提供 `<Render>` 组件用于渲染已保存的数据，可考虑替代部分 Sandpack 预览功能 |

---

## 十、参考资料

- [Puck 官方文档](https://puckeditor.com/docs)
- [Puck GitHub](https://github.com/puckeditor/puck)
- [现有编辑页面源码](../项目文档/Web前端/页面模块/技术/02_页面组件设计.md)

---

## 十一、关联代码路径

> 以下为与本方案相关的现有代码文件路径，基于 v1.0 版本代码库分析。

### 10.1 编辑页面核心

| 文件路径 | 说明 | 关联度 |
|:---------|:-----|:------:|
| [packages/web/src/app/demo/[id]/edit/page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/app/demo/[id]/edit/page.tsx) | Demo 编辑页面主入口，三栏布局实现 | 核心 |
| [packages/web/src/components/demo/home-page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/components/demo/home-page.tsx) | Demo 列表首页 | 参考 |
| [packages/web/src/app/demo/[id]/page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/app/demo/[id]/page.tsx) | Demo 预览页面 | 参考 |

### 10.2 预览与配置组件

| 文件路径 | 说明 | 关联度 |
|:---------|:-----|:------:|
| [packages/web/components/demo/PreviewPanel.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/components/demo/PreviewPanel.tsx) | Sandpack 预览区组件，基于 @codesandbox/sandpack-react | 核心 |
| [packages/web/components/demo/ConfigForm.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/components/demo/ConfigForm.tsx) | RJSF 配置表单，基于 @rjsf/core | 核心 |
| [packages/web/components/demo/widgets.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/components/demo/widgets.tsx) | RJSF 自定义控件 | 参考 |
| [packages/web/components/demo/types.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/components/demo/types.ts) | 类型定义（PreviewPanelProps, ConfigFormProps 等） | 核心 |

### 10.3 数据处理与校验

| 文件路径 | 说明 | 关联度 |
|:---------|:-----|:------:|
| [packages/web/lib/parser.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/lib/parser.ts) | Figma 格式解析器（parseFigmaText/buildFigmaText） | 核心 |
| [packages/web/lib/validator.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/lib/validator.ts) | 一致性校验服务（validateAll/getDefaultValues/getPreviewSize） | 核心 |
| [packages/web/src/lib/sandpack-deps.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/lib/sandpack-deps.ts) | Sandpack 依赖提取 | 参考 |

### 10.4 AI 对话组件

| 文件路径 | 说明 | 关联度 |
|:---------|:-----|:------:|
| [packages/web/src/components/ai-elements/ai-chat.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/components/ai-elements/ai-chat.tsx) | AI 对话组件，基于 AI Elements | 核心 |

### 10.5 现有依赖（package.json）

| 包名 | 版本 | 用途 | 方案是否依赖 |
|:-----|:-----|:-----|:----------:|
| @codesandbox/sandpack-react | ^2.20.0 | 预览区 | ✅ 共用 |
| @rjsf/core | ^6.4.2 | 配置表单 | ✅ 共用 |
| @rjsf/validator-ajv8 | ^6.4.2 | RJSF 校验器 | ✅ 共用 |
| @puckeditor/core | 未安装 | Puck 视觉编辑器 | 🔲 待新增 |

### 10.6 关键技术细节

**三栏布局实现**（edit/page.tsx 第 388-537 行）：
```typescript
<ResizablePanelGroup direction="horizontal" defaultSizes={[35, 35, 30]} minSizes={[20, 20, 20]}>
  {/* 左栏：AI 对话 / 代码编辑 Tab */}
  <ResizablePanel>...</ResizablePanel>
  {/* 中栏：预览区 */}
  <ResizablePanel>...</ResizablePanel>
  {/* 右栏：配置面板（待扩展为 Tab 切换） */}
  <ResizablePanel>...</ResizablePanel>
</ResizablePanelGroup>
```

**数据流关键函数**：
- `parseFigmaText()` — 解析编辑器内容，提取 code 和 schema
- `buildFigmaText()` — 构建编辑器内容，合并 code 和 schema
- `validateAll()` — 校验 code 和 schema 一致性
- `getDefaultValues()` — 从 schema 提取默认值
- `getPreviewSize()` — 从 schema 提取预览尺寸

**ConfigForm Props 接口**：
```typescript
interface ConfigFormProps {
  schema: string;                           // JSON Schema 字符串
  onChange: (data: Record<string, unknown>) => void;
  initialData?: Record<string, unknown>;
  readonly?: boolean;
  className?: string;
}
```

---

## 十二、审批

| 角色 | 意见 | 签字 | 日期 |
|:-----|:-----|:-----|:-----|
| 负责人 | | | |
| 技术评审 | | | |
