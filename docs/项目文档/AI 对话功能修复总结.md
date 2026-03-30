# AI 对话功能修复总结

## 问题描述

用户在启动前端和 opencode server 后，在 AI 对话区发送消息无法收到回复。

## 根本原因分析

经过代码审查，发现以下关键问题：

### 1. SSE 流监听 URL 错误 ⭐ 主要问题

**错误代码：**
```typescript
await readSSEStream(
  `${OPENCODE_SERVER_URL}/global/event`,  // ❌ 错误的端点
  sessionId!,
  (content) => { ... }
);
```

**问题分析：**
- Opencode server 的 SSE 事件流端点是 `/session/:id/event`，而不是 `/global/event`
- 使用错误的端点导致无法接收到 AI 回复的事件流

### 2. 缺少 Session ID 请求头

**原始代码：**
```typescript
const response = await fetch(url, {
  method: 'GET',
  signal: controller.signal,
  headers: { 'Accept': 'text/event-stream' },  // ❌ 缺少 session ID
});
```

**问题分析：**
- 服务器需要通过 `x-session-id` 请求头识别具体的会话
- 缺少此头部可能导致服务器返回错误或空响应

### 3. 消息解析逻辑不完善

**原始代码只支持：**
- `data.content` 或 `data.text`
- `data.parts[].text`

**缺失的格式：**
- `data.choices[].message.content`（OpenAI 兼容格式）
- `data.delta`（流式片段）

### 4. 错误处理和日志不足

**问题：**
- 缺少详细的控制台日志，难以定位问题
- 错误信息不够具体，用户无法理解问题原因

## 修复方案

### ✅ 修复 1: 更正 SSE 端点 URL

**修改位置：** `packages/web/src/app/api/ai/chat/route.ts#L220`

**修复前：**
```typescript
await readSSEStream(
  `${OPENCODE_SERVER_URL}/global/event`,
  sessionId!,
  (content) => { ... }
);
```

**修复后：**
```typescript
await readSSEStream(
  `${OPENCODE_SERVER_URL}/session/${sessionId!}/event`,  // ✅ 正确的端点
  sessionId!,
  (content) => { ... }
);
```

### ✅ 修复 2: 添加 Session ID 请求头

**修改位置：** `packages/web/src/app/api/ai/chat/route.ts#L61-65`

**修复前：**
```typescript
const response = await fetch(url, {
  method: 'GET',
  signal: controller.signal,
  headers: { 'Accept': 'text/event-stream' },
});
```

**修复后：**
```typescript
const response = await fetch(url, {
  method: 'GET',
  signal: controller.signal,
  headers: { 
    'Accept': 'text/event-stream',
    'x-session-id': sessionId  // ✅ 添加 session ID
  },
});
```

### ✅ 修复 3: 增强消息解析逻辑

**修改位置：** `packages/web/src/app/api/ai/chat/route.ts#L94-124`

**新增支持：**
```typescript
// 处理 assistant 直接返回的消息
if (data.choices && Array.isArray(data.choices)) {
  const choice = data.choices[0];
  if (choice?.message?.content) {
    onMessage(choice.message.content);
  }
}

// 处理流式片段
if (data.delta !== undefined && typeof data.delta === 'string') {
  onMessage(data.delta);
}
```

### ✅ 修复 4: 完善错误处理和日志

**新增日志：**
```typescript
console.log('[AI Chat] Received request');
console.log('[AI Chat] Request body:', { messages: messages.length, sessionId, demoId });
console.log('[AI Chat] OpenCode Server health:', health);
console.log('[AI Chat] Creating new session...');
console.log('[AI Chat] Session created:', sessionId);
console.log('[AI Chat] Message sent, status:', response.status);
console.log('[AI Chat] Error:', error);
```

**改进的错误处理：**
```typescript
if (!response.ok) {
  throw new Error(`SSE stream error: ${response.status} ${response.statusText}`);
}
```

### ✅ 修复 5: 配置文件

**创建文件：**
- `.env.example` - 环境变量示例
- `.env.local` - 本地开发配置

**内容：**
```bash
OPENCODE_SERVER_URL=http://localhost:4096
```

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `packages/web/src/app/api/ai/chat/route.ts` | 修改 | 核心修复逻辑 |
| `packages/web/.env.local` | 新建 | 本地环境配置 |
| `packages/web/.env.example` | 新建 | 环境变量模板 |
| `docs/项目文档/AI 对话功能修复说明.md` | 新建 | 详细修复说明 |
| `docs/项目文档/AI 对话功能测试指南.md` | 新建 | 测试步骤 |
| `docs/项目文档/AI 对话功能修复总结.md` | 新建 | 本文档 |

## 验证步骤

### 1. 启动服务

```bash
# 终端 1
opencode serve

# 终端 2
cd packages/web
pnpm dev
```

### 2. 验证连接

访问 http://localhost:3000/api/ai/chat

**预期响应：**
```json
{
  "status": "healthy",
  "version": "x.x.x",
  "serverUrl": "http://localhost:4096"
}
```

### 3. 测试对话

1. 访问 http://localhost:3000
2. 进入任意 Demo 的编辑页面
3. 切换到"AI 对话" Tab
4. 发送消息："你好"
5. **预期结果：** 3 秒内收到 AI 回复

### 4. 检查日志

