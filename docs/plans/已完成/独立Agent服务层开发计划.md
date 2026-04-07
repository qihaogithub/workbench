# 独立 Agent 服务层 - 开发计划文档

> 版本：v1.3
> 创建日期：2026-04-05
> 更新日期：2026-04-06
> 状态：开发中

---

## 一、项目概览

### 1.1 目标

将 Agent 相关逻辑从 Next.js 应用中剥离，创建独立的 Agent 服务，参考 AionUi 架构实现多后端支持。

### 1.2 当前实现状态

基于代码审查，当前 `packages/agent-service` 已完成以下模块：

| 模块 | 文件 | 状态 | 完成度 |
|:-----|:-----|:-----|:-------|
| 核心类型定义 | `src/core/types.ts` | ✅ 完成 | 100% |
| BaseAgent 基类 | `src/core/agent.ts` | ✅ 完成 | 100% |
| BackendAgent | `src/core/backend-agent.ts` | ✅ 完成 | 100% |
| AgentFactory | `src/core/agent-factory.ts` | ✅ 完成 | 100% |
| AgentManager | `src/core/agent-manager.ts` | ✅ 完成 | 100% |
| IBackendAdapter | `src/backends/base.ts` | ✅ 完成 | 100% |
| BaseAcpBackend | `src/backends/base-acp.ts` | ✅ 完成 | 100% |
| OpenCode 后端 | `src/backends/opencode-acp.ts` | ✅ 完成 | 100% |
| Claude 后端 | `src/backends/claude.ts` | ✅ 完成 | 100% |
| Codex 后端 | `src/backends/codex.ts` | ✅ 完成 | 100% |
| Gemini 后端 | `src/backends/gemini.ts` | ✅ 完成 | 100% |
| Qwen 后端 | `src/backends/qwen.ts` | ✅ 完成 | 100% |
| Goose 后端 | `src/backends/goose.ts` | ✅ 完成 | 100% |
| Auggie 后端 | `src/backends/auggie.ts` | ✅ 完成 | 100% |
| Kimi 后端 | `src/backends/kimi.ts` | ✅ 完成 | 100% |
| Copilot 后端 | `src/backends/copilot.ts` | ✅ 完成 | 100% |
| Qoder 后端 | `src/backends/qoder.ts` | ✅ 完成 | 100% |
| Vibe 后端 | `src/backends/vibe.ts` | ✅ 完成 | 100% |
| Custom 后端 | `src/backends/custom.ts` | ✅ 完成 | 100% |
| ACP 类型定义 | `src/acp/types.ts` | ✅ 完成 | 100% |
| ACP 连接 | `src/acp/connection.ts` | ✅ 完成 | 100% |
| 权限管理 | `src/acp/approval-store.ts` | ✅ 完成 | 100% |
| 模型管理 | `src/acp/model-info.ts` | ✅ 完成 | 100% |
| REST API 路由 | `src/routes/agent.ts` | ✅ 完成 | 100% |
| WebSocket 路由 | `src/routes/websocket.ts` | ✅ 完成 | 100% |
| Fastify 服务 | `src/server.ts` | ✅ 完成 | 100% |

### 1.3 与 AionUi 的差距分析

| 功能特性 | AionUi | 当前实现 | 差距 |
|:---------|:-------|:---------|:-----|
| 后端数量 | 17+ (claude, codex, gemini, qwen, iflow, goose, auggie, kimi, opencode, copilot, qoder, vibe, openclaw, nanobot, cursor, kiro, remote, aionrs, custom) | 12 (opencode, claude, codex, gemini, qwen, goose, auggie, kimi, copilot, qoder, vibe, custom) | 缺少 5+ 后端 |
| ACP 协议 | 完整实现 (1100+ 行) | 完整实现 (720 行) | ✅ 已完成 |
| 权限管理 | ApprovalStore 缓存 | ✅ 已实现 | ✅ 已完成 |
| 模型管理 | 动态切换、模型信息 | ✅ 已实现 | ✅ 已完成 |
| 会话模式 | YOLO、plan 等 | 无 | 缺少 |
| MCP 支持 | 完整 MCP 服务器配置 | 无 | 缺少 |
| 事件系统 | 完整回调解耦 | ✅ 已增强 | ✅ 已完成 |

