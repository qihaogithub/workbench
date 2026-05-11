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
```

## Schema Config

```json
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
4. **向后兼容**：系统同时保留旧版分隔符解析能力（`parseFigmaText()`），兼容历史数据

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
| `@group` | `$demo.group` | 分组信息，映射到扩展字段 |
| `@order` | `$demo.order` | 顺序信息，映射到扩展字段 |
| 字段类型 | `type` | `string/number/boolean/array/object` |
| 默认值 | `default` | 从 Figma 节点属性推断或留空 |

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

改造后，用户从 Figma 插件复制得到的内容如下：

````markdown
# OpenCode Workbench Export

## Component Code

```tsx
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
```

## Schema Config

```json
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
```
````

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

系统侧入口函数（如导入按钮的处理逻辑）按以下顺序尝试解析：

1. 首先尝试 `parseFigmaMarkdown()`（新格式）
2. 如果失败，回退到 `parseFigmaText()`（旧版分隔符格式）
3. 如果仍失败，尝试 `fixFigmaTextFormat()` 自动修复
4. 最终失败则提示用户格式错误

```
用户粘贴文本
    │
    ▼
isFigmaMarkdownFormat() ?
    ├── 是 → parseFigmaMarkdown() → 成功？→ 返回结果
    │                      └── 失败 → 回退到旧解析器
    │
    └── 否 → isValidFigmaFormat() ?
                ├── 是 → parseFigmaText() → 返回结果
                └── 否 → fixFigmaTextFormat() → 再次尝试
                              └── 仍失败 → 提示格式错误
```

---

## 五、边界情况处理

| 场景 | 处理策略 |
|:-----|:---------|
| 无 `#slot/#list` 标记（无 Props） | Schema 输出为 `{"type":"object","properties":{}}`，保持 Markdown 格式完整 |
| 标记类型不支持（如未知 widget） | 降级为默认 `type: string`，不阻断导出 |
| 分组/顺序注释 | 映射到 `$demo.group` 和 `$demo.order` 扩展字段 |
| 代码中包含 Markdown 代码块标记 | 使用标准 Markdown 解析器处理，嵌套代码块遵循 Markdown 规范 |
| 旧版分隔符格式内容 | 系统侧通过 `parseFigmaText()` 兼容解析 |
| 用户手动修改了 Markdown 格式 | 只要保留 `## Component Code` 和 `## Schema Config` 标题及代码块结构，即可解析 |
| 缺少 `# OpenCode Workbench Export` 标题 | 解析器不强制要求标题，只要包含两个代码块即可识别 |

---

## 六、验收标准

1. **格式正确性**：从 Figma 插件复制的内容，经系统 `parseFigmaMarkdown()` 解析后 `success === true`
2. **Schema 完整性**：解析出的 `schema` 为合法 JSON，且包含所有 `#slot/#list` 标记对应的配置项
3. **代码可用性**：解析出的 `code` 为可直接运行的 TSX 组件（保留 `interface Props` 或内联类型）
4. **向后兼容**：旧版分隔符格式（`=== DEMO CODE ===`）仍能正常解析
5. **人类可读**：导出内容粘贴到支持 Markdown 的编辑器（如 VS Code、Notion）时，代码高亮和结构清晰

---

## 七、实施建议

### 7.1 改动范围

**Figma 插件侧**：
- **新增**：`packages/backend/src/common/schemaGenerator.ts`（Props 注释 → JSON Schema 转换器）
- **修改**：`packages/backend/src/common/retrieveUI/convertToCode.ts`（出口处组装 Markdown 格式）
- **修改**：`packages/backend/src/tailwind/tailwindMain.ts`（如有必要，调整 Props 收集输出结构）
- **可选**：`packages/plugin-ui/src/components/PreviewToolbar.tsx`（预览区增加 Code/Schema/Markdown 切换）

**系统侧**：
- **新增**：`packages/author-site/lib/markdown-parser.ts`（Markdown 格式解析器）
- **修改**：系统导入入口逻辑（增加 Markdown 格式识别与调度）
- **新增**：`packages/author-site/lib/__tests__/markdown-parser.test.ts`（Markdown 解析器单元测试）

### 7.2 验证步骤

1. 在 Figma 中选中带 `#slot:img:banner` 和 `#slot:text:title` 标记的图层
2. 点击插件「导出」→ 复制到剪贴板
3. 粘贴到系统「新建页面」弹窗
4. 确认系统成功解析并生成配置面板
5. 验证旧版分隔符格式仍能正常导入（向后兼容测试）

---

## 八、相关文档索引

- [配置系统 Schema 解析器](../项目文档/创作端/04-配置与预览/技术/02_Schema解析器.md) — 系统侧解析逻辑
- [代码生成引擎](../项目文档/figma插件/技术/代码生成引擎.md) — 插件侧代码生成流程
- [标记系统](../项目文档/figma插件/技术/标记系统.md) — `#slot/#list` 标记规范
- [Figma 插件 PRD](../项目文档/figma插件/Figma插件.md) — 产品需求与功能定义
