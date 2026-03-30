# AI 对话功能修复说明

## 问题诊断与修复

### 原问题
在 AI 对话区发送消息后无法收到回复。

### 已修复的问题

1. **SSE 流监听 URL 错误**
   - ❌ 原代码：`/global/event`
   - ✅ 修复后：`/session/{sessionId}/event`
   - 说明：Opencode server 的 SSE 事件流需要绑定到具体的 session ID

2. **缺少 Session ID 请求头**
   - ❌ 原代码：未传递 session ID
   - ✅ 修复后：添加 `x-session-id: sessionId` 请求头
   - 说明：服务器需要通过请求头识别 session

3. **消息解析逻辑增强**
   - ✅ 新增：支持多种消息格式解析
     - `data.choices[].message.content`
     - `data.delta`
     - `data.content` / `data.text`
   - 说明：兼容 opencode server 不同的响应格式

4. **错误处理和日志**
   - ✅ 添加详细的控制台日志
   - ✅ 改进错误提示信息
   - 说明：便于调试和问题定位

## 配置步骤

### 1. 环境变量配置

在项目根目录创建 `.env.local` 文件：

```bash
# packages/web/.env.local
OPENCODE_SERVER_URL=http://localhost:4096
```

### 2. 启动服务

确保按以下顺序启动服务：

```bash
# 1. 启动 Opencode Server（端口 4096）
# 在你的终端中运行 opencode serve

# 2. 启动 Next.js 开发服务器
cd packages/web
pnpm dev
```

### 3. 验证连接

访问 `http://localhost:3000/api/ai/chat` (GET 请求) 检查连接状态：

```json
{
  "status": "healthy",
  "version": "x.x.x",
  "serverUrl": "http://localhost:4096",
  "timestamp": "..."
}
```

如果显示 `unavailable`，请检查：
- Opencode server 是否正在运行
- 端口 4096 是否被占用
- 防火墙设置

## 调试技巧

### 浏览器控制台

打开浏览器开发者工具 → Console，查看以下日志：

```
[AI Chat] Received request
[AI Chat] Request body: { messages: 1, sessionId: undefined, demoId: 'xxx' }
[AI Chat] OpenCode Server health: { healthy: true, version: 'x.x.x' }
[AI Chat] Creating new session...
[AI Chat] Session created: xxx-xxx-xxx
[AI Chat] Message sent, status: 200
```

### 常见错误及解决方案

#### 错误 1: "OpenCode Server 未运行"
```
原因：Opencode server 未启动或端口错误
解决：
1. 确认 opencode serve 正在运行
2. 检查 .env.local 中的 OPENCODE_SERVER_URL 是否正确
3. 访问 http://localhost:4096/global/health 验证
```

#### 错误 2: "创建 Session 失败"
```
原因：Opencode server 配置问题
解决：
1. 检查 opencode server 日志
2. 确认工作目录权限
3. 重启 opencode server
```

#### 错误 3: 一直显示"等待中..."
```
原因：SSE 流连接失败
解决：
1. 检查浏览器 Network 面板，查看 /api/ai/chat 请求
2. 确认响应是 text/event-stream 类型
3. 查看是否有 CORS 错误
```

## API 端点说明

### Opencode Server API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/global/health` | GET | 健康检查 |
| `/session` | POST | 创建新会话 |
| `/session/:id/message` | POST | 发送消息 |
| `/session/:id/event` | GET | 监听事件流 (SSE) |

### 本项目 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/ai/chat` | GET | 检查 opencode server 连接状态 |
| `/api/ai/chat` | POST | 发送 AI 对话请求 |

## 测试流程

1. **启动所有服务**
   ```bash
   # Terminal 1: Opencode Server
   opencode serve
   
   # Terminal 2: Next.js
   cd packages/web
   pnpm dev
   ```

2. **访问编辑页面**
   ```
   http://localhost:3000/demo/[demo-id]/edit
   ```

3. **发送测试消息**
   - 打开 AI 对话 Tab
   - 输入："你好"
   - 点击发送
   - 观察控制台日志和消息回复

4. **检查响应**
   - 浏览器 Console 应该有完整的日志链路
   - AI 回复应该显示在对话区
   - Network 面板应该看到 SSE 流式响应

## 技术细节

### SSE 流处理流程

```
用户发送消息
    ↓
Next.js API (/api/ai/chat)
    ↓
创建 Session (如果需要)
    ↓
发送消息到 Opencode Server
    ↓
监听 /session/:id/event (SSE)
    ↓
实时接收 AI 回复片段
    ↓
通过 SSE 转发给前端
    ↓
实时更新 UI
```

### 消息格式

**请求格式：**
```json
{
  "messages": [
    { "role": "user", "content": "你好" }
  ],
  "sessionId": "xxx",
  "demoId": "demo-1"
}
```

**响应格式 (SSE)：**
```
data: {"sessionId": "xxx"}
data: {"delta": "你"}
data: {"delta": "好"}
data: {"done": true, "sessionId": "xxx"}
```

## 下一步优化建议

1. **增加重试机制**：网络错误时自动重试
2. **添加超时控制**：避免长时间无响应
3. **支持取消请求**：用户可中断 AI 回复
4. **消息历史记录**：保存对话历史到本地存储
5. **错误边界处理**：更友好的错误提示 UI
