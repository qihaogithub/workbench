# Figma 插件导出格式改造方案（Markdown Code Block 版）

> **状态**: 进行中  
> **创建日期**: 2026-05-11  
> **更新日期**: 2026-05-11  
> **目标**: 让 Figma 插件导出符合系统要求的「React 组件代码 + JSON Schema 配置」Markdown 混合格式  
> **关联文档**: [配置系统 Schema 解析器](../项目文档/创作端/04-配置与预览/技术/02_Schema解析器.md)、[代码生成引擎](../项目文档/figma插件/技术/代码生成引擎.md)

---

## 一、现状与问题

### 1.1 系统期望的新格式

创作端新建页面时，要求 Figma 插件导出内容使用 **Markdown Code Block 格式**，同时包含代码和 Schema：

````markdown
# OpenCode Workbench Export

## Component Code

```tsx
import React from 'react';

interface BannerDemoProps {
  /**
   * @title 顶部 Banner 图
   * @format uri
   * @widget image-upload
   */
  banner: string;
  /**
   * @title 活动标题
   */
  title: string;
}

export default function BannerDemo({ banner, title }: BannerDemoProps) {
  return (
    <div className="min-h-screen bg-white">
      <img src={banner} alt="banner" className="w-full h-64 object-cover" />
      <h1 className="text-3xl font-bold">{title}</h1>
    </div>
  );
}
```

## Schema Config

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Demo 配置",
  "type": "object",
  "properties": {
    "banner": {
      "type": "string",
      "format": "uri",
      "title": "顶部 Banner 图",
      "default": "",
      "ui:widget": "file",
      "ui:options": { "accept": "image/*" }
    },
    "title": {
      "type": "string",
      "title": "活动标题",
      "default": ""
    }
  },
  "required": ["banner", "title"]
}
```
````

系统通过 `parseFigmaMarkdown()` 解析该格式，分别提取 `code` 和 `schema` 两个字段。

### 1.2 当前插件导出现状

根据现有技术文档与代码分析，当前 Figma 插件（`packages/backend/src/tailwind/tailwindMain.ts` 等）的导出产物为：

- **单一 TSX 组件代码**：包含 `interface Props` 及 JSX 结构
- **无独立 JSON Schema**：Props 元数据以 JSDoc 注释形式（`@title/@format/@widget`）嵌入代码顶部
- **无 Markdown 包装**：导出内容即为纯代码文本，无 Markdown 分区标记

### 1.3 核心矛盾

| 维度 | 系统要求 | 插件现状 |
|:-----|:---------|:---------|
| 内容结构 | 代码与 Schema 物理分离，Markdown 分区 | 代码与 Props 注释混在一起 |
| 格式规范 | Markdown Code Block 混合格式 | 纯 TSX 代码 |
| Schema 形态 | 标准 JSON Schema（`config.schema.json`） | JSDoc 风格的 Props 接口注释 |
| 消费方式 | `parseFigmaMarkdown()` 直接解析 | 需 AI 二次推断或人工补全 |

---

## 二、改造目标

让 Figma 插件在「导出代码」时，直接输出系统可识别的 Markdown Code Block 格式，实现：

1. **代码与 Schema 自动分离**：插件内部同时生成 TSX 代码和 JSON Schema，通过 Markdown 分区呈现
2. **零额外推断**：系统侧 `parseFigmaMarkdown()` 一次解析即可得到可用内容，无需 AI 二次补全
3. **人类可读性**：用户可以直接阅读导出的 Markdown，代码高亮友好

---

## 三、改造方案

### 3.1 总体思路

在插件的**代码生成引擎后端**（`packages/backend/src/`）增加一层「Markdown 格式组装器」，将原本独立的「代码生成」和「Props 收集」两个流程串联为统一输出：

```
Figma 节点树
    │
    ▼
