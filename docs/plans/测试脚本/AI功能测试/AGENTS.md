# AGENTS.md — AI 功能测试脚本

> 本文件为 AI 编码代理提供 AI 聊天功能端到端测试脚本的使用指南。

## 脚本概述

本目录包含用于测试 **AI 聊天功能** 的端到端测试脚本，覆盖以下完整流程：

```
打开 Demo 编辑页 → 定位 AI 聊天框 → 输入消息 → 发送 → 等待 AI 回复 → 验证回复有效性
```

## 文件说明

| 文件                 | 用途                | 适用平台                     |
| ------------------ | ----------------- | ------------------------ |
| `ai-chat-test.sh`  | Bash 版本测试脚本       | Linux / macOS / Git Bash |
| `ai-chat-test.ps1` | PowerShell 版本测试脚本 | Windows                  |
| `AGENTS.md`        | 本文件，使用指南          | —                        |

## 前置依赖

1. **playwright-cli** (已安装)
2. **目标服务** 必须已启动：
   - Web 前端服务（默认 <http://localhost:3200）>
   - Agent Service（默认 <http://localhost:3201）>
   - ACP CLI（如 workbench）已正确配置

## 使用方式

### Bash 版本 (Linux / macOS)

```bash
# 使用默认参数运行
./ai-chat-test.sh

# 指定 Demo ID
./ai-chat-test.sh proj_1776526720347

# 指定完整参数
./ai-chat-test.sh <demoId> <baseUrl> <message> <username> <password> <timeoutSeconds> <verbose>

# 示例
./ai-chat-test.sh proj_1776526720347 http://localhost:3200 "帮我生成一个卡片组件" qihao 130015 60

# 启用详细日志输出
./ai-chat-test.sh proj_1776526720347 http://localhost:3200 "帮我生成一个卡片组件" qihao 130015 60 true
```

### PowerShell 版本 (Windows)

```powershell
# 使用默认参数运行
.\ai-chat-test.ps1

# 指定参数
.\ai-chat-test.ps1 -demoId "proj_1776526720347" -message "帮我生成一个卡片组件"

# 指定完整参数
.\ai-chat-test.ps1 `
  -demoId "proj_1776526720347" `
  -baseUrl "http://localhost:3200" `
  -message "帮我生成一个卡片组件" `
  -username "qihao" `
  -password "130015" `
  -timeoutSeconds 60

# 启用详细日志输出
.\ai-chat-test.ps1 -demoId "proj_1776526720347" -verbose
```

## 参数说明

| 参数               | 默认值                     | 说明                 |
| ---------------- | ----------------------- | ------------------ |
| `demoId`         | `proj_1776526720347`    | 要测试的 Demo ID       |
| `baseUrl`        | `http://localhost:3200` | Web 前端服务地址         |
| `message`        | `你好，请帮我生成一个简单的按钮组件`     | 发送给 AI 的测试消息       |
| `username`       | `qihao`                 | 登录用户名（如需要）         |
| `password`       | `130015`                | 登录密码（如需要）          |
| `timeoutSeconds` | `60`                    | 等待 AI 回复的最大秒数      |
| `verbose`        | `false`                 | 启用详细日志输出（DEBUG 级别） |

## 日志级别

脚本使用带颜色的分级日志系统：

| 级别        | 颜色 | 说明                      |
| --------- | -- | ----------------------- |
| `DEBUG`   | 灰色 | 详细信息，仅在 verbose 模式开启时显示 |
| `INFO`    | 青色 | 一般信息，测试进度               |
| `WARN`    | 黄色 | 警告信息，非致命问题              |
| `ERROR`   | 红色 | 错误信息，测试失败原因             |
| `SUCCESS` | 绿色 | 成功信息，测试通过               |

## 日志输出示例

### 正常测试输出

