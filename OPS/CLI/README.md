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

服务默认运行在 `http://localhost:3201`

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

服务地址: http://localhost:3201
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
- `-m, --model <modelId>` - 模型 ID
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
  后端: workbench
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

---

### `diagnostics <kind>` - 创作端诊断事件查询

查询 `data/diagnostics/editor-events.db` 中的结构化创作端事件；当 SQLite 缺失、锁定或不可读时，会扫描 `data/editor-diagnostics/*.jsonl` 作为兜底，并在 JSON 输出的 `diagnostics` 字段标记数据来源和缺口。

```bash
# 最近 24 小时项目诊断时间线
corepack pnpm diagnostics:recent -- --project "project-1"

# 单个编辑页会话
corepack pnpm diagnostics:session -- --editor-session "editor-session-1"

# 单次 trace / operation
corepack pnpm diagnostics:trace -- --trace "trace-1"
corepack pnpm diagnostics:operation -- --operation "message-1"

# 专项排查
corepack pnpm diagnostics:autosave -- --project "project-1" --since 24h
corepack pnpm diagnostics:collab -- --workspace "workspace-1"
corepack pnpm diagnostics:preview -- --project "project-1"

# 导出 JSON 复现包
corepack pnpm diagnostics:export -- --project "project-1" --since 24h --output diagnostics-export.json

# 查询正式环境（密码只通过环境变量传入，不写入命令或仓库）
OPS_CLI_REMOTE_PASSWORD="***" corepack pnpm diagnostics:autosave -- \
  --remote-host 10.130.33.131 \
  --remote-user qihao \
  --project "project-1" \
  --since 24h
```

根目录提供稳定别名：

```bash
corepack pnpm diagnostics:recent -- --project "project-1"
corepack pnpm diagnostics:trace -- --trace "trace-1"
corepack pnpm diagnostics:export -- --project "project-1" --since 24h
```

远程查询参数：

- `--remote-host <host>`：通过 SSH 拉取远程诊断数据快照后在本地解析。
- `--remote-user <user>` / `--remote-port <port>`：SSH 用户和端口。
- `--remote-data-dir <dir>`：远程 `data` 目录；未指定时依次探测 `$DATA_DIR`、`/opt/opencode-workbench/data`、`/opt/workbench/data`、`/app/data` 和 `/data`。
- `--remote-password-env <name>`：读取 SSH 密码的环境变量名，默认 `OPS_CLI_REMOTE_PASSWORD`。如果没有密码环境变量，会尝试普通 SSH key 登录。

远程模式只读取 `diagnostics/editor-events.db*`、`editor-diagnostics/` 和 `agent-run-logs/`，不会修改生产数据。

默认输出 JSON；人工查看可加 `--format text` 输出简短时间线。失败事件会额外显示 `workspace`、`page`、`phase`、`code` 和 `status`，便于直接判断同步失败边界。

SQLite 是诊断主账本，agent-service JSONL 是 mutation/projection 等跨服务事件的 spool。`diagnostics:autosave`、`diagnostics:collab`、`diagnostics:preview`、`diagnostics:project` 和 `diagnostics:export` 会对 SQLite 与 JSONL 去重合并，避免 canonical 事件在主库、mutation/projection 事件在 spool 时被分成两条时间线。使用 JSONL 时 `jsonlFallbackUsed` 会明确标记。

autosave/collab/preview 三类专项查询均包含 `autosave`、`collab`、`preview`、`workspace` 四组事件。JSON 结果除 `events` 外还输出：

- `workspaceFlows`：按 Workspace + Authority revision 串联 mutation received/committed、projection applied/failed/gap 和 canonical materialization。
- `performance.metrics`：固定输出 autosave debounce wait、queue wait、commit latency、remote update latency、draft preview latency、projection latency、reconnect convergence 和 canonical lag 的 `count/min/p50/p95/p99/max/average`。无样本时 count 为 `0`，分位值为 `null`。

---

### `workspace-authority-status <projectId> <workspaceId>` - Workspace Authority 状态

只读查询某个 live Workspace 的 Authority 状态，用于发布、导出、模板、canonical 物化或部署前检查之前确认单写者状态。该命令需要有效编辑 Session 做访问校验，不会触发 bootstrap、不会获取写 lease，也不会修改业务文件。

```bash
corepack pnpm workspace-authority:status -- "project-1" "live-1" --session "session-1" --json

# 或直接调用 OPS CLI
corepack pnpm --filter @workbench/cli-tools exec tsx src/index.ts \
  workspace-authority-status "project-1" "live-1" \
  --session "session-1" \
  --json
```

JSON 输出包含：

| 字段 | 说明 |
|:-----|:-----|
| `status.ready` | 是否满足当前只读 preflight：存在 state、Workspace 可读、无 external drift、无 active lease、无 prepared 事务 |
| `status.revision` / `status.rootHash` | Authority 当前 committed revision 和根哈希 |
| `status.actualRootHash` | 当前磁盘受管资源重新计算出的根哈希 |
| `status.externalDrift` | 磁盘受管资源是否已偏离 Authority state |
| `status.queueDepth` | 当前进程内该 Workspace mutation 队列深度 |
| `status.activeLease` | 是否存在跨进程写 lease；遗留 lease 也会 fail-closed |
| `status.preparedCount` | 是否存在待恢复 prepared 事务 |
| `status.recoveryPendingCount` | 启动恢复尚未收敛的事务数 |
| `status.conflictCount` | 从 Authority journal 持久派生的 mutation 冲突数 |
| `status.eventSubscriberCount` | 当前进程同一 `DATA_DIR` 下的 committed-event 订阅者数 |
| `status.stagingCount` / `backupCount` / `receiptCount` / `journalEntries` / `projectionAckEntries` | staging、committed backup、receipt、journal 和 projection ack 的诊断计数 |
| `status.missingBackupCount` | 当前 committed state 引用但缺失或损坏的内容备份数；非零时 Authority 不 ready |
| `warnings` | 面向自动任务和开发者的可读风险摘要 |

