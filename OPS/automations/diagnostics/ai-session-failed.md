# AI 会话失败诊断包

## 现象关键词

- AI 空回复
- stream 中断
- WebSocket 断开
- Agent 消息失败
- 工具调用没有写入文件
- 工作区文件变更未同步

## 必读

1. `docs/项目文档/创作端/05-AI对话/`
2. `docs/项目文档/独立Agent服务层/`
3. `packages/agent-service/AGENTS.md`
4. `OPS/CLI/README.md`
5. `OPS/automations/contexts/cli-maintenance.md`

## 先判断

| 判断 | 依据 |
|:-----|:-----|
| 服务不可用 | Agent health 失败、端口不可达 |
| 配置缺失 | 模型、token、CORS 或服务地址异常 |
| session 问题 | session 不存在、过期、workspace 路径异常 |
| stream 路由问题 | HTTP 成功但 WS event 不完整 |
| 工具调用问题 | Agent 写文件成功但 author-site 未刷新 |
| 外部模型异常 | LLM 超时、限流或空响应 |

## 低副作用命令

```bash
corepack pnpm check:automation
corepack pnpm check:agent
```

如果 agent-service 正在运行，可用 OPS CLI：

```bash
corepack pnpm --filter @workbench/cli-tools dev -- health
corepack pnpm --filter @workbench/cli-tools dev -- system
```

## 可用诊断工具

- `OPS/CLI` 的 `health`、`system`、`session`、`logs`、`files`
- `scripts/development/test-ai-workspace-refresh.mjs`

## 常见根因

- Agent service 未启动或 CORS 配置不允许前端访问。
- session workspace 指向不正确。
- stream event 丢失或前端聚合逻辑未处理某类事件。
- Agent 工具写入文件后，author-site 没有刷新工作区状态。
- 真实 LLM 返回空内容或触发外部限流。

## 修复后验证

| 修复类型 | 验证 |
|:---------|:-----|
| agent-service | `corepack pnpm check:agent` |
| author AI UI | `corepack pnpm check:author` |
| workspace refresh | `corepack pnpm test:ai-workspace-refresh` |

## 停机条件

- 需要真实 LLM 密钥或生产环境。
- 需要更改模型选择、权限或计费相关策略。
- 需要删除真实 session、workspace 或 agent-run logs。
