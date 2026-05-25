# 会话状态分片问题：HTTP 与 WebSocket 路由的 Session Store 隔离

## 核心定位与设计哲学

**核心问题**：Agent 服务的会话元数据（工作空间路径、快照模式、文件变更状态等）仅存在于 HTTP 路由的局部变量中，WebSocket 路由完全无法访问，导致双通道会话状态割裂。

**铁律**：会话元数据是跨通信通道的共享状态，必须在服务层统一管理，禁止任何路由模块私有化持有。

## 架构机制与正确方向

### 当前数据流向

```
HTTP 路由 (agent.ts)
  └─ new MemorySessionStore()  ← 局部变量，仅 HTTP 路由可见
      ├─ create() → 记录 workspaceMeta
      ├─ update() → 更新 status/messageCount
      └─ get()    → 供 files/workspace/stage/discard 端点查询

WebSocket 路由 (websocket.ts)
  └─ 无 SessionStore ← 完全缺失
      └─ 仅依赖 AgentManager 管理 Agent 生命周期
```

### 状态割裂的后果

1. **WebSocket 创建的会话无元数据**：通过 WebSocket 首次创建的 Agent 会话，其 workingDir、workspaceType、snapshotMode 等关键信息未被任何 Store 记录
2. **HTTP 端点对 WebSocket 会话返回 404**：客户端通过 WebSocket 创建会话后，调用 `GET /api/agent/:sessionId/files` 或 `PUT /api/agent/:sessionId/workspace`，因 sessionStore 中无记录而直接返回 SESSION_NOT_FOUND
3. **SDK 功能断裂**：`AgentClient` 提供的 `getFiles()`、`stageFiles()`、`discardFiles()`、`updateWorkspace()` 全部走 HTTP，对 WebSocket 创建的会话不可用
4. **资源清理遗漏**：`DELETE /api/agent/:sessionId` 依赖 sessionStore 判断 workspaceType === 'temp' 来决定是否清理临时工作空间，WebSocket 会话的临时空间永远不会被清理

### 正确方向：会话元数据服务化

引入全局 `SessionStoreService` 单例，替代路由局部变量：

- **归属层级**：与 `AgentManager` 同级，由 `server.ts` 初始化并注入路由
- **双通道写入**：HTTP 和 WebSocket 路由均通过同一服务实例读写会话元数据
- **生命周期绑定**：会话创建时写入，Agent 销毁时清理，workspace 变更时同步更新
- **查询统一**：所有端点（files、workspace、stage、discard）均从同一数据源读取

## 反模式与历史避坑

### 反模式：路由模块私有化共享状态

`agent.ts` 第 61 行将 `MemorySessionStore` 声明为 `registerAgentRoutes()` 函数内的局部变量。这是典型的"谁创建谁持有"反模式——当多个消费者需要同一份数据时，数据持有权不应属于任何一个消费者。

### 反模式：隐式状态依赖

`websocket.ts` 中的 `case "message"` 分支（创建 Agent、发送消息）完全不记录会话元数据，但 HTTP 端点却假设元数据一定存在。这种隐式依赖导致跨通道操作必然失败，且无编译期或运行时警告。

### 废弃方案警示

- **方案 A：在 WebSocket 路由中再创建一个 MemorySessionStore** → 两个独立实例，数据仍然不互通，只是把问题复制了一遍
- **方案 B：让 WebSocket 路由 import agent.ts 的 sessionStore** → 模块间产生隐式耦合，且 sessionStore 是函数局部变量，根本无法导出
- **方案 C：去掉 HTTP 端点，全部走 WebSocket** → 破坏 REST API 兼容性，且非 REST 客户端（如 curl、Postman）无法使用

## 核心指标与安全边界

### 影响范围量化

| 维度 | 当前状态 | 重构后 |
|------|---------|--------|
| 会话元数据一致性 | HTTP/Ws 双通道割裂，跨通道操作必失败 | 单一数据源，跨通道操作零失败 |
| SDK 可用端点 | WebSocket 会话仅 3/8 端点可用 | 全部 8/8 端点可用 |
| 临时工作空间泄漏率 | WebSocket 创建的会话 100% 泄漏 | 0% 泄漏 |
| 代码重复 | 无（但功能缺失） | 无 |

### 安全边界

- **SessionStore 必须与 AgentManager 生命周期同步**：Agent 销毁时必须同步清理 SessionStore 记录，否则元数据成为孤儿数据
- **并发安全**：MemorySessionStore 的 `update()` 方法无锁保护，WebSocket 和 HTTP 并发更新同一会话时可能丢失更新。若未来引入持久化存储，需在存储层保证原子性
- **内存上限**：当前 MemorySessionStore 无容量限制，长时间运行的服务可能积累大量过期会话元数据。需引入与 SESSION_EXPIRY_MS（2 小时）一致的 TTL 清理机制