┌─────────────────┐
│  节点预处理层    │  ← 现有逻辑不变
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌────────────┐
│ 代码生成 │  │ Props 收集  │  ← 现有逻辑，需扩展输出结构
│ (TSX)  │  │ (JSDoc注释) │
└───┬────┘  └─────┬──────┘
    │             │
    └──────┬──────┘
           ▼
    ┌──────────────┐
    │  Props → Schema │  ← 新增：将 JSDoc 注释转为标准 JSON Schema
    │   转换器       │
    └──────┬───────┘
           ▼
    ┌──────────────┐
    │ Markdown 格式组装│  ← 新增：按 Markdown Code Block 格式拼接
    │ (buildFigmaMarkdown)│
    └──────┬───────┘
           ▼
    导出到剪贴板/文件
```

### 3.2 关键改造点

#### 改造点 1：Props 注释 → JSON Schema 转换器（新增模块）

当前 `propsGenerator.ts` 生成的是 JSDoc 风格的 `interface Props`：

```typescript
/**
 * @title 顶部 Banner 图
 * @format uri
 * @widget image-upload
 */
banner: string;
```

需新增转换逻辑，将其转为系统可消费的 JSON Schema。

> **校准说明**：以下映射规则基于系统侧实际代码校准。系统消费 Schema 的入口为 `ConfigFormNew.tsx` 的 `parseSchemaToFields()` 函数，以及 `validator.ts` 中的校验/提取函数。

**A. JSDoc 注释 → JSON Schema 字段映射**

| JSDoc 注释 | JSON Schema 字段 | 说明 | 系统消费位置 |
|:-----------|:-----------------|:-----|:-------------|
| `@title` | `title` | 配置项显示名称 | ConfigFormNew → FieldConfig.title |
| `@format` | `format` | 数据格式（uri / color / date 等） | ConfigFormNew → FieldConfig.format；`format: "color"` 触发颜色选择器 |
| `@widget` | `ui:widget` | 控件类型覆盖 | ConfigFormNew → FieldConfig.uiWidget |
| `@group` | `$demo.group` | 分组信息，映射到属性级扩展字段 | 与 `$demo.note` 同级，ConfigFormNew 待增强读取 |
| `@order` | `$demo.order` | 顺序信息，映射到属性级扩展字段 | 与 `$demo.note` 同级，ConfigFormNew 待增强读取 |
| 字段类型 | `type` | `string/number/boolean/array/object` | ConfigFormNew → FieldConfig.type |
| 默认值 | `default` | 按 [默认值生成规则](#默认值生成规则) 填充 | validator.ts → getDefaultValues() |
| — | `description` | 字段说明（JSDoc 注释首行非标记文本，或留空） | ConfigFormNew → FieldConfig.description |
| — | `enum` | 枚举值列表（联合类型自动提取） | ConfigFormNew → FieldConfig.enum |
| — | `enumNames` | 枚举显示名（与 enum 一一对应） | ConfigFormNew → FieldConfig.enumNames |
| — | `minimum` / `maximum` | 数值范围约束 | ConfigFormNew → FieldConfig.minimum / maximum |
| — | `maxLength` | 文本最大长度 | ConfigFormNew → FieldConfig.maxLength |
| — | `ui:options` | 控件选项（如 `{ accept: "image/*" }`） | ConfigFormNew → FieldConfig.uiOptions |
| — | `$demo.note` | 字段备注（HTML，由用户在配置面板中编辑） | ConfigFormNew → FieldConfig.note |

**B. @widget 值映射（Figma 插件 → 系统 ui:widget）**

Figma 插件生成的 `@widget` 值与系统 `ConfigFormNew` 消费的 `ui:widget` 值存在命名差异，转换时需做映射：

| Figma @widget 值 | 系统 ui:widget 值 | ui:options | 说明 |
|:------------------|:------------------|:-----------|:-----|
| `image-upload` | `"file"` | `{ accept: "image/*" }` | 单图上传，系统使用 FileUploadWidget |
| `video-upload` | `"file"` | `{ accept: "video/*" }` | 视频上传，复用 FileUploadWidget + accept 过滤 |
| `input` | （省略） | — | 默认文本输入框，无需指定 widget |
| `richtext` | `"richtext"` | — | 富文本，系统使用 RichTextWidget |
| `color-picker` | （省略） | — | 颜色选择器，通过 `format: "color"` 触发 |
| `image-list` | `"imageList"` | `{ maxItems: 20 }` | 多图列表，系统使用 ImageListWidget |

> **关键差异**：Figma 插件使用 `image-upload` / `video-upload` 等语义化命名，但系统侧统一使用 `"file"` widget + `ui:options.accept` 区分文件类型。转换器必须做此映射，否则系统无法识别控件。

**C. #slot/#list 标记类型 → JSON Schema 属性完整映射**

| Figma 标记 | Props 类型 | JSON Schema 属性定义 | 默认值 |
|:-----------|:-----------|:---------------------|:-------|
| `#slot:img:{id}` | `string` | `{ type: "string", format: "uri", ui:widget: "file", ui:options: { accept: "image/*" } }` | `""` |
| `#slot:text:{id}` | `string` | `{ type: "string" }`（默认 Input） | `""` |
| `#slot:text:{id}`（富文本） | `string` | `{ type: "string", ui:widget: "richtext" }` | `""` |
| `#slot:video:{id}` | `string` | `{ type: "string", format: "uri", ui:widget: "file", ui:options: { accept: "video/*" } }` | `""` |
| `#slot:color:{id}` | `string` | `{ type: "string", format: "color" }` | `"#000000"` |
| `#slot:lottie:{id}` | `string` | `{ type: "string", format: "uri" }` | `""` |
| `#slot:svga:{id}` | `string` | `{ type: "string", format: "uri" }` | `""` |
| `#slot:unity:{id}` | `string` | `{ type: "string" }` | `""` |
| `#list:{id}` | `Array<object>` | `{ type: "array", items: { type: "object" } }` | `[]` |

