# 独立 Agent 服务层 - 文档索引

> 版本：v2.2
> 创建日期：2026-04-05
> 更新日期：2026-06-06

---

## 文档概览

本系列文档用于指导独立 Agent 服务层的开发工作，将 Agent 相关逻辑从 Next.js 应用中剥离，创建可独立部署、可扩展的 Agent 服务。

---

## 文档列表

| 文档                                         | 说明                                               | 阅读顺序 | 状态   |
| :------------------------------------------- | :------------------------------------------------- | :------- | :----- |
| [01-架构设计.md](./01-架构设计.md)           | 整体架构设计、分层职责、设计原则                   | 1        | 已更新 |
| [02-接口规范.md](./02-接口规范.md)           | REST API、WebSocket 协议、类型定义                 | 2        | 已更新 |
| [03-核心模块设计.md](./03-核心模块设计.md)   | Agent、Factory、Manager、Backend 等核心模块        | 3        | 已更新 |
| [04_SSE_Drain机制.md](./04_SSE_Drain机制.md) | **SSE 时序竞争问题解决、drain 机制设计、测试覆盖** | 4        | 已完成 |
| [05-快照服务.md](./05-快照服务.md)           | 双模式架构、变更比较、丢弃回滚、Session 生命周期   | 5        | 已完成 |
| [06-Pi-Agent子Agent.md](./06-Pi-Agent子Agent.md) | Pi Agent 内部任务委派、子 Agent 生命周期与权限边界 | 6        | 已完成 |

---

## 快速导航

### 架构设计

