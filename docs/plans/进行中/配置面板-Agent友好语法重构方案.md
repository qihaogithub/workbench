# 配置面板 Agent 友好语法重构方案

> **创建日期**: 2026-07-30
> **状态**: 设计中
> **目标**: AI 用自然的 TS 对象字面量书写配置，编译器自动产出 `config.schema.json`，所有运行时消费者零改动

---

## 1. 背景与动机

### 当前问题

**JSON Schema 对 AI 不够顺手：**

- 分组需要嵌套 `ui:options.group`，AI 写 `"底部按钮组"` 作为分组名时需要：
  ```json
  "properties": {
    "buttonText": {
      "type": "string",
      "ui:options": { "group": "底部按钮组" }
    }
  }
  ```
  相比之下，TS 对象字面量可以用顶层 key 直接表达分组。

- 如果 AI 不写 `ui:options.group`，前端 `schema-parser.ts:79-135` 的 `detectGroup()` 会按字段名硬匹配推断分组（`color*` → "颜色配置"），AI 无法控制用户看到的分组结构。

- `$demo` 自定义扩展与标准 JSON Schema 属性混在同一层级，AI 需要区分"这是标准属性还是 workbench 自定义"。

**但运行时生态已经成熟：**

- `config.schema.json` 被 15+ 个站点直接读盘消费（author-site API、Yjs 协作编辑、embed 路由、project-core 校验、knowledge-service 索引、canvas/screenshot tools 等）。
- demo-ui 的 `parseSchemaToFields()` 稳定消费 JSON Schema 字符串。
- 这些消费者不需要关心配置定义文件的书写格式，只需要 JSON Schema。

### 设计目标

1. AI 用 TS 对象字面量书写配置，分组通过顶层 key 直接表达
2. `config.schema.json` 作为编译产物自动生成，所有现有消费者零改动
3. 编译发生在写入时（writeFile hook），不发生在读取时
4. 向后兼容：存量项目无 `config.ts` 时 `config.schema.json` 照常工作
5. 磁盘上 `config.ts` 是 AI 的书写面，`config.schema.json` 是机器产物，两者共存互不冲突

---

## 2. 总体方案：写入时编译，双文件共存

```
AI 写入 config.ts
        │
        ▼
  writeFile hook 检测到 config.ts
        │
        ├─ 编译 config.ts → JSON Schema 字符串
        ├─ 校验（$preview 存在性、字段 type 合法性）
        ├─ 写入 config.schema.json 到磁盘
        └─ 返回编译结果给 AI（成功/失败+建议）
                │
                ▼
    config.schema.json（自动产出，只读产物）
        │
        ├── author-site API ────────► 不变
        ├── Yjs 协作编辑 ───────────► 不变
        ├── embed 路由 ──────────────► 不变
        ├── project-core 校验 ───────► 不变
        ├── knowledge-service 索引 ──► 不变
        ├── demo-ui parseSchemaToFields() ─► 不变
        └── 其他 10+ 读盘点 ────────► 全部不变
```

**核心决策：**

| 决策 | 说明 |
|------|------|
| `config.ts` 是 AI 的书写面 | AI 只写 `config.ts`，不直接写 `config.schema.json` |
| `config.schema.json` 是编译产物 | 由编译器自动生成，不应被 AI 或用户手动编辑 |
| 编译发生在写入时 | writeFile/editFile hook 在 AI 写入 `config.ts` 后触发编译 |
| 所有读盘点零改动 | 继续读 `config.schema.json`，对 TS 格式无感知 |
| 存量兼容 | 无 `config.ts` 的项目，`config.schema.json` 照常工作 |

---

## 3. config.ts 格式规范

### 完整示例

```ts
export default {
  $preview: { width: 375, height: 812 },
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
    bannerImage: { type: "image", title: "横幅图", accept: "image/*", maxSize: 5242880, minWidth: 750, minHeight: 300 },
    gallery: { type: "imageList", title: "轮播图", maxItems: 6 },
  },

  "内容配置": {
    richContent: { type: "richtext", title: "正文", default: "" },
    linkUrl: { type: "string", title: "链接", format: "url", default: "" },
  },
};
```