```
[14:30:15] [INFO] === AI 聊天功能端到端测试 ===
[14:30:15] [INFO] 目标 Demo: proj_1776526720347
[14:30:15] [INFO] 测试消息: 你好，请帮我生成一个简单的按钮组件
[14:30:15] [INFO] 超时时间: 60秒
[14:30:15] [INFO] 详细模式: false
[14:30:15] [INFO] 步骤 1/5: 打开浏览器并访问 Demo 编辑页...
[14:30:18] [INFO] 步骤 2/5: 检查登录状态...
[14:30:18] [SUCCESS] 已登录或无需登录
[14:30:18] [INFO] 步骤 3/5: 等待页面加载并定位 AI 聊天框...
[14:30:20] [SUCCESS] 页面加载完成 (等待 2秒)
[14:30:20] [INFO] 定位 AI 聊天输入框...
[14:30:20] [SUCCESS] 找到输入框: e15
[14:30:20] [INFO] 步骤 4/5: 输入测试消息并发送...
[14:30:20] [INFO] 发送消息 (按 Enter)...
[14:30:20] [SUCCESS] 消息已发送
[14:30:20] [INFO] 步骤 5/5: 等待 AI 回复（最多 60 秒）...
[14:30:25] [INFO] AI 正在输入... (5 次检测到流式状态)
[14:30:35] [SUCCESS] 收到 AI 回复 (耗时: 15秒)

[14:30:35] [INFO] === 测试结果 ===
[14:30:35] [SUCCESS] ✅ 测试通过: 成功收到 AI 回复
```

### 失败时输出（详细诊断信息）

```
[14:30:20] [ERROR] 检测到错误回复: '抱歉，我没有收到有效的回复'

[14:30:20] [INFO] === 诊断信息汇总 ===
[14:30:20] [DEBUG] 最终页面状态: {"url":"...","title":"...","bodyTextPreview":"..."}
[14:30:20] [WARN] 控制台消息:
[14:30:20] [WARN]   Error: WebSocket connection failed
[14:30:20] [WARN]   Error: Agent service unavailable

[14:30:20] [ERROR] ❌ 测试失败: AI 返回了空回复

[14:30:20] [WARN] 可能原因:
[14:30:20] [WARN]   1. Agent 服务未启动或连接失败
[14:30:20] [WARN]   2. ACP CLI 进程异常
[14:30:20] [WARN]   3. AI 模型未返回有效内容
[14:30:20] [WARN]   4. WebSocket 连接中断
[14:30:20] [WARN] 排查建议:
[14:30:20] [WARN]   - 检查 agent-service 是否启动: curl http://localhost:3201/health
[14:30:20] [WARN]   - 检查 ACP CLI 是否可用: workbench acp
[14:30:20] [WARN]   - 查看 agent-service 控制台日志
[14:30:20] [WARN]   - 使用浏览器开发者工具查看 WebSocket 消息
```

## 详细日志（verbose 模式）内容

启用 verbose 模式后，脚本会输出额外信息：

- 每个步骤的 DOM snapshot（前 20 行）
- 所有 `playwright-cli eval` 的返回值
- 每 10 秒的页面状态（streaming 元素数、消息数等）
- 发送消息时的输入框内容验证
- WebSocket 连接状态
- 最终诊断信息汇总

### 页面状态 JSON 字段说明

```json
{
  "url": "http://localhost:3200/demo/xxx/edit",
  "title": "Demo Edit",
  "bodyTextLength": 1500,
  "bodyTextPreview": "AI 对话\n...\n用户: 你好\n助手: 好的...",
  "streamingElements": 0,
  "assistantMessages": 2,
  "userMessages": 1
}
```

| 字段                  | 说明           |
| ------------------- | ------------ |
| `url`               | 当前页面 URL     |
| `title`             | 页面标题         |
| `bodyTextLength`    | 页面文本总长度      |
| `bodyTextPreview`   | 页面文本前 500 字符 |
| `streamingElements` | 正在流式输出的元素数量  |
| `assistantMessages` | 助手消息数量       |
| `userMessages`      | 用户消息数量       |

## 测试流程详解

### 步骤 1：打开浏览器并访问 Demo 编辑页

- 使用 `playwright-cli open` 打开浏览器
- 导航到 `/demo/{demoId}/edit`
- 等待 3 秒确保页面开始加载

### 步骤 2：处理登录（如需要）

- 检测当前 URL 是否包含 `/login`
- 如果是登录页：
  - 通过 snapshot 查找用户名/密码输入框的 ref
  - 填写凭据
  - 点击登录按钮
  - 验证登录成功（URL 不再是登录页）

### 步骤 3：等待页面加载并定位 AI 聊天框

