# 预览区尺寸配置方案

## 一、需求概述

### 1.1 背景
当前预览区（PreviewPanel）的尺寸是自适应容器宽高的，缺乏对特定设备尺寸的模拟能力。需要支持：
- **默认尺寸**：375×667（iPhone 8/SE 等常见手机尺寸）
- **可配置**：允许在 `config.schema.json` 中自定义预览尺寸

### 1.2 目标
- 预览区默认显示为 375×667 的设备尺寸
- **唯一配置方式**：在 `config.schema.json` 中通过 `$demo.previewSize` 声明
- 保持向后兼容，不破坏现有功能

### 1.3 设计原则
**单一来源（Single Source of Truth）**：预览尺寸属于 demo 的元数据，应由 `config.schema.json` 统一管理，不在组件调用处重复配置。

**优势**：
- 配置与代码分离，职责清晰
- 同一个 demo 在不同页面使用时不需重复配置
- 产品/设计人员可直接修改 JSON 调整预览效果
- 避免多处配置导致的的不一致和调试困难

---

## 二、技术方案

### 2.1 类型定义扩展

**文件**：`packages/web/components/demo/types.ts`

```typescript
export interface PreviewSize {
  width?: string | number;
  height?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  scale?: number;
}

// 新增：config.schema.json 中的元数据扩展字段
export interface DemoMeta {
  previewSize?: PreviewSize;
  [key: string]: unknown;
}

// 新增：JSON Schema 根级别扩展
export interface DemoSchema extends Record<string, unknown> {
  $demo?: DemoMeta;
  $schema?: string;
  title?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
}
```

**说明**：
- 保持现有 `PreviewSize` 类型不变
- 新增 `DemoMeta` 和 `DemoSchema` 类型用于类型安全地访问 `$demo` 字段

---

### 2.2 默认尺寸设置

**文件**：`packages/web/components/demo/PreviewPanel.tsx`

```typescript
// 默认预览尺寸（iPhone 8/SE 标准）
const DEFAULT_PREVIEW_SIZE: PreviewSize = {
  width: 375,
  height: 667,
};

function buildPreviewStyle(size?: PreviewSize): React.CSSProperties {
  // 使用传入的尺寸或默认尺寸
  const effectiveSize = size ?? DEFAULT_PREVIEW_SIZE;
  
  const style: React.CSSProperties = {
    width: effectiveSize.width,
    height: effectiveSize.height,
    minHeight: effectiveSize.minHeight ?? 400,
    // 居中显示
    margin: '0 auto',
    // 添加边框和阴影以突出设备感
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
  };

  if (effectiveSize.maxHeight !== undefined) {
    style.maxHeight = effectiveSize.maxHeight;
  }

  if (effectiveSize.scale !== undefined) {
    style.transform = `scale(${effectiveSize.scale})`;
    style.transformOrigin = 'top center';
  }

  return style;
}
```

**关键变化**：
1. 移除原来的 `height: '100%', width: '100%'` 自适应逻辑
2. 默认使用 `375×667` 固定尺寸
3. 添加居中和视觉装饰（边框、圆角、阴影）
4. 支持 `scale` 属性用于缩放显示

---

### 2.3 组件属性传递

**文件**：`packages/web/components/demo/PreviewPanel.tsx`

组件签名保持不变，`previewSize` 属性已存在：

```typescript
export function PreviewPanel({
  code,
  configData,
  sdkFiles,
  onError,
  className,
  previewSize, // ← 此属性已存在，由调用方从 schema 提取后传入
}: PreviewPanelProps)
```

---

### 2.4 config.schema.json 扩展

**方案**：在 `config.schema.json` 根级别添加 `$demo` 元数据字段

#### 示例 1：基础手机尺寸
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$demo": {
    "previewSize": {
      "width": 375,
      "height": 667
    }
  },
  "title": "Banner Demo 配置",
  "type": "object",
  "properties": {
    // ... 现有配置不变
  }
}
```

#### 示例 2：平板尺寸
```json
{
  "$demo": {
    "previewSize": {
      "width": 768,
      "height": 1024
    }
  },
  // ...
}
```

#### 示例 3：带缩放的桌面尺寸
```json
{
  "$demo": {
    "previewSize": {
      "width": 1440,
      "height": 900,
      "scale": 0.5
    }
  },
  // ...
}
```

**说明**：
- `$demo` 是 JSON Schema 的合法扩展字段（`$` 前缀是 JSON Schema 保留的）
- 不影响现有的 JSON Schema 验证逻辑
- 解析时需要从 schema 中提取 `$demo.previewSize`

---

### 2.5 配置来源与优先级

**唯一配置来源**：`config.schema.json` 中的 `$demo.previewSize`

```
config.schema.json 中声明 > 默认值 (375×667)
```

**实现逻辑**（在调用方页面统一处理）：

```typescript
// 从 schema 中提取预览尺寸
const previewSize = (schema as DemoSchema)?.$demo?.previewSize;

<PreviewPanel
  code={demoCode}
  configData={configData}
  previewSize={previewSize}  // 可能为 undefined，组件内部会使用默认值
