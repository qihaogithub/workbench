## Web端预览区CSS样式缺失问题报告

### 一、问题现状

**问题描述**：Web端预览区（Sandpack Preview）展示的React组件没有CSS样式效果，尽管代码中正确使用了Tailwind CSS类名（如 `min-h-screen`、`bg-white`、`text-3xl` 等），但预览结果显示为无样式的原始HTML。

**影响范围**：
- `packages/web/src/app/demo/[id]/edit/page.tsx` - Demo编辑页面
- `packages/web/src/app/demo-test/page.tsx` - 演示测试页面
- 所有使用 `PreviewPanel` 组件的页面

---

### 二、根本原因

**直接原因**：Sandpack默认环境不包含Tailwind CSS配置。

**代码证据**：[PreviewPanel.tsx#L115-L132](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/components/demo/PreviewPanel.tsx#L115-L132)

```tsx
<SandpackProvider
  key={code}
  template="react-ts"
  files={files}
  customSetup={{
    dependencies: {
      react: "^18.0.0",
      "react-dom": "^18.0.0",
    },
  }}
  theme={{...}}
>
```

当前 `customSetup` 仅配置了 `react` 和 `react-dom` 依赖，**缺少Tailwind CSS及其相关依赖（postcss、tailwindcss、autoprefixer）**。

用户代码（如 [demo-test/page.tsx#L23](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/app/demo-test/page.tsx#L23)）大量使用Tailwind类名：

```tsx
<div className={`min-h-screen p-8 ${bgColors[theme]}`}>
  ...
  <h1 className="text-3xl font-bold mb-4">{title}</h1>
```

但Sandpack沙箱环境中没有Tailwind CSS运行时，无法解析这些类名。

---

### 三、修复方案

**方案：在SandpackProvider中注入Tailwind CSS配置**

需要修改 `PreviewPanel.tsx`，在 `customSetup` 中添加Tailwind相关依赖和配置：

#### 修复代码

修改文件：[packages/web/components/demo/PreviewPanel.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/components/demo/PreviewPanel.tsx#L115-L132)

**当前代码（第119-124行）：**
```tsx
customSetup={{
  dependencies: {
    react: "^18.0.0",
    "react-dom": "^18.0.0",
  },
}},
```

**修改为：**
```tsx
customSetup={{
  dependencies: {
    react: "^18.0.0",
    "react-dom": "^18.0.0",
    tailwindcss: "^3.4.1",
    autoprefixer: "^10.4.17",
    postcss: "^8.4.33",
  },
  files: {
    "/tailwind.config.js": `module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}`,
    "/postcss.config.js": `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
    "/src/globals.css": `
@tailwind base;
@tailwind components;
@tailwind utilities;
`,
  },
}},
```

**同时需要修改入口文件注入样式（第84-89行）：**

**当前代码：**
```tsx
const entryCode = `
import Demo from './Demo';
export default function App() {
  return <Demo {...${JSON.stringify(configData)}} />;
}
`;
```

**修改为：**
```tsx
const entryCode = `
import React from 'react';
import './globals.css';
import Demo from './Demo';

export default function App() {
  return <Demo {...${JSON.stringify(configData)}} />;
}
`;
```

---

### 四、相关代码路径汇总

| 文件路径 | 说明 |
|---------|------|
| [packages/web/components/demo/PreviewPanel.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/components/demo/PreviewPanel.tsx) | 预览面板组件，需添加Tailwind配置 |
| [packages/web/src/app/demo/[id]/edit/page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/app/demo/[id]/edit/page.tsx) | Demo编辑页面，使用PreviewPanel |
| [packages/web/src/app/demo-test/page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/app/demo-test/page.tsx) | 演示测试页面，使用PreviewPanel |
| [packages/web/components/demo/types.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/components/demo/types.ts) | PreviewPanelProps类型定义 |

---

### 五、验证方法

1. 启动开发服务器：`pnpm dev:web`
2. 访问 `/demo-test` 页面
3. 检查预览区域：
   - **修复前**：标题显示为普通文字，无背景色、无间距
   - **修复后**：标题有3xl大小、粗体、底部间距，背景根据theme变化

---
