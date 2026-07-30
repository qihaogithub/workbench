# 配置面板 Agent 友好语法重构方案

> **创建日期**: 2026-07-30  
> **状态**: 设计中  
> **目标**: 将页面配置定义从 JSON Schema 迁移到 TypeScript 对象字面量，让 AI 用最自然的语法控制字段分组

---

## 1. 背景与动机

### 当前问题

**JSON Schema 对 AI 不友好：**

- 深度嵌套结构：`properties > field > type/title/default > ui:options > group/category/visibleWhen`
- 括号匹配是 AI 语法错误的重灾区（`preview-validation.ts` 已有专门的 `INVALID_JSON` 捕获）
- 分组靠 `ui:options.group`（非标准扩展）或前端硬编码 `detectGroup()` 兜底
- AI 写一个中等复杂度 schema 要 200+ token，其中 40% 是 JSON 花括号和引号

**分组逻辑硬编码在前端：**

- `schema-parser.ts:79-135` 的 `detectGroup()` 根据字段 key 名推断分组（`color*` → "颜色配置"）
- 分组名称和规则写死，AI 无法控制用户看到的分组结构
- 如果 AI 想用 `"底部按钮组"` 作为分组名，必须写 `"ui:options": {"group": "底部按钮组"}`，极其冗长

**磁盘上存在隐式耦合：**

- `config.schema.json` 同时被 author-site（API 读取）、agent-service（AI 上下文/写入校验）、viewer-site（嵌入预览）三处直接读盘
- 任何格式改动要三端同步

### 设计目标

1. AI 不需要学习 JSON Schema 语法，用熟悉的 TS 对象字面量即可
2. 分组是第一公民：顶层 key 就是分组名，不需要自定义扩展属性
3. 磁盘上单一 source of truth，不存在 `config.ts` 与 `config.schema.json` 双文件同步问题
4. 运行时（demo-ui、viewer-site）改动为零，继续消费 JSON Schema 字符串
5. 向后兼容：存量 `config.schema.json` 继续正常工作

---

