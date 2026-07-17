# AI 对话与 Agent 问题沉淀

## 当前状态

已修复 P0 和 P1 项。

---

## 问题 2：AI 处理耗时提示过于突兀

**现象**：AI 执行超过 60 秒后，聊天区域出现带背景色的横幅提示"AI 已持续处理 X 秒…"，180 秒后变红色"AI 处理时间过长，建议取消后重试"。提示视觉权重过高，干扰用户阅读已输出的内容。

**当前实现**：`packages/author-site/src/components/ai-elements/ai-chat.tsx:475-490`
- 60s 后显示黄色横幅（`bg-yellow-500/10`）
- 180s 后变红色横幅（`bg-red-500/10`）
- 位置在消息流中间，独立占一行

**改进方向**：将此提示降级为信息流底部的轻量运行时间显示，与 AI 运行中的红色动画放在一起，仅显示运行时间即可，不需要独立横幅。

**已完成**：
- [x] 移除独立横幅组件（`ai-chat.tsx` L475-490）
- [x] 在底部增加轻量运行时间显示（小圆点 + "已运行 X 秒"，180s+ 圆点变红脉冲，无背景色横幅）

---

## 问题 1：Rate-limit 后对话级联失败（死循环）

**现象**：AI 对话过程中突然返回"AI 服务额度或频率受限，请稍后重试"或"AI 请求失败，请稍后重试"，之后用户发送的所有消息均失败。退出项目重新打开后恢复正常。

**影响范围**：所有使用 AI 对话的用户。一旦触发，当前会话内无法恢复，只能退出重建会话。

**案例**：session-1784187533761-r2475xiby（2026-07-16）
- 用户请求参考 Figma 导出文件修改页面
- AI 尝试 8 次并发 saveImage 全部超时（10s）
- AI 成功执行 1 次 editFile 后，后续请求开始返回 rate-limit 错误
- 用户连续 5 次发送"继续"，全部失败
- 退出重开后恢复

### 根因

四个缺陷形成级联失败：

1. **LLM API 调用层无重试机制**
   - 整个调用链（`websocket.ts` → `backend-agent.ts` → `pi-agent.ts` → `harness.prompt()`）均无自动重试
   - `retryable: true` 只是元数据标记，服务端未执行任何重试
   - 对于 429 限流、瞬时超时等可恢复错误，本应等待后重试，但当前直接返回错误给用户
   - 对比：文件工具的 `driftRetryCount` 机制已实现了类似的重试模式，但 LLM 调用层缺失

2. **`RATE_LIMIT_EXCEEDED` 错误码已定义但从未使用**
   - `packages/agent-service/src/core/types.ts` 定义了 `RATE_LIMIT_EXCEEDED`
   - 但 `backend-agent.ts` 的 catch 块将所有 LLM 错误统一包装为 `MESSAGE_SEND_ERROR`
   - 前端 `normalizeAiError()` 只能依赖消息文本匹配分类，导致同类错误显示不同提示

3. **Rate-limit 后 Agent 对话历史未清理**
   - Pi Agent harness 维护内存中的完整对话历史
   - 429 错误后 Agent 实例未被销毁，失败轮次（含 8 个超时错误 + editFile 调用）留在历史中
   - 每次重试发送完整历史给 LLM API，token 数更大，更容易再次触发 429
   - 形成不可恢复的级联失败循环

4. **saveImage 8 次并发超时加剧历史膨胀**
   - 8 个失败的工具调用显著增加了对话历史的 token 数
   - 使后续请求更容易触发 rate limit

### 为什么退出重开能恢复

1. 用户退出项目 → 前端关闭 WebSocket
2. 服务端 `websocket.ts` 的 close handler 检测到最后一个连接关闭
3. 调用 `manager.destroy(sessionId)` 销毁 Agent（包括对话历史）
4. 用户重新进入 → 新 sessionId → 新 Agent → 干净对话历史
5. 此时 rate-limit 窗口通常已过期 → 正常处理

### 修复方案

| 优先级 | 修复 | 文件 | 复杂度 |
|--------|------|------|--------|
| P0 | LLM API 调用增加自动重试（指数退避，针对 429/5xx/超时） | `backend-agent.ts` 或 `pi-agent.ts` | 中 |
| P0 | 检测 rate-limit 错误并使用 `RATE_LIMIT_EXCEEDED` 错误码 | `backend-agent.ts` | 低 |
| P0 | Rate-limit 错误后销毁 Agent 或重置对话历史 | `websocket.ts` 或 `backend-agent.ts` | 中 |
| P1 | 前端对 `RATE_LIMIT_EXCEEDED` 显示明确提示并建议等待 | 前端 `onError` 处理 | 低 |
| P2 | 对话历史 token 数上限截断 | `pi-agent.ts` | 高 |

**重试策略建议**：
- 在 `backend-agent.ts` 的 `sendMessage` 中包裹重试逻辑
- 可重试错误：429（rate limit）、500/502/503/504（服务端错误）、网络超时
- 不可重试错误：401/403（鉴权）、参数错误
- 退避策略：指数退避 + 抖动，最多 3 次，初始间隔 1s
- 429 响应优先读取 `Retry-After` header
- 重试时保留对话历史但清除失败轮次（避免历史膨胀问题）

### 已完成修复

- [x] **P0：LLM API 自动重试**（`backend-agent.ts`）：在 `sendMessage` 中包裹 `this.backend.sendMessage()` 于重试循环，对 429/5xx/超时/网络错误自动重试，指数退避 + 抖动，最多 2 次重试，429 优先读取 `Retry-After`。超时或 cancel 时不重试。
- [x] **P0：rate-limit 错误码**（`backend-agent.ts`）：catch 块中通过 `isRateLimitError()` 检测 429 状态码或错误消息关键词，匹配时返回 `RATE_LIMIT_EXCEEDED` 错误码和用户友好消息，不再统一包装为 `MESSAGE_SEND_ERROR`。
- [x] **P0：rate-limit 后销毁 Agent**（`websocket.ts`）：检测到 `RATE_LIMIT_EXCEEDED` 错误码后异步调用 `manager.destroy(sessionId)`，下次消息将创建全新 Agent（干净对话历史），打破级联失败循环。
- [x] **P1：前端错误码分类**（`ai-error-normalizer.ts`）：`classifyAiError()` 优先根据结构化错误码分类（`RATE_LIMIT_EXCEEDED` → quota、`MESSAGE_TIMEOUT` → timeout、`AGENT_BUSY` → busy），不再仅依赖文本匹配。
- [ ] P2：评估对话历史 token 截断策略（未实施，当前重试 + 销毁 Agent 已可打破级联失败）

### 相关文件

- `packages/agent-service/src/core/types.ts` — ErrorCode 定义（含未使用的 `RATE_LIMIT_EXCEEDED`）
- `packages/agent-service/src/core/backend-agent.ts` — 错误处理 catch 块
- `packages/agent-service/src/routes/websocket.ts` — WebSocket 错误处理和 Agent 生命周期
- `packages/agent-service/src/backends/pi-agent.ts` — harness.prompt() 使用完整对话历史
- `packages/shared/src/ai-error-normalizer.ts` — 前端错误分类逻辑
- `packages/agent-service/src/backends/pi-tools/save-image-tool.ts` — saveImage 超时配置
- `packages/author-site/src/components/ai-elements/ai-chat.tsx:475-490` — 耗时提示横幅实现
- `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts` — silenceSeconds 状态管理
