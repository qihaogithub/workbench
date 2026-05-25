# AI 生成图片配置字段始终为 URL 输入而非上传控件 — 问题分析与优化方案

> 版本：v2（重写，推翻 v1「双管齐下」策略）
> 更新日期：2026-05-25

---

## 问题描述

用户让 AI 生成页面时，banner 图片配置项始终以「URL 文本输入框」形式呈现，而非「图片上传控件」。用户期望点击配置项后能直接上传图片，但实际只能手动填写 URL。

---

## 根因定位

### 一个 bug，不是两个问题

表面上看，似乎有两个问题：(1) 渲染逻辑不认识 `format: "image"`，(2) AI prompt 没教 AI 写 `ui:widget`。

但仔细分析需求文档和现有代码后，结论是：**这是一个纯粹的渲染层 bug —— `format→widget` 映射表中漏掉了 `image`。**

### 证据链

**证据一：需求文档已定义了正确的设计**

[配置系统_需求文档.md](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/项目文档/创作端/04-配置与预览/配置系统_需求文档.md) 第 4.2 节明确规定：

> `ui:widget` — 指定使用的控件类型 — **覆盖默认控件选择**

关键词是「覆盖默认」。这意味着：存在一套基于 `type` 和 `format` 的**默认控件选择**机制，`ui:widget` 只是用来**覆盖**这个默认值的。

所以 `format: "image"` 本就应该在默认选择逻辑中被映射到图片上传控件，`ui:widget: "file"` 只是给需要特殊覆盖的场景准备的。

**证据二：代码已存在相同的 `format→widget` 映射模式**

[ConfigFormNew.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/components/demo/ConfigFormNew.tsx) 第 288 行：

```tsx
// 颜色选择器 — format 已参与 widget 选择
if (field.format === "color" || field.type === "color") {
  return <颜色选择器组件 />;
}
```

代码已经使用 `format === "color"` 来触发颜色选择器。为什么 `format === "color"` 有效而 `format === "image"` 无效？因为 `image` 被漏掉了。这不是设计缺陷，是**实现遗漏**。

**证据三：AI 的天然行为已经正确**

AI 生成 schema 时写法是：

```json
{
  "bannerImage": {
    "type": "string",
    "format": "image",
    "title": "Banner图片",
    "default": "https://..."
  }
}
```

这完全符合 JSON Schema 规范 —— `format: "image"` 是表达「这个字符串是一个图片」的标准方式。AI 不懂 `ui:widget`，因为 `ui:widget` 是项目自定义扩展，不在 JSON Schema 标准中。AI 按标准写，写得完全正确。**有 bug 的是渲染层，不是 AI。**

**证据四：需求文档里「图片选择器」是独立于 `ui:widget` 的**

需求文档第 3.2 节列举了支持的控件扩展：

| 控件 | 说明 |
|:-----|:-----|
| 颜色选择器 | 可视化选择颜色 |
| 图片选择器 | 选择或上传图片 |
| 富文本编辑器 | 编辑格式化文本 |
| 代码编辑器 | 编辑代码片段 |

其中 **颜色选择器已经通过 `format: "color"` 实现**，同样的模式**图片选择器也应该通过 `format: "image"` 实现**。`ui:widget` 的角色是为 `imageList`（多图）和 `richtext`（富文本）这些无对应标准 `format` 值的控件服务。

### 根因一句话

> `ConfigFormNew.tsx` 的 widget 解析逻辑使用了 `format === "color"` 但遗漏了 `format === "image"`。

---

## 为什么 v1「双管齐下」方案不够优雅

v1 方案提出「同步修渲染逻辑 + 补 prompt」：

```
方案一：if (uiWidget === "file" || uiWidget === "image" || format === "image")
方案二：prompt 里教 AI 写 ui:widget: "file"
```

这存在三个问题：

1. **混淆了默认与覆盖的职责**：如果 prompt 要求 AI 同时写 `format: "image"` 和 `ui:widget: "file"`，等于告诉 AI「默认值」和「覆盖值」都要填，这在概念上是矛盾的。`ui:widget` 存在的意义是「当你需要不同于 format 默认值的控件时」，而不是「每个字段都填一遍」。

2. **增加了 AI 的认知负担**：让 AI 记住每个字段类型对应的 `ui:widget` 值，本质上是把渲染层的缺失转嫁给了 AI。下次 `format: "date"` 也漏了呢？再补 prompt？这不可持续。

3. **制造了双重表达**：一个字段「是图片」这件事被表达了两次（`format` + `ui:widget`），降低了 schema 的可读性和可维护性。

---

## 长期最优方案：补全「format → widget」映射表

### 核心思路

将 widget 解析逻辑改成**三层结构**，每层职责清晰：

