# AI对话与Agent

## 当前状态

已修复一类“对话到一半像断连，切换模型后继续发送仍失败”的后端语义问题，待真实浏览器长任务复验。

## 当前结论

2026-07-10 排查 `session-1783606411369-u0dg9us6z` 的导出对话和 `data/agent-run-logs` 后确认：16:54 以后多次新消息都进入了 agent-service，模型也从 `jojo/deepseek-v4-flash` / `jojo/deepseek-v4-pro` 切到 `deepseek/deepseek-v4-flash`，但每次 run 都在毫秒级失败，底层错误为 `AgentHarness is busy`。因此用户看到的“切换模型也不行”不是模型选择事件未送达，而是同一个 Pi Agent harness 仍被上一轮长任务占用，新消息又绕过前端队列进入了 WebSocket 发送路径。

当前修复边界：

- agent-service 默认不再把长时间无 token 或工具事件当作死亡；运行期间持续发送 `processing` 状态心跳。
- 只有调用方显式传入 timeout 时才按硬上限取消本轮运行。
- WebSocket 与 HTTP 发送入口在调用 Pi Agent harness 前检查同会话 busy 状态；若上一轮仍在运行，返回 `AGENT_BUSY`，保持会话为 `processing`，不再制造新的 `AgentHarness is busy` 空 run。
- 共享错误归一化器把 `AGENT_BUSY` 映射为“上一轮 AI 请求仍在运行，请等待完成或先取消后再发送。”，避免前端继续显示泛化的“AI 请求失败”。

## 待办

- 用真实浏览器复验一次包含文件读取、计划审批或长工具链的 AI 长任务：长时间无正文输出时聊天区应维持处理中状态，重复发送应出现 busy 提示而不是泛化失败。

## 验证状态

待运行单元验证和真实浏览器复验。

## 风险

`AGENT_BUSY` 只是避免重入和误导错误；如果底层 Pi Agent harness 永久不退出，仍需要用户取消或后端进一步实现可等待的异步取消完成机制。

## AI 修改成功但预览回退

2026-07-10 已定位并修复一类 `editFile` 短暂成功、随后同一文件恢复旧内容的问题。根因是文件变更捕获错误依赖字段不完整的底层 `tool_execution_end`，导致编辑页没有收到 `file_operation`；同时 HTML/CSS 原型源码没有独立协同房间，旧内存状态仍可能在自动保存时覆盖新文件。

当前修复把带完整工具参数的 `tool_result` 设为文件修改权威完成事件，并让 `prototype.html` / `prototype.css` 进入独立协同资源。回归覆盖 AI 外部写入后重载旧协同文本、再次 flush 仍保持新文件。待真实浏览器完成一次 AI 编辑原型页验证后关闭本条。
