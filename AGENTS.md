# AGENTS.md — opencode-workbench

> 本文件为 AI 编码代理提供在此仓库中工作的指南。

## 项目概览

Monorepo 架构，使用 pnpm workspaces 管理四个包：
- `@opencode-workbench/web` — Next.js 14 前端应用（App Router）
- `@opencode-workbench/shared` — 共享类型定义
- `@opencode-workbench/agent-service` — 独立 Agent 服务，实现 ACP 协议
- `@opencode-workbench/agent-client` — Agent Service Client SDK

## 构建 / 测试 / 开发命令

### 根目录命令
```bash
pnpm dev          # 同时启动 web 和 agent-service 开发服务器
pnpm dev:web      # 仅启动 web 开发服务器
pnpm dev:agent    # 仅启动 agent-service 开发服务器
pnpm build        # 生产构建
pnpm lint         # ESLint 检查
pnpm typecheck    # TypeScript 类型检查
```

### 运行测试
```bash
# 运行 web 包测试
pnpm --filter @opencode-workbench/web test

# 运行单个测试文件
pnpm --filter @opencode-workbench/web test -- --testPathPattern="validator.test.ts"

# 运行特定测试用例
pnpm --filter @opencode-workbench/web test -- -t "应验证有效的 JSON"

# 监听模式
pnpm --filter @opencode-workbench/web test:watch

# 运行 agent-service 包测试（使用 fake-acp-cli）
pnpm --filter @opencode-workbench/agent-service test

# agent-service 测试监听模式
pnpm --filter @opencode-workbench/agent-service test:watch

# agent-service 测试覆盖率报告
pnpm --filter @opencode-workbench/agent-service test:coverage

# agent-service 真实后端冒烟测试（需要安装对应 CLI）
pnpm --filter @opencode-workbench/agent-service test:smoke
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

### agent-service 特定约定

#### ACP 协议
- **协议说明**：ACP (Agent Client Protocol) 是由 Zed Industries 主导的行业开放标准
- **通信方式**：通过 stdio 进行 JSON-RPC 通信（子进程标准输入/输出）
- **消息格式**：每行一个 JSON 消息，以换行符分隔

#### 支持的 Agent 后端
| Backend | CLI 命令 | ACP 参数 |
|---------|----------|----------|
| `opencode` | `opencode` | `['acp']` |
| `claude` | `claude` | `['--experimental-acp']` |
| `codex` | `codex` | `[]` |
| `gemini` | `gemini` | `['--experimental-acp']` |
| `qwen` | `qwen` | `['--acp']` |
| `goose` | `goose` | `['acp']` |

#### 日志规范
- 使用 **pino** 日志库
- 通过 `src/utils/logger.ts` 统一导出
- 日志级别：`debug`, `info`, `warn`, `error`

#### 测试策略
- **单元测试**：纯逻辑测试，位于 `tests/unit/`
- **集成测试**：使用 `fake-acp-cli` 模拟真实 CLI，位于 `tests/integration/`
- **真实后端测试**：可选，通过 `ACP_SMOKE_REAL=1` 环境变量启用

### agent-client 使用示例
```typescript
import { AgentClient } from '@opencode-workbench/agent-client';

const client = new AgentClient({ baseUrl: 'http://localhost:3001' });

// 发送消息
const result = await client.sendMessage('session-id', '你好');

// 获取 WebSocket 流
const stream = client.stream('session-id');
stream.on('stream', (event) => console.log(event.content));
stream.send('继续');
```

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
├── shared/
│   └── src/              # 共享类型和常量
├── agent-service/
│   ├── src/
│   │   ├── acp/          # ACP 协议实现
│   │   ├── backends/     # Agent 后端适配器
│   │   ├── core/         # 核心逻辑（Agent、工厂、管理器）
│   │   ├── events/       # 事件系统
│   │   ├── routes/       # HTTP/WebSocket 路由
│   │   ├── session/      # 会话管理
│   │   ├── utils/        # 工具函数
│   │   └── server.ts     # Fastify 服务器入口
│   └── tests/            # 单元测试和集成测试
└── agent-client/
    └── src/
        ├── client.ts     # AgentClient 类实现
        └── types.ts      # 类型定义
```

## 注意事项
- 无 Cursor/Copilot 规则文件
- ESLint 配置：继承 `next/core-web-vitals`
- 使用 Turbo 进行任务编排（缓存和依赖管理）
- Node.js 版本要求：>= 18.0.0

### agent-service 注意事项
- **进程隔离**：每个 Agent 运行在独立子进程中
- **超时处理**：`session/prompt` 默认超时 5 分钟，其他方法 1 分钟
- **权限控制**：敏感操作需要通过 `onPermissionRequest` 回调确认
- **流式响应**：通过 `session/update` 通知实现实时更新
- **会话恢复**：支持通过 `loadSession` 恢复已有会话
- **模型切换**：支持运行时切换模型（`setModel`）
- **详细文档**：参见 `packages/agent-service/AGENTS.md`
