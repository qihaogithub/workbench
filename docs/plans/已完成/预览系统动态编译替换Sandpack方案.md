# 预览系统动态编译替换 Sandpack 方案

> **文档版本**: v1.3
> **创建时间**: 2026-04-19
> **更新日期**: 2026-04-19
> **状态**: 🚧 实施中
>
> **当前进度**:
> - ✅ 第一阶段：后端编译服务（`sucrase` 安装、`/api/compile` 路由、`compiler-client.ts`、`component-executor.ts`）
> - ✅ 第二阶段：重写 `PreviewPanel`（移除 Sandpack，改为动态编译渲染）
> - ✅ 第三阶段：测试与验证（`PreviewPanel` 单元测试 8/8 通过，TypeScript 类型检查通过）
> - ✅ 第四阶段：清理（移除 `@codesandbox/sandpack-react`，更新 Jest 配置）
>
> **待手动验证项**（需启动 `pnpm dev:web` 后确认）:
> - [ ] `/demo-test` 页面正常预览
> - [ ] 配置实时联动响应
> - [ ] 代码编辑后重新编译
> - [ ] 错误提示显示

---

## 一、背景与现状

### 1.1 当前方案

预览系统使用 **@codesandbox/sandpack-react** 作为浏览器端代码执行环境，核心组件为 `PreviewPanel`，通过 iframe 沙箱编译和渲染 AI 生成的 React 组件代码。

### 1.2 当前方案问题

| 问题 | 现象 | 影响 |
|:-----|:-----|:-----|
| **初始化慢** | 首次加载需初始化 CodeSandbox 编译服务 | 预览 2-5s 白屏 |
| **配置联动延迟** | props 变更触发 iframe 内部重新编译 | 修改配置后 1-3s 才刷新 |
| **样式不一致** | iframe 内通过 CDN 加载 Tailwind | 颜色、间距与项目主题不同步 |
| **组件无法复用** | 项目已有的 shadcn/ui 组件无法传入 iframe | AI 只能生成纯 Tailwind 组件 |
| **包体积大** | `@codesandbox/sandpack-react` ≈ 500KB+ | 首屏加载慢 |
| **外部服务依赖** | 依赖 CodeSandbox CDN 和编译服务 | 内网/弱网环境不稳定 |
| **调试困难** | React DevTools 需配置 iframe 穿透 | 排查组件问题不便 |

### 1.3 历史问题记录

- [预览区 CSS 样式丢失问题分析报告](./已完成/预览区CSS样式丢失问题分析报告.md) — `externalResources` 位置错误导致 Tailwind CDN 未加载
- [AI 生成代码时依赖缺失问题解决方案](./已完成/AI生成代码时依赖缺失问题解决方案.md) — 依赖解析和预声明机制

---

## 二、目标方案

### 2.1 核心思路

将浏览器端编译（Sandpack iframe 沙箱）改为**服务端编译 + 前端直接渲染**：

```
当前方案（Sandpack）：                          目标方案（动态编译）：
┌─────────────────────────────┐                ┌─────────────────────────────┐
│  PreviewPanel               │                │  PreviewPanel               │
│  ┌───────────────────────┐  │                │  ┌───────────────────────┐  │
│  │ SandpackProvider      │  │                │  │ ErrorBoundary         │  │
│  │ ┌───────────────────┐ │  │                │  │ ┌───────────────────┐ │  │
│  │ │ SandpackPreview   │ │  │   ────→        │  │ │ CompiledComponent │ │  │
│  │ │ ┌───────────────┐ │ │  │   替换         │  │ │ (React.createElement)│ │
│  │ │ │ iframe 沙箱   │ │ │  │                │  │ └───────────────────┘ │  │
│  │ │ │ 浏览器端编译  │ │ │  │                │  └───────────────────────┘  │
│  │ │ └───────────────┘ │ │  │                └─────────────────────────────┘
│  │ └───────────────────┘ │  │                          │
│  └───────────────────────┘  │                          ▼
└─────────────────────────────┘                ┌─────────────────────────────┐
                                               │  /api/compile               │
                                               │  sucrase 服务端编译 TSX → JS    │
                                               └─────────────────────────────┘
```

