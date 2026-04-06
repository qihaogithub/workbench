# 配置系统 - Schema 解析器

> 版本：v1.0
> 创建日期：2026-04-06

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

### 3.3 isValidFigmaFormat

**功能**：检查文本是否为有效的 Figma 导出格式

**返回值**：`boolean`

### 3.4 fixFigmaTextFormat

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
