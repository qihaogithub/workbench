# 配置系统 - Schema 解析器

> 版本：v1.1
> 创建日期：2026-04-06
> 更新日期：2026-05-03

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
