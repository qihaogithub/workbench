# AI对话与Agent-模型无限思考导致harness卡死

## 背景

2026-07-09 用户报告创作端对话卡住不动，只能手动停止。排查 `session-1783606411369-u0dg9us6z`（项目 `growth-bean-mall_x8k2`）的 `data/agent-run-logs` 后确认：模型 `jojo/deepseek-v4-flash` 两次陷入无限 thinking 循环，`BackendAgent.sendMessage()` 永远不 resolve，导致 harness 永久 busy。

## 问题时间线

所有时间为 UTC。

| 时间         | 消息 ID             | 模型                         | 现象                                                                                                             |
| ------------ | ------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 7/9 14:16    | `msg-1783606614977` | `deepseek/deepseek-v4-flash` | 运行 4 分钟后用户手动取消（cancel 事件）                                                                         |
| 7/9 16:32    | `msg-1783614749255` | `jojo/deepseek-v4-flash`     | 正常完成（14s，1 tool）                                                                                          |
| 7/9 16:33    | `msg-1783614798379` | `jojo/deepseek-v4-flash`     | **🚨 卡死**：持续 14 分钟纯 thought 事件，无 finish/tool_call，日志在 16:47:06 中断                              |
| 7/9 16:54:43 | `msg-1783616083918` | `jojo/deepseek-v4-flash`     | ❌ `AgentHarness is busy`                                                                                        |
| 7/9 16:54:52 | `msg-1783616092502` | `jojo/deepseek-v4-flash`     | ❌ `AgentHarness is busy`                                                                                        |
| 7/9 16:55:19 | `msg-1783616119840` | `jojo/deepseek-v4-pro`       | ❌ `AgentHarness is busy`（切模型无效）                                                                          |
| 7/9 16:57:44 | `msg-1783616264396` | `deepseek/deepseek-v4-flash` | ❌ `AgentHarness is busy`                                                                                        |
| 7/9 16:57:48 | `msg-1783616269003` | `deepseek/deepseek-v4-flash` | ❌ `AgentHarness is busy`                                                                                        |
| 7/9 16:57:50 | `msg-1783616270483` | `deepseek/deepseek-v4-flash` | ❌ `AgentHarness is busy`                                                                                        |
| 7/9 17:06    | `msg-1783616784915` | `deepseek/deepseek-v4-flash` | ✅ 成功（中间用户手动取消/重启了解锁）                                                                           |
| 7/10 03:08   | `msg-1783652880554` | `jojo/deepseek-v4-flash`     | 正常完成（5min，17 tools）                                                                                       |
| 7/10 03:38   | `msg-1783654706592` | `jojo/deepseek-v4-flash`     | **🚨 再次卡死**：6 分钟 thought 后执行了 updatePlan（3/3 completed），但之后无 finish 事件，日志在 03:44:25 中断 |
| 7/10 04:02   | `msg-1783656140463` | `jojo/deepseek-v4-flash`     | ✅ 成功（中间又做了解锁操作）                                                                                    |
| 7/10 04:07   | `msg-1783656452263` | `jojo/deepseek-v4-flash`     | 正常完成（9min，42 tools）                                                                                       |
| 7/10 04:49   | `msg-1783658972029` | `jojo/deepseek-v4-flash`     | 正常完成（3min，9 tools）                                                                                        |

## 根因总结

1. **模型端**：`jojo/deepseek-v4-flash` 陷入无限 thinking 循环，持续产出小片段 thought 事件但从不产生 tool_call 或 finish
2. **后端代码**：`BackendAgent.sendMessage()` 无超时保护，`backend.sendMessage()` 永不 resolve → `busy` 永远为 true
3. **清理机制**：`cleanupIdleAgents()` 跳过 processing 状态，兜底机制失效
4. **前端追踪**：`onThought` handler 误调用 `markActivity()` 重置 silence 计时器，导致前后端对“活跃”定义不一致，UI 警告无法触发

### 连锁影响

1. 当前对话无响应（前端表现为"卡住不动"）
2. 用户发新消息 → `AgentHarness is busy`
3. 用户切换模型重试 → 仍然 busy（busy 是 agent 级别，不是模型级别）
4. 用户只能手动取消/停止

## 根因

### 1. 模型端：`jojo/deepseek-v4-flash` 陷入无限 thinking 循环

模型持续产出小片段 `thought` 事件（contentLength 为个位数），但从不产生最终回复或 tool_call。两次分别持续了 14 分钟和 6 分钟。

特征：

- thought 事件密集（毫秒级间隔），每个 contentLength 很小（1-17 字符）
- 没有 `done: true` 的 thought
- 没有 `tool_call`、`finish`、`error` 事件
- 日志突然中断，没有收尾事件

