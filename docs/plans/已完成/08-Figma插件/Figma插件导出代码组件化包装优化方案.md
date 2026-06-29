# Figma 插件导出代码组件化包装优化方案

> **状态**: 进行中
> **创建日期**: 2026-05-16
> **关联问题**: Figma 导入页面在预览区无法正确渲染（裸 JSX 无 `export default`）
> **关联文档**: [Figma插件导出格式改造方案](./Figma插件导出格式改造方案.md)、[代码生成引擎](../../../项目文档/figma插件/技术/代码生成引擎.md)

---

## 一、背景

### 1.1 问题描述

Figma 插件导出的 Tailwind/React 代码是**裸 JSX 片段**——以 `<div>` 等 HTML 元素直接开头，没有 `export default`、没有组件函数声明、没有 `import React`。这类代码被创作端接收后，在预览区 iframe 中无法正确渲染。

**实际案例**（项目 `proj_1776526720347`）：

| 页面 | 代码开头 | 有 `export default` | 预览结果 |
|------|---------|---------------------|---------|
| `demo_1777965200000_x8k2p9`（手机） | `<div className="w-[375px]...">` | ❌ | 显示上一个成功渲染的页面 |
| `demo_1778751411983_7h2rpo`（从Figma导入） | `<div className="w-[375px]...">` | ❌ | 显示上一个成功渲染的页面 |
| `demo_1778077850198_fjxwmf`（横屏 iPad mini） | `import React from 'react';` | ✅ | 正常渲染炫彩世界 |

**现象**：在页面目录中点击切换到 Figma 导入的页面时，预览区始终显示"炫彩世界"而非对应的"麦克风权限"页面。

### 1.2 根因分析

完整因果链如下：

```
Figma 插件生成裸 JSX（无 export default）
    │
    ▼
创作端 compiler.ts 编译后，产物无默认导出
    │
    ▼
iframe 通过 import(moduleUrl) 加载模块
    │
    ▼
module.default === undefined
    │
    ▼
currentComponent = undefined → renderComponent() 跳过渲染
    │
    ▼
之前成功渲染的组件留在画面上（视觉上"切换无效"）
```

**核心矛盾**：Figma 插件生成的代码不是合法的 React 组件模块，而创作端预览引擎要求代码必须是带 `export default` 的 ESM 模块。

### 1.3 当前临时修复

创作端已在 `compiler.ts` 中添加了 `autoWrapIfNoDefaultExport()` 函数作为**运行时补偿**：

```typescript
// compiler.ts — 运行时自动包装
function autoWrapIfNoDefaultExport(code: string): string {
  if (/\bexport\s+default\b/.test(removeComments(code))) return code;
  if (code.trim().startsWith('<')) {
    return `export default function __AutoComponent__() {\n  return (\n${code}\n  );\n}`;
  }
  // ...
}
```

这解决了"预览不更新"的问题，但属于**下游修补**，存在以下局限：

1. **包装组件名为占位符**（`__AutoComponent__`），无法反映页面语义
2. **无法接收 Props**：裸 JSX 中的 `#slot` / `#list` 标记已被替换为硬编码值，包装后组件无法通过 Props 注入配置
3. **Schema 生成依赖逆向推断**：`schema-generator.ts` 需从裸 JSX 中解析 `interface Props`，但裸 JSX 根本没有 Props 定义
4. **代码可读性差**：用户在"查看代码"弹窗中看到的是裸 JSX，不符合 React 组件规范

---

## 二、目标

### 2.1 核心目标

**让 Figma 插件在导出代码时，直接输出符合 React ESM 模块规范的组件代码**，包含：

1. `import React from 'react'` 声明
2. `interface Props` 类型定义（含 JSDoc 元数据注释）
3. `export default function ComponentName(props: Props)` 组件声明
4. JSX 在组件函数体内通过 `return (...)` 返回

### 2.2 预期收益

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 预览渲染 | 依赖运行时 `autoWrapIfNoDefaultExport()` 补偿 | 直接可渲染，无需补偿 |
| Props 注入 | 裸 JSX 无法接收 Props，配置面板无效 | 组件声明 Props，配置面板可正常驱动 |
| Schema 生成 | 需从裸 JSX 逆向推断，准确率低 | 从 `interface Props` 直接提取，准确率 100% |
| 代码可读性 | 裸 JSX 片段，不符合 React 规范 | 标准 React 组件，可直接复制到项目中使用 |
| 调试体验 | `module.default === undefined` 时静默失败 | 有明确的组件名和 Props 定义，错误信息清晰 |

