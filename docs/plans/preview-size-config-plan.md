# 预览区尺寸配置方案

## 一、需求概述

### 1.1 背景
当前预览区（PreviewPanel）的尺寸是自适应容器宽高的，缺乏对特定设备尺寸的模拟能力。需要支持：
- **默认尺寸**：375×667（iPhone 8/SE 等常见手机尺寸）
- **可配置**：允许在 `index.tsx` 调用时或 `config.schema.json` 中自定义尺寸

### 1.2 目标
- 预览区默认显示为 375×667 的设备尺寸
- 支持两种配置方式：
  1. 组件调用时在 `index.tsx` 中传入 `previewSize` 属性
  2. 在 `config.schema.json` 中通过元数据声明预览尺寸
- 保持向后兼容，不破坏现有功能

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
```

**说明**：
- 保持现有 `PreviewSize` 类型不变
- 新增 `DemoMeta` 类型用于描述 demo 元数据（包含 `previewSize`）

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
  previewSize, // ← 此属性已存在，无需修改接口
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

### 2.5 配置优先级

当多种方式同时指定预览尺寸时，优先级如下：

```
index.tsx 显式传入 > config.schema.json 中的 $demo > 默认值 (375×667)
```

**实现逻辑**（在使用 PreviewPanel 的页面中）：

```typescript
// 伪代码示例
const previewSize = 
  explicitPreviewSize ||           // 1. 页面显式传入
  schema?.$demo?.previewSize ||    // 2. schema 中声明
  DEFAULT_PREVIEW_SIZE;            // 3. 默认值
```

---

## 三、使用示例

### 3.1 在 index.tsx 中指定尺寸

```typescript
import { PreviewPanel } from '@/components/demo';

export default function DemoPage() {
  return (
    <PreviewPanel
      code={demoCode}
      configData={configData}
      previewSize={{
        width: 414,
        height: 896, // iPhone 11 Pro Max
      }}
    />
  );
}
```

### 3.2 在 config.schema.json 中指定尺寸

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

### 3.3 使用默认尺寸

```typescript
// 不传入 previewSize，自动使用 375×667
<PreviewPanel
  code={demoCode}
  configData={configData}
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
1. `packages/web/components/demo/types.ts` — 可选：新增 `DemoMeta` 类型
2. `packages/web/components/demo/PreviewPanel.tsx` — 修改默认尺寸逻辑

### 6.2 不需要修改的文件
- `packages/web/components/demo/index.ts` — 导出接口不变
- `packages/web/components/demo/ConfigForm.tsx` — 与预览尺寸无关
- 现有 `config.schema.json` 文件 — 向后兼容，不传则使用默认值

### 6.3 向后兼容性
✅ **完全兼容**：不传入 `previewSize` 时使用新的默认值 375×667，不会破坏现有功能

---

## 七、实施步骤

1. **修改 PreviewPanel.tsx**
   - 添加 `DEFAULT_PREVIEW_SIZE` 常量
   - 修改 `buildPreviewStyle` 函数逻辑
   - 添加居中样式和视觉装饰

2. **（可选）更新 types.ts**
   - 新增 `DemoMeta` 类型定义

3. **（可选）更新调用方**
   - 在现有使用 PreviewPanel 的页面中，从 schema 提取 `$demo.previewSize`
   - 传入 PreviewPanel 组件

4. **测试验证**
   - 验证默认尺寸显示
   - 验证自定义尺寸
   - 验证 schema 配置
   - 验证响应式布局

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
