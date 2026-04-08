# CLI 测试工具

用于脱离 Web 端独立测试 AI Agent 服务功能的命令行工具。

## 安装

```bash
cd OPS/CLI
pnpm install
```

## 快速开始

### 1. 确保 Agent Service 已启动

```bash
# 在项目根目录
pnpm dev:agent
```

服务默认运行在 `http://localhost:3101`

### 2. 检查服务状态

```bash
pnpm dev health
```

### 3. 发送测试消息

```bash
# HTTP 模式(简单,非流式)
pnpm dev send "test-session-1" "你好,请介绍一下自己"

# WebSocket 流式模式(推荐,实时显示)
pnpm dev stream "test-session-1" "你好,请介绍一下自己"
```

## 命令参考

### `health` - 健康检查

检查 Agent Service 是否运行正常。

```bash
pnpm dev health
```

**输出示例:**
```
✓ Agent Service 运行正常

详细信息:
  状态: ok
  运行时间: 5m 23s
  活跃 Agent 数量: 0

服务地址: http://localhost:3101
```

---

### `send <sessionId> <message>` - HTTP 消息测试

通过 HTTP API 发送消息,等待完整响应后返回。

```bash
pnpm dev send "session-1" "你好"

# 指定工作目录
pnpm dev send "session-1" "修改代码" -w "E:\projects\my-project"

# 指定 Demo ID
pnpm dev send "session-1" "生成配置" -d "demo-123"

# 自定义超时时间(毫秒)
pnpm dev send "session-1" "长时间任务" -t 300000
```

**参数:**
- `sessionId` - 会话 ID(必填)
- `message` - 消息内容(必填)
- `-d, --demo-id <demoId>` - Demo ID
- `-w, --working-dir <dir>` - 工作目录路径
- `-b, --backend <backend>` - Agent 后端类型(默认: opencode)
- `-t, --timeout <ms>` - 超时时间,毫秒(默认: 120000)

---

### `stream <sessionId> [message]` - WebSocket 流式测试

通过 WebSocket 测试流式响应,实时显示 AI 回复。

```bash
pnpm dev stream "session-1" "你好"

# 指定工作目录
pnpm dev stream "session-1" "修改代码" -w "E:\projects\my-project"

# 不等待完成,立即返回
pnpm dev stream "session-1" "你好" --no-wait
```

**参数:**
- `sessionId` - 会话 ID(必填)
- `message` - 消息内容(默认: "你好")
- `-w, --working-dir <dir>` - 工作目录路径
- `-t, --timeout <ms>` - 超时时间,毫秒(默认: 120000)
- `--no-wait` - 发送消息后立即退出,不等待响应完成

**输出示例:**
```
=== WebSocket 流式测试 ===

会话 ID: session-1
消息内容: 你好

✓ WebSocket 连接成功

>>> 发送消息:
你好

=== AI 回复 (流式) ===

你好!我是 AI 助手,很高兴为你服务。我可以帮助你:
- 修改和生成代码
- 分析项目结构
- 解答技术问题
- 提供建议和最佳实践

有什么我可以帮助你的吗?

✓ 流式响应完成
耗时: 3s 456ms
内容长度: 156 字符
```

---

### `session <sessionId>` - 查看会话信息

获取指定会话的详细信息。

```bash
pnpm dev session "session-1"
```

**输出示例:**
```
=== 会话信息 ===

✓ 会话信息

详细信息:
  会话 ID: session-1
  状态: ready
  后端: opencode
  消息数量: 3
  创建时间: 2026/4/8 14:30:25
  最后活动: 2026/4/8 14:32:10
  工作目录: E:\projects\my-project
  会话存活时间: 1m 45s
```

---

### `sessions` - 列出所有会话

显示所有活跃的会话列表。

```bash
# 列出所有会话
pnpm dev sessions

# 限制数量
pnpm dev sessions -l 10

# 按状态过滤
pnpm dev sessions -s "ready"
pnpm dev sessions -s "error"
```

**参数:**
- `-l, --limit <n>` - 限制返回数量(默认: 50)
- `-o, --offset <n>` - 偏移量(默认: 0)
- `-s, --status <status>` - 按状态过滤(ready, error, processing, initializing)

---

### `destroy <sessionId>` - 销毁会话

删除指定会话,释放资源。

```bash
pnpm dev destroy "session-1"
```

**输出示例:**
```
=== 销毁会话 ===

✓ 会话 session-1 已销毁

销毁结果: 成功
```

---

### `diagnose [sessionId]` - 错误诊断

诊断会话错误,分析可能的失败原因并提供解决方案。

```bash
# 基本诊断
pnpm dev diagnose

# 诊断指定会话
pnpm dev diagnose "session-1"

# 发送测试消息进行深度诊断
pnpm dev diagnose "session-1" -m "你好"
```

**参数:**
- `sessionId` - 会话 ID(可选)
- `-m, --message <message>` - 发送测试消息进行诊断

**输出示例:**
```
=== 错误诊断 ===

目标会话: session-1

步骤 1/4: 检查服务健康状态
✓ Agent Service 运行正常
  状态: ok
  活跃 Agent: 2

步骤 2/4: 检查会话状态
✓ 会话存在
  状态: error
  后端: opencode
  消息数: 5

步骤 3/4: 发送测试消息
✗ 测试消息失败
  错误代码: MESSAGE_SEND_ERROR
  错误信息: No active session

步骤 4/4: 错误分析

错误分析:

  [问题] Session 未正确初始化
  [可能原因]
    - ACP 连接建立但 createSession 失败
    - Session 超时或失效
    - opencode CLI 未正确响应
  [解决方案]
    1. 使用新的 sessionId 重试
    2. 检查 opencode CLI 是否可用
    3. 查看 agent-service 日志
    4. 运行: ops-cli stream "new-session" "测试"
```