### `workspace-authority-preflight <projectId> <workspaceId>` - Workspace Authority 自动化前置检查

只读执行关键动作前置检查，并把 health 状态转换成机器可消费的 `passed` / `issues`。默认把 Workspace 缺失、Authority state 缺失、external drift、active/stale write lease、prepared 事务和 committed backup 不完整判为失败；可用 `--fail-on-queue` 或 `--fail-on-staging` 把队列积压和 staging 文件残留也纳入阻断项。

```bash
corepack pnpm workspace-authority:preflight -- "project-1" "live-1" --session "session-1" --json

corepack pnpm workspace-authority:preflight -- "project-1" "live-1" \
  --session "session-1" \
  --fail-on-queue \
  --fail-on-staging \
  --json
```

JSON 输出包含：

| 字段 | 说明 |
|:-----|:-----|
| `passed` | 是否允许继续执行发布、导出、模板、canonical 物化或部署前检查 |
| `issues` | 机器可消费的阻断原因列表；为空表示通过 |
| `status` | 与 `workspace-authority-status` 相同的 health 明细 |
| `warnings` | 可读风险摘要；可能包含非阻断项 |

部署前需要一次检查全部 live Workspace 时，使用无服务依赖的离线扫描：

```bash
corepack pnpm check:workspace-deploy-preflight
```

该检查只读本地 `data/` 和 `docker-compose.yml`，阻断未注册 live Workspace、external drift、lease、prepared 事务、committed backup 缺口以及共享 `DATA_DIR` 不一致。正式部署脚本会在同步/构建前自动运行静态门禁，并在远端正式 `APP_DATA_DIR` 上执行同一扫描。

历史 live Workspace 的 Authority 注册使用幂等迁移命令，默认 dry-run：

```bash
# 单 Workspace / 单项目 / 全量，三者必须且只能选一个
corepack pnpm workspace-authority:migrate -- --workspace <workspaceId> --json
corepack pnpm workspace-authority:migrate -- --project <projectId> --json
corepack pnpm workspace-authority:migrate -- --all --json

# 显式写入 Authority state 与 committed backup，不修改 Workspace 业务内容
corepack pnpm workspace-authority:migrate -- --all --apply --json
```

已注册且完整的 Workspace 返回 `already_bootstrapped`；旧 state 缺少 committed backup 时返回 `would_repair_backups` / `backups_repaired`。若存在 external drift、lease 或 prepared 事务，迁移保持 `blocked`，不会静默 adopt。

### `workspace-authority-bootstrap` / `workspace-authority-reconcile-adopt` / `workspace-authority-reconcile-restore`

这两个命令用于受控修复 Authority 元数据，默认都是 dry-run：

```bash
# 只检查是否需要 bootstrap，不写入 state
corepack pnpm workspace-authority:bootstrap -- "project-1" "live-1" --session "session-1" --json

# 显式创建 Authority state。该操作只写 Authority 内部 state，不修改业务文件。
corepack pnpm workspace-authority:bootstrap -- "project-1" "live-1" --session "session-1" --apply --json

# 只检查 external drift，不接纳磁盘漂移
corepack pnpm workspace-authority:reconcile-adopt -- "project-1" "live-1" --session "session-1" --json

# 显式把当前磁盘受管内容 adopt 为新 revision
corepack pnpm workspace-authority:reconcile-adopt -- "project-1" "live-1" --session "session-1" --apply --json

# 只检查能否从 committed backup 恢复，不修改 Workspace
corepack pnpm workspace-authority:reconcile-restore -- "project-1" "live-1" --session "session-1" --json

# 丢弃外部漂移，恢复最后 committed 内容
corepack pnpm workspace-authority:reconcile-restore -- "project-1" "live-1" --session "session-1" --apply --json
```

`bootstrap` 默认返回 `would_bootstrap` 或 `already_bootstrapped`；`reconcile-adopt` 默认返回 `would_adopt` 或 `noop`；`reconcile-restore` 默认返回 `would_restore`、`restore_blocked` 或 `noop`。只有加 `--apply` 才会调用 agent-service 的修复入口。restore 依赖 Authority 内部按内容 hash 保存的 committed backup，备份缺失或损坏时返回阻断结果并保留当前外部内容，不会退化为静默 adopt。

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
  后端: workbench
  消息数: 5

步骤 3/4: 发送测试消息
✗ 测试消息失败
  错误代码: MESSAGE_SEND_ERROR
  错误信息: No active session

步骤 4/4: 错误分析

错误分析:

  [问题] Session 未正确初始化
  [可能原因]
    - Pi Agent 会话初始化失败
    - Session 超时或失效
    - Pi Agent 未正确响应
  [解决方案]
    1. 使用新的 sessionId 重试
    2. 检查 Pi Agent 模型供应商配置
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
  后端: workbench
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
cd E:\重要文件\Programming\1_Work\workbench工作台
pnpm dev:agent

# 检查服务地址
pnpm dev health -u http://localhost:3201
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
│       ├── diagnostics.ts    # 创作端诊断事件查询
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
- `better-sqlite3` - 只读查询本地诊断事件库

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