### 1.4 里程碑

| 阶段 | 目标 | 预计周期 | 状态 |
|:-----|:-----|:---------|:-----|
| **Phase 1** | 基础框架搭建 | 2 天 | ✅ 已完成 |
| **Phase 2** | 核心功能实现 | 3 天 | ✅ 已完成 |
| **Phase 3** | 多后端扩展 | 3 天 | ✅ 已完成 |
| **Phase 4** | 集成与迁移 | 2 天 | ⏳ 待开始 |
| **Phase 5** | 测试与优化 | 2 天 | ⏳ 待开始 |
| **Phase 6** | 部署与文档 | 1 天 | ⏳ 待开始 |

---

## 二、Phase 1：基础框架搭建 ✅ 已完成

### 2.1 任务清单

- [x] 创建项目目录结构
- [x] 初始化 package.json 和 tsconfig.json
- [x] 配置开发环境（ESLint、Prettier、Jest）
- [x] 实现基础类型定义
- [x] 搭建 Fastify 服务骨架

### 2.2 已完成的文件

```
packages/agent-service/
├── src/
│   ├── core/
│   │   ├── types.ts          ✅ 核心类型定义
│   │   ├── agent.ts          ✅ BaseAgent 基类
│   │   ├── backend-agent.ts  ✅ BackendAgent 实现
│   │   ├── agent-factory.ts  ✅ AgentFactory 工厂
│   │   └── agent-manager.ts  ✅ AgentManager 管理器
│   ├── backends/
│   │   ├── base.ts           ✅ IBackendAdapter 接口
│   │   ├── index.ts          ✅ 后端导出
│   │   ├── opencode-http.ts  ✅ OpenCode HTTP 后端
│   │   ├── opencode-acp.ts   ✅ OpenCode ACP 后端
│   │   ├── claude.ts         ✅ Claude 后端（骨架）
│   │   ├── codex.ts          ✅ Codex 后端（骨架）
│   │   └── gemini.ts         ✅ Gemini 后端（骨架）
│   ├── acp/
│   │   ├── types.ts          ✅ ACP 类型定义
│   │   ├── connection.ts     ✅ ACP 连接（简化版）
│   │   └── index.ts          ✅ ACP 导出
│   ├── routes/
│   │   ├── agent.ts          ✅ REST API 路由
│   │   ├── websocket.ts      ✅ WebSocket 路由
│   │   └── index.ts          ✅ 路由注册
│   ├── session/
│   │   ├── session-store.ts  ✅ Session 存储
│   │   └── session-guard.ts  ✅ Session 守卫
│   ├── events/
│   │   └── event-bus.ts      ✅ 事件总线
│   ├── utils/
│   │   ├── config.ts         ✅ 配置加载
│   │   └── logger.ts         ✅ 日志工具
│   └── server.ts             ✅ Fastify 服务入口
├── package.json              ✅ 依赖配置
├── tsconfig.json             ✅ TypeScript 配置
├── jest.config.js            ✅ Jest 配置
└── .eslintrc.json            ✅ ESLint 配置
```

### 2.3 验收标准

- [x] `pnpm dev` 能成功启动服务
- [x] `GET /health` 返回健康状态
- [x] TypeScript 编译无错误
- [x] ESLint 检查通过

---

## 三、Phase 2：核心功能实现 ✅ 已完成

### 3.1 任务清单

- [x] 实现 Agent 基类
- [x] 实现 Agent 工厂
- [x] 实现 Agent 管理器
- [x] 实现 OpenCode HTTP 后端适配器
- [x] 实现 OpenCode ACP 后端适配器
- [x] 实现 Session 存储
- [x] 实现 Session 守卫
- [x] 实现事件总线
- [x] 实现 REST API 路由
- [x] 实现 WebSocket 流式响应
- [x] 完善 ACP 协议实现
- [x] 实现权限管理（ApprovalStore）
- [x] 实现模型管理

### 3.2 已完成任务详情

#### 任务 2.10：完善 WebSocket 流式响应 ✅ 已完成

**文件**：`src/routes/websocket.ts`

**参考**：AionUi `src/process/task/IpcAgentEventEmitter.ts`