### 语法规则

| 层级 | 规则 |
|------|------|
| **顶层** | `"$xxx"` 开头的 key 是元数据，其余全是分组 |
| **分组** | 值为对象，每个 key 是一个配置字段 |
| **字段** | 值为描述该字段属性的对象 |

### 元数据顶层 key（`$` 前缀）

| Key | 类型 | 说明 | 编译为 |
|------|------|------|--------|
| `$preview` | `{ width, height }` | 预览尺寸 | `$demo.previewSize` |
| `$positionable` | `{ items, defaults?, size? }` | 可自由定位的字段 | `$demo.positionable` |

### 字段属性

**基本属性：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `type` | `"string" \| "number" \| "integer" \| "boolean" \| "text" \| "color" \| "image" \| "imageList" \| "array" \| "richtext" \| "enum"` | 字段值类型 + UI 控件 |
| `title` | `string` | 显示标签 |
| `default` | 对应类型的值 | 默认值 |
| `required` | `boolean` | 是否必填（默认 false） |

### config.ts type → JSON Schema 编译映射

`config.ts` 的 `type` 是 workbench 领域类型（不是原始 JSON Schema type），编译器负责映射：

| config.ts `type` | JSON Schema 输出 |
|---|---|
| `"string"` | `{ type: "string" }` |
| `"number"` | `{ type: "number" }` |
| `"integer"` | `{ type: "integer" }` |
| `"boolean"` | `{ type: "boolean" }` |
| `"text"` | `{ type: "string", maxLength: 1000 }`（长文本输入框） |
| `"color"` | `{ type: "string", format: "color" }` |
| `"image"` | `{ type: "string", format: "image" }` |
| `"imageList"` | `{ type: "array", items: { type: "string" } }` |
| `"array"` | `{ type: "array" }` + 按 `children` 或 `variants` 生成 items 结构 |
| `"richtext"` | `{ type: "string", ui:widget: "richtext" }` |
| `"enum"` | `{ type: "string" }` + 注入 `enum`/`enumNames` |

**类型专属属性：**

| 属性 | 适用 type | 说明 |
|------|-----------|------|
| `enum` | `"enum"` | 可选项值列表 |
| `enumNames` | `"enum"` | 可选项显示名 |
| `min` | `"number"`, `"integer"` | 最小值 |
| `max` | `"number"`, `"integer"` | 最大值 |
| `maxLength` | `"string"`, `"text"` | 最大字符数 |
| `accept` | `"image"` | 文件类型限制，如 `"image/*"` |
| `maxSize` | `"image"` | 文件大小限制（字节） |
| `minWidth` | `"image"` | 图片最小宽度（px） |
| `minHeight` | `"image"` | 图片最小高度（px） |
| `maxWidth` | `"image"` | 图片最大宽度（px） |
| `maxHeight` | `"image"` | 图片最大高度（px） |
| `maxItems` | `"imageList"`, `"array"` | 数组最多元素数量 |
| `collapsed` | `"array"` | 数组项默认折叠（默认 true，设为 false 时第一项自动展开） |
| `itemTitleField` | `"array"` | 数组项标题取自哪个子字段的 key（编译为 `ui:options.itemTitleField`） |

**数组级别 `_` 前缀属性：**

以 `_` 开头的 key 是数组级约束，不是子字段：

| 属性 | 说明 | 编译为 |
|------|------|--------|
| `_fixed` | 固定数量，隐藏添加和删除按钮，仅允许排序和编辑 | `ui:options.fixed` |

**跨类型属性：**

| 属性 | 类型 | 说明 |
|------|------|------|
| `widget` | `string` | 强制指定 UI 控件 |
| `format` | `string` | 格式（如 `"url"`） |
| `category` | `string` | 配置分类筛选 |
| `visibleWhen` | `{ field, equals }` | 条件显示 |
| `note` | `string` | 字段备注 |

### 数组字段

**对象数组（带子字段）：**

```ts
"商品列表": {
  items: {
    type: "array",
    maxItems: 10,
    collapsed: false,
    itemTitleField: "name",
    children: {
      name: { type: "string", title: "商品名", default: "" },
      price: { type: "number", title: "价格", default: 0 },
    },
  },
},
```

