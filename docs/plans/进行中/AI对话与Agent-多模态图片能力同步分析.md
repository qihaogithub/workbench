# AI对话与Agent-多模态图片能力同步分析

## 当前状态

问题未完全关闭：管理后台已保存 `jojo/kimi-k2.6` 为多模态模型，但真实对话仍返回“当前模型不支持图片处理”。

## 当前结论

- 已确认数据库 `system_configs.model_config.multimodalModels` 包含 `jojo/kimi-k2.6`，所以问题不是后台开关未保存。
- 已完成第一轮修复：`BackendProvidersConfig` 支持携带 `multimodalModels`，author-site 保存/会话推送和 agent-service 内部配置接收均保留该字段；agent-service 的 `ModelManager.getModel()` 会据此给当前模型补上图片输入能力。
- 新发现的缺口：`websocket.ts` 和 HTTP message route 会设置 `AgentConfig.model`，但 `ModelManager.resolveProviderAndModel()` 原先不读取 `config.model`。当 agent 根据路由配置创建或恢复时，真实模型可能回落到 session/global/env 默认模型，而不是 UI 当前显示或路由传入的模型。
- 当前方案：`ModelManager.resolveProviderAndModel()` 已加入 `AgentConfig.model` 解析，并让它优先于 backendProviders 默认 active model；当 `model = "jojo/kimi-k2.6"` 且 `multimodalModels` 命中时，`getModel()` 应返回带图片输入能力的模型对象。
- 当前错误仍从 agent-service 图片能力判定分支抛出，说明运行时 `modelSupportsImages` 仍为 false；待验证它是因为旧进程/旧 session 未刷新，还是因为模型 ID 解析路径没有使用当前选中模型。

## 待办

- 补充会话级验证：旧 session 更新 backendProviders 后，`sendMessage` 使用的模型能力与当前模型 ID 一致。
- 如仍复现，增加不暴露密钥的运行时诊断日志，只输出 sessionId、resolved modelId、supportsImages 和 multimodalModels 命中数量。

## 验证状态

- 已通过：`corepack pnpm --filter @opencode-workbench/agent-service test -- tests/unit/pi-agent.test.ts`
- 已通过：`corepack pnpm check:agent`
- 已通过：`corepack pnpm check:author`
- 已通过：`corepack pnpm --filter @opencode-workbench/agent-service test -- tests/unit/model-manager.test.ts tests/unit/pi-agent.test.ts`
- 已通过：新增 `AgentConfig.model` 优先级和多模态命中测试后重新运行 `corepack pnpm check:agent`

## 风险

- 当前内部配置调试接口会返回供应商配置，可能包含敏感信息；后续运行时诊断必须避免输出 API Key。
- 如果运行中的 dev 进程仍加载旧代码，代码修复不会立刻反映到现有会话；需要区分代码缺陷与进程/session 刷新问题。
