# CLI 测试工具 - 快速开始

## 问题诊断

你遇到的 "Internal error" 错误可以通过以下步骤诊断和测试。

## 使用步骤

### 步骤 1: 启动 Agent Service

在项目根目录运行:
```bash
pnpm dev:agent
```

等待服务启动,应该看到类似输出:
```
Agent Service running on http://localhost:3101
```

### 步骤 2: 检查服务状态

打开**新的终端**,进入 CLI 工具目录:
```bash
cd OPS\CLI
```

运行健康检查:
```bash
npx tsx src/index.ts health
```

**成功输出示例:**
```
✓ Agent Service 运行正常

详细信息:
  状态: ok
  运行时间: 2m 15s
  活跃 Agent 数量: 0

服务地址: http://localhost:3101
```

### 步骤 3: 发送测试消息

#### 方式 1: HTTP 模式(简单测试)

```bash
npx tsx src/index.ts send "test-1" "你好,请介绍一下自己"
```

#### 方式 2: WebSocket 流式模式(推荐,实时显示)

```bash
npx tsx src/index.ts stream "test-1" "你好,请介绍一下自己"
```

**成功输出示例:**
```
=== WebSocket 流式测试 ===

会话 ID: test-1
消息内容: 你好,请介绍一下自己

✓ WebSocket 连接成功

>>> 发送消息:
你好,请介绍一下自己

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

### 步骤 4: 交互式测试模式(连续对话)

```bash
npx tsx src/index.ts interactive "test-1"
```

进入后可以连续发送消息:
```
=== 交互式测试模式 ===

会话 ID: test-1
模式: HTTP

输入消息后按 Enter 发送,输入 quit 或 exit 退出

你: 你好

AI:
你好!有什么我可以帮助你的吗?

你: 请帮我写一个简单的 React 组件

AI:
[AI 的完整回复...]

你: quit

退出交互式测试模式
```

### 步骤 5: 诊断错误

如果仍然出现错误,运行诊断:

```bash
npx tsx src/index.ts diagnose "test-1" -m "测试消息"
```

**诊断输出示例:**
```
=== 错误诊断 ===

目标会话: test-1
测试消息: 测试消息

步骤 1/4: 检查服务健康状态
✓ Agent Service 运行正常
  状态: ok
  活跃 Agent: 1

步骤 2/4: 检查会话状态
✓ 会话存在
  状态: ready
  后端: opencode
  消息数: 2

步骤 3/4: 发送测试消息
✓ 测试消息成功
  耗时: 2345ms
  回复长度: 120 字符

步骤 4/4: 无错误
✓ 诊断完成 - 服务运行正常
```

## 常用命令速查

```bash
# 健康检查
npx tsx src/index.ts health

# 发送消息(HTTP)
npx tsx src/index.ts send "session-id" "消息内容"

# 发送消息(WebSocket 流式)
npx tsx src/index.ts stream "session-id" "消息内容"

# 查看会话信息
npx tsx src/index.ts session "session-id"

# 列出所有会话
npx tsx src/index.ts sessions

# 销毁会话
npx tsx src/index.ts destroy "session-id"

# 错误诊断
npx tsx src/index.ts diagnose "session-id" -m "测试"

# 交互式测试
npx tsx src/index.ts interactive "session-id"

# 使用自定义服务地址
npx tsx src/index.ts -u http://localhost:3000 health

# 指定工作目录
npx tsx src/index.ts send "session-id" "修改代码" -w "E:\projects\my-project"
```

## 排查 "Internal error"

### 可能原因 1: Session 未正确初始化

**诊断:**
```bash
npx tsx src/index.ts diagnose "your-session-id" -m "测试"
```

**解决:**
```bash
# 使用新的 sessionId
npx tsx src/index.ts stream "new-session-$(date +%s)" "测试消息"
```

### 可能原因 2: Agent 后端不可用

**检查 opencode CLI 是否可用:**
```bash
# 在终端运行
opencode --help
```

**如果不可用:**
- 安装 opencode CLI
- 或在 agent-service 配置中使用其他后端(claude, codex 等)

### 可能原因 3: 工作目录问题

**使用 CLI 测试带工作目录的消息:**
```bash
npx tsx src/index.ts send "session-id" "修改代码" -w "E:\projects\my-project"
```

### 可能原因 4: 资源不足

**检查会话列表:**
```bash
npx tsx src/index.ts sessions
```

**清理旧会话:**
```bash
npx tsx src/index.ts destroy "old-session-id"
```

## 查看日志

在运行 agent-service 的终端查看日志,获取详细错误信息。

## 获取帮助

查看完整文档:
```bash
cd OPS\CLI
npx tsx src/index.ts --help
npx tsx src/index.ts send --help
npx tsx src/index.ts stream --help
```

## 便捷脚本

使用提供的启动脚本:
```bash
# Windows
OPS\CLI\ops-cli.cmd health
OPS\CLI\ops-cli.cmd stream "test-1" "你好"
OPS\CLI\ops-cli.cmd interactive
```
