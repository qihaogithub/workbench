# AI 对话与 Agent - 信息流优化方案

> 创建日期：2026-07-29
> 状态：方案草稿，待评审

## 背景

当前 Agent 对话信息流（用户消息和 AI 消息从发送到渲染的完整链路）存在以下系统性问题：

1. **数据表示二义性**：`ChatMessage` 同时维护 `content`（字符串）和 `parts`（结构化数组），`content` 已标记 `@deprecated` 但大量兼容代码依赖 `normalizedParts` 转换逻辑。
2. **事件类型分散**：`StreamEvent` 在 `agent-client/types.ts`、`agent-service/core/types.ts`、`ws-event-router.ts` 三处独立定义，字段不完全一致。
3. **上下文注入逻辑跨层**：L3/L4/知识库/历史在前端 `useChatStream.startMessageRun()` 拼装，systemPrompt 在 WebSocket 层注入，图片描述在 `PiAgentBackend.sendMessage()` 处理——排查上下文问题时需要跨越三层。
4. **渲染分组逻辑过重**：`AssistantMessage` 的 `renderBlocks` 约 200 行，处理 reasoning→tool→text 的顺序关系和 flush 逻辑，可测试性差。
5. **WebSocket 状态机脆弱**：`StreamService` 管理 3 个状态标志 + 多个 timer，缺乏明确的状态转换规则。
6. **HTTP 回退缺失结构化信息**：非流式 HTTP API 只返回 `{ content, files }`，丢失工具调用、reasoning 等流式细节。

## 目标

从用户体验、开发难度、可维护性三个维度优化 Agent 对话信息流，消除技术债，提升架构清晰度。

## 优化方案

### Phase 1：工程清理（低成本、高收益）

#### A. 彻底废弃 `content`，统一为 `parts`

- **当前状态**：`ChatMessage` 的 `content: string` 字段标记为 `@deprecated`，但 `normalizedParts` 转换逻辑遍布消费代码
- **方案**：删除 `ChatMessage.content` 字段及其所有转换代码，所有消息统一使用 `parts: MessagePart[]`
- **涉及文件**：
  - `packages/author-site/src/components/ai-elements/ai-chat-shared/src/message.tsx`
  - 所有消费 `normalizedParts` / `message.content` 的组件
  - 持久化逻辑（author-site API + viewer localStorage）
- **影响面**：仅限 `ai-chat-shared` 和消费组件，不涉及协议层
- **收益**：消除数据表示二义性，减少每次渲染的转换开销

#### B. 统一事件类型定义

- **当前状态**：事件类型在三处独立定义
  - `packages/agent-client/src/types.ts` — `StreamEvent`
  - `packages/agent-service/src/core/types.ts` — `AgentEvent`
  - `packages/agent-service/src/ws-event-router.ts` — `ServerMessage`
- **方案**：
  1. 在 `@workbench/shared` 中定义统一的 `AgentStreamEvent` 类型（单一来源）
  2. agent-client 和 agent-service 都从 shared 导入
  3. `ServerMessage` 映射为 `AgentStreamEvent` 的子集
- **风险**：shared 包变更需同步验证 agent-client、agent-service、author-site、viewer-site 的类型检查
- **收益**：改一处全生效，消除字段不一致的隐患

#### C. 重构上下文注入为后端统一管道

- **当前状态**：
  - L3（工作空间状态）：前端 `useChatStream.startMessageRun()` 拼装
  - L4（记忆）：前端拼装，首条消息注入一次
  - 知识库索引：前端每条消息注入
  - 近期对话历史（最近 8 条）：前端拼装
  - systemPrompt：WebSocket 层 `updateSystemPrompt` 注入
  - 图片描述：`PiAgentBackend.sendMessage()` 处理
- **方案**：
  1. 前端只传最小必要参数：`mode`、`projectId`、`demoId`、`images`
  2. 后端在 `websocket.ts` 的消息处理中统一构建完整上下文
  3. 图片预处理保留在后端（需要访问文件系统）
  4. systemPrompt 注入逻辑不变（已在后端）
- **收益**：上下文构建逻辑集中于后端一个入口，排查时无需跨越三层

### Phase 2：体验提升（中等成本）

#### D. 改进工具调用展示

- **当前状态**：2+同类型工具合并为 `ToolCallGroup`，折叠态仅显示数量（如"读取文件 ×3"），无法区分具体操作
- **方案**：
  1. 工具卡片增加摘要行
     - 读取工具：显示文件名列表（如"读取了 index.ts, utils.ts, types.ts"）
     - 编辑工具：显示编辑文件路径和类型（如"修改了 Button 组件样式"）
     - 执行工具：显示命令摘要
  2. `ToolCallGroup` 标题从纯数量改为描述性摘要
  3. 失败的工具有独立视觉区分（当前依赖颜色，可加强）