---

## 三、方案

### 3.1 总体思路

在 Figma 插件的 **Tailwind/React 代码生成引擎**（`packages/backend/src/tailwind/tailwindMain.ts`）中，将输出格式从「裸 JSX 片段」改为「完整的 React 组件模块」。

改造仅涉及**代码生成引擎的输出层**，不影响节点遍历、样式转换、标记拦截等核心逻辑。

```
Figma 节点树
    │
    ▼
┌─────────────────┐
│  节点预处理层    │  ← 不变
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  样式转换层      │  ← 不变：Figma 样式 → Tailwind 类名
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  标记拦截层      │  ← 不变：#slot/#list/#ignore/#prompt
│  PropsCollector  │
└────────┬────────┘
         │
    ┌────┴─────────────────┐
    │                      │
    ▼                      ▼
┌──────────┐     ┌──────────────────┐
│ 改造前    │     │ 改造后            │
│ 裸 JSX   │     │ React 组件模块    │
│ 输出     │     │ 输出              │
└──────────┘     └──────────────────┘
  <div ...>        import React from 'react';
                   interface Props { ... }
                   export default function Xxx(props) {
                     return (<div ...>);
                   }
```

### 3.2 改造点 1：组件函数包装

**文件**：`packages/backend/src/tailwind/tailwindMain.ts`

**改造前**（当前输出）：

```tsx
<div className="w-[375px] h-[812px] relative bg-[#f8f8fa] overflow-hidden">
  <div className="w-[375px] h-[88px] left-0 top-0 absolute bg-[#ffffff]" />
  {/* ... */}
</div>
```

**改造后**（目标输出）：

```tsx
import React from 'react';

interface Props {
  /**
   * @title 顶部 Banner 图
   * @format uri
   * @widget image-upload
   */
  banner?: string;
  /**
   * @title 活动标题
   */
  title?: string;
}

export default function FigmaComponent({ banner, title }: Props) {
  return (
    <div className="w-[375px] h-[812px] relative bg-[#f8f8fa] overflow-hidden">
      <div className="w-[375px] h-[88px] left-0 top-0 absolute bg-[#ffffff]" />
      {/* ... */}
    </div>
  );
}
```

**实现要点**：

1. 在 `tailwindMain.ts` 的输出函数中，将 JSX 生成结果包裹在组件函数内
2. 组件名生成规则：从 Figma 选中节点的名称推导（如 `Frame 1` → `Frame1`），无法推导时使用 `FigmaComponent`
3. `interface Props` 由现有的 `PropsCollector` 生成，已有逻辑无需修改
4. 无 `#slot` / `#list` 标记时，Props 为空接口 `interface Props {}`

### 3.3 改造点 2：import React 声明

**文件**：`packages/backend/src/tailwind/tailwindMain.ts`

在组件代码顶部添加 `import React from 'react'`。

**注意事项**：
- 创作端编译器使用 Sucrase 的 `jsxRuntime: 'automatic'` 模式，会自动注入 `jsx-runtime` 导入
- 但保留 `import React from 'react'` 可确保组件在非自动 JSX Runtime 环境中也能运行
- 若代码中已存在 `import React` 声明（如用户手写组件），不重复添加

### 3.4 改造点 3：Props 解构与注入

**文件**：`packages/backend/src/tailwind/tailwindMain.ts` + `packages/backend/src/common/propsGenerator.ts`

当前 `#slot` 标记在 JSX 中被替换为硬编码值：

```tsx
// 当前：#slot:img:banner 被替换为硬编码的 <img> 标签
<img src="https://example.com/banner.png" alt="banner" className="..." />
```

改造后，`#slot` 标记应替换为 Props 引用：

```tsx
// 改造后：#slot:img:banner 引用 Props 中的 banner 字段
<img src={banner} alt="banner" className="..." />
```

**PropsCollector 现有逻辑**已收集了 `#slot` / `#list` 标记的字段名和类型，只需在 JSX 生成时将硬编码值替换为 Props 引用即可。

**#slot 替换规则**：