- 轮询检查页面是否包含 "AI 对话"、"输入指令"、textarea 等元素
- 最多等待 30 秒
- 定位输入框（优先通过 ref，其次通过 CSS 选择器 `textarea`）
- verbose 模式会输出 DOM snapshot

### 步骤 4：输入测试消息并发送

- 使用 `playwright-cli fill` 填写输入框
- 验证输入是否成功（读取输入框的值）
- 使用 `playwright-cli press Enter` 发送消息
- 如果 Enter 失败，尝试点击发送按钮

### 步骤 5：等待并验证 AI 回复

- 轮询检查页面内容，最多等待 `timeoutSeconds` 秒
- 每 10 秒输出页面状态（verbose 模式）
- **失败检测**：如果页面出现 "抱歉，我没有收到有效的回复"，立即判定失败
- **成功检测**：如果检测到 assistant 角色的消息且内容不为空，判定成功
- **超时检测**：超过最大等待时间未收到回复，判定失败
- 最后输出诊断信息汇总

## 测试结果

### 测试通过

```
✅ 测试通过: 成功收到 AI 回复
  回复内容 (前300字符):
    好的，我来帮你生成一个按钮组件...
```

### 测试失败（AI 返回空回复）

```
❌ 测试失败: AI 返回了空回复
  可能原因:
    1. Agent 服务未启动或连接失败
    2. ACP CLI 进程异常
    3. AI 模型未返回有效内容
    4. WebSocket 连接中断
```

### 测试失败（超时）

```
❌ 测试失败: 未检测到 AI 回复
  可能原因:
    1. 消息发送失败
    2. Agent 服务未响应
    3. 回复超时
    4. 前端渲染问题
```

## 故障排查

### 问题：playwright-cli 未找到

**解决**：

```bash
npm install -g @playwright/cli
```

### 问题：页面加载超时

**可能原因**：

- 前端服务未启动
- Demo ID 不存在
- 网络延迟

**解决**：

1. 确认 `pnpm dev:web` 已启动
2. 检查 Demo ID 是否正确
3. 增加等待时间（修改脚本中的 `$maxWait` / `MAX_WAIT`）

### 问题：未找到 AI 聊天输入框

**可能原因**：

- AI 对话标签未自动激活
- 页面结构变化

**解决**：

1. 手动确认页面是否有 "AI 对话" 标签
2. 检查 `ai-chat.tsx` 和 `prompt-input.tsx` 的 DOM 结构是否变化
3. 更新脚本中的选择器逻辑
4. 启用 verbose 模式查看 DOM snapshot

### 问题：AI 返回空回复

**排查步骤**：

1. 启用 verbose 模式运行脚本，查看详细日志
2. 检查 agent-service 是否启动：`curl http://localhost:3201/health`
3. 检查 ACP CLI 是否可用：`workbench acp`（或其他后端 CLI）
4. 查看 agent-service 日志是否有错误
5. 查看浏览器控制台 WebSocket 消息（脚本会输出 console 错误）

### 问题：登录失败

**解决**：

- 确认用户名和密码正确
- 检查登录表单的 DOM 结构是否变化
- 启用 verbose 模式查看登录页的 DOM snapshot
- 尝试手动登录后使用 `playwright-cli state-save` 保存状态

## 扩展建议

### 添加更多测试场景

可以在脚本基础上扩展：

1. **多轮对话测试**：发送多条消息，验证上下文保持
2. **代码生成测试**：验证 AI 生成的代码是否正确更新到编辑器
3. **Schema 更新测试**：验证 AI 修改配置 schema 后预览区是否更新
4. **错误恢复测试**：模拟网络中断后重连

### 集成到 CI/CD

```yaml
# 示例 GitHub Actions 配置
- name: Run AI Chat E2E Test
  run: |
    ./docs/plans/测试脚本/AI功能测试/ai-chat-test.sh
  env:
    AGENT_SERVICE_URL: http://localhost:3201
```

## 注意事项

- 测试脚本会**自动关闭浏览器**，无需手动清理
- 测试过程中会占用一个浏览器窗口，请勿手动关闭
- 如果测试中断（Ctrl+C），`trap` / `finally` 会确保浏览器关闭
- 建议在**非生产环境**运行测试，避免影响真实数据
- 启用 verbose 模式可获得更多诊断信息，对排查问题很有帮助