- [整体架构图](./01-架构设计.md#二整体架构)
- [分层职责](./01-架构设计.md#22-分层职责)
- [设计原则](./01-架构设计.md#三核心设计原则)
- [目录结构](./01-架构设计.md#四目录结构)

### 接口规范

- [REST API](./02-接口规范.md#二rest-api)
- [WebSocket API](./02-接口规范.md#三websocket-api)
- [类型定义](./02-接口规范.md#四类型定义)
- [错误处理](./02-接口规范.md#五错误处理)

### 核心模块

- [类型定义](./03-核心模块设计.md#21-类型定义-typests)
- [Agent 基类](./03-核心模块设计.md#22-agent-基类-agentts)
- [Agent 工厂](./03-核心模块设计.md#23-agent-工厂-agent-factoryts)
- [Agent 管理器](./03-核心模块设计.md#24-agent-管理器-agent-managerts)
- [OpenCode 后端](./03-核心模块设计.md#32-opencode-后端-backendopencodets)

### SSE Drain 机制

- [SSE 时序竞争问题](./04_SSE_Drain机制.md#一问题背景)
- [Drain 机制设计](./04_SSE_Drain机制.md#二drain-机制设计)
- [测试覆盖](./04_SSE_Drain机制.md#三测试覆盖)

### 快照服务

- [双模式架构](./05-快照服务.md#二双模式架构)
- [初始化流程](./05-快照服务.md#三核心流程)
- [变更比较流程](./05-快照服务.md#32-变更比较流程)
- [丢弃变更与回滚](./05-快照服务.md#33-丢弃变更流程)
- [API 方法一览](./05-快照服务.md#五api-方法一览)
- [与 Session 生命周期关系](./05-快照服务.md#十与-session-生命周期的关系)

### Pi Agent 子 Agent

- [定位](./06-Pi-Agent子Agent.md#一定位)
- [协作关系](./06-Pi-Agent子Agent.md#二协作关系)
- [权限与变更边界](./06-Pi-Agent子Agent.md#三权限与变更边界)
- [生命周期](./06-Pi-Agent子Agent.md#四生命周期)

---

## 核心设计决策

### 1. 技术栈选型

| 组件        | 选型        | 理由                                 |
| :---------- | :---------- | :----------------------------------- |
| 运行时      | Node.js 18+ | Monorepo 要求，与 opencode 兼容      |
| 框架        | Fastify     | 高性能，原生支持 WebSocket           |
| HTTP 客户端 | undici      | 比 node-fetch 更快，原生支持流式响应 |
| 日志        | pino        | Fastify 默认日志库，高性能           |
| 测试        | vitest      | agent-service 专用测试框架           |

### 2. 架构模式

- **工厂模式**：支持多种 AI 后端（14+ 后端）
- **观察者模式**：事件驱动，解耦 Agent 和 UI
- **单例模式**：全局 AgentManager + AgentFactory
- **策略模式**：不同后端使用不同通信策略
- **适配器模式**：BackendAgent 统一封装后端接口

### 3. 核心原则

```
"Agent 服务层负责业务逻辑和 AI 交互，前端消费层只负责 UI 渲染和用户交互"
```

---

## 开发路线

```
Phase 1 (2天) ──► Phase 2 (3天) ──► Phase 3 (2天) ──► Phase 4 (2天) ──► Phase 5 (1天)
   │                  │                  │                  │                  │
   ▼                  ▼                  ▼                  ▼                  ▼
基础框架          核心功能          集成迁移          测试优化          部署文档
```

---

## 相关资源

### 参考文档

- [需求文档](../../项目文档/需求文档.md)
- AionUi 架构分析内容已整合到本文档系列中：
  - [架构设计 - AionUi 参考](./01-架构设计.md#十三aionui-架构参考)
  - [核心模块设计 - AionUi 代码参考](./03-核心模块设计.md#十aionui-代码参考指南)
  - [核心模块设计 - 具体实施代码示例](./03-核心模块设计.md#十一具体实施代码示例)

### 现有代码

- `packages/agent-service/src/server.ts` - 服务入口
- `packages/agent-service/src/core/` - 核心模块（Agent、Factory、Manager）
- `packages/agent-service/src/backends/` - 后端适配器（14+ 后端）
- `packages/agent-service/src/routes/` - API 路由
- `packages/agent-service/src/session/` - 会话管理（SessionStore、SessionGuard、SnapshotService）
- `packages/agent-client/src/` - 浏览器端 SDK，封装 HTTP + WebSocket 通信
- `packages/screenshot-service/src/` - 截图服务（Puppeteer + Fastify）
- `packages/shared/src/` - 共享类型

### 相关包说明

| 包 | 路径 | 说明 |
|:---|:-----|:-----|
| agent-client | `packages/agent-client/` | 浏览器端 SDK，提供 AgentClient（HTTP）和 AgentStream（WebSocket）类 |
| screenshot-service | `packages/screenshot-service/` | Puppeteer 截图服务，支持同步/异步截图模式 |

---

---

## AionUi 参考指南

本项目大量参考了 [AionUi](../../AionUi) 的 Agent 架构设计。以下是具体的参考对照表。

### 核心参考对照

| 本项目模块      | AionUi 参考文件                     | 参考程度 | 说明                       |
| :-------------- | :---------------------------------- | :------- | :------------------------- |
| `AgentFactory`  | `src/process/task/AgentFactory.ts`  | **95%**  | 工厂模式几乎完全一致       |
| `IAgentManager` | `src/process/task/IAgentManager.ts` | **90%**  | 接口定义参考               |
| `BaseAgent`     | `src/process/agent/acp/index.ts`    | **70%**  | 核心结构参考，通信层需重写 |
| 事件回调机制    | `AcpAgent.onStreamEvent`            | **85%**  | 回调解耦模式               |
| 会话恢复        | `createOrResumeSession()`           | **80%**  | 恢复策略参考               |
| 权限缓存        | `ApprovalStore.ts`                  | **60%**  | 可选功能，后期实现         |

### 需要适配的关键差异

```
AionUi (Electron 应用)              本项目 (独立服务)
─────────────────────────────────────────────────────────────
IPC 通信                    →      HTTP REST / WebSocket
spawn CLI 进程              →      undici 连接池调用 HTTP API
AcpConnection (ACP 协议)    →      OpenCodeBackend (HTTP API)
主进程内存存储              →      可选 Redis/数据库持久化
Electron 生命周期           →      Fastify 生命周期
```

### 推荐抄作业顺序

1. **直接抄**：`AgentFactory`、`IAgentManager` 接口定义
2. **参考改**：`BaseAgent` 类结构、事件回调机制
3. **理解后重写**：后端通信层（HTTP 替代 ACP 协议）
4. **后期借鉴**：会话恢复、权限缓存、模型切换

### AionUi 核心文件路径

| 文件       | 路径                                            | 核心内容            |
| :--------- | :---------------------------------------------- | :------------------ |
| Agent 工厂 | `AionUi/src/process/task/AgentFactory.ts`       | 极简工厂实现        |
| Agent 接口 | `AionUi/src/process/task/IAgentManager.ts`      | 生命周期接口        |
| ACP Agent  | `AionUi/src/process/agent/acp/index.ts`         | 完整 Agent 实现     |
| 连接管理   | `AionUi/src/process/agent/acp/AcpConnection.ts` | 连接生命周期        |
| 权限缓存   | `AionUi/src/process/agent/acp/ApprovalStore.ts` | "always allow" 缓存 |

---

## 更新日志

| 日期       | 版本 | 更新内容                           |
| :--------- | :--- | :--------------------------------- |
| 2026-04-05 | v1.0 | 初始版本，完成全部文档             |
| 2026-04-05 | v1.1 | 添加 AionUi 参考指南               |
| 2026-05-29 | v2.0 | 根据代码实现全面更新文档，对齐现状 |
| 2026-06-04 | v2.1 | 新增 05-快照服务文档 |
| 2026-06-21 | v2.2 | 新增 Pi Agent 子 Agent 实现文档 |
