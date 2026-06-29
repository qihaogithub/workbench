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
│  │   区域       │    │ sucrase      │    │  沙箱         │    │
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
   const result = transform(wrappedCode, {
     transforms: ['typescript', 'jsx'],
     jsxRuntime: 'automatic',
   });
   ```

3. **第三方库**（如 `lucide-react`）从 CDN 加载时，**esm.sh 默认会将 React 内联打包到该库的产物中**，而不是作为外部依赖共享。这导致第三方库使用的 React 与 iframe 模板中的 React 是**不同的模块实例**（不同 URL = 不同 ES Module 实例）。

4. 当 `_jsx()` 函数尝试渲染来自"另一个 React 实例"的组件对象时，由于 `$$typeof` 等内部属性指向不同的 React 实例，React 无法识别。

### 关键发现：当前编译链路已使 Import Map 无效

[compiler.ts](file:///e:/重要文件/Programming/1_Work/opencode-workbench/packages/author-site/src/lib/compiler.ts) 中的 `rewriteImportsToCdn()` 在编译阶段已将代码中的**所有裸 specifier** 替换为完整的 CDN URL：

```
编译前: import React from 'react'
编译后: import React from 'https://esm.sh/react@18.3.1'
```

这意味着浏览器实际加载的 ES Module 代码中**已不存在裸 specifier**，Import Map 根本没有机会介入。Import Map 只能拦截 `import React from 'react'` 这种裸 specifier 形式，对 `import React from 'https://esm.sh/react@18.3.1'` 不起作用。

**真正的问题是 esm.sh 在内联依赖，而非裸 specifier 的解析。** 因此解决方案不能只依赖 Import Map。

---

## 目标

| 目标 | 说明 |
|------|------|
| **依赖一致性** | 确保 iframe 中所有模块共享同一个 React 实例 |
| **零 AI 限制** | AI 可自由使用任意 npm 包，无需人工干预 |
| **零代码修改** | 不修改任何 AI 生成的 Demo 代码 |
| **向后兼容** | 不影响现有的嵌入和预览功能 |

---

## 方案：分层防御策略

### 核心思路

采用**三层防御**架构，从内到外逐层加固：

```
┌─────────────────────────────────────────────────────┐
│  Layer 3: AI 引导层（软约束，减少问题发生概率）      │
│  ┌─────────────────────────────────────────────┐   │
│  │  Layer 2: Import Map 安全网（兜底裸 specifier）│   │
│  │  ┌─────────────────────────────────────────┐ │   │
│  │  │  Layer 1: ?deps 参数（根因修复，核心方案）│ │   │
│  │  └─────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

| 层级 | 方案 | 改动量 | 作用 | 优先级 |
|------|------|--------|------|--------|
| **Layer 1** | `toCdnUrl()` 追加 `?deps` 参数 | ~3 行 | **根因修复**：指示 esm.sh 不内联 React | **P0 必须** |
| **Layer 2** | iframe 添加 Import Map | ~10 行 | 安全网：兜底任何遗留的裸 specifier | P1 建议 |
| **Layer 3** | Prompt 补充 React 版本约束 | ~5 行 | 预防：减少 AI 使用不兼容库的概率 | P2 可选 |

---

### Layer 1（核心）：`?deps` 参数

#### 原理

esm.sh 提供 `?deps` 参数，用于声明第三方库的外部依赖版本：

```
https://esm.sh/lucide-react?deps=react@18.3.1,react-dom@18.3.1
```

添加此参数后，esm.sh 在打包 `lucide-react` 时不会将 React 内联进产物，而是产出一个 **import React from 'https://esm.sh/react@18.3.1'** 的引用。这个 URL 与 iframe 模板中的导入 URL 完全一致。根据 ES Module 规范：**同一 URL 始终返回同一模块实例**，从而实现 React 单例。

#### 实现方式

