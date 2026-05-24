# iframe 沙箱依赖一致性方案

## 背景

### 项目场景

opencode-workbench 是一个 AI 驱动的 Demo 创作平台，其核心能力之一是：**AI 实时生成代码 → 预览渲染**。

这个能力依赖以下架构：

```
┌─────────────────────────────────────────────────────────────┐
│                     author-site (Next.js)                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │   AI 编辑    │───▶│   编译器     │───▶│  iframe 预览  │    │
│  │   区域       │    │ sucrase     │    │  沙箱         │    │
│  └──────────────┘    └──────────────┘    └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │     esm.sh CDN    │
                    │   (React 生态)    │
                    └──────────────────┘
```

### 问题描述

AI 生成的代码中可能使用任意 npm 包（如 `lucide-react`、`framer-motion` 等）。这些包通过 CDN（esm.sh）动态加载后在 iframe 沙箱中运行。

**问题表现**：部分 Demo 页面在预览时出现渲染错误，如 React Error #31：

```
Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31
```

错误信息：`Attempted to call an element like a function` —— React 无法将某个对象识别为合法的组件。

### 问题根因

iframe 沙箱中存在**多个 React 实例**或**版本不一致**的模块：

1. **iframe 模板**中显式导入的 React：
   ```javascript
   import React from '${cdnBase}/react@18.3.1';
   import ReactDOM from '${cdnBase}/react-dom@18.3.1/client';
   ```

2. **Sucrase 编译**使用 `jsxRuntime: 'automatic'`，生成的代码需要 `react/jsx-runtime`：
   ```typescript
   // compiler.ts
   const result = transform(wrappedCode, {
     transforms: ['typescript', 'jsx'],
     jsxRuntime: 'automatic',  // 生成 _jsx() 调用
   });
   ```

3. **第三方库**（如 `lucide-react`）从 CDN 加载时，可能通过 esm.sh 的依赖解析获取了不同版本或不同实例的 React。

4. 当 `_jsx()` 函数尝试渲染来自"另一个 React 实例"的组件对象时，由于 `$$typeof` 等内部属性指向不同的 React 实例，React 无法识别。

---

## 目标

| 目标 | 说明 |
|------|------|
| **依赖一致性** | 确保 iframe 中所有模块共享同一个 React 实例 |
| **零 AI 限制** | AI 可自由使用任意 npm 包，无需人工干预 |
| **零代码修改** | 不修改任何 AI 生成的 Demo 代码 |
| **向后兼容** | 不影响现有的嵌入和预览功能 |

---

## 方案

### 核心思路

使用 **Import Map**（浏览器原生标准）声明模块映射，确保所有模块通过相同的 URL 加载 React 相关依赖。

### 实现方式

修改 [iframe-template.ts](#相关代码路径)，在 `<head>` 中添加 Import Map：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Import Map：确保所有模块共享同一个 React -->
  <script type="importmap">
  {
    "imports": {
      "react": "${cdnBase}/react@18.3.1",
      "react-dom": "${cdnBase}/react-dom@18.3.1/client",
      "react/jsx-runtime": "${cdnBase}/react@18.3.1/jsx-runtime",
      "react/jsx-dev-runtime": "${cdnBase}/react@18.3.1/jsx-dev-runtime"
    }
  }
  </script>

  <link rel="preconnect" href="${cdnBase}" crossorigin>
  <link rel="dns-prefetch" href="${cdnBase}">
  <!-- ... -->
</head>
```

### 方案优势

| 优势 | 说明 |
|------|------|
| **标准化** | 浏览器原生支持，无需 polyfill |
| **零限制** | AI 可使用任何第三方 React 库 |
| **零侵入** | 不修改 AI 代码，不修改编译配置 |
| **性能优化** | 共享同一个 React 实例，减少内存占用 |
| **兼容性** | 现代浏览器均支持（Chrome 89+、Firefox 108+、Safari 16.4+）|

### 备选方案

**方案 B**：将 Sucrase 的 `jsxRuntime` 改为 `'classic'`

```typescript
// compiler.ts
const result = transform(wrappedCode, {
  transforms: ['typescript', 'jsx'],
  jsxRuntime: 'classic',  // 生成 React.createElement，不依赖 jsx-runtime
  production: true,
});
```

**缺点**：代码冗长，非 React 18 推荐方式。

---

## 案例参考

- [预览区 React Error #31 问题分析](./预览区ReactError31问题解决方案.md)

---

## 相关代码路径

| 文件 | 说明 |
|------|------|
| `packages/author-site/src/lib/iframe-template.ts` | **主要修改点**：添加 Import Map |
| `packages/author-site/src/lib/compiler.ts` | Sucrase 编译配置（`jsxRuntime: 'automatic'`） |
| `packages/author-site/src/app/api/embed/[projectId]/iframe/route.ts` | iframe HTML 生成 API |
| `packages/author-site/src/lib/cdn-config.ts` | CDN 基础 URL 配置 |

---

## 实施步骤

- [ ] 修改 `iframe-template.ts`，在 `<head>` 中添加 Import Map
- [ ] 测试受影响的 Demo 页面渲染
- [ ] 测试使用其他第三方库（如 `framer-motion`）的 Demo
- [ ] 测试嵌入模式下的配置更新功能

---

## 扩展阅读

- [React Error #31 官方说明](https://reactjs.org/docs/error-decoder.html?invariant=31)
- [Import Map 标准 (MDN)](https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/script/type/importmap)
- [Sucrase JSX Runtime 选项](https://sucrase.io/#jsx-runtime)