**关键点**：
- ✅ 实现完整的流式事件推送
- ✅ 支持消息类型：stream、thought、tool_call、error、finish
- ✅ 实现心跳保活机制
- ✅ 处理断线重连
- ✅ 支持会话恢复
- ✅ 支持模型切换

#### 任务 2.11：完善 ACP 协议实现 ✅ 已完成

**文件**：`src/acp/connection.ts`

**参考**：AionUi `src/process/agent/acp/AcpConnection.ts` (1100+ 行)

**已完成功能**：

| 功能 | AionUi | 当前实现 | 状态 |
|:-----|:-------|:---------|:-----|
| JSON-RPC 消息处理 | ✅ 完整 | ✅ 完整 | ✅ |
| 会话创建/恢复 | ✅ session/new, session/load | ✅ 完整 | ✅ |
| 权限请求处理 | ✅ 完整回调 | ✅ 完整 | ✅ |
| 超时管理 | ✅ 可配置 + keepalive | ✅ 完整 | ✅ |
| 进程管理 | ✅ spawn + 生命周期 | ✅ 完整 | ✅ |
| 模型切换 | ✅ session/set_model | ✅ 完整 | ✅ |
| 配置选项 | ✅ session/set_config_option | ✅ 完整 | ✅ |
| 文件操作 | ✅ fs/read_text_file, fs/write_text_file | ✅ 完整 | ✅ |

#### 任务 2.12：实现权限管理（ApprovalStore）✅ 已完成

**文件**：`src/acp/approval-store.ts`

**参考**：AionUi `src/process/agent/acp/ApprovalStore.ts`

**实现内容**：
- ✅ AcpApprovalStore 类
- ✅ createAcpApprovalKey 辅助函数
- ✅ 权限缓存功能
- ✅ 序列化 key 生成

#### 任务 2.13：实现模型管理 ✅ 已完成

**文件**：`src/acp/model-info.ts`

**参考**：AionUi `src/process/agent/acp/modelInfo.ts`

**实现内容**：
- ✅ AcpModelInfo 接口
- ✅ buildAcpModelInfo 函数
- ✅ summarizeAcpModelInfo 函数
- ✅ 支持 configOption 和 models 两种来源

### 3.3 验收标准

- [x] WebSocket 流式响应正常工作
- [x] ACP 会话恢复功能正常
- [x] 权限缓存功能正常
- [x] 模型切换功能正常
- [x] TypeScript 编译无错误

---

## 四、Phase 3：多后端扩展 ✅ 已完成

### 4.1 任务清单

- [x] 扩展 ACP 后端配置（参考 AionUi `acpTypes.ts`）
- [x] 实现 Qwen Code 后端
- [x] 实现 Codex 后端（完整版）
- [x] 实现 Claude Code 后端（完整版）
- [x] 实现 Gemini CLI 后端
- [x] 实现 Goose AI 后端
- [x] 实现 Augment Code 后端
- [x] 实现 Kimi CLI 后端
- [x] 实现 GitHub Copilot 后端
- [x] 实现 Qoder CLI 后端
- [x] 实现 Mistral Vibe 后端
- [x] 实现 Custom Agent 后端

### 4.2 已完成的后端

| 后端 | 文件 | 类型 | 状态 |
|:-----|:-----|:-----|:-----|
| OpenCode | `opencode-acp.ts` | ACP 协议 | ✅ 完成 |
| Claude | `claude.ts` | HTTP API | ✅ 完成 |
| Codex | `codex.ts` | HTTP API | ✅ 完成 |
| Gemini | `gemini.ts` | HTTP API | ✅ 完成 |
| Qwen | `qwen.ts` | ACP 协议 | ✅ 完成 |
| Goose | `goose.ts` | ACP 协议 | ✅ 完成 |
| Auggie | `auggie.ts` | ACP 协议 | ✅ 完成 |
| Kimi | `kimi.ts` | ACP 协议 | ✅ 完成 |
| Copilot | `copilot.ts` | ACP 协议 | ✅ 完成 |
| Qoder | `qoder.ts` | ACP 协议 | ✅ 完成 |
| Vibe | `vibe.ts` | ACP 协议 | ✅ 完成 |
| Custom | `custom.ts` | ACP 协议 | ✅ 完成 |