修改 [compiler.ts](file:///e:/重要文件/Programming/1_Work/opencode-workbench/packages/author-site/src/lib/compiler.ts#L88-L108) 的 `toCdnUrl()` 函数：

```typescript
// compiler.ts
const CORE_DEPENDENCY_VERSIONS: Record<string, string> = {
  'react': '18.3.1',
  'react-dom': '18.3.1',
};

function toCdnUrl(packageName: string, lockedUrl?: string): string {
  if (lockedUrl) {
    return lockedUrl;
  }

  const coreVersion = CORE_DEPENDENCY_VERSIONS[packageName];
  if (coreVersion) {
    return `${ESM_SH_BASE}/${packageName}@${coreVersion}`;
  }

  // React 子路径（react/jsx-runtime、react-dom/client 等）
  if (packageName.startsWith('react/')) {
    const version = CORE_DEPENDENCY_VERSIONS['react'];
    return `${ESM_SH_BASE}/react@${version}${packageName.slice('react'.length)}`;
  }
  if (packageName.startsWith('react-dom/')) {
    const version = CORE_DEPENDENCY_VERSIONS['react-dom'];
    return `${ESM_SH_BASE}/react-dom@${version}${packageName.slice('react-dom'.length)}`;
  }

  // 非核心依赖：追加 ?deps 参数，确保共享同一个 React 实例
  const reactVer = CORE_DEPENDENCY_VERSIONS['react'];
  const reactDomVer = CORE_DEPENDENCY_VERSIONS['react-dom'];
  return `${ESM_SH_BASE}/${packageName}?deps=react@${reactVer},react-dom@${reactDomVer}`;
}
```

关键逻辑：当 `packageName` 不属于核心依赖（react、react-dom）时，自动追加 `?deps=react@18.3.1,react-dom@18.3.1`。核心依赖本身不追加（避免循环依赖）。

#### 方案优势

| 优势 | 说明 |
|------|------|
| **精准根因修复** | 直接解决"第三方库内联 React"这一真实病因 |
| **零侵入** | 不修改 AI 代码、不修改编译配置 |
| **极低维护成本** | React 版本升级只需改 `CORE_DEPENDENCY_VERSIONS` |
| **标准化** | esm.sh 官方支持的查询参数，非 hack |
| **性能优化** | 共享 React 实例减少内存占用 |

---

### Layer 2（安全网）：Import Map

#### 原理

虽然当前编译链路已将裸 specifier 全部替换为 CDN URL，Import Map 不是防御内联 React 的有效手段，但它作为**安全网**仍有价值：

1. 防御未来可能引入的、不经 `rewriteImportsToCdn()` 处理的代码路径
2. 兜底少数 esm.sh 未正确遵守 `?deps` 参数的边缘情况
3. 为可能的 `?external` + Import Map 方案演进铺路

#### 实现方式

修改 [iframe-template.ts](file:///e:/重要文件/Programming/1_Work/opencode-workbench/packages/author-site/src/lib/iframe-template.ts)，在 `<head>` 中添加 Import Map：

```html
<!-- Import Map：兜底安全网，确保任何裸 specifier 解析到统一实例 -->
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
```

> **注意**：此层为辅助防御，不可作为独立方案。单独使用无法解决第三方库内联 React 的问题。

#### 注意事项

- Import Map 必须在所有 `<script type="module">` 之前声明，否则不生效
- 需要覆盖 React 相关的所有子路径（`react/jsx-runtime`、`react-dom/client` 等）
- 浏览器兼容性：Chrome 89+、Firefox 108+、Safari 16.4+

---

### Layer 3（预防）：AI Prompt 约束

#### 原理

从 AI 生成代码的源头减少问题发生概率。虽然不能完全依赖约束，但其改造成本极低，可以作为辅助手段。

#### 实现方式

在 [claude.ts](file:///e:/重要文件/Programming/1_Work/opencode-workbench/packages/agent-service/src/backends/claude.ts#L79-L120)、[codex.ts](file:///e:/重要文件/Programming/1_Work/opencode-workbench/packages/agent-service/src/backends/codex.ts#L78-L119)、[gemini.ts](file:///e:/重要文件/Programming/1_Work/opencode-workbench/packages/agent-service/src/backends/gemini.ts#L79-L120) 三个后端的 `buildSystemPrompt()` 中，以及 [demo-generator.template.md](file:///e:/重要文件/Programming/1_Work/opencode-workbench/packages/author-site/src/lib/agent-prompts/demo-generator.template.md) 中，补充 React 版本约束说明：

```
## React 版本约束
预览环境使用 React 18.3.1，所有第三方 React 依赖必须兼容此版本。
禁止手动 import React（由 React JSX Runtime 自动处理）。
使用第三方 React 库时，优先使用白名单中的库（lucide-react、framer-motion）。
如需使用白名单外的库，请通过 // @dependency 注释声明。
```

#### 方案评估

| 维度 | 评价 |
|------|------|
| 效果 | 软约束，AI 可能不遵守，但能降低问题概率 |
| 成本 | 极低，仅修改 Prompt 模板 |
| 边界 | 与 Layer 1 互补：Layer 3 减少"犯错概率"，Layer 1 兜底"即使犯错也能正确运行" |

#### 注意事项

- 三个后端（claude、codex、gemini）的 `buildSystemPrompt()` 是复制粘贴的代码，需要同步修改三处
- 如果后续引入新的 AI 后端，需要同步补充此约束

---

### 不推荐的方案

**方案 B**：将 Sucrase 的 `jsxRuntime` 改为 `'classic'`。

```typescript
const result = transform(wrappedCode, {
  transforms: ['typescript', 'jsx'],
  jsxRuntime: 'classic',
  production: true,
});
```

**不推荐原因**：
- 不解决第三方库内联 React 的根因
- 生成的 `React.createElement()` 调用代码冗长
- 非 React 18 推荐方式，失去 automatic JSX Runtime 的未来兼容性

---

## 相关代码路径

| 文件 | 说明 | 修改内容 |
|------|------|----------|
| `packages/author-site/src/lib/compiler.ts` | **Layer 1 核心修改点**：`toCdnUrl()` 追加 `?deps` 参数 | P0 必须 |
| `packages/author-site/src/lib/iframe-template.ts` | **Layer 2**：添加 Import Map | P1 建议 |
| `packages/agent-service/src/backends/claude.ts` | **Layer 3**：补充 React 版本约束 | P2 可选 |
| `packages/agent-service/src/backends/codex.ts` | **Layer 3**：补充 React 版本约束 | P2 可选 |
| `packages/agent-service/src/backends/gemini.ts` | **Layer 3**：补充 React 版本约束 | P2 可选 |
| `packages/author-site/src/lib/agent-prompts/demo-generator.template.md` | **Layer 3**：补充 React 版本约束 | P2 可选 |
| `packages/author-site/src/app/api/embed/[projectId]/iframe/route.ts` | 联动：验证 `lockedDependencies` 中的 URL 是否需要升级 | 联动确认 |
| `packages/author-site/src/lib/cdn-config.ts` | CDN 基础 URL 配置 | 无需修改 |

---

## 实施步骤

- [x] **Layer 1（P0）** 修改 `compiler.ts` 的 `toCdnUrl()`，非核心包追加 `?deps=react@18.3.1,react-dom@18.3.1`
- [x] **Layer 2（P1）** 修改 `iframe-template.ts`，在 `<head>` 中添加 Import Map
- [x] **Layer 3（P2）** 修改三个后端的 `buildSystemPrompt()` 和 `demo-generator.template.md`，补充 React 版本约束
- [x] 测试预置 Demo 页面渲染（确保无回归）
- [x] 测试使用第三方库（lucide-react、framer-motion、recharts 等）的 Demo 渲染
- [x] 测试嵌入模式下的配置更新功能
- [x] 测试 `lockedDependencies`（已锁定的依赖 URL）与 `?deps` 的组合兼容性

---

## 案例参考

- 历史参考：预览区 React Error #31 问题分析
- [iframe沙箱与动态CDN编译策略](../../../复盘文档/预览引擎/iframe沙箱与动态CDN编译策略.md)

---

## 扩展阅读

- [esm.sh Deps 参数文档](https://esm.sh/#docs/deps)
- [React Error #31 官方说明](https://reactjs.org/docs/error-decoder.html?invariant=31)
- [Import Map 标准 (MDN)](https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element/script/type/importmap)
- [ES Module 单例保障机制](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Modules)