```
Layer 1: ui:widget 显式覆盖     → 最优先，用于非标准控件或强制指定
Layer 2: format 语义映射        → 根据 JSON Schema 标准 format 值推断
Layer 3: type 数据类型回退       → 根据基本数据类型推断
```

这与需求文档「`ui:widget` 覆盖默认控件选择」的定义完全一致。

### 具体改动

#### 唯一需要修改的文件

[ConfigFormNew.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/components/demo/ConfigFormNew.tsx)

#### 改动内容：将当前混乱的 if-else 链重构为三层映射结构

**当前代码的 widget 解析顺序（混乱）：**

```
uiWidget === "file" / "image"          → FileUploadWidget
uiWidget === "imageList" / array       → ImageListWidget
uiWidget === "richtext"                → Textarea (richtext)
format === "color" / type === "color"  → ColorPicker        ← format 混在 type 中间
type === "boolean"                     → Switch
type === "number" / "integer"          → Slider / Input
enum                                   → Select
maxLength > 100                        → Textarea
默认                                    → Input (text)
```

问题：`ui:widget` 检查分散在不同位置，`format` 和 `type` 检查混在一起，无法一眼看出缺失了哪个映射。

**重构为三层结构：**

```tsx
const resolveWidget = () => {
  // ====== Layer 1: ui:widget 显式覆盖 ======
  if (field.uiWidget === "file" || field.uiWidget === "image") {
    return <FileUploadWidget ... />;
  }
  if (field.uiWidget === "imageList") {
    return <ImageListWidget ... />;
  }
  if (field.uiWidget === "richtext") {
    return <Textarea (richtext) ... />;
  }

  // ====== Layer 2: format 语义映射 ======
  if (field.format === "image") {
    return <FileUploadWidget ... />;       // ← 就加这一条
  }
  if (field.format === "color") {
    return <ColorPicker ... />;
  }

  // ====== Layer 3: type 数据类型回退 ======
  if (field.type === "array") {
    return <ImageListWidget ... />;
  }
  if (field.type === "boolean") {
    return <Switch ... />;
  }
  if (field.type === "number" || field.type === "integer") {
    return <Slider or Input ... />;
  }
  if (field.enum) {
    return <Select ... />;
  }
  if (field.maxLength > 100) {
    return <Textarea ... />;
  }
  return <Input (text) ... />;
};
```

#### 关键变化点

**Layer 2 中只新增一条映射**：`format === "image"` → `FileUploadWidget`。

这与已有的 `format === "color"` → `ColorPicker` 是完全对等的模式。不增加任何新机制，只是补全映射表。

#### 未来扩展

将来如果要支持更多 format 值（如 `format: "date"` → 日期选择器、`format: "email"` → 邮箱输入框），只需在 Layer 2 新增映射即可，无需修改 AI prompt，也无需调整其他代码。

### Prompt 是否需要改动？

**不需要。**

理由：

1. AI 已经天然使用 `format: "image"` 来标注图片字段，这是 JSON Schema 标准行为
2. 修好渲染层后，AI 的标准写法「恰好」就能正确工作
3. `ui:widget` 只在非标准控件场景才需要——比如 `imageList`（多图）、`richtext`（富文本）这些 JSON Schema 标准 `format` 不覆盖的场景

如果想进一步优化 AI 输出质量，可以在 prompt 中补充 `ui:widget` 的**可选说明**——告诉 AI 存在这些扩展控件，但这是锦上添花，不是 bug 修复的一部分。

---

## 实施计划

| 步骤 | 内容 | 文件 | 工作量 |
|:---|:---|:---|:---|
| 1 | 重构 `renderInput()` 为三层结构 | ConfigFormNew.tsx | 核心改动 |
| 2 | Layer 2 新增 `format === "image"` 映射 | ConfigFormNew.tsx | 同上，实际只加 1 个条件 |
| 3 | 在「课后服务-手机」页面上验证 | 打开编辑页 | 验证 |
| 4 | 在「课后服务-平板」页面上验证 | 打开编辑页 | 验证 |
| 5 | （可选）prompt 补充 `ui:widget` 可选说明 | demo-generator.template.md | 增强 |

---

## 影响范围

- **改动文件**：仅 [ConfigFormNew.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/components/demo/ConfigFormNew.tsx)
- **改动范围**：`FieldRenderer` 组件的 `renderInput()` 方法
- **向后兼容**：完全兼容。所有现有 schema 行为不变，`ui:widget` 优先级不变
- **风险**：无。`format === "image"` 语义明确，不会与任何现有逻辑冲突

---

## 设计原则总结

本方案遵循一个简单原则：

> **`format` 是语义声明，`ui:widget` 是控件覆盖。**
> 渲染层负责理解语义声明并给出合理的默认控件；
> 只有需要偏离默认时，才需要 `ui:widget`。

这个原则不仅解决了当前问题，也为未来的 `format` 扩展提供了清晰的架构指引。