**总结**：模型供应商侧的无限 thinking 循环是触发问题的源头。

### 2. 代码层：`BackendAgent.sendMessage()` 没有超时保护

文件：`packages/agent-service/src/core/backend-agent.ts` `sendMessage()` 方法

```typescript
async sendMessage(content, options) {
    this.busy = true;
    this.setStatus("processing");
    try {
        const result = await this.backend.sendMessage(content, ...);  // 无限等待，无超时保护
        this.busy = false;      // 只有成功才解除
    } catch (error) {
        this.busy = false;      // 或异常才解除
    }
}
```

`backend.sendMessage()` 永远不 resolve → `busy` 永远为 `true` → 后续所有消息命中 `isBusy()` 返回 `AgentHarness is busy`。

**总结**：`sendMessage()` 缺少超时保护，一旦底层永不 resolve，整个 agent 永久锁死。

### 3. 清理机制盲区：`cleanupIdleAgents` 跳过 processing 状态

文件：`packages/agent-service/src/core/agent-manager.ts` `cleanupIdleAgents()` 方法

```typescript
if (isIdle && agent.status !== 'processing') {  // processing 状态不会被清理
```

卡住的 agent 状态是 `processing`，空闲清理机制完全不起作用。

**总结**：`cleanupIdleAgents` 对 processing 状态无兜底，卡住的 agent 永远不会被自动清理。

### 4. 前端追踪：`onThought` 误重置 silence 计时器

`use-chat-stream.ts` 的 `onThought` handler 调用了 `markActivity()`，模型持续产出 thought 事件时 silence 计时器不断被重置。后端正确地将 thought 排除在超时判定之外（`activityEvents` 不含 thought），但前端将其视为活动，导致 60s/180s 警告永远无法触发。

**修复**：移除 `onThought` 中的 `markActivity()` 调用，补充 3 处注释确保前后端一致性。

**总结**：前端 silence 追踪与后端超时定义不一致，用户看不到任何警告提示。

## 相关文件

| 文件                                                                            | 作用                                                      |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `packages/agent-service/src/core/backend-agent.ts`                              | `sendMessage()` 缺少超时保护，busy 状态管理               |
| `packages/agent-service/src/core/agent-manager.ts`                              | `cleanupIdleAgents()` 跳过 processing 状态                |
| `packages/agent-service/src/core/agent.ts`                                      | `BaseAgent` 状态机定义                                    |
| `packages/agent-service/src/core/timeouts.ts`                                   | 超时常量集中定义，支持环境变量覆盖                        |
| `packages/agent-service/src/backends/pi-agent.ts`                               | Pi Agent harness 适配层，`sendMessage` 底层实现           |
| `packages/agent-service/src/routes/websocket.ts`                                | WebSocket 消息入口                                        |
| `packages/agent-service/tests/unit/websocket-timeout.test.ts`                   | 已有超时相关测试                                          |
| `packages/author-site/src/components/ai-elements/ai-chat.tsx`                   | 前端 silence 提示渲染（60s 黄色 / 180s 红色）             |
| `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts` | 前端 silence 追踪，`onThought` 中 `markActivity()` 误重置 |
| `packages/screenshot-service/src/routes/ensure/route.ts`                        | 截图服务，`inlinePrototypeAssets` 内联图片修复            |
| `data/agent-run-logs/session-1783606411369-u0dg9us6z/`                          | 问题会话的完整日志                                        |

## 用户体验问题

从用户视角看，系统表现与完全卡死无异：

1. **无进度提示**：界面没有任何视觉反馈，用户不知道系统正在思考还是已经崩溃
2. **无超时反馈**：等了很久没有任何提示，用户只能手动取消重试
3. **重复失败**：取消后发新消息报 `AgentHarness is busy`，切换模型也无效，彻底卡死

用户体验问题的本质：用户无法区分"系统正在思考"和"系统已卡死"。缺少有效的进度反馈机制，导致用户被迫手动取消，然后遇到 busy 错误，体验极差。

## 已实施的解决方案

针对四个根因设计三层超时防护：

1. **BackendAgent 层**（根因 2）：双定时器策略——inactivity 检测"无进展"，absolute 兜底"总时长"。超时后自动 abort 并返回 `MESSAGE_TIMEOUT`
2. **AgentManager 层**（根因 3）：为 processing 状态补兜底，解决清理机制盲区
3. **前端层**（根因 4）：渲染 silence 时长，让用户感知系统状态

超时常量集中在 `timeouts.ts`，均支持环境变量覆盖。

## 验证状态

### 实现细节