## 2. 总体方案：服务端按需编译

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  磁盘 (唯一   │ ──► │  config-compiler │ ──► │ 运行时不变    │
│  source of  │     │  (编译为 JSON     │     │ demo-ui 继续  │
│  truth)     │     │   Schema 字符串)  │     │ 读 JSON       │
│             │     │                  │     │ Schema 字符串 │
│ config.ts   │     │ 位于 shared 包    │     └──────────────┘
│ (AI 书写)   │     └──────────────────┘
└──────────────┘
```

**核心决策：**

- `config.ts` 是磁盘上唯一的配置定义文件
- 编译器放在 `@workbench/shared`，author-site 和 agent-service 通过同一个函数读配置
- 编译发生在"读取时"（API 响应 / AI 上下文构建），不在"写入时"
- demo-ui 的 `parseSchemaToFields()` 不变，继续接收 JSON Schema 字符串

---

## 3. config.ts 格式规范

### 完整示例

```ts
export default {
  $preview: { width: 375, height: 812 },
  $orderable: ["header", "content", "footer"],
  $positionable: {
    items: ["logo", "floatingBtn"],
    defaults: { logo: { x: 0, y: 0 } },
    size: { width: 375, height: 812 },
  },

  "基础信息": {
    title: { type: "string", title: "标题", default: "Hello World" },
    description: { type: "text", title: "描述", default: "" },
  },

  "显示选项": {
    showBanner: { type: "boolean", title: "显示横幅", default: true },
    layout: { type: "enum", title: "布局", enum: ["grid", "list"], enumNames: ["网格", "列表"], default: "grid" },
  },

  "颜色配置": {
    bgColor: { type: "color", title: "背景颜色", default: "#ffffff" },
    textColor: { type: "color", title: "文字颜色", default: "#333333" },
  },

  "素材上传": {
    bannerImage: { type: "image", title: "横幅图", widget: "image", accept: "image/*", maxSize: 5242880 },
    gallery: { type: "imageList", title: "轮播图", widget: "imageList", maxItems: 6 },
  },

  "内容配置": {
    richContent: { type: "richtext", title: "正文", widget: "richtext", default: "" },
    linkUrl: { type: "string", title: "链接", format: "url", default: "" },
  },
};
```

### 语法规则

| 层级 | 规则 | 示例 |
|:-----|:-----|:-----|
| **顶层** | `"$xxx"` 开头的 key 是元数据，其余全是分组 | `$preview`, `$orderable`, `"基础信息"` |
| **分组** | 值为对象，每个 key 是一个配置字段 | `title: { ... }` |
| **字段** | 值为描述该字段属性的对象 | `{ type: "string", title: "标题" }` |

### 元数据顶层 key（`$` 前缀）

| Key | 类型 | 说明 | 对应 JSON Schema |
|:----|:-----|:-----|:-----------------|
| `$preview` | `{ width, height }` | 预览尺寸 | `$demo.previewSize` |
| `$orderable` | `string[]` | 可垂直排序的字段名列表 | `$demo.orderable` |
| `$orderableHorizontal` | `string[]` | 可水平排序的字段名列表 | `$demo.orderableHorizontal` |
| `$positionable` | `{ items, defaults?, size? }` | 可自由定位的字段 | `$demo.positionable` |

### 字段属性

**基本类型：**

| 属性 | 类型 | 说明 | 对应 JSON Schema |
|:-----|:-----|:-----|:-----------------|
| `type` | `"string" \| "number" \| "boolean" \| "text" \| "color" \| "image" \| "imageList" \| "richtext" \| "enum"` | 字段值类型 + UI 控件 | `type` / `format` / `ui:widget` |
| `title` | `string` | 显示标签 | `title` |
| `default` | 对应类型的值 | 默认值 | `default` |
| `required` | `boolean` | 是否必填（默认 false） | 编译器收集到顶层 `required[]` |

**类型专属属性：**

| 属性 | 适用 type | 说明 |
|:-----|:----------|:-----|
| `enum` | `"enum"` | 可选项值列表 |
| `enumNames` | `"enum"` | 可选项显示名 |
| `min` | `"number"` | 最小值 |
| `max` | `"number"` | 最大值 |
| `maxLength` | `"string"` | 最大字符数 |
| `accept` | `"image"` | 文件类型限制，如 `"image/*"` |
| `maxSize` | `"image"` | 文件大小限制（字节） |
| `maxItems` | `"imageList"` | 最多上传数量 |

**跨类型属性：**

| 属性 | 类型 | 说明 | 对应 JSON Schema |
|:-----|:-----|:-----|:-----------------|
| `widget` | `string` | 强制指定 UI 控件 | `ui:widget` |
| `category` | `string` | 配置分类筛选 | `ui:options.category` |
| `visibleWhen` | `{ field, equals }` | 条件显示 | `ui:options.visibleWhen` |
| `note` | `string` | 字段备注 | `$demo.note` |

### 数组字段（objects 数组）

```ts
"商品列表": {
  items: {
    type: "array",
    children: {
      name: { type: "string", title: "商品名", default: "" },
      price: { type: "number", title: "价格", default: 0 },
    },
  },
},
```

### oneOf 字段（条件变体）

```ts
"内容区": {
  contentType: {
    type: "enum",
    enum: ["text", "image", "video"],
    enumNames: ["文本", "图片", "视频"],
    default: "text",
    variants: {
      text: {
        textContent: { type: "text", title: "文本内容", default: "" },
      },
      image: {
        imageUrl: { type: "image", title: "图片", widget: "image" },
      },
      video: {
        videoUrl: { type: "string", title: "视频链接", default: "" },
      },
    },
  },
},
```

---

## 4. 编译器架构

### 位置

`packages/shared/src/config-compiler.ts`

两个导出函数：

```ts
// 编译 config.ts 源码 → JSON Schema 字符串
export function compileConfigTs(source: string): string;

// 读取文件系统上的配置定义，返回 JSON Schema 字符串
// 优先读 config.ts，不存在时降级读 config.schema.json
export function readConfigSchema(dirPath: string): string | undefined;
```

### 编译流程

```
config.ts 源码
  │
  ├─ 1. strip 注释（// 和 /* */）
  ├─ 2. 去除 `export default`
  ├─ 3. 提取最外层 `{ ... }`
  ├─ 4. JSON.parse() 得到中间结构
  ├─ 5. 分离 `$xxx` 元数据 和 分组数据
  ├─ 6. 构造 JSON Schema properties（摊平所有分组字段，注入 ui:options.group）
  ├─ 7. 收集 required 字段到顶层数组
  ├─ 8. 注入 $demo 元数据
  └─ 9. JSON.stringify() 返回标准 JSON Schema 字符串