| 标记 | 当前输出 | 改造后输出 |
|------|---------|-----------|
| `#slot:img:banner` | `<img src="硬编码URL" />` | `<img src={banner} />` |
| `#slot:text:title` | `<span>硬编码文本</span>` | `<span>{title}</span>` |
| `#slot:video:hero_video` | `<video src="硬编码URL" />` | `<video src={heroVideo} />` |
| `#slot:color:bg_color` | `style={{ backgroundColor: "#fff" }}` | `style={{ backgroundColor: bgColor }}` |
| `#list:product_grid` | 硬编码的列表 JSX | `{productGrid?.map((item, i) => ...)}` |

**#list 替换规则**：

`#list` 标记的子节点作为列表项模板，改造后应包裹在 `.map()` 中：

```tsx
// 改造后
{productGrid?.map((item, index) => (
  <div key={index} className="...">
    {/* 子节点模板，item 中的字段引用 item.xxx */}
  </div>
))}
```

### 3.5 改造点 4：无标记场景的兼容

当 Figma 节点**没有任何 `#slot` / `#list` 标记**时，仍需输出合法的 React 组件：

```tsx
import React from 'react';

interface Props {}

export default function FigmaComponent() {
  return (
    <div className="w-[375px] h-[812px] relative bg-[#f8f8fa] overflow-hidden">
      {/* 纯静态 JSX，无 Props 注入点 */}
    </div>
  );
}
```

此时 Props 为空接口，组件不接收参数，但仍是合法的 ESM 模块，预览引擎可正常渲染。

---

## 四、输出格式对比

### 4.1 完整示例：带标记的组件

**Figma 节点名称**：`Banner Frame`，包含 `#slot:img:banner` 和 `#slot:text:title` 标记。

**改造前**（裸 JSX）：

```tsx
<div className="w-[375px] h-[200px] relative">
  <img src="https://r2.example.com/banner.png" alt="banner" className="w-full h-full object-cover" />
  <h1 className="text-2xl font-bold p-4">欢迎使用</h1>
</div>
```

**改造后**（React 组件）：

```tsx
import React from 'react';

interface Props {
  /**
   * @title Banner 图
   * @format uri
   * @widget image-upload
   * @order 1
   */
  banner?: string;
  /**
   * @title 标题
   * @order 2
   */
  title?: string;
}

export default function BannerFrame({ banner, title }: Props) {
  return (
    <div className="w-[375px] h-[200px] relative">
      <img src={banner} alt="banner" className="w-full h-full object-cover" />
      <h1 className="text-2xl font-bold p-4">{title}</h1>
    </div>
  );
}
```

### 4.2 完整示例：无标记的组件

**Figma 节点名称**：`Static Page`，无任何标记。

**改造前**（裸 JSX）：

```tsx
<div className="w-[375px] h-[812px] relative bg-[#f8f8fa] overflow-hidden">
  <div className="w-[375px] h-[88px] left-0 top-0 absolute bg-[#ffffff]" />
</div>
```

**改造后**（React 组件）：

```tsx
import React from 'react';

interface Props {}

export default function StaticPage() {
  return (
    <div className="w-[375px] h-[812px] relative bg-[#f8f8fa] overflow-hidden">
      <div className="w-[375px] h-[88px] left-0 top-0 absolute bg-[#ffffff]" />
    </div>
  );
}
```

---

## 五、与导出格式改造方案的关系

本方案与 [Figma插件导出格式改造方案](./Figma插件导出格式改造方案.md) 是**互补关系**，不冲突：

| 维度 | 导出格式改造方案 | 本方案（组件化包装） |
|------|-----------------|---------------------|
| 改造层面 | **输出格式**：纯 TSX → Markdown Code Block | **代码内容**：裸 JSX → React 组件模块 |
| 改造位置 | `convertToCode.ts`（输出层组装） | `tailwindMain.ts`（代码生成层） |
| 依赖关系 | 无依赖，可独立实施 | 无依赖，可独立实施 |
| 组合效果 | Markdown 中包裹的是**完整 React 组件**而非裸 JSX | — |

**推荐实施顺序**：先实施本方案（组件化包装），再实施导出格式改造。原因：

1. 组件化包装是**功能修复**，解决预览不渲染的核心问题
2. 导出格式改造是**格式优化**，改善用户体验
3. 组件化包装后，Markdown 中的代码块内容自然就是合法的 React 组件

---

## 六、创作端配套调整

### 6.1 保留 `autoWrapIfNoDefaultExport()` 作为降级方案

插件改造完成后，新导出的代码将自带 `export default`。但历史数据中仍存在裸 JSX，因此保留 `compiler.ts` 中的 `autoWrapIfNoDefaultExport()` 作为降级处理。

