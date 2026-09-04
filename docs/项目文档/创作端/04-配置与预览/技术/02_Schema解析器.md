---
covers:
  - packages/demo-ui/src/schema-parser.ts
  - packages/demo-ui/src/schema-parser.test.ts
  - packages/demo-ui/src/ConfigForm.tsx
---

# 配置系统 - Schema 解析器

> 版本：v1.1
> 创建日期：2026-04-06
> 更新日期：2026-09-03

---

## 一、解析器职责

Schema 解析器负责处理从设计工具导出的配置文本，提取出可用的代码和配置定义。

---

## 二、分隔符格式

### 2.1 格式规范

Figma 插件导出时使用统一的分隔符格式：

```
=== DEMO CODE ===
<React 组件代码>
=== DEMO SCHEMA ===
<JSON Schema 配置>
=== END ===
```

### 2.2 分隔符说明

| 分隔符 | 说明 |
|:-------|:-----|
| `=== DEMO CODE ===` | 代码部分开始 |
| `=== DEMO SCHEMA ===` | Schema 部分开始 |
| `=== END ===` | 内容结束标记 |

---

## 三、核心函数

### 3.1 parseFigmaText

**文件位置**：`lib/parser.ts`

**功能**：解析分隔符格式文本，提取代码和 Schema

**参数**：

| 参数 | 类型 | 说明 |
|:-----|:-----|:-----|
| `text` | string | 包含分隔符的完整文本 |

**返回值**：

```typescript
interface ParsedContent {
  code: string       // React 组件代码
  schema: string     // JSON Schema 配置
  success: boolean   // 解析是否成功
  error?: string     // 错误信息
}
```

**验证规则**：

| 规则 | 说明 |
|:-----|:-----|
| 分隔符存在 | 必须包含 CODE 和 SCHEMA 分隔符 |
| 分隔符顺序 | CODE 必须在 SCHEMA 之前 |
| 内容非空 | CODE 和 SCHEMA 部分都不能为空 |

### 3.2 buildFigmaText

**功能**：将代码和 Schema 拼接为分隔符格式

**参数**：

| 参数 | 类型 | 说明 |
|:-----|:-----|:-----|
| `code` | string | React 组件代码 |
| `schema` | string | JSON Schema 配置 |

**返回值**：分隔符格式的完整文本

### 3.3 parseSchemaToFields

**文件位置**：`packages/demo-ui/src/schema-parser.ts`

**功能**：把页面 Schema 转换为配置面板可消费的字段组。顶层字段和数组项目内部字段使用同一套解析规则，避免嵌套结构进入 `oneOf` 分支后丢失控件信息。

数组项目的解析规则如下：

- `items.oneOf` 生成对象数组的变体列表，并递归解析每个变体的字段；
- `items.properties` 生成普通对象数组的子字段，并继续递归处理其中的数组；
- 对象数组字段读取 `$demo.sortable` 作为当前层的排序能力；该字段必须是布尔值，`true` 开启排序，`false` 关闭排序，缺失或非法值按 `false` 处理。`ui:options.sortable` 不再参与解析；父子数组分别解析，不引入额外的 `tree` 类型；
- `position` 字段保留可拖动标记、定位键和容器尺寸，使坐标输入与画布拖动共用同一字段；
- 对象数组字段可在 `ui:options` 中显式声明 `detailPresentation: "sheet"`，并可用 `detailBreadcrumbTitle` 指定详情路由的列表节点名称、`itemTitleTemplate` 指定条目标题模板（`{index}` 为从 1 开始的两位序号）；列表节点可保留在内部路由上下文，但 Sheet 顶部只展示当前条目，未声明时继续使用原有内联折叠。
- `typeLimits` 沿递归路径传递，数组深度不会改变字段限制；
- 因此 `modules.items.oneOf → levels.items.oneOf` 仍会得到对象数组和 `position` 控件，不会降级为多图上传列表。

关卡图坐标单位约定：`position.x/y` 使用 1 倍像素值，`w/h` 继续使用 2 倍值，渲染时仅对 `w/h` 除以 2。

### 3.4 isValidFigmaFormat

**功能**：检查文本是否为有效的 Figma 导出格式

**返回值**：`boolean`

### 3.5 getOrderable

**功能**：从 Schema 中提取 `$demo.orderable` 可排序属性列表

**文件位置**：`lib/parser.ts`

**参数**：

| 参数 | 类型 | 说明 |
|:-----|:-----|:-----|
| `schema` | string | JSON Schema 字符串 |

**返回值**：`string[] | undefined`

- 当 Schema 包含有效的 `$demo.orderable`（至少 2 个字符串元素）时，返回属性名数组
- 否则返回 `undefined`

**Schema 示例**：

```json
{
  "type": "object",
  "properties": {
    "header": { "type": "string" },
    "content": { "type": "string" },
    "footer": { "type": "string" }
  },
  "$demo": {
    "orderable": ["header", "content", "footer"]
  }
}
```

**返回值示例**：

```typescript
getOrderable(schema)  // → ["header", "content", "footer"]
getOrderable(schemaWithoutOrderable)  // → undefined
```

**规则说明**：

| 规则 | 说明 |
|:-----|:-----|
| 可选字段 | `orderable` 为可选，未声明时返回 `undefined` |
| 最低数量 | `orderable` 至少 2 项才有排序意义，否则返回 `undefined` |
| 类型过滤 | 仅保留 `string` 类型的元素，过滤后不足 2 项则返回 `undefined` |

**与 `getDefaultValues` 的协作**：当 Schema 包含 `orderable` 时，`getDefaultValues()` 自动生成 `__order` 默认值，等于 `orderable` 数组的原始顺序。

### 3.6 fixFigmaTextFormat

**功能**：尝试修复常见格式问题

**修复内容**：

| 问题 | 修复方式 |
|:-----|:---------|
| 换行符不一致 | 统一为 `\n` |
| 缺失分隔符 | 自动检测并添加 |

---

## 四、错误处理

### 4.1 错误类型

| 错误类型 | 说明 |
|:---------|:-----|
| MISSING_CODE_SEPARATOR | 缺少 CODE 分隔符 |
| MISSING_SCHEMA_SEPARATOR | 缺少 SCHEMA 分隔符 |
| INVALID_SEPARATOR_ORDER | 分隔符顺序错误 |
| EMPTY_CODE | 代码部分为空 |
| EMPTY_SCHEMA | Schema 部分为空 |

### 4.2 错误返回

```typescript
{
  code: '',
  schema: '',
  success: false,
  error: 'MISSING_CODE_SEPARATOR: 未找到代码分隔符'
}
```

---

## 五、使用示例

### 5.1 解析文本

```typescript
import { parseFigmaText } from '@/lib/parser'

const text = `
=== DEMO CODE ===
export default function Demo({ title }: { title: string }) {
  return <h1>{title}</h1>
}
=== DEMO SCHEMA ===
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "title": "标题" }
  }
}
=== END ===
`

const result = parseFigmaText(text)
if (result.success) {
  console.log(result.code)    // React 组件代码
  console.log(result.schema)  // JSON Schema
}
```

### 5.2 构建文本

```typescript
import { buildFigmaText } from '@/lib/parser'

const text = buildFigmaText(code, schema)
// 返回完整的分隔符格式文本
```

---

## 六、相关需求文档

本技术文档对应的需求文档：[配置系统_需求文档.md](../配置系统_需求文档.md)