- **收益**：折叠态也有信息量，用户无需展开即可了解 AI 做了什么

#### E. Reasoning 展示策略优化

- **当前状态**：思考内容流式时自动展开，结束后 800ms 自动折叠。所有用户都看到 reasoning block
- **方案**：
  1. 新增用户级设置（页面顶部或设置面板）："显示思考过程" 开关，默认关闭
  2. 关闭时：不渲染 reasoning block，后端事件仍接收但不展示
  3. 开启时：保持当前行为（流式展开 → 结束折叠）
- **收益**：大多数用户不需要看思考过程，减少信息噪音；对进阶用户保留可查看能力

### Phase 3：长期演进

#### F. HTTP 回退携带有结构数据

- **当前状态**：HTTP POST `/api/agent/:sessionId/message` 返回 `{ success, content, files }`，无工具调用/reasoning
- **方案**：HTTP 响应增加 `parts: MessagePart[]` 字段，工具调用以完整状态（非流式增量）返回
- **收益**：降级体验与流式体验信息对齐

#### G. WebSocket 状态机简化

- **当前状态**：`StreamService` 管理 `connectionEstablished`、`finishDelivered`、`messageInFlight` 三个布尔标志 + reconnect grace timer + ready-fallback timer + keepalive timer
- **方案**：引入有限状态机，明确状态和转换规则
  - 状态：`idle → connecting → ready → streaming → finishing → idle`
  - 每个状态明确允许/禁止的操作
- **收益**：消除标志组合的隐式状态，提高可维护性

#### H. `renderBlocks` 提取为独立可测试单元

- **当前状态**：`AssistantMessage` 中约 200 行的分组逻辑内联在组件中
- **方案**：抽取为纯函数 `buildRenderBlocks(parts: MessagePart[]): RenderBlock[]`，编写单元测试覆盖各种 parts 组合
- **收益**：可独立测试、可在 agent-client 或 shared 层复用

## 推荐执行顺序

```
Phase 1: A → B → C（统一类型 + 废弃 content + 后端化上下文）
Phase 2: D → E（工具展示 + reasoning 开关）
Phase 3: F → G → H（HTTP 补全 + 状态机 + 渲染重构）
```

Phase 1 是纯工程技术债清理，改动集中在类型系统和数据流管道，不影响用户可见行为，风险最低。
Phase 2 直接影响用户体验，需要产品确认。
Phase 3 是长期健康度投资。

## 任务清单

### Phase 1

- [ ] A1: 扫描 `normalizedParts` 和 `message.content` 的全部引用
- [ ] A2: 移除 `ChatMessage.content` 字段和转换逻辑
- [ ] A3: 更新持久化逻辑（author-site API + viewer localStorage）
- [ ] A4: 运行 `pnpm check:author` + `pnpm check:viewer` 验证
- [ ] B1: 在 shared 中定义统一的 `AgentStreamEvent` 类型
- [ ] B2: 迁移 agent-client 和 agent-service 类型导入
- [ ] B3: 运行 `pnpm check:all` 验证
- [ ] C1: 梳理当前各层上下文注入的具体字段和数据来源
- [ ] C2: 设计后端统一上下文构建接口
- [ ] C3: 实现后端统一管道，前端简化为最小参数
- [ ] C4: 验证上下文效果（观察实际对话中注入内容）

### Phase 2

- [ ] D1: 设计工具摘要行的交互和视觉方案
- [ ] D2: 实现工具摘要生成逻辑
- [ ] D3: 更新 ToolCallGroup 和工具卡片组件
- [ ] E1: 设计 reasoning 开关的 UI 和存储位置
- [ ] E2: 实现 reasoning 显示策略
- [ ] E3: product review

### Phase 3

- [ ] F1: HTTP API 响应增加 parts 字段
- [ ] F2: agent-client HTTP 调用适配
- [ ] G1: 设计 WebSocket 状态机图
- [ ] G2: 实现 FSM 替换现有标志组合
- [ ] H1: 提取 buildRenderBlocks 纯函数
- [ ] H2: 编写单元测试

## 风险与待确认事项

1. **Phase 1-A**：需确认 `content` 字段是否在 viewer-site 的 localStorage 持久化中被依赖（历史数据兼容）
2. **Phase 1-C**：上下文后端化后，前端需要一次额外的网络交互来获取工作空间状态？还是当前已有其他 API 可用？
3. **Phase 2-D**：工具摘要需要后端在 `tool_call_update` 事件中提供更多结构化信息（当前 `details` 字段是字符串）
4. **Phase 2-E**：reasoning 开关的用户设置存储位置（localStorage 还是用户配置 API）
5. **Phase 3-F**：需确认非流式 HTTP API 的当前使用者（是否有外部调用方）
