# Sandpack 集成经验

> 从历史开发文档中提取的 Sandpack 集成和配置经验

---

## 一、externalResources 属性位置陷阱

### 1.1 错误写法

```tsx
<SandpackProvider
  externalResources={["https://cdn.tailwindcss.com"]}  // ❌ 被忽略
  ...
>
```

### 1.2 正确写法

```tsx
<SandpackProvider
  options={{
    externalResources: ['https://cdn.tailwindcss.com/3.4.17#tailwind.js']
  }}
  ...
>
```

**根因**：`externalResources` 不是 `SandpackProvider` 的顶层属性，必须放在 `options` 中。TypeScript 类型定义会给出警告。

### 1.3 CDN URL 格式建议

- 使用带版本号的 URL：`https://cdn.tailwindcss.com/3.4.17#tailwind.js`
- `#tailwind.js` fragment hint 帮助 Sandpack 识别脚本类型

---

## 二、AI 生成代码依赖管理

### 2.1 三层信息断裂问题

```
┌─────────────────────────────────────────────────────────┐
│ 断裂层 1: AI 系统提示词                                  │
│ ❌ 未声明可用依赖清单                                     │
├─────────────────────────────────────────────────────────┤
│ 断裂层 2: 工作目录                                       │
│ ❌ 缺少 package.json                                     │
├─────────────────────────────────────────────────────────┤
│ 断裂层 3: Sandpack 配置                                  │
│ ❌ 依赖列表硬编码且不完整                                 │
└─────────────────────────────────────────────────────────┘
```

### 2.2 分层渐进解决方案

**第一层：预声明常用依赖**（覆盖 85% 场景）

```typescript
customSetup={{
  dependencies: {
    react: "^18.0.0",
    "react-dom": "^18.0.0",
    clsx: "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "class-variance-authority": "^0.7.0",
    "lucide-react": "^0.323.0",
    "framer-motion": "^10.0.0",
  },
}}
```

**第二层：AI 提示词增强**（解决根源问题）

```
## 可用依赖
- react, react-dom（React 框架）
- tailwindcss（样式系统，通过 CDN 加载）
- clsx, tailwind-merge（样式类名合并）
- class-variance-authority（组件变体系统）
- lucide-react（图标库）
- framer-motion（动画库）

## 使用非常规依赖
如需使用上述列表外的 npm 包，请在代码顶部用注释声明：
// @dependency package-name
// @dependency package@^1.0.0
```

**第三层：注释解析提取**（支持动态依赖）

```typescript
// @dependency date-fns@^3.0.0
// @dependency @react-spring/web@^9.7.0

import { format } from 'date-fns';
import { useSpring } from '@react-spring/web';
```

解析逻辑：
```typescript
export function extractDependenciesFromComments(code: string): Record<string, string> {
  const depRegex = /\/\/\s*@dependency\s+([^\n]+)/g;
  const deps: Record<string, string> = {};
  let match;
  while ((match = depRegex.exec(code)) !== null) {
    const depString = match[1].trim();
    const { name, version } = parseDependencyString(depString);
    if (name) deps[name] = version;
  }
  return deps;
}
```