### 2.2 方案架构

```
用户修改配置/代码
        │
        ▼
父组件 state 更新 (code, configData)
        │
        ▼
┌─────────────────────────────────────┐
│  PreviewPanel (React.memo)          │
│  1. useEffect: code 变更时调用 API  │
│  2. 配置变更时直接传递 props        │
└─────────────────────────────────────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
┌────────┐  ┌────────────────────────┐
│ /api/  │  │ CompiledComponent      │
│ compile│  │ (React.createElement)  │
│        │  │                        │
│ sucrase    │  │ 直接使用项目样式系统   │
│ 编译   │  │ 直接使用项目组件库     │
│ TSX→JS │  │ 毫秒级 props 响应      │
└────────┘  └────────────────────────┘
```

### 2.3 核心优势

| 维度 | Sandpack（当前） | 动态编译（目标） | 提升 |
|:-----|:----------------|:----------------|:-----|
| 首屏预览延迟 | 2-5s | <1s | **80%** |
| 配置联动响应 | 1-3s | <16ms | **99%** |
| 前端包体积 | ~500KB | ~0KB | **100%** |
| 样式一致性 | ❌ CDN 独立加载 | ✅ 项目主题一致 | — |
| 组件复用 | ❌ 需注入沙箱 | ✅ 直接使用 | — |
| 离线可用 | ❌ 依赖 CDN | ✅ 完全本地 | — |
| DevTools 调试 | ❌ iframe 穿透 | ✅ 原生支持 | — |

---

## 三、技术设计

### 3.1 编译流程

AI 生成的 TSX 代码字符串经过以下步骤转换为可执行的 React 组件：

1. **依赖检测** — 扫描 `import` 语句，检查是否均为项目已有依赖（白名单机制）
2. **服务端编译（sucrase）** — 输入 TSX 字符串，输出 CommonJS 模块代码（~50-100ms）
3. **前端执行** — 通过 `new Function` 执行编译结果，注入项目依赖映射，返回组件函数

### 3.2 服务端编译接口

**路由**: `POST /api/compile`

**请求体**: `{ code: string }`

**响应体**:
- 成功：`{ success: true, data: { compiledCode, dependencies } }`
- 失败：`{ success: false, error: { code, message, line?, column? } }`

**编译器选型**: `sucrase`（纯 JavaScript 实现，零原生依赖，支持 TSX → CommonJS）

**编译配置**:
```typescript
import { transform } from 'sucrase';

const result = transform(code, {
  transforms: ['typescript', 'jsx'],
  jsxRuntime: 'automatic',
  production: true,
});
```

### 3.3 前端组件执行

编译后的 JS 代码通过 `new Function` 在浏览器端执行：

- 创建虚拟 `module` 对象捕获 `module.exports`
- 注入 `require` 函数映射，将项目已有依赖传递给组件
- 组件从 `module.exports.default ?? module.exports` 中获取（兼容 `export default` 和 `module.exports =` 两种写法）
- 返回的组件函数通过 `React.createElement` 直接渲染到 DOM

**依赖映射表**（`component-executor.ts` 中静态定义）：
```typescript
const requireMap: Record<string, unknown> = {
  'react': React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': require('lucide-react'),
  'clsx': require('clsx'),
  'tailwind-merge': require('tailwind-merge'),
  'class-variance-authority': require('class-variance-authority'),
  'framer-motion': require('framer-motion'),
  // 项目内部组件别名
  '@/lib/utils': { cn },
  '@/components/ui/button': require('@/components/ui/button'),
  '@/components/ui/card': require('@/components/ui/card'),
  // ... 其他常用 shadcn/ui 组件按需添加
};
```

