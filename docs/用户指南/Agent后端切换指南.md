# Agent 后端切换指南

> 本文档面向非技术用户，指导你如何在 OpenCode 工作台中切换 Agent 后端。

---

## 目录

- [Agent 后端切换指南](#agent-后端切换指南)
  - [目录](#目录)
  - [一、这是什么？](#一这是什么)
  - [二、支持的 Agent 后端](#二支持的-agent-后端)
  - [三、切换 Agent 后端的步骤](#三切换-agent-后端的步骤)
  - [四、Pi Agent 后端配置](#四pi-agent-后端配置)
  - [五、常见问题](#五常见问题)
  - [附录：环境变量说明](#附录环境变量说明)

---

## 一、这是什么？

OpenCode 工作台支持多种 **Agent 后端**。Agent 后端是负责理解你的指令并生成代码的 AI 引擎。不同的后端可能有不同的特点和优势。

**默认情况下**，系统使用 `opencode-http` 后端。你可以根据需要切换到其他后端。

---

## 二、支持的 Agent 后端

| 后端名称 | 说明 | 适用场景 |
|---------|------|---------|
| `opencode-http` | 默认后端，通过 HTTP 调用 OpenCode 服务 | 通用场景（推荐） |
| `pi-agent` | 进程内运行的轻量级 Agent | 需要更透明的执行过程 |
| `claude` | Claude Code ACP 后端 | 使用 Claude 模型 |
| `codex` | Codex ACP 后端 | 使用 OpenAI Codex |
| `gemini` | Gemini ACP 后端 | 使用 Google Gemini |

---

## 三、切换 Agent 后端的步骤

### 前提条件

- 已经部署好了 OpenCode 工作台（Docker 方式或本地开发）

### 操作步骤

#### 第 1 步：找到配置文件

在项目根目录下，找到 `.env` 文件。

```
opencode-workbench/
├── .env                ← 在这里修改配置
├── docker-compose.yml
└── ...
```

#### 第 2 步：添加或修改 `DEFAULT_BACKEND` 变量

用文本编辑器打开 `.env` 文件，添加或修改以下行：

```env
# 切换 Agent 后端
DEFAULT_BACKEND=opencode-http
```

**切换到不同后端的示例：**

```env
# 使用 OpenCode HTTP 后端（默认）
DEFAULT_BACKEND=opencode-http

# 使用 Pi Agent 后端
DEFAULT_BACKEND=pi-agent

# 使用 Claude 后端
DEFAULT_BACKEND=claude
```

#### 第 3 步：重新启动服务

**Docker 部署方式：**

```bash
docker compose down && docker compose up -d
```

**本地开发方式：**

```bash
# 停止当前服务（如果正在运行）
# 然后重新启动
pnpm dev
```

等待服务启动完成后，新的 Agent 后端就生效了。

---

## 四、Pi Agent 后端配置

如果你选择使用 `pi-agent` 后端，还需要配置 API 信息。

### 4.1 配置 API Key

在 `.env` 文件中添加以下配置：

```env
# Pi Agent 后端配置
DEFAULT_BACKEND=pi-agent
PI_AGENT_PROVIDER=anthropic
PI_AGENT_API_KEY=sk-ant-你的Claude密钥
PI_AGENT_MODEL=claude-sonnet-4-20250514
```

### 4.2 支持的 Provider

| Provider | 说明 | API 地址 |
|---------|------|---------|
| `anthropic` | Anthropic Claude | `https://api.anthropic.com` |
| `openai` | OpenAI | `https://api.openai.com/v1` |
| `google` | Google Gemini | `https://generativelanguage.googleapis.com` |

### 4.3 自定义 API 地址（可选）

如果你使用代理或自建服务，可以指定自定义 API 地址：

```env
PI_AGENT_BASE_URL=https://your-proxy-server.com/v1
```

---

## 五、常见问题

### Q：切换后端后，之前的对话记录会丢失吗？

不会。对话记录存储在数据库中，与 Agent 后端无关。但新对话将使用新的后端。

### Q：切换后端后需要重启哪些服务？

需要重启 `agent-service`。Docker 方式运行 `docker compose down && docker compose up -d` 即可。

### Q：如何查看当前使用的 Agent 后端？

访问健康检查接口：

```
http://你的服务器IP:3201/health
```

返回的 `status` 字段显示服务状态，但当前后端信息需要查看日志。

### Q：切换后端失败怎么办？

如果切换后出错，将 `DEFAULT_BACKEND` 改回 `opencode-http` 并重启服务即可恢复：

```env
DEFAULT_BACKEND=opencode-http
```

### Q：`pi-agent` 和 `opencode-http` 有什么区别？

| 特性 | `opencode-http` | `pi-agent` |
|-----|----------------|-----------|
| 运行方式 | 调用外部 OpenCode 服务 | 进程内直接运行 |
| 透明度 | 黑盒，内部处理 | 代码透明，可调试 |
| 配置复杂度 | 简单 | 需要配置 API |
| 性能 | 依赖网络 | 进程内，无网络开销 |

---

## 附录：环境变量说明

| 变量名 | 必填 | 说明 | 默认值 |
|-------|------|------|--------|
| `DEFAULT_BACKEND` | 否 | 默认 Agent 后端 | `opencode`（本地）/ `opencode-http`（Docker） |
| `PI_AGENT_PROVIDER` | 使用 pi-agent 时 | API 提供商 | `anthropic` |
| `PI_AGENT_API_KEY` | 使用 pi-agent 时 | API 密钥 | （空） |
| `PI_AGENT_MODEL` | 否 | 模型名称 | `claude-sonnet-4-20250514` |
| `PI_AGENT_BASE_URL` | 否 | 自定义 API 地址 | （空，使用默认） |
| `PI_AGENT_TIMEOUT` | 否 | 超时时间（毫秒） | `120000` |
