# Opencode Server API 调试指南

## 问题分析

根据错误日志，opencode server 报告 "Session not found"，说明：
1. 前端发送消息到一个 Session
2. 但监听的是另一个 Session 的事件流

## Opencode Server API 端点

### 1. 健康检查
```bash
GET http://localhost:4096/global/health
```

**响应示例：**
```json
{
  "status": "ok",
  "version": "x.x.x"
}
```

### 2. 创建 Session
```bash
POST http://localhost:4096/session
Content-Type: application/json

{
  "title": "Demo: test-123"
}
```

**响应示例：**
```json
{
  "id": "session-abc-123-def",
  "title": "Demo: test-123",
  "createdAt": "2026-03-30T..."
}
```

### 3. 发送消息
```bash
POST http://localhost:4096/session/{sessionId}/message
Content-Type: application/json

{
  "template": "build",
  "parts": [
    {
      "type": "text",
      "text": "你好，请帮我修改代码"
    }
  ]
}
```

**响应：** 200 OK（立即返回）

### 4. 监听事件流（SSE）⭐ 关键
```bash
GET http://localhost:4096/session/{sessionId}/event
Accept: text/event-stream
```

**重要：** 
- 必须使用**正确的 sessionId**
- sessionId 来自步骤 2 的响应
- 这个请求会建立 SSE 长连接

**SSE 事件格式：**
```
event: session.message
data: {"id":"xxx","parts":[{"type":"text","text":"..."}]}

event: done
data: {}
```

## 手动测试流程

### 步骤 1: 创建 Session

```bash
curl -X POST http://localhost:4096/session \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Test Demo\"}"
```

**记录返回的 sessionId**，例如：`session-abc-123-def`

### 步骤 2: 打开两个终端

**终端 A - 监听事件流：**
```bash
curl -N http://localhost:4096/session/session-abc-123-def/event
```

保持这个终端打开，等待接收事件。

**终端 B - 发送消息：**
```bash
curl -X POST http://localhost:4096/session/session-abc-123-def/message \
  -H "Content-Type: application/json" \
  -d "{\"template\":\"build\",\"parts\":[{\"type\":\"text\",\"text\":\"你好\"}]}"
```

**预期结果：** 终端 A 应该立即收到 SSE 事件。

### 步骤 3: 验证事件格式

如果终端 A 收到类似以下内容，说明正常：

```
event: session.message
data: {"id":"msg-123","parts":[{"type":"text","text":"你好"}]}

event: done
data: {}
```

## 常见问题

### 问题 1: Session not found

**错误信息：**
```
NotFoundError: NotFoundError
 data: {
  message: "Session not found: session-xyz",
}
```

**原因：**
- 使用了错误的 sessionId
- Session 已过期或被删除
- sessionId 拼写错误

**解决方案：**
1. 重新创建 Session，获取新的 sessionId
2. 确保所有请求使用同一个 sessionId
3. 检查 sessionId 是否完整复制

### 问题 2: 收不到事件流

**可能原因：**
1. **URL 路径错误**
   - ❌ `/global/event`
   - ✅ `/session/{sessionId}/event`

2. **缺少 sessionId**
   - 确保 URL 中包含正确的 sessionId

3. **网络问题**
   - 检查防火墙设置
   - 确认端口 4096 未被占用

### 问题 3: SSE 连接立即断开

**检查事项：**
1. Opencode server 日志是否有错误
2. Session 是否仍然有效
3. 是否有其他客户端关闭了 Session

## 调试脚本

### PowerShell 测试脚本

```powershell
# 1. 创建 Session
Write-Host "创建 Session..."
$sessionResponse = Invoke-RestMethod -Uri "http://localhost:4096/session" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"title":"Test"}'

$sessionId = $sessionResponse.id
Write-Host "Session ID: $sessionId"

# 2. 启动后台作业监听事件流
Write-Host "开始监听事件流..."
$listenerJob = Start-Job -ScriptBlock {
  param($sid)
  $response = Invoke-WebRequest -Uri "http://localhost:4096/session/$sid/event" `
    -TimeoutSec 30
  return $response.Content
} -ArgumentList $sessionId

# 等待 1 秒让监听就绪
Start-Sleep -Seconds 1

# 3. 发送消息
Write-Host "发送消息..."
Invoke-RestMethod -Uri "http://localhost:4096/session/$sessionId/message" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"template":"build","parts":[{"type":"text","text":"你好"}]}'

# 4. 等待并显示结果
Write-Host "等待响应..."
Start-Sleep -Seconds 5

# 获取监听结果
$events = Receive-Job -Job $listenerJob -Wait -Timeout 10
Write-Host "收到的事件:"
Write-Host $events

# 清理
Stop-Job -Job $listenerJob
Remove-Job -Job $listenerJob
```

保存为 `test-opencode.ps1` 并运行。

## 与本项目集成

### 当前架构

```
前端页面加载
    ↓
创建本地 Session (/api/sessions)
    ↓
存储 sessionId: session-local-123
    ↓
用户发送 AI 消息
    ↓
调用 /api/ai/chat (带上 sessionId)
    ↓
API Route 转发到 opencode server
    ↓
POST /session/{sessionId}/message
    ↓
GET /session/{sessionId}/event (SSE)
    ↓
实时接收事件流
    ↓
转发给前端
```

### 关键点

1. **sessionId 来源**
   - 前端页面加载时创建本地 Session
   - AI 对话时复用这个 sessionId
   - 传递给 opencode server 使用

2. **Session 生命周期**
   - 本地 Session：文件系统目录，手动管理
   - Opencode Session：内存中的会话，有超时机制

3. **可能的冲突**
   - 两种 Session 是完全独立的
   - 需要确保使用正确的 sessionId

## 建议方案

### 方案 A: 直接使用 Opencode Session（推荐）

**修改：**
1. 页面加载时直接调用 opencode server 的 `/session` 创建 Session
2. 存储返回的 sessionId
3. AI 对话时使用这个 sessionId

**优点：**
- 统一管理，不会混淆
- 减少 Session 数量
- 更容易调试

**缺点：**
- 需要修改现有 Session 管理逻辑

### 方案 B: 保持双 Session 系统

**修改：**
1. 本地 Session 用于文件编辑
2. AI 对话时创建新的 opencode Session
3. 两者独立管理

**优点：**
- 改动较小
- 职责分离清晰

**缺点：**
- 需要维护两套 Session
- 容易混淆

## 下一步

1. **运行手动测试**
   - 使用 curl 或 PowerShell 脚本测试 opencode server API
   - 确认 sessionId 和事件流正常工作

2. **查看详细日志**
   - Opencode server 日志
   - Next.js API Route 日志
   - 浏览器 Console 日志

3. **确定 Session 策略**
   - 选择方案 A 或方案 B
   - 统一 sessionId 管理

4. **修复代码**
   - 根据选择的方案修改代码
   - 添加充分的日志
   - 完善错误处理

## 联系支持

如果问题仍未解决，请提供：
1. Opencode server 完整日志
2. Next.js 开发服务器日志
3. 浏览器 Console 截图
4. Network 面板中 /api/ai/chat 请求详情