**路径别名处理**：
编译阶段不处理 `@/` 路径，由 `component-executor.ts` 的 `require` 函数直接拦截映射。遇到未在 `requireMap` 中定义的 `@/` 路径，抛出明确的错误提示。新增 shadcn/ui 组件时，只需在 `requireMap` 中增加一行映射即可。

AI 系统提示词已约束只能使用上述依赖，编译阶段会二次校验，发现非白名单依赖返回错误。

### 3.4 错误处理

| 错误阶段 | 类型 | 处理方式 | 用户感知 |
|:---------|:-----|:---------|:---------|
| 编译阶段 | 语法错误 | API 返回行号/列号 | 编辑器标注错误位置 |
| 编译阶段 | 无效依赖 | API 返回依赖列表 | 提示"检测到未声明的依赖" |
| 执行阶段 | 运行时错误 | ErrorBoundary 捕获 | 显示友好错误提示 |
| 渲染阶段 | Props 不匹配 | try/catch + fallback | 显示默认占位内容 |

---

## 四、嵌入其他系统方案（后续迭代）

### 4.1 需求背景

Demo 制作完成后，需要嵌入到其他内部系统（如设计规范平台、活动管理系统）中，支持修改配置并实时预览效果。

### 4.2 技术方案

**不采用**预编译静态 HTML 文件方案（需要内联完整的表单渲染逻辑，与现有 `@rjsf` 方案重复造轮子，维护成本高）。

**采用**动态路由方案：

```
新增路由: GET /embed/[demoId]

┌─────────────────────────────────────┐
│  /embed/[demoId]                    │
│  ┌───────────────────────────────┐  │
│  │  左侧 2/3: 预览区             │  │
│  │  (复用 PreviewPanel)          │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  右侧 1/3: 配置面板           │  │
│  │  (复用 ConfigForm)            │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
         无顶部导航栏，适合 iframe 嵌入
```

### 4.3 与使用页面的区别

| 页面 | URL | 特点 |
|:-----|:-----|:-----|
| 使用页面 | `/demo/[id]` | 带顶部工具栏（返回首页、编辑按钮） |
| 嵌入页面 | `/embed/[demoId]` | 无导航栏，纯预览+配置面板 |

**实现方式**：复用 `PreviewPanel` 和 `ConfigForm` 组件，仅移除导航栏。数据加载逻辑与使用页面一致。

### 4.4 嵌入使用方式

其他系统通过 iframe 加载嵌入页面：

```html
<iframe 
  src="https://our-system.com/embed/demo-123"
  width="100%"
  height="800px"
  frameborder="0"
></iframe>
```

嵌入页面内部完全自洽：加载 Demo 源码、编译渲染、配置表单生成、实时预览，均在同一路由内完成。

---

## 五、文件变更清单

### 5.1 修改文件

| 文件 | 路径 | 变更内容 |
|:-----|:-----|:---------|
| PreviewPanel | `packages/web/components/demo/PreviewPanel.tsx` | 移除 Sandpack，改为动态编译渲染（参考实现见本章节的组件设计） |
| PreviewPanel 测试 | `packages/web/components/demo/__tests__/PreviewPanel.test.tsx` | 重写测试，Mock 编译 API |
| 依赖提取工具 | `packages/web/src/lib/sandpack-deps.ts` | 扩展为通用依赖扫描工具（复用现有逻辑） |
| package.json | `packages/web/package.json` | 移除 `@codesandbox/sandpack-react`，添加 `sucrase` |
| Jest 配置 | `packages/web/jest.config.ts` | 移除 `transformIgnorePatterns` 中的 `@codesandbox/sandpack-react` |

### 5.2 新增文件

