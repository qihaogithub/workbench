# AGENTS.md — opencode-workbench

> 本文件为 AI 编码代理提供在此仓库中工作的指南。

## 项目概览

Monorepo 架构，使用 pnpm workspaces 管理两个包：
- `@opencode-workbench/web` — Next.js 14 前端应用（App Router）
- `@opencode-workbench/shared` — 共享类型定义

## 构建 / 测试 / 开发命令

### 根目录命令
```bash
pnpm dev          # 启动开发服务器
pnpm build        # 生产构建
pnpm lint         # ESLint 检查
pnpm typecheck    # TypeScript 类型检查
```

### 运行测试
```bash
# 运行所有测试
pnpm --filter @opencode-workbench/web test

# 运行单个测试文件
pnpm --filter @opencode-workbench/web test -- --testPathPattern="validator.test.ts"

# 运行特定测试用例
pnpm --filter @opencode-workbench/web test -- -t "应验证有效的 JSON"

# 监听模式
pnpm --filter @opencode-workbench/web test:watch
```

### 包管理
```bash
pnpm install                    # 安装依赖
pnpm --filter @opencode-workbench/web add <pkg>  # 为 web 包添加依赖
```

## 代码风格与约定

### TypeScript 配置
- **严格模式**：`strict: true`，禁止使用 `as any`、`@ts-ignore`、`@ts-expect-error`
- **目标版本**：ES2017
- **模块系统**：ESNext，模块解析使用 bundler 模式
- **JSX**：preserve（由 Next.js 处理）

### 路径别名
```typescript
import { cn } from '@/lib/utils'                    // → ./src/lib/utils
import type { DemoMeta } from '@opencode-workbench/shared'  // → ../shared/src
```

### 命名约定
- **组件/接口**：PascalCase（`DemoMeta`, `SessionCard`）
- **函数/变量**：camelCase（`createSession`, `useDemos`）
- **常量/枚举值**：UPPER_SNAKE_CASE（`DEMO_NOT_FOUND`, `ERROR_MESSAGES`）
- **类型别名**：PascalCase（`ApiResponse<T>`, `ErrorCodeType`）
- **测试文件**：`*.test.ts` 放在 `__tests__/` 目录中

### 导入顺序
1. 外部库（React、Next.js、第三方包）
2. 内部别名导入（`@/`）
3. 相对路径导入（`../`, `./`）

### API 响应格式
所有 API 路由必须使用统一的响应格式：
```typescript
// 成功响应
{ success: true, data: T }

// 错误响应
{ success: false, error: { code: ErrorCode, message: string, details?: unknown } }
```

使用 `createApiSuccess()` 和 `createApiError()` 辅助函数（位于 `@/lib/fs-utils`）。

### 错误处理
- API 路由使用 try/catch 包裹逻辑
- 错误消息使用中文
- 使用 `@opencode-workbench/shared` 中定义的 `ErrorCode` 常量
- 客户端使用 SWR 处理数据获取和错误状态

### 组件库
- **基础组件库**：[shadcn/ui](https://ui.shadcn.com/)
  - 组件位于 `src/components/ui/` 目录
  - 使用 `npx shadcn@latest add <component>` 添加新组件
  - 基于 Radix UI 原语 + `class-variance-authority` 变体系统
- **AI 组件库**：[AI Elements](https://ai.sdk.dev/)
  - 使用 `npx ai-elements@latest add <component>` 添加 AI 相关组件
  - 依赖 shadcn/ui 基础架构，必须在 shadcn/ui 初始化后才能使用
  - 用于流式响应、工具调用展示、推理面板、聊天容器等 AI 场景
- **禁止引入其他 UI 组件库**（如 Ant Design、Material-UI、Chakra UI 等）

### 样式
- **Tailwind CSS** 为主要样式方案
- 使用 `cn()` 工具函数合并类名（`clsx` + `tailwind-merge`）
- 组件使用 `class-variance-authority` 处理变体

### 数据获取
- 客户端使用 **SWR** 进行数据获取和缓存
- 使用 `mutate()` 手动触发重新验证
- API 调用封装在 `@/lib/api.ts` 中

### 组件结构
- App Router 组件放在 `src/app/`
- 可复用组件放在 `src/components/`
- 页面级组件放在 `src/app/[route]/page.tsx`

### 测试规范
- 使用 **Jest** + **Testing Library**
- 测试环境：jsdom
- 设置文件：`jest.setup.ts`
- 模块映射：`@/*` → `<rootDir>/src/*`
- 测试描述使用中文（`describe('应验证有效的 JSON', ...)`）

## 目录结构
```
packages/
├── web/
│   ├── src/
│   │   ├── app/          # Next.js App Router（页面和 API 路由）
│   │   ├── components/   # React 组件
│   │   └── lib/          # 工具函数和 API 客户端
│   ├── lib/              # 校验器和解析器
│   │   └── __tests__/    # 单元测试
│   └── components/       # 演示组件
└── shared/
    └── src/              # 共享类型和常量
```

## 注意事项
- 无 Cursor/Copilot 规则文件
- ESLint 配置：继承 `next/core-web-vitals`
- 使用 Turbo 进行任务编排（缓存和依赖管理）
- Node.js 版本要求：>= 18.0.0