### 4.3 后端配置扩展

**文件**：`src/acp/types.ts`

**参考**：AionUi `src/common/types/acpTypes.ts` L336-536

```typescript
// AionUi 支持的后端配置
export const ACP_BACKENDS_ALL: Record<AcpBackendAll, AcpBackendConfig> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    cliCommand: 'claude',
    authRequired: true,
    enabled: true,
    acpArgs: ['--experimental-acp'],
    skillsDirs: ['.claude/skills'],
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    cliCommand: 'qwen',
    defaultCliPath: 'npx @qwen-code/qwen-code',
    authRequired: true,
    enabled: true,
    acpArgs: ['--acp'],
    skillsDirs: ['.qwen/skills'],
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    cliCommand: 'codex',
    defaultCliPath: 'npx @zed-industries/codex-acp@0.9.5',
    authRequired: true,
    enabled: true,
    acpArgs: [],
    skillsDirs: ['.codex/skills'],
  },
  goose: {
    id: 'goose',
    name: 'Goose',
    cliCommand: 'goose',
    authRequired: false,
    enabled: true,
    acpArgs: ['acp'],
    skillsDirs: ['.goose/skills'],
  },
  auggie: {
    id: 'auggie',
    name: 'Augment Code',
    cliCommand: 'auggie',
    authRequired: false,
    enabled: true,
    acpArgs: ['--acp'],
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi CLI',
    cliCommand: 'kimi',
    authRequired: false,
    enabled: true,
    acpArgs: ['acp'],
    skillsDirs: ['.kimi/skills'],
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    cliCommand: 'opencode',
    authRequired: false,
    enabled: true,
    acpArgs: ['acp'],
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    cliCommand: 'copilot',
    authRequired: false,
    enabled: true,
    acpArgs: ['--acp', '--stdio'],
  },
  qoder: {
    id: 'qoder',
    name: 'Qoder CLI',
    cliCommand: 'qodercli',
    authRequired: false,
    enabled: true,
    acpArgs: ['--acp'],
  },
  vibe: {
    id: 'vibe',
    name: 'Mistral Vibe',
    cliCommand: 'vibe-acp',
    authRequired: false,
    enabled: true,
    acpArgs: [],
    skillsDirs: ['.vibe/skills'],
  },
  custom: {
    id: 'custom',
    name: 'Custom Agent',
    cliCommand: undefined,
    authRequired: false,
    enabled: true,
    acpArgs: [],
  },
};
```

### 4.3 后端实现模板

每个后端需要实现以下内容：

```typescript
// src/backends/{backend-name}.ts
import { IBackendAdapter, BackendStatus } from './base';
import { AgentConfig, AgentEvent } from '../core/types';
import { AcpConnection } from '../acp';

export class {BackendName}Backend implements IBackendAdapter {
  readonly name = '{backend-id}';
  private connection: AcpConnection | null = null;
  private config: AgentConfig;
  private status: BackendStatus = 'idle';
  private eventCallback?: (event: AgentEvent) => void;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.status = 'initializing';
    this.connection = new AcpConnection('{backend-id}', this.config.workingDir || process.cwd());
    
    this.connection.on('sessionUpdate', (update) => {
      this.handleSessionUpdate(update);
    });
    
    this.connection.on('permissionRequest', async (request) => {
      return this.handlePermissionRequest(request);
    });
    
    await this.connection.connect();
    await this.connection.createSession({ model: this.config.model });
    this.status = 'ready';
  }

  async sendMessage(content: string, options?: { stream?: boolean }): Promise<string> {
    // 实现消息发送逻辑
  }

  onStream(callback: (event: AgentEvent) => void): void {
    this.eventCallback = callback;
  }

  async getStatus(): Promise<BackendStatus> {
    return this.status;
  }

  async destroy(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = null;
    }
    this.status = 'idle';
  }

  async checkHealth(): Promise<boolean> {
    return this.connection?.isConnected ?? false;
  }
}
```

### 4.4 验收标准

- [ ] 至少支持 10 个后端
- [ ] 每个后端能独立启动和运行
- [ ] 后端切换功能正常
- [ ] 配置文件正确加载

---