| 文件 | 路径 | 说明 |
|:-----|:-----|:-----|
| 编译 API 路由 | `packages/web/src/app/api/compile/route.ts` | Next.js API Route，sucrase 编译服务 |
| 编译客户端 | `packages/web/src/lib/compiler-client.ts` | 封装 `/api/compile` 调用，带客户端缓存 |
| 组件执行器 | `packages/web/src/lib/component-executor.ts` | 前端执行编译后代码，注入项目依赖映射 |

### 5.3 删除内容

| 内容 | 位置 | 说明 |
|:-----|:-----|:-----|
| Sandpack 导入 | `PreviewPanel.tsx` | 移除所有 `@codesandbox/sandpack-react` 引用 |
| Sandpack 依赖 | `package.json` | 卸载 `@codesandbox/sandpack-react` |
| Jest transformIgnorePatterns | `jest.config.ts` | 移除 `@codesandbox/sandpack-react` 的忽略规则 |

---

## 六、实施步骤

### 6.1 第一阶段：后端编译服务（1 天）

#### 步骤 1.1：安装 sucrase

- [x] 已完成

```bash
pnpm --filter @opencode-workbench/web add sucrase
```

#### 步骤 1.2：创建编译 API 路由

- [x] 已完成 — `packages/web/src/app/api/compile/route.ts`

实现：
- `POST` 方法接收 `{ code: string }`
- 扫描代码中的 `import` 语句，提取依赖列表
- 校验依赖是否均在白名单内（`react`、`lucide-react`、`clsx`、`tailwind-merge`、`class-variance-authority`、`framer-motion`）
- 使用 `sucrase` 的 `transform` 方法编译 TSX → CommonJS
- 返回 `{ compiledCode, dependencies }` 或错误信息

**编译配置**:
```typescript
import { transform } from 'sucrase';

const result = transform(code, {
  transforms: ['typescript', 'jsx'],
  jsxRuntime: 'automatic',
  production: true,
});
```

**运行时依赖映射**：
由于使用 automatic JSX transform，编译后代码会依赖 `react/jsx-runtime`。`component-executor.ts` 的 `require` 映射中需包含：
```typescript
'react/jsx-runtime': require('react/jsx-runtime')
```

#### 步骤 1.3：创建编译客户端

- [x] 已完成 — `packages/web/src/lib/compiler-client.ts`

实现：
- `compileCode(code: string)` — 调用 API，返回编译结果
- 客户端缓存（`Map`）— 相同代码不重复请求
- `clearCompileCache()` — 手动清空缓存

**缓存策略**：
```typescript
const MAX_CACHE_SIZE = 50;
const compileCache = new Map<string, CompileResult>();

function getCacheKey(code: string): string {
  // 使用代码内容生成缓存 key（简单 hash 或前 200 字符 + 长度）
  return `${code.length}_${code.slice(0, 200)}`;
}
```
缓存达到上限时，移除最早写入的条目（FIFO）。

#### 步骤 1.4：创建组件执行器

- [x] 已完成 — `packages/web/src/lib/component-executor.ts`

实现 `executeComponent(compiledCode: string)`：
- 创建虚拟 `module` 对象（`{ exports: {} }`）
- 注入 `require` 函数，映射项目已有依赖（含 `react/jsx-runtime`）
- 通过 `new Function` 执行编译后的 CommonJS 代码
- 从 `module.exports.default ?? module.exports` 获取组件（兼容 `export default`）
- 验证获取的是函数类型，否则抛出错误

**路径别名处理**：
编译 API 不处理 `@/` 路径，由 `component-executor.ts` 的 `require` 函数静态映射。`requireMap` 中预先定义常用 shadcn/ui 组件和工具函数，新增组件时只需增加一行映射。

### 6.2 第二阶段：重写 PreviewPanel（1 天）

- [x] 已完成 — `packages/web/components/demo/PreviewPanel.tsx`

#### 状态管理

- `compiledComponent` — 编译后的组件函数（`useState`）
- `compileError` — 编译错误信息（`useState`）
- `isCompiling` — 编译中状态（`useState`）

