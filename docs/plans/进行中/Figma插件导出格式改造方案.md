# Figma 插件导出格式改造方案

> **状态**: 进行中  
> **创建日期**: 2026-05-11  
> **目标**: 让 Figma 插件导出符合系统要求的「React 组件代码 + JSON Schema 配置」分隔符格式  
> **关联文档**: [配置系统 Schema 解析器](../项目文档/创作端/04-配置与预览/技术/02_Schema解析器.md)、[代码生成引擎](../项目文档/figma插件/技术/代码生成引擎.md)

---

## 一、现状与问题

### 1.1 系统期望的格式

创作端新建页面时，要求 Figma 插件导出内容必须包含**两个独立部分**，用固定分隔符包裹：

```
=== DEMO CODE ===
<React 组件代码>
=== DEMO SCHEMA ===
<JSON Schema 配置>
=== END ===
```

系统通过 `parseFigmaText()` 解析该格式，分别提取 `code` 和 `schema` 两个字段。若格式不符，解析失败，用户无法完成新建页面流程。

### 1.2 当前插件导出现状

根据现有技术文档与代码分析，当前 Figma 插件（`packages/backend/src/tailwind/tailwindMain.ts` 等）的导出产物为：

- **单一 TSX 组件代码**：包含 `interface Props` 及 JSX 结构
- **无独立 JSON Schema**：Props 元数据以 JSDoc 注释形式（`@title/@format/@widget`）嵌入代码顶部
- **无分隔符包装**：导出内容即为纯代码文本，无 `=== DEMO CODE ===` 等分隔标记

### 1.3 核心矛盾

| 维度 | 系统要求 | 插件现状 |
|:-----|:---------|:---------|
| 内容结构 | 代码与 Schema 物理分离 | 代码与 Props 注释混在一起 |
| 格式规范 | 分隔符包裹的混合格式 | 纯 TSX 代码 |
| Schema 形态 | 标准 JSON Schema（`config.schema.json`） | JSDoc 风格的 Props 接口注释 |
| 消费方式 | `parseFigmaText()` 直接解析 | 需 AI 二次推断或人工补全 |

---

## 二、改造目标

让 Figma 插件在「导出代码」时，直接输出系统可识别的分隔符格式，实现：

1. **代码与 Schema 自动分离**：插件内部同时生成 TSX 代码和 JSON Schema，不再混为一谈
2. **零额外推断**：系统侧 `parseFigmaText()` 一次解析即可得到可用内容，无需 AI 二次补全
3. **向后兼容**：改造期间旧格式可降级处理（系统已有 `fixFigmaTextFormat()` 做基础修复）

---

## 三、改造方案

### 3.1 总体思路

在插件的**代码生成引擎后端**（`packages/backend/src/`）增加一层「格式组装器」，将原本独立的「代码生成」和「Props 收集」两个流程串联为统一输出：

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
    │  分隔符格式组装 │  ← 新增：按系统要求拼接分隔符
    │  (buildFigmaText)│
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

需新增转换逻辑，将其转为系统可消费的 JSON Schema：

```json
{
  "type": "object",
  "properties": {
    "banner": {
      "type": "string",
      "format": "uri",
      "title": "顶部 Banner 图"
    }
  }
}
```

**映射规则**：

| JSDoc 注释 | JSON Schema 字段 | 说明 |
|:-----------|:-----------------|:-----|
| `@title` | `title` | 配置项显示名称 |
| `@format` | `format` | 数据格式（uri、date 等） |
| `@widget` | `ui:widget` | 控件类型覆盖 |
| `@group` | — | 分组信息，可映射为 `$demo.group` 或忽略 |
| `@order` | — | 顺序信息，可映射为 `propertyOrder` 或忽略 |
| 字段类型 | `type` | `string/number/boolean/array/object` |
| 默认值 | `default` | 从 Figma 节点属性推断或留空 |

#### 改造点 2：分隔符格式组装（修改输出层）

当前 `convertToCode()` 或 `run()` 返回的 `code` 字段需扩展为包含分隔符的完整文本。

在 `packages/backend/src/common/retrieveUI/convertToCode.ts`（或等效出口）中：

1. 调用现有逻辑生成 TSX 代码（去除 `interface Props` 部分，或保留但不再作为 Schema 来源）
2. 调用新增转换器生成 JSON Schema
3. 使用与系统侧相同的 `buildFigmaText(code, schema)` 拼接为分隔符格式
4. 将拼接后的完整文本作为 `code` 字段返回给 UI 层

