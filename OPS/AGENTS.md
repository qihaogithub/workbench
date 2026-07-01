# AGENTS.md - OPS

`OPS/` 存放项目内工程诊断工具、自动任务上下文和维护型账本。它服务 AI 编码代理和自动任务，不是产品需求文档或架构知识库。

## 读取顺序

进入 `OPS/` 相关任务时按顺序读取：

1. 根目录 `AGENTS.md`。
2. 本文件。
3. 目标子目录的 `AGENTS.md`，如果存在。
4. 目标子目录的 `README.md`、`package.json`、registry、context、runbook 或 state。
5. 与任务直接相关的源码、测试、项目文档或运行现场。

## 子目录职责

| 目录 | 职责 | 入口 |
|---|---|---|
| `OPS/CLI/` | 长期工程诊断 CLI、Agent Service 测试工具、WebSocket/HTTP 调试入口 | `OPS/CLI/AGENTS.md` |
| `OPS/automations/` | Codex 定时任务和维护型自动任务上下文 | `OPS/automations/AGENTS.md` |

## 维护边界

- `OPS/` 不属于 `docs/项目文档/` 知识库，不套用需求文档/技术文档拆分规范。
- `OPS/CLI/` 的代码改动应保持为诊断工具能力，不要把产品业务逻辑迁入 CLI。
- `OPS/automations/` 的 context、runbook、state 和 registry 以自动任务可执行为优先，不写成泛化说明书。
- 自动任务发现可复用的业务规则、接口契约或架构边界时，应同步沉淀到 `docs/项目文档/` 对应模块。
- 自动任务发现具体缺陷、测试缺口或实施事项时，应记录到 `docs/plans/进行中/`，不要只写在 `OPS/automations/state/`。
- 不提交运行产物、截图、trace、日志、缓存、数据库、真实 token 或 `.env`。

## 验证

优先使用根目录脚本验证 OPS 相关改动：

```bash
corepack pnpm check:automation
corepack pnpm check:project-cli
```

仅修改说明文档且不影响脚本、registry 或 CLI 行为时，可以不运行构建测试，但最终回复需要说明验证范围。