---

### `interactive [sessionId]` - 交互式测试模式

进入交互式模式,可以连续发送消息与 AI 对话。

```bash
# 使用新会话
pnpm dev interactive

# 使用指定会话
pnpm dev interactive "session-1"

# 使用 WebSocket 模式
pnpm dev interactive "session-1" --ws

# 指定工作目录
pnpm dev interactive -w "E:\projects\my-project"
```

**交互式命令:**
- 输入任意文本 - 发送消息
- `quit` 或 `exit` - 退出
- `clear` - 清屏
- `status` - 查看会话状态

**使用示例:**
```
=== 交互式测试模式 ===

会话 ID: session-1
模式: HTTP

输入消息后按 Enter 发送,输入 quit 或 exit 退出
输入 clear 清屏,输入 status 查看会话状态

你: 你好

AI:
你好!我是 AI 助手,很高兴为你服务。有什么我可以帮助你的吗?

耗时: 1234ms

你: 请帮我写一个 React 组件

AI:
[AI 的完整回复...]

你: status

会话状态:
  状态: ready
  后端: opencode
  消息数: 2
  工作目录: 未设置

你: quit

退出交互式测试模式
```

---

## 使用场景

### 场景 1: 调试 "No active session" 错误

```bash
# 1. 检查服务状态
pnpm dev health

# 2. 运行诊断
pnpm dev diagnose "your-session-id" -m "测试"

# 3. 使用新 sessionId 重试
pnpm dev stream "new-session-$(date +%s)" "测试消息"
```

### 场景 2: 测试 AI 响应

```bash
# 快速测试
pnpm dev stream "test-1" "你好"

# 进入交互式模式,连续对话
pnpm dev interactive "test-1" --ws
```

### 场景 3: 检查工作目录

```bash
# 发送带工作目录的消息
pnpm dev send "session-1" "修改代码" -w "E:\projects\my-project"

# 查看会话信息,确认工作目录
pnpm dev session "session-1"
```

### 场景 4: 清理资源

```bash
# 列出所有会话
pnpm dev sessions

# 销毁错误状态的会话
pnpm dev sessions -s "error"

# 销毁指定会话
pnpm dev destroy "session-1"
```

---

## 故障排查

### 问题 1: "Agent Service 不可用"

**原因:** Agent Service 未启动或地址错误

**解决:**
```bash
# 启动服务
cd E:\重要文件\Programming\1_Work\opencode工作台
pnpm dev:agent

# 检查服务地址
pnpm dev health -u http://localhost:3101
```

### 问题 2: "No active session"

**原因:** Session 未正确初始化

**解决:**
```bash
# 运行诊断
pnpm dev diagnose "session-id" -m "测试"

# 使用新 sessionId
pnpm dev stream "new-$(date +%s)" "测试消息"

# 查看 agent-service 日志
# 在 agent-service 终端查看
```

### 问题 3: "INTERNAL_ERROR"

**原因:** 服务器内部错误

**解决:**
```bash
# 查看详细错误
pnpm dev diagnose "session-id"

# 重启服务
# Ctrl+C 停止,然后重新运行
pnpm dev:agent

# 检查系统资源
# 查看内存、磁盘空间使用情况
```

### 问题 4: WebSocket 连接失败

**原因:** WebSocket 路由问题或会话无效

**解决:**
```bash
# 使用 HTTP 模式代替
pnpm dev send "session-id" "测试消息"

# 创建新会话
pnpm dev stream "new-session" "测试消息"
```

---

## 技术架构

```
OPS/CLI/
├── src/
│   ├── index.ts              # 主入口,定义所有命令
│   ├── types.ts              # TypeScript 类型定义
│   ├── utils.ts              # 辅助函数(请求、格式化等)
│   └── commands/
│       ├── health.ts         # 健康检查
│       ├── http-message.ts   # HTTP 消息测试
│       ├── websocket-stream.ts # WebSocket 流式测试
│       ├── session-info.ts   # 会话信息查询
│       ├── list-sessions.ts  # 会话列表
│       ├── destroy-session.ts # 销毁会话
│       ├── diagnose.ts       # 错误诊断
│       └── interactive.ts    # 交互式测试模式
├── package.json
└── tsconfig.json
```

**依赖:**
- `commander` - 命令行框架
- `chalk` - 终端彩色输出
- `ws` - WebSocket 客户端
- `ora` - 加载动画
- `tsx` - TypeScript 执行器

---

## 开发

### 添加新命令

1. 在 `src/commands/` 创建新文件
2. 实现命令逻辑
3. 在 `src/index.ts` 注册命令

**示例:**
```typescript
// src/commands/my-command.ts
export async function myCommand(baseUrl: string, options: MyOptions): Promise<void> {
  console.log('Hello from my command!');
}

// src/index.ts
import { myCommand } from './commands/my-command.js';

program
  .command('my-command')
  .description('My new command')
  .action(async (options) => {
    await myCommand(program.opts().url, options);
  });
```

### 构建

```bash
pnpm build
```

---

## 许可证

MIT