/>
```

**辅助函数**（可选，位于 `@/lib/schema-utils`）：

```typescript
import type { DemoSchema, PreviewSize } from '@/components/demo/types';

export function extractPreviewSize(schema: unknown): PreviewSize | undefined {
  return (schema as DemoSchema)?.$demo?.previewSize;
}
```

---

## 三、使用示例

### 3.1 在 config.schema.json 中指定尺寸

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$demo": {
    "previewSize": {
      "width": 390,
      "height": 844
    }
  },
  "title": "移动端组件演示",
  "type": "object",
  "properties": {
    "title": { "type": "string", "title": "标题" }
  }
}
```

调用方自动从 schema 提取：

```typescript
import type { DemoSchema } from '@/components/demo/types';

// 加载 schema 后自动提取预览尺寸
const schema = await loadSchema();
const previewSize = (schema as DemoSchema)?.$demo?.previewSize;

<PreviewPanel
  code={demoCode}
  configData={configData}
  previewSize={previewSize}
/>
```

### 3.2 使用默认尺寸

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "简单组件演示",
  "type": "object",
  "properties": {
    // 不声明 $demo，自动使用 375×667
  }
}
```

```typescript
// 调用方无需特殊处理，直接传入 undefined 或不传
<PreviewPanel
  code={demoCode}
  configData={configData}
  previewSize={undefined}  // 或不传此属性
/>
```

---

## 四、常见设备尺寸参考

| 设备 | 宽度 | 高度 |
|------|------|------|
| iPhone SE / 8 | 375 | 667 |
| iPhone 12/13/14 | 390 | 844 |
| iPhone 12/13/14 Pro Max | 428 | 926 |
| iPad Mini | 768 | 1024 |
| iPad Pro 11" | 834 | 1194 |
| Desktop (常见) | 1440 | 900 |
| Desktop (大屏) | 1920 | 1080 |

---

## 五、可选增强功能（后续迭代）

### 5.1 设备选择器 UI
在预览区顶部添加设备切换下拉菜单：
```
[ iPhone SE ▼ ] [ 刷新 ] [ 全屏 ]
```

### 5.2 响应式预览
支持拖拽调整预览区宽度，类似 Chrome DevTools 的设备模拟器

### 5.3 横竖屏切换
添加旋转按钮，自动交换宽高值

### 5.4 预设尺寸配置
在 `config.schema.json` 中支持设备名称快捷配置：
```json
{
  "$demo": {
    "previewDevice": "iphone-14"  // 自动映射到 390×844
  }
}
```

---

## 六、影响范围

### 6.1 需要修改的文件
1. `packages/web/components/demo/types.ts` — 新增 `DemoMeta` 和 `DemoSchema` 类型
2. `packages/web/components/demo/PreviewPanel.tsx` — 修改默认尺寸逻辑
3. 调用 PreviewPanel 的页面组件 — 从 schema 提取 `$demo.previewSize` 并传入

### 6.2 不需要修改的文件
- `packages/web/components/demo/index.ts` — 导出接口不变
- `packages/web/components/demo/ConfigForm.tsx` — 与预览尺寸无关

### 6.3 向后兼容性
✅ **完全兼容**：
- 现有 `config.schema.json` 不声明 `$demo` 时，自动使用默认值 375×667
- 不影响已有 demo 的显示效果
- `PreviewPanel` 的 `previewSize` 属性为可选，不传即可

---

## 七、实施步骤

1. **更新 types.ts**
   - 新增 `DemoMeta` 和 `DemoSchema` 类型定义

2. **修改 PreviewPanel.tsx**
   - 添加 `DEFAULT_PREVIEW_SIZE` 常量
   - 修改 `buildPreviewStyle` 函数逻辑，使用 375×667 作为默认值
   - 添加居中样式和视觉装饰

3. **更新调用方页面组件**
   - 在加载 schema 后，提取 `$demo.previewSize`
   - 将提取的值传入 `PreviewPanel` 组件
   - （可选）创建 `extractPreviewSize` 辅助函数

4. **测试验证**
   - 验证默认尺寸 375×667 显示正常
   - 验证 config.schema.json 中声明 `$demo.previewSize` 后生效
   - 验证不声明 `$demo` 的现有 demo 不受影响
   - 验证不同尺寸（手机、平板、桌面）的显示效果
   - 验证 `scale` 属性的缩放效果

---

## 八、注意事项

1. **Sandpack 兼容性**：SandpackPreview 组件的 `style` 属性可能需要包裹外层 div 才能生效
2. **移动端适配**：如果预览区宽度超过视口，建议添加 `scale` 自动适配
3. **性能影响**：固定尺寸不会影响 Sandpack 的编译性能
4. **JSON Schema 规范**：`$demo` 字段符合 JSON Schema 的 `$` 前缀扩展约定

---

## 九、相关文件索引

- 预览组件：`packages/web/components/demo/PreviewPanel.tsx`
- 类型定义：`packages/web/components/demo/types.ts`
- 导出入口：`packages/web/components/demo/index.ts`
- Schema 示例：`demos/demo-example/config.schema.json`

---

**文档版本**：v1.0  
**创建日期**：2026-04-08  
**状态**：待评审