**简单字符串数组（如图片列表，无需子字段）：**

```ts
"轮播图": {
  gallery: { type: "imageList", maxItems: 6 },
},
```

**数组变体（多态模块数组）：**

当数组项可以是不同类型时，用 `variants` 表达。每个 variant 的 key 即为模块类型标识，编译器自动注入 `const` 区分字段。排序自动启用，无需额外标记：

```ts
"模块列表": {
  modules: {
    type: "array",
    title: "模块列表",
    variants: {
      image: {
        title: "图片模块",
        imageUrl: { type: "image", title: "图片" },
      },
      video: {
        title: "视频模块",
        _maxItems: 1,
        videoBg: { type: "image", title: "视频背景" },
        videoCover: { type: "image", title: "视频封面" },
      },
      progress: {
        title: "进度模块",
        _maxItems: 1,
        progressBgTop: { type: "image", title: "进度背景-上" },
        progressBgMiddle: { type: "image", title: "进度背景-中" },
        progressBgBottom: { type: "image", title: "进度背景-下" },
      },
    },
    default: [
      { variant: "image", imageUrl: "" },
      { variant: "progress", progressBgTop: "", progressBgMiddle: "", progressBgBottom: "" },
      { variant: "image", imageUrl: "" },
      { variant: "video", videoBg: "", videoCover: "" },
      { variant: "image", imageUrl: "" },
    ],
  },
},
```

**数组变体规则：**

| 概念 | 规则 |
|------|------|
| 变体标识 | variant key 即为模块类型标识（编译为 `oneOf` 中的 `const` 区分字段） |
| 排序 | `type: "array"` + `variants` 自动启用拖拽排序，无需标记 |
| 数量限制 | 每个 variant 内可用 `_maxItems` 控制该类型最大数量（缺省无限制） |
| 固定数量 | 数组级 `_fixed: true` 隐藏添加和删除按钮，仅允许排序和编辑 |
| 默认值 | `default` 数组中每个元素需包含 `variant` 字段指明类型 |
| `_` 前缀属性 | `_maxItems`、`_fixed` 等以 `_` 开头的 key 是变体约束或数组约束，不属于子字段 |

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
        imageUrl: { type: "image", title: "图片" },
        _maxItems: 1,
      },
      video: {
        videoUrl: { type: "string", title: "视频链接", default: "" },
        _maxItems: 1,
      },
    },
  },
},
```

变体中以 `_` 前缀的属性是变体专属约束（如 `_maxItems`），不属于子字段。编译时提取到对应 oneOf 变体的 `$demo` 中。

### 格式约束

- 顶层必须是 `export default { ... }`（对象字面量，不支持 `export default config` 变量引用）
- 支持 `//` 和 `/* */` 注释
- 解析基于 `acorn` AST，自然兼容 ES 语法：无引号 key、单/双引号 key、尾逗号等
- 不支持表达式（如函数调用、模板字符串、运算、变量引用），AST 遍历时遇到非字面量节点会报错

---

## 4. 编译器

### 位置

`packages/shared/src/config-compiler.ts`

### 依赖

`acorn`（纯 JS 解析器，~130KB），安装到 `@workbench/shared`：

```bash
pnpm --filter @workbench/shared add acorn
```

### 导出

```ts
// 编译 config.ts 源码 → JSON Schema 字符串
// 编译失败抛出 ConfigCompileError（含错误位置和建议）
export function compileConfigTs(source: string): string;
```

### 解析策略：acorn AST

不使用 `JSON.parse` + 字符串预处理。使用 `acorn` 解析完整 AST，遍历提取字面量值：

```ts
import { parse } from "acorn";
import type { Node, ObjectExpression, Property, ArrayExpression, Literal } from "acorn";

// 解析语法树
const ast = parse(source, { ecmaVersion: 2022, sourceType: "module" });

// 找到 export default 声明，提取其 ObjectExpression
// 递归遍历 ObjectExpression → 字面量还原为 JS 值 → 得到中间结构
```

**为什么用 AST 而不是 JSON.parse：**

