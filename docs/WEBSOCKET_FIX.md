# WebSocket 连接问题修复说明

## 🔧 问题描述

用户报告错误：`错误: WebSocket is not connected`

## 📋 原因分析

1. **AgentStream 自动连接**：`AgentStream` 在构造函数中就尝试建立 WebSocket 连接
2. **Agent Service 未运行**：如果 Agent Service（localhost:3001）没有启动，WebSocket 连接会失败
3. **连接时机问题**：即使 Service 已启动，WebSocket 可能需要时间建立连接

## ✅ 修复方案

### 1. 智能降级机制

实现了**自动降级**策略：

```
尝试 WebSocket 流式连接
    ↓ (失败)
自动降级到 HTTP 非流式连接
    ↓ (失败)
显示友好错误提示
```

### 2. 连接等待和重试

- **等待连接建立**：发送消息前等待 WebSocket 连接完成（最多 3 秒）
- **主动检查**：定期检查 `readyState` 确认连接状态
- **超时处理**：超时后自动进入 catch 降级流程

### 3. 错误处理优化

```typescript
try {
  // 尝试 WebSocket 流式模式
  const stream = agentClient.stream(agentSessionId)
  // 等待连接建立...
  // 发送消息...
} catch (error) {
  // 降级到 HTTP 非流式模式
  const result = await agentClient.sendMessage(...)
}
```

## 🎯 行为说明

### WebSocket 可用时
- ✅ 实时流式响应
- ✅ 内容即时渲染
- ✅ 支持取消生成

### WebSocket 不可用时
- ⚠️ 自动降级到 HTTP 模式
- ⚠️ 非流式响应（等待完整回复）
- ⚠️ 功能完全正常，只是没有实时效果

## 🔍 如何判断当前模式

打开浏览器控制台（F12），查看日志：

```
WebSocket 失败，使用非流式模式: Error: ...
```

如果出现此日志，说明正在使用降级模式。

## 🚀 启动 Agent Service（推荐）

为了获得最佳体验，建议启动 Agent Service：

```bash
# 进入 agent-service 目录
cd packages/agent-service

# 启动服务
pnpm dev
```

服务启动后会在 `http://localhost:3001` 监听。

## 🧪 测试验证

### 测试场景 1: Agent Service 运行中

1. 启动 Agent Service: `cd packages/agent-service && pnpm dev`
2. 访问编辑页面
3. 发送消息
4. **预期**: 实时流式响应，内容逐字显示

### 测试场景 2: Agent Service 未运行

1. 确保 Agent Service 未启动
2. 访问编辑页面
3. 发送消息
4. **预期**: 
   - 短暂等待（~3秒）
   - 自动降级到 HTTP 模式
   - 正常收到 AI 回复（非流式）
   - 控制台显示降级警告

### 测试场景 3: 网络错误

1. 断开网络
2. 发送消息
3. **预期**: 显示友好错误提示

## 📊 对比

| 特性 | WebSocket 模式 | HTTP 降级模式 |
|------|---------------|--------------|
| 实时性 | ✅ 流式更新 | ❌ 等待完整回复 |
| 用户体验 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 可取消 | ✅ 支持 | ❌ 不支持 |
| 可靠性 | 需要 Service 运行 | ✅ 更稳定 |
| 代码更新 | ✅ 自动提取 | ✅ 自动提取 |

## 💡 建议

### 开发环境
- 建议启动 Agent Service 获得完整体验
- 查看 `packages/agent-service/AGENTS.md` 了解配置

### 生产环境
- 当前降级方案确保功能可用性
- 建议部署 Agent Service 提升体验

### 用户体验
- 添加连接状态指示器（可选）
- 提示用户当前模式（可选）
- 提供"重试"按钮（可选）

## 🐛 排查步骤

如果仍然遇到问题：

### 1. 检查 Agent Service 状态

```bash
# 检查端口是否监听
netstat -ano | findstr :3001

# 或直接访问
curl http://localhost:3001/health
```

### 2. 检查环境变量

确保 `.env.local` 配置正确：

```env
AGENT_SERVICE_URL=http://localhost:3001
```

### 3. 查看浏览器控制台

- **F12** 打开开发者工具
- 查看 **Console** 标签页
- 寻找错误或警告信息

### 4. 检查网络请求

- **F12** → **Network** 标签页
- 过滤 `ws` 查看 WebSocket 连接
- 过滤 `fetch` 查看 HTTP 请求

## 📝 代码变更

### 修改文件

`packages/web/src/components/ai-elements/ai-chat.tsx`

### 关键变更

1. **添加连接等待逻辑**
```typescript
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(...), 3000)
  stream.on('status', (e) => {
    if (e.status === 'connected') resolve()
  })
  // 主动检查连接状态
  const checkConnection = () => { ... }
})
```

2. **实现降级逻辑**
```typescript
catch (error) {
  // WebSocket 失败，降级到 HTTP
  const result = await agentClient.sendMessage(...)
}
```

3. **改进错误提示**
```typescript
content: `错误: ${message}。请确保 Agent Service 已启动（http://localhost:3001）`
```

## ✅ 验证清单

- [x] TypeScript 编译通过
- [x] ESLint 检查通过
- [x] 生产构建成功
- [x] WebSocket 模式正常工作
- [x] HTTP 降级模式正常
- [x] 错误提示友好清晰
- [x] 代码提取功能正常
- [x] 文件变更追踪正常

---

**修复日期**: 2026年4月6日  
**状态**: ✅ 已完成并验证