**浏览器 Console 应该显示：**
```
[AI Chat] Received request
[AI Chat] OpenCode Server health: { healthy: true }
[AI Chat] Session created: xxx
[AI Chat] Message sent, status: 200
```

## 技术细节

### API 调用流程

```
用户发送消息
    ↓
POST /api/ai/chat
    ↓
检查 Opencode Server 健康状态
    ↓
创建 Session（如需要）
    ↓
POST /session/:id/message → Opencode Server
    ↓
GET /session/:id/event (SSE) ← Opencode Server
    ↓
实时接收 AI 回复片段
    ↓
通过 SSE 转发给前端
    ↓
实时更新 UI
```

### Opencode Server API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/global/health` | GET | 健康检查 |
| `/session` | POST | 创建会话 |
| `/session/:id/message` | POST | 发送消息 |
| `/session/:id/event` | GET | 事件流（SSE） |

### 数据格式

**请求体：**
```json
{
  "messages": [
    { "role": "user", "content": "你好" }
  ],
  "sessionId": "xxx",
  "demoId": "demo-1"
}
```

**SSE 响应流：**
```
data: {"sessionId": "abc-123"}
data: {"delta": "你"}
data: {"delta": "好"}
data: {"done": true, "sessionId": "abc-123"}
```

## 兼容性说明

### Opencode Server 版本要求

- ✅ 支持最新版本
- ✅ 支持 OpenAI 兼容格式的响应
- ⚠️ 如果使用其他 AI 后端，可能需要调整消息解析逻辑

### 浏览器兼容性

- ✅ Chrome/Edge (推荐)
- ✅ Firefox
- ✅ Safari
- ⚠️ IE 不支持（已放弃支持）

## 性能指标

### 响应时间（本地开发环境）

| 阶段 | 预期时间 |
|------|----------|
| 创建 Session | < 100ms |
| 发送到 Opencode | < 200ms |
| 收到首个回复 | 1-3s |
| 完整回复 | 3-10s（取决于内容长度） |

### 网络开销

- SSE 长连接：持续占用 1 个 TCP 连接
- 数据传输：约 1-5 KB/s（流式传输中）

## 后续优化建议

### 短期（可选）

1. **添加超时控制**
   - 当前超时：60 秒
   - 建议：根据实际使用情况调整

2. **重试机制**
   - 网络错误时自动重试 1-2 次
   - 指数退避策略

3. **取消功能**
   - 允许用户中断 AI 回复
   - 释放服务器资源

### 长期（可选）

1. **消息历史持久化**
   - 保存到 localStorage 或数据库
   - 支持历史记录查询

2. **并发会话管理**
   - 支持多个并发的 AI 会话
   - 会话优先级管理

3. **性能监控**
   - 收集响应时间指标
   - 错误率统计
   - 用户行为分析

## 故障排查清单

如果修复后仍有问题，请按以下顺序检查：

### ✅ 基础检查

- [ ] Opencode server 正在运行（端口 4096）
- [ ] `.env.local` 文件存在且配置正确
- [ ] Next.js 开发服务器正在运行
- [ ] 浏览器 Console 无 JavaScript 错误

### ✅ 网络检查

- [ ] 能访问 http://localhost:4096/global/health
- [ ] 能访问 http://localhost:3000/api/ai/chat
- [ ] Network 面板显示 SSE 请求正常
- [ ] 防火墙未拦截请求

### ✅ 代码检查

- [ ] 最新代码已提交并保存
- [ ] TypeScript 编译无错误
- [ ] 重启了 Next.js 开发服务器
- [ ] 清除了浏览器缓存

### ✅ Opencode 检查

- [ ] Opencode server 日志正常
- [ ] Session 创建成功
- [ ] 消息处理无错误
- [ ] SSE 事件流正常发送

## 常见问题 FAQ

### Q: 为什么选择 SSE 而不是 WebSocket？

**A:** Opencode server 原生支持 SSE，且对于单向实时推送场景，SSE 更简单高效：
- 基于 HTTP/1.1，无需升级协议
- 自动重连机制
- 更好的浏览器支持
- 更低的实现复杂度

### Q: 能否使用其他 AI 后端（如 OpenAI API）？

**A:** 可以，需要：
1. 修改 `/api/ai/chat/route.ts` 中的后端调用逻辑
2. 适配不同后端的数据格式
3. 保持 SSE 流式响应格式一致

### Q: 生产环境如何部署？

**A:** 
1. 设置环境变量 `OPENCODE_SERVER_URL` 为生产地址
2. 构建 Next.js 应用：`pnpm build`
3. 使用 Docker 容器化部署（参考需求文档）
4. 配置反向代理（Nginx/Traefik）

### Q: 如何处理大量并发对话？

**A:**
1. Opencode server 需要支持多 session 并发
2. Next.js API Route 需要增加限流
3. 考虑使用消息队列缓冲请求
4. 增加负载均衡

## 总结

本次修复主要解决了 AI 对话功能无法接收回复的核心问题，主要涉及：

1. **修复 SSE 端点 URL** - 从 `/global/event` 改为 `/session/:id/event`
2. **添加 Session ID 请求头** - 确保服务器能识别会话
3. **增强消息解析** - 支持多种响应格式
4. **完善错误处理** - 添加详细日志便于调试

修复后，AI 对话功能应该能够正常工作。如有任何问题，请参考测试指南和故障排查清单。

---

**修复日期：** 2026-03-30  
**修复人员：** AI Assistant  
**测试状态：** ✅ 待用户验证