| 场景 | JSON.parse | acorn AST |
|------|-----------|-----------|
| `{ bgColor: "#fff" }`（无引号 key） | ❌ 抛异常 | ✅ 正常解析 |
| `{ bgColor: '#fff', }`（尾逗号） | ❌ 抛异常 | ✅ 正常解析 |
| `{ bgColor: "#fff" }`（单引号） | ❌ 抛异常 | ✅ 正常解析 |
| `// comment` 注释 | ❌ 需预处理 strip | ✅ 正常解析 |
| `{ bgColor: getColor() }`（函数调用） | 不适用 | ✅ 检测到非 Literal → 精准报错 |
| 语法错误（缺括号等） | ❌ 无位置信息 | ✅ 行号+列号+错误类型 |

### 编译流程

```
config.ts 源码
  │
  ├─ 1. acorn.parse(source) → AST
  ├─ 2. 找到 ExportDefaultDeclaration → ObjectExpression
  ├─ 3. 递归遍历 AST 节点，将字面量还原为 JS 值（中间结构）
  │     ├─ ObjectExpression → 对象
  │     ├─ ArrayExpression → 数组
  │     ├─ Literal → 原始值
  │     └─ 非字面量节点 → 抛出 ConfigCompileError（含位置）
  ├─ 4. 分离 $xxx 元数据和分组数据
  ├─ 5. 摊平所有分组字段到 properties，每个字段注入 ui:options.group
  ├─ 6. 收集 required 字段到顶层数组
  ├─ 7. 注入 $demo 元数据（previewSize、orderable、positionable 等）
  ├─ 8. 注入 $schema、title、type: "object"
  └─ 9. JSON.stringify() 返回标准 JSON Schema 字符串
```

### 编译输出（与当前 config.schema.json 一致）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Demo 配置",
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "title": "标题",
      "default": "Hello World",
      "ui:options": { "group": "基础信息" }
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

## 5. 集成点

### 5.1 写入钩子（核心变更）

**位置**: `packages/agent-service/src/backends/pi-tools/file-tools.ts`（writeFile）和 `packages/agent-service/src/backends/pi-tools/edit-file-tool.ts`（editFile）

当前逻辑（`file-tools.ts:534-546`）：
```ts
const runtimeValidation = validatePreviewFileWrite(args.path, args.content, ...);
// 有校验问题则追加到 tool result text
```

改造为：

```
AI 写入 config.ts
  │
  ├─ 调用 compileConfigTs(source)
  │   ├─ 编译成功 → 写入 config.schema.json 到磁盘
  │   │             确保与 config.ts 同目录（demos/{pageId}/）
  │   ├─ 编译失败 → 返回错误信息给 AI（不写入 config.schema.json）
  │   └─ ConfigCompileError 包含：行号、具体错误、修复建议
  │
  ├─ 对编译产物执行现有 validatePreviewFileWrite
  │   （$preview 存在性、JSON 语法等现有校验）
  │
  └─ 将校验结果追加到 tool result text
```

**关键行为：**
- 只有写入路径匹配 `**/config.ts` 且编译成功时，才同步产出 `config.schema.json`
- 写入 `config.schema.json` 本身时仍走现有校验逻辑（AI 有时可能误写原格式，保留兜底）
- 编译失败时 AI 看到错误信息，可以修正 `config.ts` 后重试

### 5.2 校验适配

**位置**: `packages/agent-service/src/backends/pi-tools/preview-validation.ts:278-333`

- `validatePreviewFileWrite` 按原样校验 `config.schema.json`（编译产物），不需要感知 `config.ts`
- 在写入钩子中，编译成功后直接调用 `validatePreviewFileWrite` 对编译产物做现有校验

### 5.3 system prompt 更新

**位置**: `packages/author-site/src/lib/agent/prompts/system-prompt.md`

当前 prompt 描述 JSON Schema 格式（第 208-215 行等）。需新增 `config.ts` 格式说明，将示例从 JSON Schema 迁移为 TS 对象字面量。

**引导策略：**
- preinstalled skill `page-lifecycle/SKILL.md`（第 17-44 行）的默认配置模板从 JSON Schema 改为 `config.ts` 格式
- 保留 JSON Schema 格式说明作为降级参考（存量项目可能无 `config.ts`）