#### 编译触发

- `useEffect` 监听 `code` 变化，触发 `compileCode()`
- 配置变更（`configData`）不触发编译，直接通过 props 传递给已编译组件

#### 渲染逻辑

- 无效代码 — 显示"代码加载失败"提示
- 编译中 — 显示加载动画
- 编译错误 — 显示错误信息和详细提示
- 编译成功 — 通过 `React.createElement(compiledComponent, configData)` 渲染

#### ErrorBoundary

内置 `PreviewErrorBoundary` 组件捕获运行时错误，防止整个页面崩溃，显示降级 UI。

**关键设计点**：
- `setCompiledComponent(() => Component)` — 使用函数形式避免 React 将组件函数当作 updater
- `useEffect` 返回 cleanup 函数设置 `cancelled` 标志，防止竞态条件

### 6.3 第三阶段：测试与验证（0.5 天）

#### 单元测试

- [x] 已完成 — `packages/web/components/demo/__tests__/PreviewPanel.test.tsx` 全部 8 个测试通过

Mock `@/lib/compiler-client` 的 `compileCode` 和 `@/lib/component-executor` 的 `executeComponent`。
测试场景：编译中状态、编译成功渲染、编译错误处理、无效代码路径、自定义 className、默认预览尺寸、配置变更不触发重新编译。

#### 手动验证

- [ ] 待进行 — 需启动 `pnpm dev:web` 后确认

1. 启动开发服务器：`pnpm dev:web`
2. 访问 `http://localhost:3200/demo-test`
3. 验证：正常预览、配置实时联动、代码编辑后重新编译、错误提示

### 6.4 第四阶段：清理（0.5 天）

- [x] 已完成

1. 卸载 Sandpack：`pnpm --filter @opencode-workbench/web remove @codesandbox/sandpack-react`
2. 清理 Next.js 缓存：`pnpm --filter @opencode-workbench/web exec rimraf .next`
3. 运行全量检查：
   ```bash
   pnpm --filter @opencode-workbench/web typecheck  # ✅ 通过
   pnpm --filter @opencode-workbench/web test       # ✅ PreviewPanel 8/8 通过
   pnpm --filter @opencode-workbench/web lint       # ✅ 无新增错误
   ```

---

## 七、影响范围

### 7.1 调用方分析

| 调用方 | 文件 | 影响 |
|:-------|:-----|:-----|
| Demo 使用页面 | `src/app/demo/[id]/page.tsx` | **无影响**，PreviewPanel Props 接口不变 |
| Demo 编辑页面 | `src/app/demo/[id]/edit/page.tsx` | **无影响**，PreviewPanel Props 接口不变 |
| Demo 测试页面 | `src/app/demo-test/page.tsx` | **无影响**，PreviewPanel Props 接口不变 |

### 7.2 接口变更

PreviewPanel Props 保持向后兼容，唯一变化是 `sdkFiles` 属性在新方案中不再使用（不再通过文件系统注入组件），但保留在类型定义中以避免破坏现有调用方。

---

## 八、风险与应对

| 风险 | 可能性 | 影响 | 应对措施 |
|:-----|:-------|:-----|:---------|
| sucrase 编译复杂 TSX 失败 | 低 | 高 | 备选方案：接入 `babel` 编译；或提示用户简化代码（如避免复杂泛型）|
| `new Function` 安全警告 | 低 | 中 | 代码仅来自 AI 生成（可信源），且经过白名单校验 |
| 高频编译性能问题 | 低 | 中 | 客户端缓存（`compileCache`），相同代码不重复编译 |
| 依赖注入不完整 | 中 | 中 | 白名单机制，缺失依赖时给出明确错误提示 |
| 样式类名未生成 | 低 | 高 | 直接使用项目 Tailwind，无需 CDN，类名与项目一致 |

### 8.1 安全说明

本系统部署于公司内部局域网，仅供内部团队使用，`new Function` 执行代码的风险可控：