```

### 中间结构（编译步骤 4 后的 TypeScript 类型）

```ts
interface ConfigTsParsed {
  $preview?: { width: number; height: number };
  $orderable?: string[];
  $orderableHorizontal?: string[];
  $positionable?: {
    items: string[];
    defaults?: Record<string, { x: number; y: number }>;
    size?: { width: number; height: number };
  };
  [groupName: string]: Record<string, FieldDef> | unknown;
}

interface FieldDef {
  type: string;
  title?: string;
  default?: unknown;
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  enum?: unknown[];
  enumNames?: string[];
  widget?: string;
  category?: string;
  visibleWhen?: { field: string; equals: string | number | boolean };
  accept?: string;
  maxSize?: number;
  maxItems?: number;
  note?: string;
  children?: Record<string, FieldDef>;
  variants?: Record<string, Record<string, FieldDef>>;
}
```

### 编译输出（JSON Schema 字符串）

与当前 `config.schema.json` 完全一致：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Demo 配置",
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "title": "标题",
      "default": "Hello World"
    },
    "bgColor": {
      "type": "string",
      "title": "背景颜色",
      "format": "color",
      "default": "#ffffff",
      "ui:options": { "group": "颜色配置" }
    }
  },
  "required": ["title"],
  "$demo": {
    "previewSize": { "width": 375, "height": 812 },
    "orderable": ["header", "content", "footer"]
  }
}
```

---

## 5. 集成点改造

### 5.1 author-site API 读取

| 当前代码 | 改造后 |
|:---------|:-------|
| `fs-utils.ts:1567` → `fs.readFileSync(schemaPath, "utf-8")` | `readConfigSchema(demoDir)` |
| `project-config.ts:30` → `fs.readFileSync(filePath, "utf-8")` | `readConfigSchema(workspacePath)` |

`readConfigSchema()` 封装逻辑：

```ts
export function readConfigSchema(dirPath: string): string | undefined {
  const tsPath = path.join(dirPath, "config.ts");
  const jsonPath = path.join(dirPath, "config.schema.json");

  if (fs.existsSync(tsPath)) {
    const source = fs.readFileSync(tsPath, "utf-8");
    return compileConfigTs(source);
  }

  if (fs.existsSync(jsonPath)) {
    return fs.readFileSync(jsonPath, "utf-8");
  }

  return undefined;
}
```

### 5.2 agent-service AI 上下文与校验

| 当前代码 | 改造后 |
|:---------|:-------|
| `viewer-ai-context.ts:67-70` → 直接读 `config.schema.json` | 使用 `readConfigSchema()` 读 |
| `preview-validation.ts:278-333` → 校验 `config.schema.json` 语法 | 触发时机改为 `config.ts` 写入时 |
| `writeFile` 工具 hook → 检测 `config.ts` 写入 | 编译并校验，校验失败则通知 AI |

**写入校验流程：**

```
AI 写入 config.ts
  │
  ├─ tool-hook-manager 检测到 config.ts 写入
  ├─ 调用 compileConfigTs(source)
  ├─ 校验 $preview 存在性
  ├─ 校验每个字段 type 合法
  ├─ 编译成功 → 提示 AI 写入成功
  └─ 编译失败 → 返回明确错误 + 修复建议
```

### 5.3 viewer-site

viewer-site 嵌入预览也需要读取配置：统一改为 `readConfigSchema()`，对编译器无感知。

### 5.4 demo-ui（零改动）

demo-ui 继续接收 JSON Schema 字符串，`parseSchemaToFields()` 不变。

---

## 6. 迁移策略

### 阶段一：编译器落地（本次）

1. 实现 `compileConfigTs()` 和 `readConfigSchema()`
2. 改造 author-site 的所有 `config.schema.json` 读盘点为 `readConfigSchema()`
3. 改造 agent-service 的配置读盘点和写入校验
4. 支持 `config.ts` / `config.schema.json` 共存，优先读 `config.ts`
5. 单元测试覆盖所有字段类型 → JSON Schema 的编译

### 阶段二：AI 过渡期（自然发生）

- AI 开始自然使用 `config.ts` 书写配置（system prompt 会引导它用新格式）
- 存量项目的 `config.schema.json` 继续正常运作
- 不强制迁移存量，`config.schema.json` 永远可作为降级格式存在