**调整策略**：

- `autoWrapIfNoDefaultExport()` 保留，但添加日志：当触发自动包装时，输出 `warn` 级别日志提示"代码缺少 export default，建议更新 Figma 插件版本"
- 未来版本可在确认所有历史数据迁移完成后移除此函数

### 6.2 iframe 模板竞态修复（已完成）

已在 `iframe-template.ts` 中添加 `updateVersion` 版本计数器，防止快速切换页面时旧组件覆盖新组件。此修复与插件改造无关，但改善了整体预览体验。

### 6.3 无默认导出时的防御性处理（已完成）

已在 `iframe-template.ts` 中添加：当 `module.default` 为 `undefined` 时，将 `currentComponent` 设为 `null` 并发送 `RUNTIME_ERROR` 消息，而非静默失败。

---

## 七、改动范围

### 7.1 Figma 插件侧（独立项目）

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `packages/backend/src/tailwind/tailwindMain.ts` | **修改** | 输出层从裸 JSX 改为 React 组件模块；`#slot` 替换为 Props 引用 |
| `packages/backend/src/common/propsGenerator.ts` | **修改** | Props 字段名到 JSX 引用名的映射（camelCase 转换已在现有逻辑中） |
| `packages/backend/src/tailwind/tailwindDefaultBuilder.ts` | **可能修改** | `#slot` 节点的渲染逻辑，从硬编码值改为 Props 引用 |
| `packages/backend/src/tailwind/tailwindTextBuilder.ts` | **可能修改** | `#slot:text` 节点的渲染逻辑 |

### 7.2 创作端（当前 monorepo）

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `packages/author-site/src/lib/compiler.ts` | **保留** | `autoWrapIfNoDefaultExport()` 保留作为降级，添加 warn 日志 |
| `packages/author-site/src/lib/iframe-template.ts` | **已完成** | 竞态修复 + 无默认导出防御 |

---

## 八、验收标准

### 8.1 功能验收

1. **预览渲染**：Figma 插件导出的代码，在创作端预览区可正确渲染（不再显示上一个页面的内容）
2. **Props 注入**：带 `#slot` 标记的组件，配置面板修改值后预览区实时更新
3. **Schema 一致性**：`interface Props` 的字段名与 JSON Schema 的 `properties` 键名完全一致
4. **代码完整性**：导出代码包含 `import React`、`interface Props`、`export default function`
5. **无标记兼容**：无 `#slot` / `#list` 标记的页面，导出为 `interface Props {}` 的空 Props 组件

### 8.2 回归验收

1. **有 `export default` 的手写组件**（如炫彩世界）不受影响，正常渲染
2. **历史裸 JSX 数据**仍可通过 `autoWrapIfNoDefaultExport()` 降级渲染
3. **HTML 引擎输出**不受影响（本方案仅改造 Tailwind/React 引擎）

### 8.3 验证步骤

1. 在 Figma 中选中带 `#slot:img:banner` + `#slot:text:title` 标记的图层
2. 使用插件生成代码，确认输出为完整 React 组件（含 `export default`）
3. 复制到创作端「从 Figma 导入」弹窗
4. 确认预览区正确渲染，配置面板可正常驱动预览更新
5. 切换到其他页面再切回，确认预览区显示正确页面

---

## 九、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `#slot` 替换为 Props 引用后，硬编码值丢失 | 用户首次导入时看不到原始图片/文本 | Schema 中保留 `default` 值，首次渲染使用默认值填充 |
| 组件名从 Figma 节点名推导，可能含特殊字符 | 生成非法标识符 | 清理规则：移除特殊字符、数字开头加下划线、空名回退到 `FigmaComponent` |
| `#list` 的 `.map()` 包装增加代码复杂度 | 生成的代码可读性下降 | 保留简洁的模板结构，添加 key 属性 |
| 历史数据中的裸 JSX 与新格式共存 | 需同时支持两种格式 | `autoWrapIfNoDefaultExport()` 降级方案持续生效 |

---

## 十、相关文档索引

- [Figma插件导出格式改造方案](./Figma插件导出格式改造方案.md) — Markdown Code Block 输出格式规范
- [代码生成引擎](../../../项目文档/figma插件/技术/代码生成引擎.md) — 插件代码生成流程
- [标记系统](../../../项目文档/figma插件/技术/标记系统.md) — `#slot/#list` 标记规范
- Figma导入代码与预览界面不匹配-分析报告 — 问题分析报告