1. **代码来源可控**：AI 生成代码受系统提示词约束，依赖白名单限制
2. **使用范围受限**：仅限内网访问，无外部用户输入风险
3. **后续可选加固**：如需要更高级别的隔离，可在 iframe 中执行编译后代码，通过 `postMessage` 通信

---

## 九、回退方案

如实施过程中遇到阻塞问题，可快速回退到 Sandpack：

1. 从 Git 历史恢复 `PreviewPanel.tsx`
2. 重新安装 `@codesandbox/sandpack-react`
3. 恢复测试文件

**回退耗时**: < 10 分钟

---

## 十、后续优化（可选）

| 优化项 | 描述 | 优先级 |
|:-------|:-----|:-------|
| iframe 隔离执行 | 编译后的代码在 iframe 中运行，通过 `postMessage` 通信 | 低 |
| 浏览器端编译 | 使用 `@swc/wasm-web` 在浏览器编译，完全离线 | 中 |
| 嵌入路由 | 新增 `/embed/[demoId]` 路由，支持 iframe 嵌入其他系统 | 后续迭代 |
| 编译缓存持久化 | 将编译结果缓存到 localStorage | 低 |
| Source Map | 调试时映射到原始 TSX 代码 | 低 |

---

## 十一、验收标准

### 11.1 功能验收

| 验收项 | 标准 |
|:-------|:-----|
| 正常预览 | 访问 `/demo-test`，页面加载后 1s 内显示 Demo 组件 |
| 配置联动 | 修改配置面板中的"标题"，预览区在 100ms 内更新 |
| 代码编辑 | 修改代码后，预览区在 2s 内重新编译并更新 |
| 错误提示 | 输入语法错误的代码，显示清晰的编译错误信息 |
| 样式一致 | 预览区组件样式与项目主题完全一致（颜色、间距、字体） |

### 11.2 性能验收

| 指标 | 当前值 | 目标值 |
|:-----|:-------|:-------|
| 首屏预览时间 | 2-5s | <1s |
| 配置联动延迟 | 1-3s | <100ms |
| 前端包体积 | ~500KB | 减少 400KB+ |

### 11.3 兼容性验收

| 验收项 | 标准 |
|:-------|:-----|
| 现有 Demo | 所有已有 Demo 预览正常 |
| 调用方代码 | `src/app/demo/[id]/*.tsx` 无需修改 |
| 测试用例 | 所有 PreviewPanel 相关测试通过 |

---

## 十二、相关文件索引

| 文件 | 路径 | 作用 |
|:-----|:-----|:-----|
| 需求文档 | `docs/项目文档/Web前端/需求文档.md` | 原始需求 |
| Sandpack 集成 | `docs/项目文档/Web前端/预览系统/技术/01_Sandpack集成.md` | 当前方案文档 |
| 实时预览机制 | `docs/项目文档/Web前端/预览系统/技术/02_实时预览机制.md` | 联动机制文档 |
| PreviewPanel | `packages/web/components/demo/PreviewPanel.tsx` | 核心组件（待重写） |
| PreviewPanel 测试 | `packages/web/components/demo/__tests__/PreviewPanel.test.tsx` | 测试文件（待重写） |
| 依赖提取工具 | `packages/web/src/lib/sandpack-deps.ts` | 现有依赖解析逻辑 |
| 编译 API（新建） | `packages/web/src/app/api/compile/route.ts` | 后端编译接口 |
| 编译客户端（新建） | `packages/web/src/lib/compiler-client.ts` | 前端编译调用封装 |
| 组件执行器（新建） | `packages/web/src/lib/component-executor.ts` | 编译后代码执行器 |
| 嵌入路由（后续） | `packages/web/src/app/embed/[demoId]/page.tsx` | 嵌入页面路由 |

---

**文档状态**: ✅ 已确认
**最后更新**: 2026-04-19
