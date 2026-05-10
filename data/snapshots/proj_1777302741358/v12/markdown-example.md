# OpenCode Workbench 项目文档

## 一、项目概述

OpenCode Workbench 是一个基于 **Monorepo 架构**的内部开发工具平台，提供统一的 Agent 客户端接入能力。

> 💡 核心目标：让团队成员通过统一界面接入不同 AI Agent，提升协作效率。

---

## 二、技术架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                  Web Frontend (Next.js)              │
├─────────────────────────────────────────────────────┤
│              Agent Service (Fastify)                 │
├──────────┬──────────┬──────────┬─────────────────────┤
│ OpenCode │  Claude  │  Codex   │      Gemini         │
└──────────┴──────────┴──────────┴─────────────────────┘
```

### 2.2 包结构

| 包名 | 描述 | 技术栈 |
|------|------|--------|
| `@opencode-workbench/web` | Next.js 前端应用 | Next.js 14 + Tailwind + SWR |
| `@opencode-workbench/shared` | 共享类型定义 | TypeScript |
| `@opencode-workbench/agent-service` | Agent 服务 | Fastify + pino |
| `@opencode-workbench/agent-client` | 客户端 SDK | TypeScript |

---

## 三、核心功能

### 3.1 功能清单

- [x] 多 Agent 后端支持（OpenCode / Claude / Codex / Gemini）
- [x] 会话管理与会话恢复
- [x] 实时流式响应
- [x] 配置管理与工作空间隔离
- [ ] 插件系统（规划中）
- [ ] 团队协作功能（规划中）

### 3.2 支持的 Agent 后端

| Backend | CLI 命令 | ACP 参数 | 状态 |
|---------|----------|----------|------|
| `opencode` | `opencode` | `['acp']` | ✅ 稳定 |
| `claude` | `claude` | `['--experimental-acp']` | ✅ 稳定 |
| `codex` | `codex` | `[]` | 🟡 测试中 |
| `gemini` | `gemini` | `['--experimental-acp']` | ✅ 稳定 |
| `qwen` | `qwen` | `['--acp']` | 🟡 测试中 |
| `goose` | `goose` | `['acp']` | ✅ 稳定 |

---

## 四、开发指南

### 4.1 环境要求

- **Node.js**: `>= 18.0.0`
- **包管理器**: `pnpm`
- **操作系统**: macOS / Linux / Windows

### 4.2 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动开发服务器（Web + Agent Service）
pnpm dev

# 3. 单独启动 Web 服务器
pnpm dev:web

# 4. 单独启动 Agent 服务
pnpm dev:agent
```

### 4.3 运行测试

```bash
# 运行所有测试
pnpm test

# 运行单个测试文件
pnpm --filter @opencode-workbench/web test \
  -- --testPathPattern="validator.test.ts"

# 监听模式
pnpm --filter @opencode-workbench/web test:watch
```

---

## 五、代码规范

### 5.1 TypeScript 配置

- **严格模式**: `strict: true`
- **目标版本**: ES2017
- **模块系统**: ESNext

### 5.2 命名约定

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件/接口 | PascalCase | `DemoMeta`, `SessionCard` |
| 函数/变量 | camelCase | `createSession`, `useDemos` |
| 常量/枚举 | UPPER_SNAKE_CASE | `DEMO_NOT_FOUND` |
| 类型别名 | PascalCase | `ApiResponse<T>` |

### 5.3 导入顺序

1. 外部库（React、Next.js、第三方包）
2. 内部别名导入（`@/`）
3. 相对路径导入（`../`, `./`）

```typescript
// ✅ 正确示例
import React from 'react'
import { cn } from '@/lib/utils'
import type { DemoMeta } from '@opencode-workbench/shared'
import { localHelper } from './helpers'
```

---

## 六、经验沉淀

### 6.1 已沉淀文档

| 文档 | 覆盖范围 |
|------|---------|
| [ACP协议消息处理](docs/plans/归档/经验/ACP协议消息处理.md) | ACP 协议映射、消息聚合 |
| [React高频事件状态覆盖](docs/plans/归档/经验/React高频事件状态覆盖.md) | React 受控模式 Bug |
| [Sandpack集成经验](docs/plans/归档/经验/Sandpack集成经验.md) | Sandpack 配置陷阱 |
| [配置与工作空间管理](docs/plans/归档/经验/配置与工作空间管理.md) | 配置单一来源 |

### 6.2 核心原则

> **简洁优先**：用最少的代码解决问题，不编写任何推测性代码。
> 
> **Agent 友好**：目录即职责，显式优于隐式，接口与实现分离。

---

## 七、快速参考

### 常用命令速查

| 命令 | 描述 |
|------|------|
| `pnpm dev` | 同时启动 web 和 agent-service |
| `pnpm build` | 生产构建 |
| `pnpm lint` | ESLint 检查 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm install` | 安装依赖 |

### 错误处理示例

```typescript
// ✅ 成功响应
{ success: true, data: T }

// ❌ 错误响应
{ success: false, error: { code: ErrorCode, message: string } }
```

---

*文档最后更新: 2026年5月3日*