> **注意**：`#slot:text` 默认生成普通 Input，若需富文本需设计师在 Figma 中手动指定 `@widget richtext`，或由系统侧根据字段语义自动推断。

**D. TypeScript 类型 → JSON Schema 类型映射**

与系统侧 `schema-generator.ts` 的 `mapTypeToSchema()` 保持一致：

| TypeScript 类型 | JSON Schema 类型 | 说明 |
|:----------------|:-----------------|:-----|
| `string` | `{ type: "string" }` | — |
| `number` / `integer` | `{ type: "number" }` | — |
| `boolean` | `{ type: "boolean" }` | — |
| `'a' \| 'b' \| 'c'` | `{ type: "string", enum: ["a","b","c"] }` | 联合类型自动提取枚举 |
| `Array<*>` / `*[]` | `{ type: "array", items: { type: "string" } }` | — |
| `Record<string, unknown>` / `object` | `{ type: "object" }` | — |

**E. 默认值生成规则**

与系统侧 `schema-generator.ts` 的 `getDefaultForType()` 保持一致：

| 属性 type | 默认值 | 说明 |
|:----------|:-------|:-----|
| `string` | `""` | 若有 enum 则取 `enum[0]` |
| `number` | `0` | — |
| `boolean` | `false` | — |
| `array` | `[]` | — |
| `object` | `{}` | — |

**F. required 字段生成规则**

- Props 接口中**非可选**属性（无 `?` 标记）→ 加入 `required` 数组
- Props 接口中**可选**属性（有 `?` 标记）→ 不加入 `required` 数组
- 所有 `#slot` / `#list` 生成的字段默认为**必填**（无 `?`），除非插件明确标记为可选

**G. 根级 $demo 扩展命名空间**

系统侧在根级 `$demo` 对象中消费以下字段（参见 `validator.ts` 和 `types.ts`）：

| 字段 | 类型 | 说明 | 来源 |
|:-----|:-----|:-----|:-----|
| `$demo.previewSize` | `{ width?, height?, minHeight?, maxHeight?, scale? }` | 预览窗口尺寸 | 可从 Figma Frame 尺寸推断 |
| `$demo.orderable` | `string[]` | 可排序的 section 名称列表（≥2 项生效） | 从 `#list` 标记的 id 列表生成 |

