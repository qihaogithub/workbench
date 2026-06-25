# AGENTS.md — @opencode-workbench/project-admin-mcp

> 本文件为 AI 编码代理提供在 Project Admin MCP 包中工作的指南。进入本包前仍需先阅读根目录 `AGENTS.md`。

## 包定位

`@opencode-workbench/project-admin-mcp` 是项目管理 MCP stdio 服务。它面向 Codex/Agent 暴露确定性项目管理工具，但业务逻辑应委托给 `@opencode-workbench/project-core`。

## 关键目录

| 路径 | 说明 |
| --- | --- |
| `src/server.ts` | MCP stdio 服务入口和工具注册 |
| `src/protocol.ts` | 工具协议、参数校验和响应整理 |
| `src/protocol.test.ts` | 工具协议单元测试 |

## 改动边界

- 本包只做协议适配、参数校验、权限边界、错误结构和审计包装，不复制 `project-core` 的业务逻辑。
- 新增工具时先确认 `project-core` 是否已有对应领域方法；没有时先补 `project-core`。
- 工具响应应使用稳定业务结构，避免要求调用方理解项目内部文件格式。
- 高风险写操作应提供 dry-run、明确确认参数或可审计结果。
- 本地启动默认使用 stdio，不要引入 HTTP 服务，除非有单独方案和文档。

## 文档维护

改动工具能力、安装方式、权限模型或返回结构时，同步检查：

- `docs/用户指南/Project-Admin-MCP使用指南.md`
- `docs/plans/进行中/创作端项目管理MCP完整能力方案.md`
- `.agents/skills/opencode-project-admin/`

## 验证

优先使用根目录脚本：

```bash
pnpm check:project-admin-mcp
```

更小范围验证：

```bash
pnpm --filter @opencode-workbench/project-admin-mcp typecheck
pnpm --filter @opencode-workbench/project-admin-mcp test
```

