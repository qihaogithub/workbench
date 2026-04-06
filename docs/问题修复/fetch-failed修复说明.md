# fetch failed 问题修复说明

## 问题原因

前端 AI 对话发送消息后收到 `fetch failed` 错误，是因为：

1. **Agent 服务未启动** - `packages/agent-service` 需要独立启动
2. **缺少降级机制** - 之前代码强依赖 Agent 服务，服务不可用时没有备选方案

---

## 解决方案

### ✅ 已实现：自动降级机制

修改了 `/api/ai/chat/route.ts`，添加了智能降级逻辑：

```
请求 AI 消息
   ↓
检查 Agent 服务是否可用 (http://localhost:3001/health)
   ↓
├─ 可用 → 调用 Agent 服务 (/api/agent/:sessionId/message)
│          ↓
│       返回 AI 回复
│
└─ 不可用 → 降级到直接调用 OpenCode Server
             ↓
          直接调用 OpenCode Server (/session/:sessionId/message)
             ↓
          返回 AI 回复
```

### 优势

- **无需启动 Agent 服务** - 可以直接使用，自动降级到 OpenCode Server
- **向后兼容** - Agent 服务启动后会自动使用，无需修改配置
- **容错性强** - 即使某个服务异常，AI 对话仍可正常工作

---

## 使用方式

### 方式一：仅使用 OpenCode Server（推荐，最简单）

只需确保 OpenCode Server 运行在 `http://localhost:4096`：

```bash
# 启动 Web 前端
cd packages/web
pnpm dev
```

系统会自动检测到 Agent 服务不可用，降级到直接调用 OpenCode Server。

### 方式二：使用完整架构（Agent 服务 + Web 前端）

如果你需要使用 Agent 服务的完整功能：

#### 步骤 1: 启动 Agent 服务

```bash
cd packages/agent-service
pnpm dev
```

等待服务启动完成（看到类似 `Server listening at http://0.0.0.0:3001`）

#### 步骤 2: 启动 Web 前端

```bash
cd packages/web
pnpm dev
```

系统会自动检测到 Agent 服务可用，使用 Agent 服务进行 AI 对话。

#### 或使用一键启动脚本（Windows）

```powershell
.\start-dev.ps1
```

这会自动启动两个服务，并显示它们的地址。

---

## 环境变量配置

`.env.local` 文件中的配置：

```env
# Agent Service 地址
AGENT_SERVICE_URL=http://localhost:3001

# OpenCode Server 地址（降级时使用）
OPENCODE_SERVER_URL=http://localhost:4096
```

---

## 如何验证

### 检查 Agent 服务是否运行

访问：http://localhost:3001/health

- **返回 JSON** → Agent 服务运行中
- **连接失败** → Agent 服务未启动（不影响 AI 对话，会自动降级）

### 查看降级日志

在浏览器终端或 Node.js 控制台看到类似日志：

```
[AI Chat] Agent 服务不可用，降级到直接调用 OpenCode Server
```

这表示系统正在正常工作。

---

## 服务端口说明

| 服务 | 端口 | 说明 |
|:-----|:-----|:-----|
| Web 前端 | 3000 | Next.js 开发服务器 |
| Agent 服务 | 3001 | 独立 Agent 服务（可选） |
| OpenCode Server | 4096 | AI 后端（必需） |

**必需服务**：OpenCode Server (4096)
**可选服务**：Agent 服务 (3001) - 未启动时会自动降级

---

## 故障排查

### 问题 1: 仍然收到 fetch failed

**检查 OpenCode Server 是否运行**

```bash
# 访问 OpenCode Server 健康检查
curl http://localhost:4096/global/health
```

如果连接失败，需要先启动 OpenCode Server。

### 问题 2: Agent 服务启动失败

检查 Agent 服务依赖和端口占用：

```bash
cd packages/agent-service
pnpm install
pnpm dev
```

### 问题 3: 想强制使用 Agent 服务

修改 `/api/ai/chat/route.ts`，移除降级逻辑，直接返回错误。

---

## 架构对比

### 之前（有问题）

```
Web 前端 → Agent Client → Agent Service (必须运行)
                                  ↓
                            OpenCode Server
```

❌ Agent 服务未运行时，AI 对话完全不可用

### 现在（已修复）

```
Web 前端 → 检查 Agent Service
              ↓
         ┌────┴────┐
         ↓         ↓
    可用时     不可用时
         ↓         ↓
  Agent Service  OpenCode Server (降级)
         ↓         ↓
    OpenCode Server
```

✅ Agent 服务可选，AI 对话始终可用

---

## 后续优化建议

1. **前端显示服务状态** - 在 UI 上显示当前使用的服务模式
2. **WebSocket 流式响应** - 实现实时 AI 回复流
3. **错误提示优化** - 区分服务不可用和 AI 请求失败

---

更新日期：2026-04-06