> 插件导出时，若 Figma 选中节点为 Frame 且尺寸可获取，建议自动填充 `$demo.previewSize`；若存在多个 `#list` 标记，建议自动填充 `$demo.orderable`。

#### 改造点 2：Markdown 格式组装（修改输出层）

当前 `convertToCode()` 或 `run()` 返回的 `code` 字段需扩展为包含 Markdown 包装的完整文本。

在 `packages/backend/src/common/retrieveUI/convertToCode.ts`（或等效出口）中：

1. 调用现有逻辑生成 TSX 代码
2. 调用新增转换器生成 JSON Schema
3. 使用 `buildFigmaMarkdown(code, schema)` 拼接为 Markdown Code Block 格式
4. 将拼接后的完整文本作为 `code` 字段返回给 UI 层

**组装格式规范**：

````markdown
# OpenCode Workbench Export

## Component Code

```tsx
{code}
```

## Schema Config

```json
{schema}
```
````

**格式约束**：
- 标题固定为 `# OpenCode Workbench Export`
- 代码区块标题固定为 `## Component Code`
- Schema 区块标题固定为 `## Schema Config`
- 代码语言标识：`tsx`（React 组件）
- Schema 语言标识：`json`（JSON Schema）
- 区块之间用空行分隔

#### 改造点 3：UI 层导出交互微调

当前插件 UI 提供「复制到剪贴板」和「导出文件」两种交互。改造后：

- **剪贴板内容** = Markdown Code Block 格式完整文本（用户直接粘贴到系统新建页面弹窗）
- **导出文件内容** = 同上，建议导出为 `.md` 文件
- **预览区代码展示** = 增加「Code / Schema / Preview」切换 Tab，方便用户预览两部分内容

### 3.3 输出示例

改造后，用户从 Figma 插件复制得到的内容如下（以包含 `#slot:img:banner` 和 `#slot:text:title` 标记的组件为例）：

````markdown
# OpenCode Workbench Export

## Component Code

```tsx
import React from 'react';

interface BannerDemoProps {
  /**
   * @title 顶部 Banner 图
   * @format uri
   * @widget image-upload
   * @group Banner区域
   * @order 1
   */
  banner: string;
  /**
   * @title 活动标题
   * @format string
   * @widget input
   * @group Banner区域
   * @order 2
   */
  title: string;
}

export default function BannerDemo({ banner, title }: BannerDemoProps) {
  return (
    <div className="min-h-screen bg-white">
      <img src={banner} alt="banner" className="w-full h-64 object-cover" />
      <h1 className="text-3xl font-bold">{title}</h1>
    </div>
  );
}
```

## Schema Config

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Demo 配置",
  "type": "object",
  "properties": {
    "banner": {
      "type": "string",
      "format": "uri",
      "title": "顶部 Banner 图",
      "default": "",
      "ui:widget": "file",
      "ui:options": { "accept": "image/*" },
      "$demo": { "group": "Banner区域", "order": 1 }
    },
    "title": {
      "type": "string",
      "title": "活动标题",
      "default": "",
      "$demo": { "group": "Banner区域", "order": 2 }
    }
  },
  "required": ["banner", "title"]
}
```
````

> **校准要点**：
> - `@widget image-upload` 转换为 `"ui:widget": "file"` + `"ui:options": { "accept": "image/*" }`（而非直接使用 `"image-upload"`）
> - `@widget input` 转换时省略 `ui:widget`（系统默认即为 Input）
> - `@group` / `@order` 映射到属性级 `$demo.group` / `$demo.order`（与已有的 `$demo.note` 模式一致）
> - 每个 property 均包含 `default` 值（与 `schema-generator.ts` 的 `getDefaultForType()` 一致）
> - `required` 数组包含所有非可选属性

### 3.4 与系统解析器的对齐

系统侧新增 `packages/author-site/lib/markdown-parser.ts`，定义 Markdown 格式解析逻辑：

**解析规则**：
1. 识别 `# OpenCode Workbench Export` 标题（可选，用于格式识别）
2. 查找 `## Component Code` 区块，提取其后第一个 ` ```tsx ` 到 ` ``` ` 之间的内容作为 `code`
3. 查找 `## Schema Config` 区块，提取其后第一个 ` ```json ` 到 ` ``` ` 之间的内容作为 `schema`
4. 验证提取的 `code` 和 `schema` 非空

