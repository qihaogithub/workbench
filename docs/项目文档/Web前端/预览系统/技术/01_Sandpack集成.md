# 预览系统 - Sandpack 集成

> 版本：v1.0
> 创建日期：2026-04-06

---

## 一、Sandpack 概述

### 1.1 技术选型

采用 **Sandpack** 作为浏览器端代码执行环境：

| 特性 | 说明 |
|:-----|:-----|
| 浏览器端执行 | 无需后端服务，代码在浏览器中编译运行 |
| React 原生支持 | 开箱即用的 React/TypeScript 模板 |
| 实时预览 | 代码变更自动重新编译 |
| 错误展示 | 编译错误和运行时错误的友好提示 |
| 自定义主题 | 可定制编辑器和预览区主题 |

### 1.2 文件位置

| 文件 | 说明 |
|:-----|:-----|
| `components/demo/PreviewPanel.tsx` | 预览面板组件 |
| `components/demo/types.ts` | 类型定义 |

---

## 二、核心组件

### 2.1 Sandpack 组件结构

```typescript
import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview
} from '@codesandbox/sandpack-react'
```

| 组件 | 职责 |
|:-----|:-----|
| `SandpackProvider` | 提供执行上下文，管理文件和依赖 |
| `SandpackLayout` | 布局容器，协调编辑器和预览区 |
| `SandpackPreview` | 预览区域，渲染组件输出 |

### 2.2 基础配置

```typescript
<SandpackProvider
  template="react-ts"           // 使用 React + TypeScript 模板
  files={files}                 // 文件映射
  customSetup={{
    dependencies: {
      'react': '^18.0.0',
      'react-dom': '^18.0.0',
    },
  }}
  theme={sandpackTheme}
>
  <SandpackLayout>
    <SandpackPreview
      showNavigator={false}
      showRefreshButton={true}
      style={previewStyle}
    />
  </SandpackLayout>
</SandpackProvider>
```

---

## 三、文件结构

### 3.1 虚拟文件系统

Sandpack 使用虚拟文件系统，文件映射如下：

```typescript
const files: Record<string, string> = {
  '/Demo.tsx': code,              // 用户组件代码
  '/App.tsx': entryCode,          // 入口文件，注入配置
  ...sdkFiles,                    // SDK 组件文件（可选）
}
```

### 3.2 入口文件生成

入口文件 `/App.tsx` 负责将配置值注入组件：

```typescript
const entryCode = `
import Demo from './Demo';
export default function App() {
  return <Demo {...${JSON.stringify(configData)}} />;
}
`
```

**工作原理**：
1. `configData` 是用户在配置面板中设置的值
2. 通过 `JSON.stringify` 序列化为 JSON 字符串
3. 作为 JSX 属性展开传递给 Demo 组件

---

## 四、配置注入机制

### 4.1 注入流程

```
用户修改配置
      │
      ▼
ConfigForm.onChange(formData)
      │
      ▼
父组件 setConfigData(formData)
      │
      ▼
PreviewPanel 接收新 configData
      │
      ▼
entryCode 重新生成
      │
      ▼
Sandpack 检测文件变更
      │
      ▼
重新编译和渲染
```

### 4.2 类型安全

入口文件通过模板字符串生成，确保类型安全：

```typescript
function generateEntryCode(configData: Record<string, unknown>): string {
  return `
import Demo from './Demo';
export default function App() {
  return <Demo {...${JSON.stringify(configData)}} />;
}
`
}
```

---

## 五、主题定制

### 5.1 主题配置

```typescript
const sandpackTheme = {
  colors: {
    surface1: '#ffffff',
    surface2: '#f7f7f7',
    surface3: '#e8e8e8',
    clickable: '#808080',
    base: '#323232',
    disabled: '#C5C5C5',
    hover: '#4D4D4D',
    accent: '#0D7377',
    error: '#ff3333',
    errorSurface: '#ffe6e6',
  },
  syntax: {
    plain: '#151515',
    comment: { color: '#999', fontStyle: 'italic' },
    keyword: '#0D7377',
    tag: '#0D7377',
    punctuation: '#151515',
    definition: '#151515',
    property: '#151515',
    static: '#151515',
    string: '#4D9375',
  },
}
```

---

## 六、错误处理

### 6.1 编译错误

Sandpack 自动捕获编译错误并在预览区展示：

| 错误类型 | 展示方式 |
|:---------|:---------|
| 语法错误 | 显示错误位置和描述 |
| 类型错误 | 显示类型不匹配信息 |
| 导入错误 | 显示模块未找到信息 |

### 6.2 运行时错误

通过 Error Boundary 捕获运行时错误：

```typescript
<SandpackPreview
  showNavigator={false}
  showRefreshButton={true}
/>
```

---

## 七、相关需求文档

本技术文档对应的需求文档：[预览系统_需求文档.md](../预览系统_需求文档.md)
