# AI 对话功能测试指南

## 快速测试步骤

### 1. 启动服务

```bash
# 终端 1: 启动 Opencode Server
opencode serve
# 应该看到：Server running on http://localhost:4096

# 终端 2: 启动 Next.js 开发服务器
cd packages/web
pnpm dev
# 应该看到：Ready on http://localhost:3000
```

### 2. 验证 Opencode Server 连接

访问：http://localhost:4096/global/health

预期响应：
```json
{
  "status": "ok",
  "version": "x.x.x"
}
```

如果无法访问，请检查：
- Opencode server 是否正在运行
- 端口 4096 是否被其他程序占用
- 防火墙设置

### 3. 验证 Next.js API

在浏览器访问：http://localhost:3000/api/ai/chat

预期响应：
```json
{
  "status": "healthy",
  "version": "x.x.x",
  "serverUrl": "http://localhost:4096",
  "timestamp": "2026-03-30T..."
}
```

如果显示 `unavailable`：
1. 检查 `.env.local` 文件是否存在
2. 确认 `OPENCODE_SERVER_URL` 配置正确
3. 重启 Next.js 开发服务器

### 4. 测试 AI 对话

#### 方法 A: 使用编辑页面

1. 访问首页：http://localhost:3000
2. 创建一个新 Demo 或选择现有 Demo
3. 点击"编辑"进入编辑页面
4. 切换到"AI 对话" Tab
5. 输入测试消息："你好，请介绍一下自己"
6. 点击发送
7. 观察：
   - 控制台日志（F12 → Console）
   - Network 面板中的 SSE 请求
   - AI 回复是否正常显示

#### 方法 B: 使用浏览器开发者工具

打开浏览器 Console（F12），执行以下代码：

```javascript
// 测试 AI 对话 API
const testChat = async () => {
  try {
    console.log('开始测试 AI 对话...');
    
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: '你好' }],
        demoId: 'test-demo'
      })
    });
    
    console.log('Response status:', response.status);
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            console.log('收到数据:', data);
            
            if (data.error) {
              console.error('错误:', data.error);
            }
            if (data.delta) {
              console.log('内容片段:', data.delta);
            }
            if (data.done) {
              console.log('完成！Session ID:', data.sessionId);
            }
          } catch (e) {
            console.log('原始数据:', line);
          }
        }
      }
    }
    
    console.log('测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
};

// 执行测试
testChat();
```

### 5. 查看控制台日志

正常的日志流程应该是：

```
[AI Chat] Received request
[AI Chat] Request body: { messages: 1, sessionId: undefined, demoId: 'xxx' }
[AI Chat] OpenCode Server health: { healthy: true, version: 'x.x.x' }
[AI Chat] Creating new session...
[AI Chat] Session created: abc-123-def
[AI Chat] Message sent, status: 200
```

### 6. 检查 Network 面板

1. 打开 Network 面板（F12 → Network）
2. 发送 AI 消息
3. 找到 `/api/ai/chat` 请求
4. 检查：
   - **Status**: 应该是 200
   - **Type**: 应该是 `eventsource` 或 `sse`
   - **Response Headers**: 应该包含 `Content-Type: text/event-stream`
   - **Preview**: 应该看到流式数据

## 常见问题排查

### 问题 1: 一直显示"加载中..."

**症状：** 发送消息后，AI 回复区域一直显示加载动画

**排查步骤：**
1. 查看 Console 是否有错误日志
2. 检查 Network 中 `/api/ai/chat` 请求状态
3. 确认请求是否是 SSE 类型
4. 检查 Opencode server 日志

**可能原因：**
- SSE 流连接失败
- Opencode server 未返回数据
- 网络超时

### 问题 2: 显示"OpenCode Server 未运行"

**症状：** 立即收到错误提示

**解决方案：**
1. 确认 `opencode serve` 正在运行
2. 检查 `.env.local` 配置：
   ```bash
   OPENCODE_SERVER_URL=http://localhost:4096
   ```
3. 访问 http://localhost:4096/global/health 验证
4. 如有必要，重启 opencode server

### 问题 3: "创建 Session 失败"

**症状：** 显示"创建 Session 失败：[错误信息]"

**排查步骤：**
1. 查看完整的错误信息
2. 检查 opencode server 日志
3. 确认工作目录权限
4. 检查 opencode server 配置

**常见原因：**
- Opencode server 配置错误
- 目录权限问题
- 版本不兼容

### 问题 4: 收到空回复

**症状：** AI 回复内容为空或只有"抱歉，我没有收到有效的回复。"

**排查步骤：**
1. 检查 Opencode server 是否正常响应
2. 查看 Network 面板中的完整响应数据
3. 检查 SSE 事件格式是否正确
4. 确认消息模板是否支持

## 调试工具

### Opencode Server 日志

查看 opencode server 的运行日志，应该能看到：

```
POST /session - 201 Created
POST /session/:id/message - 200 OK
GET /session/:id/event - 200 (SSE Stream)
```

### Next.js 日志

开发服务器控制台应该显示：

```
[AI Chat] Received request
[AI Chat] OpenCode Server health: ...
[AI Chat] Session created: ...
```

### 浏览器 Network 详情

在 Network 面板中右键 `/api/ai/chat` 请求：
- **Copy → Copy as cURL**: 可以复制到 curl 命令用于单独测试
- **Open in new tab**: 在新标签页打开查看完整响应

## 性能优化建议

如果测试通过，但感觉响应慢：

1. **检查网络延迟**
   - 本地开发应该在 1-2 秒内收到回复
   - 如果超过 5 秒，检查网络配置

2. **优化 Opencode Server 配置**
   - 调整模型参数
   - 使用更快的 AI 模型
   - 增加缓存

3. **前端优化**
   - 启用响应压缩
   - 优化 SSE 重连策略
   - 添加加载进度提示

## 成功标准

✅ 测试通过的标志：

1. [ ] 能正常访问 Opencode server 健康检查端点
2. [ ] Next.js API 返回 healthy 状态
3. [ ] 发送消息后 3 秒内收到 AI 回复
4. [ ] 回复内容完整显示在对话区
5. [ ] Console 无错误日志
6. [ ] Network 面板显示正常的 SSE 流

全部满足后，AI 对话功能即可正常使用！