**格式识别函数**：
- `isFigmaMarkdownFormat(text)`：检查文本是否包含 `# OpenCode Workbench Export` 或 `## Component Code` + `## Schema Config`

---

## 四、系统侧解析器改造

### 4.1 新增 Markdown 解析器

文件位置：`packages/author-site/lib/markdown-parser.ts`

```typescript
export interface ParsedMarkdownContent {
  code: string;
  schema: string;
  success: boolean;
  error?: string;
}

export function parseFigmaMarkdown(text: string): ParsedMarkdownContent
export function buildFigmaMarkdown(code: string, schema: string): string
export function isFigmaMarkdownFormat(text: string): boolean
```

### 4.2 解析器调度策略

系统侧入口函数（如导入按钮的处理逻辑）直接解析 Markdown 格式：

1. 使用 `isFigmaMarkdownFormat()` 检查是否为 Markdown Code Block 格式
2. 是则调用 `parseFigmaMarkdown()` 解析
3. 否则提示用户格式错误

```
用户粘贴文本
    │
    ▼
isFigmaMarkdownFormat() ?
    ├── 是 → parseFigmaMarkdown() → 返回结果
    │
    └── 否 → 提示格式错误
```

---

## 五、边界情况处理

| 场景 | 处理策略 |
|:-----|:---------|
| 无 `#slot/#list` 标记（无 Props） | Schema 输出为 `{"type":"object","properties":{}}`，保持 Markdown 格式完整 |
| 标记类型不支持（如未知 widget） | 降级为默认 `type: string`，不阻断导出；`@widget` 未知值时省略 `ui:widget` 字段 |
| 分组/顺序注释 | 映射到属性级 `$demo.group` 和 `$demo.order` 扩展字段（与 `$demo.note` 模式一致） |
| 代码中包含 Markdown 代码块标记 | 使用标准 Markdown 解析器处理，嵌套代码块遵循 Markdown 规范 |
| 用户手动修改了 Markdown 格式 | 只要保留 `## Component Code` 和 `## Schema Config` 标题及代码块结构，即可解析 |
| 缺少 `# OpenCode Workbench Export` 标题 | 解析器不强制要求标题，只要包含两个代码块即可识别 |
| `@widget image-upload` / `video-upload` | 转换器必须映射为 `"ui:widget": "file"` + `"ui:options": { accept }`，不能直接透传原值 |
| `@widget input` | 转换时省略 `ui:widget` 字段，系统默认渲染为 Input |
| `#slot:color` 标记 | 使用 `format: "color"` 触发颜色选择器，不使用 `ui:widget` |
| `#slot:text` 标记 | 默认生成普通 Input；若 JSDoc 含 `@widget richtext` 则生成 `"ui:widget": "richtext"` |
| `#list` 标记 | 生成 `{ type: "array", items: { type: "object" } }`，默认值 `[]`；多个 #list 时自动填充根级 `$demo.orderable` |
| Props 与 Schema 字段不一致 | 系统侧 `validatePropsSchema()` 会报 `props_mismatch` 错误，转换器应确保 properties 与 interface Props 严格一致 |
| 项目级 Schema 与页面级 Schema 字段重名 | 系统侧 `schema-validator.ts` 强校验拦截，插件导出的 Schema 仅包含页面级字段，不含项目级字段 |

---

## 六、验收标准