### 5.4 reader 端（零改动，仅 `_fixed` 例外）

以下站点全部继续读 `config.schema.json`，**无需任何修改**：

| 消费者 | 读盘方式 |
|--------|----------|
| `author-site` API（fs-utils.ts, project-config.ts, workspace-manager.ts） | 直接读 `config.schema.json` |
| `author-site` embed 路由（iframe/route.ts, embed/page.tsx） | 直接读 `config.schema.json` |
| `author-site` Yjs 协作编辑（edit/page.tsx） | 通过 Yjs 同步 `config.schema.json` |
| `agent-service` AI 上下文（viewer-ai-context.ts） | 直接读 `config.schema.json` |
| `agent-service` session-guard、viewer-readonly-mode | 白名单 `config.schema.json` |
| `agent-service` canvas/screenshot/delete-page tools | 读 `config.schema.json` 提取 `$demo.previewSize` |
| `project-core` service（15+ 引用） | 读 `config.schema.json` |
| `project-core` workspace-resource-registry | 注册 `config.schema.json` 为 `page-schema` 类型 |
| `knowledge-service` index / sqlite-catalog | 读 `config.schema.json` |
| `shared` validator.ts | parse `config.schema.json` |
| `demo-ui` schema-parser.ts, ConfigForm.tsx, config-categories.ts | 消费编译后的 JSON Schema 字符串 |

**demo-ui 微小改动：** `ArrayFieldGroup` 需消费 `ui:options.fixed`：当为 `true` 时隐藏添加和删除按钮，仅保留排序。`schema-parser.ts` 需将 `ui:options.fixed` 透传到 `FieldConfig`。

**Yjs 协作编辑兼容性：** `config.schema.json` 继续通过 Yjs 同步。`config.ts` 仅在 agent-service 写入钩子中产出，不经过 Yjs——Yjs 用户编辑 `config.schema.json` 的场景保持不变（用户通过 UI 表单编辑配置值，不直接编辑 schema 定义）。

---

## 6. 实施计划

### 阶段一：编译器（`packages/shared/`）

1. `pnpm --filter @workbench/shared add acorn`
2. 实现 `compileConfigTs()`（acorn AST 解析 + 中间结构遍历 + JSON Schema 构造）
3. 实现 `ConfigCompileError`（含位置、错误码、修复建议）
4. 编译器单元测试（覆盖所有字段类型、数组、oneOf、合法语法变体、错误场景）
5. 编译输出与现有 `config.schema.json` 100% 兼容

### 阶段二：写入钩子（`packages/agent-service/`）

6. 改造 `file-tools.ts` 的 writeFile：检测 `config.ts` 路径 → 编译 → 写入 `config.schema.json`
7. 改造 `edit-file-tool.ts` 的 editFile：同上
8. 编译错误信息追加到 tool result

### 阶段三：demo-ui `_fixed` 适配

9. `schema-parser.ts`：解析 `ui:options.fixed` → `FieldConfig.fixed`
10. `ArrayFieldGroup.tsx`：`fixed` 时隐藏添加按钮和删除按钮，保留拖拽排序

### 阶段四：system prompt

11. 更新 `system-prompt.md`：
    - 示例从 JSON Schema 改为 `config.ts`
    - 删除 `$demo.sortable` 说明（数组排序由 ArrayFieldGroup 全自动启用，无需标记）
12. 更新 `page-lifecycle/SKILL.md`：模板从 JSON Schema 改为 `config.ts`

### 阶段五：集成测试

13. agent-service 集成测试：写入 `config.ts` → 验证 `config.schema.json` 自动产出
14. 错误场景测试：无效 `config.ts` → 验证 AI 收到明确错误信息

### 阶段六：存量迁移

15. 将所有项目中已有的 `config.schema.json` 转写为 `config.ts` 格式
16. 删除 `config.schema.json`，自此不再兼容直接书写该文件

---

## 7. 测试计划

### 编译单元测试