#### 改造点 3：UI 层导出交互微调（可选）

当前插件 UI 提供「复制到剪贴板」和「导出文件」两种交互。改造后：

- 剪贴板内容 = 分隔符格式完整文本（用户直接粘贴到系统新建页面弹窗）
- 导出文件内容 = 同上（若支持导出 `.txt` 或 `.md`）
- 预览区代码展示 = 可增加「Code / Schema」切换 Tab，方便用户预览两部分内容

### 3.3 输出示例

改造后，用户从 Figma 插件复制得到的内容应如下：

```
=== DEMO CODE ===

import React from 'react';

interface BannerDemoProps {
  banner: string;
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

=== DEMO SCHEMA ===
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "banner": {
      "type": "string",
      "format": "uri",
      "title": "顶部 Banner 图",
      "default": "https://picsum.photos/750/400"
    },
    "title": {
      "type": "string",
      "title": "活动标题",
      "default": "精彩活动来袭"
    }
  },
  "required": ["banner", "title"]
}

=== END ===
```

### 3.4 与系统解析器的对齐

系统侧 `packages/author-site/lib/parser.ts` 已定义分隔符常量：

- `CODE_START_MARKER = "=== DEMO CODE ==="`
- `SCHEMA_START_MARKER = "=== DEMO SCHEMA ==="`
- `END_MARKER = "=== END ==="`

插件侧组装格式时必须**严格一致**，包括：
- 分隔符大小写、空格数量
- 换行符使用 `\n`
- CODE 与 SCHEMA 之间无额外空行（或保持一致）
- END 标记可选（系统解析器支持无 END 的情况）

---

## 四、边界情况处理

| 场景 | 处理策略 |
|:-----|:---------|
| 无 `#slot/#list` 标记（无 Props） | Schema 输出为 `{"type":"object","properties":{}}`，保持格式完整 |
| 标记类型不支持（如未知 widget） | 降级为默认 `type: string`，不阻断导出 |
| 分组/顺序注释 | 可映射到 `$demo` 扩展字段，或暂时忽略 |
| 代码中包含分隔符字符串 | 极低概率，暂不考虑转义；若出现可后续增加转义规则 |
| 旧版插件导出内容 | 系统侧 `fixFigmaTextFormat()` 已做基础兼容，但建议尽快升级插件 |

---

## 五、验收标准

1. **格式正确性**：从 Figma 插件复制的内容，经系统 `parseFigmaText()` 解析后 `success === true`
2. **Schema 完整性**：解析出的 `schema` 为合法 JSON，且包含所有 `#slot/#list` 标记对应的配置项
3. **代码可用性**：解析出的 `code` 为可直接运行的 TSX 组件（保留 `interface Props` 或内联类型）
4. **向后兼容**：旧版无分隔符的导出内容，系统侧仍能识别（通过现有降级逻辑）

---

## 六、实施建议

### 6.1 改动范围

- **新增**：`packages/backend/src/common/schemaGenerator.ts`（Props 注释 → JSON Schema 转换器）
- **修改**：`packages/backend/src/common/retrieveUI/convertToCode.ts`（出口处组装分隔符格式）
- **修改**：`packages/backend/src/tailwind/tailwindMain.ts`（如有必要，调整 Props 收集输出结构）
- **可选**：`packages/plugin-ui/src/components/PreviewToolbar.tsx`（预览区增加 Code/Schema 切换）

### 6.2 验证步骤

1. 在 Figma 中选中带 `#slot:img:banner` 和 `#slot:text:title` 标记的图层
2. 点击插件「导出」→ 复制到剪贴板
3. 粘贴到系统「新建页面」弹窗
4. 确认系统成功解析并生成配置面板

---

## 七、相关文档索引

- [配置系统 Schema 解析器](../项目文档/创作端/04-配置与预览/技术/02_Schema解析器.md) — 系统侧解析逻辑
- [代码生成引擎](../项目文档/figma插件/技术/代码生成引擎.md) — 插件侧代码生成流程
- [标记系统](../项目文档/figma插件/技术/标记系统.md) — `#slot/#list` 标记规范
- [Figma 插件 PRD](../项目文档/figma插件/Figma插件.md) — 产品需求与功能定义