1. **格式正确性**：从 Figma 插件复制的内容，经系统 `parseFigmaMarkdown()` 解析后 `success === true`
2. **Schema 完整性**：解析出的 `schema` 为合法 JSON，且包含所有 `#slot/#list` 标记对应的配置项
3. **Schema 字段一致性**：解析出的 `schema` 的 `properties` 键名与 `code` 中 `interface Props` 的属性名完全一致（通过 `validatePropsSchema()` 校验无 `props_mismatch` 错误）
4. **控件映射正确性**：`@widget image-upload` 正确映射为 `"ui:widget": "file"` + `"ui:options": { accept: "image/*" }`，系统配置面板渲染为文件上传控件
5. **代码可用性**：解析出的 `code` 为可直接运行的 TSX 组件（保留 `interface Props` 及 JSDoc 元数据注释）
6. **人类可读**：导出内容粘贴到支持 Markdown 的编辑器（如 VS Code、Notion）时，代码高亮和结构清晰

---

## 七、实施建议

### 7.1 改动范围

**Figma 插件侧**：
- **新增**：`packages/backend/src/common/schemaGenerator.ts`（Props 注释 → JSON Schema 转换器，含 @widget 值映射逻辑）
- **修改**：`packages/backend/src/common/retrieveUI/convertToCode.ts`（出口处组装 Markdown 格式）
- **修改**：`packages/backend/src/tailwind/tailwindMain.ts`（如有必要，调整 Props 收集输出结构）
- **可选**：`packages/plugin-ui/src/components/PreviewToolbar.tsx`（预览区增加 Code/Schema/Markdown 切换）

**系统侧**：
- **新增**：`packages/author-site/lib/markdown-parser.ts`（Markdown 格式解析器）
- **修改**：系统导入入口逻辑（增加 Markdown 格式识别与调度）
- **修改**：`packages/author-site/components/demo/ConfigFormNew.tsx`（增强 `parseSchemaToFields()` 读取属性级 `$demo.group` / `$demo.order` 实现显式分组，替代当前 `detectGroup()` 启发式推断）
- **新增**：`packages/author-site/lib/__tests__/markdown-parser.test.ts`（Markdown 解析器单元测试）

### 7.2 验证步骤

1. 在 Figma 中选中带 `#slot:img:banner` 和 `#slot:text:title` 标记的图层
2. 点击插件「导出」→ 复制到剪贴板
3. 粘贴到系统「新建页面」弹窗
4. 确认系统成功解析并生成配置面板

---

## 八、相关文档索引

- [配置系统 Schema 解析器](../项目文档/创作端/04-配置与预览/技术/02_Schema解析器.md) — 系统侧解析逻辑
- [代码生成引擎](../项目文档/figma插件/技术/代码生成引擎.md) — 插件侧代码生成流程
- [标记系统](../项目文档/figma插件/技术/标记系统.md) — `#slot/#list` 标记规范

### 系统侧关键代码文件

| 文件 | 职责 | 与本方案的关系 |
|:-----|:-----|:--------------|
| `packages/author-site/src/lib/schema-generator.ts` | 从 TSX 代码生成 JSON Schema | 默认值生成规则、类型映射规则的参考基准 |
| `packages/author-site/src/lib/schema-validator.ts` | Schema 冲突校验 | 插件导出 Schema 不得包含项目级字段 |
| `packages/author-site/lib/validator.ts` | 一致性校验、`getDefaultValues()`、`getPreviewSize()`、`getOrderable()` | Schema 字段一致性校验、`$demo.previewSize` / `$demo.orderable` 消费方 |
| `packages/author-site/components/demo/ConfigFormNew.tsx` | 配置表单渲染（`parseSchemaToFields()`） | Schema 字段的最终消费方，需增强读取 `$demo.group` / `$demo.order` |
| `packages/author-site/components/demo/types.ts` | `DemoSchema` / `DemoMeta` 类型定义 | Schema 结构的类型约束 |
| `packages/author-site/components/demo/widgets.tsx` | 自定义控件（`FileUploadWidget` 等） | `ui:widget` 值的消费方，决定了 widget 命名必须匹配 |
| `packages/author-site/src/lib/runtime-props.ts` | 运行时 Props 合并 | 项目级 + 页面级 Schema 合并逻辑 |