- 超时取消链路：`cancel()` → `cancelPrompt()` → `harness.abort()`，`cancel()` 有幂等守卫（`if (!this.busy) return`）
- 竞态防护：成功路径检查 `timedOut` 标志，防止 abort 竞态下吞掉超时错误
- AgentManager 扫描间隔 60s，processing 超 10min 强制 `kill()`
- 前端 `silenceSeconds` 基于本地 `setInterval`（1s tick）计算，纯本地逻辑不依赖 SSE

### 测试覆盖

- `tests/unit/backend-agent-inactivity-timeout.test.ts`（164 行，5 个场景）：busy 恢复、MESSAGE_TIMEOUT 错误码、事件持续重置 inactivity timer、thought 事件不重置 timer、absolute timer 硬触发
- `tests/unit/agent-manager-processing-timeout.test.ts`（100 行，3 个场景）：processing 超时 kill、未超时不 kill、非 processing 状态不受影响

以上路径相对于 `packages/agent-service/`，全量测试 376 passed。

### 验证结果

- `pnpm check:agent`：typecheck + lint + test 全部通过
- `pnpm check:author`：typecheck + lint + test 通过（4 个预存失败与本次改动无关）
- 前端 silence 追踪修复：`use-chat-stream.ts` 的 `onThought` 不再调用 `markActivity()`，前后端“活跃”定义已对齐
- 截图服务 `ensure/route.ts` 的 `inlinePrototypeAssets`：prototype-html-css 页面相对图片路径已正确内联

## 后续发现

### 截图服务 assetRewrite 缺失（已修复）

截图服务渲染 `prototype-html-css` 页面时，`buildPrototypePreviewDocumentHtml` 未传入 `assetRewrite` 参数，导致相对路径图片在 Puppeteer 渲染时无法解析。

**修复**：在 `ensure/route.ts` 发送截图请求前，新增 `inlinePrototypeAssets` 函数将相对图片路径内联为 base64 data URI。

### 时间线分析结论

用户发消息时距最后 tool call 仅 3.3 分钟（未到 5 分钟 inactivity timeout），前端 silence 被 thought 事件持续重置，导致无任何 UI 警告触发。该 3.3 分钟间隙是用户手动取消/重启后重试的时间点。

## 待改进项

以下问题已修复，但用户体验仍有改进空间：

1. **优化超时提示文案**：当前“正在处理中，请稍等”过于笼统，用户无法判断是正常等待还是卡死。建议改为“正在执行第 N 个工具调用，已耗时 X 秒”或“模型正在深度思考中，您可以等待或取消”
2. **增加进度反馈**：每 30-60 秒主动推送一次进度更新，让用户感知系统仍在工作
3. **提供“继续等待”选项**：超时后不自动取消，而是询问用户“是否继续等待”
4. **记录用户取消行为**：统计用户在超时前手动取消的频率，用于评估超时值是否合理
5. **模型熔断机制**：同一模型多次卡死时自动切换备用模型，而非让用户反复重试

## 待办

- [x] 在 `BackendAgent.sendMessage()` 中实现无进展超时检测（连续 N 秒无新事件则 abort）
- [x] 在 `AgentManager.cleanupIdleAgents()` 中增加 processing 状态兜底超时
- [x] 前端增加“长时间处理中”提示，避免用户以为卡死而重复发送
- [x] 补充单元测试覆盖 sendMessage 超时和 processing 状态清理
- [x] 用真实浏览器复验：模型长思考时前端应显示处理中状态，超时后自动取消并提示用户
- [x] 修复前端 `onThought` 中 `markActivity()` 误重置 silence 计时器
- [x] 修复截图服务 `ensure/route.ts` assetRewrite 缺失（`inlinePrototypeAssets`）

## 待观察

1. **超时提示的用户感知效果**：修复 silence bug 后，观察用户是否能看到黄色/红色警告提示并据此决策。若用户仍在超时前手动取消，说明提示时机或文案需优化
2. **绝对超时误触率**：15 分钟绝对超时对正常长任务（如大量文件编辑）的影响。若误触率偏高，考虑上调至 20–30 分钟并同步增加 UI 安抚频率
3. **`jojo/deepseek-v4-flash` 模型稳定性**：两次卡死均与该模型相关。若反复出现，考虑切换默认模型或增加模型级熔断
4. **断网恢复后的状态同步**：断网期间后端可能已完成或超时取消，恢复连接后前端是否能正确收到终止事件并更新 UI 状态，需实测验证

## 风险

- 超时值需要权衡：太短会中断正常的长任务（如大量文件编辑），太长则用户体验差
- Pi Agent harness 的 abort 是否真正释放资源需要验证，可能残留子进程或连接
- `jojo/deepseek-v4-flash` 的无限 thinking 可能是模型供应商侧的问题，需要关注是否反复出现
- `MESSAGE_TIMEOUT` 是新增错误码，前端已有通用错误处理路径覆盖，但外部消费者（CLI、agent-client）可能未专门处理此码