| 测试用例 | 输入 | 预期 |
|----------|------|------|
| 基本字段 | `export default { "基础": { title: { type: "string", default: "x" } } }` | 输出 properties + 分组信息 |
| 所有 field type | string, number, boolean, color, image, imageList, array, richtext, enum | 正确映射 format/ui:widget |
| required 收集 | 多个字段设 `required: true` | 顶层 required 数组包含对应 key |
| $preview | 设置 `$preview` | $demo.previewSize 正确 |
| $positionable | 设置 `$positionable` | $demo.positionable 正确 |
| visibleWhen | 字段设 `visibleWhen` | ui:options.visibleWhen 正确 |
| category | 字段设 `category` | ui:options.category 正确 |
| note | 字段设 `note` | $demo.note 正确 |
| array + children | 数组字段带 children | 数组 items 结构正确 |
| array + variants | 数组字段带 variants（多态模块） | 生成 oneOf items + const 区分字段 |
| variants _maxItems | variant 内设 `_maxItems: 1` | 对应 oneOf 变体 $demo.maxItems 正确 |
| array _fixed | 数组设 `_fixed: true` | 编译产物 ui:options.fixed = true |
| oneOf variants | 带 variants 的 enum 字段 | oneOf 结构正确 |
| 空配置 | `export default {}` | 空 properties 合法 JSON Schema |
| 无 $preview | 不设 `$preview` | $demo 不存在（由写入钩子另做校验） |
| 多分组 | 3+ 组，每组多个字段 | 分组名保留到 ui:options.group |
| 带注释 | `// comment` 和 `/* */` | 注释被正常跳过，编译成功 |
| 无引号 key | `{ bgColor: { type: "color" } }`（ES 无引号 key） | 正常编译 |
| 单引号 | `{ title: { default: 'hello' } }`（单引号字符串） | 正常编译 |
| 尾逗号 | 对象/数组末尾多余逗号 | 正常编译 |
| 模板字符串 | `` { title: { default: `hello ${name}` } } `` | 抛出 ConfigCompileError（非字面量） |
| 函数调用 | `{ title: { default: getDefaultTitle() } }` | 抛出 ConfigCompileError（非字面量） |
| 语法错误 | `export default { title: { type: "string", }` （缺 `}`） | 抛出 ConfigCompileError，含行号 |
| 非法 field type | `{ title: { type: "slider" } }` | 抛出 ConfigCompileError（未知 type） |
| 非 `export default` | `const x = {}` | 抛出 ConfigCompileError |

### 集成测试（agent-service）

| 测试 | 说明 |
|------|------|
| 写入 config.ts 触发编译 | writeFile `config.ts` → 磁盘上出现 `config.schema.json` |
| `config.schema.json` 内容正确 | 编译产物通过 `validatePreviewFileWrite` |
| 编译失败通知 AI | 无效 `config.ts` → tool result 包含错误信息 |
| 写入 config.schema.json 仍走旧逻辑 | 直接写入 `config.schema.json` 不触发编译 |

---

## 8. 风险

| 风险 | 缓解 |
|------|------|
| AI 写出非字面量语法（模板字符串、函数调用、变量引用等） | acorn AST 遍历时精准检测非字面量节点，返回含行号的明确错误。这些写法在配置定义中没有语义，阻止是合理行为 |
| AI 写出不存在的 field type（如 `type: "slider"`） | 编译器校验 `type` 字段必须在合法值集合内，非法值时返回明确错误和合法值列表 |
| `config.ts` 和 `config.schema.json` 不一致（用户手动编辑了 `config.schema.json`） | `config.ts` 总是源；如果 AI 通过 writeFile 写入 `config.ts`，编译器会覆盖 `config.schema.json`。非 AI 路径（用户通过 API 直接写入 `config.schema.json`）不受影响 |
| Yjs 协作编辑：用户通过 UI 改了 `config.schema.json`，下次 AI 写 `config.ts` 会覆盖 | AI 写 `config.ts` 前应从 `config.schema.json` 获取当前状态作为起点（由 system prompt 引导） |
| 编译错误不影响现有链路 | 编译失败时不写入 `config.schema.json`，现有 JSON Schema 保持不变，不会阻塞前端 |