### 阶段三：清理（可选，远期）

- 当确认所有活跃项目都迁移到 `config.ts` 后，可移除 `detectGroup()` 硬编码逻辑
- `config.schema.json` 读写保留但不作为推荐路径

---

## 7. 测试计划

### 编译单元测试（`packages/shared/`）

| 测试用例 | 输入 | 预期 |
|:---------|:-----|:-----|
| 基本字段 | `{ "基础": { title: { type: "string", default: "x" } } }` | 输出 properties + 分组信息 |
| 所有 field type | string, number, boolean, color, image, imageList, richtext, enum | 正确映射 format/ui:widget |
| required 收集 | 多个字段设 `required: true` | 顶层 required 数组包含对应 key |
| $preview | 设置 `$preview` | $demo.previewSize 正确 |
| $orderable | 设置 `$orderable` | $demo.orderable 正确 |
| visibleWhen | 字段设 `visibleWhen` | ui:options.visibleWhen 正确 |
| array + children | 数组字段带 children | 数组字段 items 结构正确 |
| oneOf variants | 带 variants 的 enum 字段 | oneOf 结构正确 |
| 无 config.ts 降级 | `config.ts` 不存在 | 返回 `config.schema.json` 内容 |
| 语法错误 | 无效 JS 语法 | 抛出明确错误 |
| 空配置 | `export default {}` | 输出空 properties 的合法 JSON Schema |
| 多分组 | 3+ 组，每组多个字段 | 分组名保留到 ui:options.group |
| category | 字段设 `category: "设计"` | ui:options.category 正确 |

### 集成测试（`packages/agent-service/`）

| 测试 | 说明 |
|:-----|:-----|
| ai-context 包含编译后的 schema | `viewer-ai-context` 输出包含正确的 JSON Schema |
| 写入 config.ts 触发校验 | writeFile hook 校验 $preview 存在性 |
| 编译错误通知 AI | 语法错误时返回明确错误信息 |

---

## 8. 风险与已决策事项

### 风险

| 风险 | 缓解措施 |
|:-----|:---------|
| `config.ts` 解析器不够健壮（AI 可能写出非 JSON 兼容的值） | 编译器只接受 `JSON.parse` 兼容的子集，语法错误给明确提示 |
| `config.ts` 和 `config.schema.json` 共存时语义冲突 | `config.ts` 优先；仅在 `config.ts` 不存在时读 `config.schema.json` |
| agent-service 写 `config.ts` 后前端未刷新到新 schema | 现有 session/file-change 事件保持不变，编译在读时发生，对前端透明 |
| 迁移期间 demo-ui 分组名可能与 `detectGroup()` 旧逻辑冲突 | 编译阶段不在 demo-ui，`detectGroup()` 仅在无 `ui:options.group` 时生效；编译后总有 `group`，不会触发旧逻辑 |

### 已决策

| 决策 | 结论 |
|:-----|:-----|
| 是否支持 TypeScript 类型注解（`const config: Config = { ... } export default config`） | 不支持，只接受 `export default { ... }` |
| 是否支持注释（`//` / `/* */`） | 支持，编译器会 strip 注释后再解析 |
| `config.schema.json` 是否永久保留降级支持 | 是，`readConfigSchema()` 在无 `config.ts` 时退回读 `config.schema.json` |
| `project.config.schema.json` 是否同时迁移 | 是，`readConfigSchema(workspacePath)` 同时处理两个文件 |

---

## 9. 实施顺序

1. 实现 `packages/shared/src/config-compiler.ts`（编译 + 读盘封装）
2. 改造 `packages/author-site/src/lib/fs-utils.ts` 的读盘路径
3. 改造 `packages/author-site/src/lib/project-config.ts` 的读盘路径
4. 改造 `packages/agent-service/src/services/viewer-ai-context.ts` 的读盘路径
5. 改造 `packages/agent-service/src/backends/pi-tools/preview-validation.ts` 支持 `config.ts`
6. 改造 `packages/agent-service/src/backends/managers/tool-hook-manager.ts` 的 config.ts 写入钩子
7. 更新 `packages/agent-service/` 的 system prompt 引导 AI 使用 config.ts
8. 编译单元测试
9. 集成测试
10. 更新 `docs/项目文档/创作端/04-配置与预览/` 文档