## 五、Phase 4：集成与迁移 ⏳ 待开始

### 5.1 任务清单

- [ ] 创建 Agent 客户端 SDK
- [ ] 改造 Web 前端 API Routes
- [ ] 实现前后端联调
- [ ] 迁移现有功能

### 5.2 Agent 客户端 SDK

**文件**：`packages/agent-client/src/client.ts`

```typescript
export class AgentClient {
  private baseUrl: string;
  
  constructor(config: { baseUrl: string; apiKey?: string }) {
    this.baseUrl = config.baseUrl;
  }
  
  async sendMessage(sessionId: string, content: string): Promise<AgentResult> {
    const response = await fetch(`${this.baseUrl}/api/agent/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return response.json();
  }
  
  stream(sessionId: string): AgentStream {
    return new AgentStream(`${this.baseUrl}/api/agent/${sessionId}/stream`);
  }
  
  async createSession(config: AgentConfig): Promise<SessionInfo> {
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return response.json();
  }
  
  async getModels(sessionId: string): Promise<ModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/api/agent/${sessionId}/models`);
    return response.json();
  }
  
  async setModel(sessionId: string, modelId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/agent/${sessionId}/model`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId }),
    });
  }
}
```

### 5.3 Web 前端集成

**方案**：API Routes 代理

```typescript
// packages/web/src/app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:3101';

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  const response = await fetch(`${AGENT_SERVICE_URL}/api/agent/${body.sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  const data = await response.json();
  return NextResponse.json(data);
}
```

### 5.4 环境变量配置

```env
# packages/web/.env.local
AGENT_SERVICE_URL=http://localhost:3101
NEXT_PUBLIC_AGENT_SERVICE_URL=http://localhost:3101

# packages/agent-service/.env
PORT=3101
OPENCODE_SERVER_URL=http://localhost:4096
LOG_LEVEL=info
```

### 5.5 验收标准

- [ ] Web 前端能通过 Agent 服务发送消息
- [ ] 流式响应正常工作
- [ ] 文件变更正确同步
- [ ] 错误处理正确传递

---

## 六、Phase 5：测试与优化 ⏳ 待开始

### 5.1 任务清单

- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 性能测试与优化
- [ ] 错误处理完善

### 5.2 测试用例

#### 单元测试

| 模块 | 测试点 |
|:-----|:-------|
| AgentFactory | 注册、创建、重复注册 |
| AgentManager | 创建、缓存、销毁 |
| OpenCodeBackend | 连接、发送、健康检查 |
| SessionStore | CRUD、过滤 |
| SessionGuard | 文件校验、路径安全 |

#### 集成测试

| 场景 | 测试点 |
|:-----|:-------|
| 完整流程 | 创建 Session → 发送消息 → 获取结果 |
| 流式响应 | WebSocket 连接 → 发送 → 接收流 → 完成 |
| 错误恢复 | 后端不可用 → 重试 → 恢复 |
| 并发处理 | 多个 Session 同时发送消息 |

### 5.3 性能优化

| 优化点 | 方法 |
|:-------|:-----|
| 连接池 | 使用 undici Pool |
| Agent 缓存 | 避免重复创建 |
| 流式响应 | 直接写入 socket |
| 内存管理 | 定期清理过期 Session |

### 5.4 验收标准

- [ ] 测试覆盖率 > 80%
- [ ] 所有测试通过
- [ ] 性能指标达标（响应时间 < 100ms）

---

## 六、Phase 6：部署与文档 ⏳ 待开始

### 6.1 任务清单

- [ ] 编写 Dockerfile
- [ ] 编写 docker-compose.yml
- [ ] 编写 API 文档
- [ ] 编写运维文档

### 6.2 Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3101

CMD ["node", "dist/server.js"]
```

### 6.3 docker-compose.yml

```yaml
version: '3.8'

services:
  agent-service:
    build:
      context: ./packages/agent-service
      dockerfile: Dockerfile
    ports:
      - "3101:3101"
    environment:
      - PORT=3101
      - OPENCODE_SERVER_URL=http://opencode:4096
      - LOG_LEVEL=info
    depends_on:
      - opencode
    restart: unless-stopped

  opencode:
    image: opencode/opencode:latest
    ports:
      - "4096:4096"
    volumes:
      - ./data:/data
    restart: unless-stopped
```

### 6.4 验收标准

- [ ] Docker 镜像构建成功
- [ ] docker-compose up 正常启动
- [ ] 服务健康检查通过
- [ ] 文档完整

---

## 七、风险与应对

### 7.1 技术风险

| 风险 | 概率 | 影响 | 应对措施 |
|:-----|:-----|:-----|:---------|
| opencode API 变更 | 中 | 高 | 抽象后端接口，隔离变更 |
| 性能瓶颈 | 低 | 中 | 连接池、缓存、监控 |
| 内存泄漏 | 中 | 高 | 定期清理、压力测试 |

### 7.2 进度风险

| 风险 | 概率 | 影响 | 应对措施 |
|:-----|:-----|:-----|:---------|
| 需求变更 | 中 | 中 | 模块化设计，快速响应 |
| 集成问题 | 中 | 高 | 提前联调，预留缓冲 |

---

## 八、交付物清单

### 8.1 代码

- [ ] `packages/agent-service/` - Agent 服务
- [ ] `packages/agent-client/` - 客户端 SDK
- [ ] `packages/shared/src/agent-types.ts` - 共享类型

### 8.2 文档

- [ ] API 文档（Swagger/OpenAPI）
- [ ] 部署文档
- [ ] 运维手册

### 8.3 测试

- [ ] 单元测试代码
- [ ] 集成测试代码
- [ ] 测试报告

---

## 九、后续规划

### 9.1 短期（1-2 周）

- [ ] 添加 Claude 后端支持
- [ ] 实现会话持久化
- [ ] 添加监控指标

### 9.2 中期（1-2 月）

- [ ] 支持多租户
- [ ] 实现 Agent 插件系统
- [ ] 添加 Web UI 管理界面

### 9.3 长期（3+ 月）

- [ ] 支持自定义后端
- [ ] 实现 Agent 编排
- [ ] 提供 GraphQL API

---

## 十、总结

本开发计划分为 6 个阶段，预计总工期 13 天：

1. **Phase 1**：搭建基础框架（2 天）✅ 已完成
2. **Phase 2**：实现核心功能（3 天）🔄 进行中
3. **Phase 3**：多后端扩展（3 天）⏳ 待开始
4. **Phase 4**：集成与迁移（2 天）⏳ 待开始
5. **Phase 5**：测试与优化（2 天）⏳ 待开始
6. **Phase 6**：部署与文档（1 天）⏳ 待开始

### 当前优先任务

1. **完善 WebSocket 流式响应** - 高优先级
2. **完善 ACP 协议实现** - 高优先级
3. **实现权限管理（ApprovalStore）** - 中优先级
4. **实现模型管理** - 中优先级

下一步：参考 [05-部署方案.md](./05-部署方案.md) 了解部署细节。

---

## 十一、AionUi 参考实施指南

本节提供每个开发阶段如何参考 AionUi 代码的具体指南。

### 11.1 已完成的参考（Phase 1）

| 任务 | AionUi 参考文件 | 参考方式 | 状态 |
|:-----|:----------------|:---------|:-----|
| 类型定义 | `common/types/acpTypes.ts` | 参考类型结构 | ✅ 完成 |
| AgentFactory | `process/task/AgentFactory.ts` | **直接抄** | ✅ 完成 |
| IAgentManager | `process/task/IAgentManager.ts` | **直接抄** | ✅ 完成 |
| BaseAgent | `process/agent/acp/index.ts` L129-220 | 参考类结构 | ✅ 完成 |
| AgentManager | `process/task/AcpAgentManager.ts` L1-100 | 参考改 | ✅ 完成 |

### 11.2 待完成的参考（Phase 2）

| 任务 | AionUi 参考文件 | 参考方式 | 优先级 |
|:-----|:----------------|:---------|:-------|
| WebSocket 流式 | `process/task/IpcAgentEventEmitter.ts` | 参考改 | 高 |
| 会话恢复 | `process/agent/acp/index.ts` L1510-1557 | 参考策略 | 高 |
| 权限缓存 | `process/agent/acp/ApprovalStore.ts` | 直接抄 | 高 |
| 模型管理 | `process/agent/acp/modelInfo.ts` | 参考改 | 中 |
| ACP 连接完善 | `process/agent/acp/AcpConnection.ts` | 参考改 | 高 |

### 11.3 多后端扩展参考（Phase 3）

| 后端 | AionUi 参考文件 | 参考方式 | 说明 |
|:-----|:----------------|:---------|:-----|
| Qwen Code | `common/types/acpTypes.ts` ACP_BACKENDS_ALL.qwen | 直接抄配置 | CLI 命令：`npx @qwen-code/qwen-code` |
| Codex | `common/types/acpTypes.ts` ACP_BACKENDS_ALL.codex | 直接抄配置 | CLI 命令：`npx @zed-industries/codex-acp@0.9.5` |
| Goose AI | `common/types/acpTypes.ts` ACP_BACKENDS_ALL.goose | 直接抄配置 | CLI 命令：`goose acp` |
| Augment Code | `common/types/acpTypes.ts` ACP_BACKENDS_ALL.auggie | 直接抄配置 | CLI 命令：`auggie --acp` |
| Kimi CLI | `common/types/acpTypes.ts` ACP_BACKENDS_ALL.kimi | 直接抄配置 | CLI 命令：`kimi acp` |
| GitHub Copilot | `common/types/acpTypes.ts` ACP_BACKENDS_ALL.copilot | 直接抄配置 | CLI 命令：`copilot --acp --stdio` |
| Qoder CLI | `common/types/acpTypes.ts` ACP_BACKENDS_ALL.qoder | 直接抄配置 | CLI 命令：`qodercli --acp` |
| Mistral Vibe | `common/types/acpTypes.ts` ACP_BACKENDS_ALL.vibe | 直接抄配置 | CLI 命令：`vibe-acp` |
| Custom Agent | `common/types/acpTypes.ts` ACP_BACKENDS_ALL.custom | 参考改 | 自定义 CLI 命令 |

### 11.4 AionUi 核心文件路径

| 文件 | 路径 | 核心内容 | 参考程度 |
|:-----|:-----|:---------|:---------|
| Agent 工厂 | `AionUi/src/process/task/AgentFactory.ts` | 极简工厂实现 | **已抄** |
| Agent 接口 | `AionUi/src/process/task/IAgentManager.ts` | 生命周期接口 | **已抄** |
| ACP Agent | `AionUi/src/process/agent/acp/index.ts` | 完整 Agent 实现（1700+ 行） | 70% 参考 |
| 连接管理 | `AionUi/src/process/agent/acp/AcpConnection.ts` | 连接生命周期（1100+ 行） | 40% 参考 |
| 权限缓存 | `AionUi/src/process/agent/acp/ApprovalStore.ts` | "always allow" 缓存 | 待抄 |
| 模型信息 | `AionUi/src/process/agent/acp/modelInfo.ts` | 模型管理 | 待参考 |
| 后端配置 | `AionUi/src/common/types/acpTypes.ts` L336-536 | 所有后端配置 | 待抄 |

### 11.5 快速参考清单

#### 已完成

- [x] `AgentFactory.ts` → `core/agent-factory.ts`
- [x] `IAgentManager.ts` → `core/types.ts`（接口部分）
- [x] `AcpAgent.ts` L129-220 → `core/agent.ts`（类结构）
- [x] `AcpAgentManager.ts` L1-100 → `core/agent-manager.ts`

#### 待完成 - 高优先级

- [ ] `AcpConnection.ts` → `acp/connection.ts`（完善会话恢复、权限处理）
- [ ] `ApprovalStore.ts` → `acp/approval-store.ts`（权限缓存）
- [ ] `IpcAgentEventEmitter.ts` → `routes/websocket.ts`（流式事件）

#### 待完成 - 中优先级

- [ ] `modelInfo.ts` → `acp/model-info.ts`（模型管理）
- [ ] `acpTypes.ts` ACP_BACKENDS_ALL → `acp/types.ts`（后端配置）

#### 待完成 - 低优先级

- [ ] `AcpAdapter.ts` → `acp/adapter.ts`（消息转换）
- [ ] MCP 支持 → `acp/mcp.ts`（MCP 服务器配置）
