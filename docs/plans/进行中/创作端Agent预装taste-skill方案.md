# 创作端 Agent 预装 taste-skill 方案

## 背景

用户希望创作端 Agent 默认具备 [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) 的前端审美与落地页设计约束能力。当前创作端对话由 author-site 注入静态 System Prompt，agent-service 基于 Pi Agent 运行主 Agent 与子 Agent。

## 目标

- 创作端主 Agent 默认识别并可按需使用 `design-taste-frontend` skill。
- 子 Agent 与主 Agent 保持一致，也能使用该预装 skill。
- 预装内容随仓库发布，不依赖运行时联网拉取 GitHub。
- 文档同步说明预装 skill 的边界和读取方式。

## 范围

- 涉及 `packages/agent-service/` 的 Pi Agent 初始化、工具注册和测试。
- 涉及创作端 AI 对话相关长期项目文档。
- 不改变用户工作空间文件权限，不为 Agent 增加运行时 GitHub 下载能力。

## 方案

1. 将 taste-skill 作为 agent-service 内置资源登记，来源标记为 `github:Leonxlnx/taste-skill`。
2. 在 System Prompt 的运行时工具列表之后追加预装 skill 列表和读取规则。
3. 新增只读工具，让模型按 skill 名称读取内置 `SKILL.md` 全文，避免把 80KB 以上的 skill 内容长期注入每轮 System Prompt。
4. 主 Agent 和子 Agent 创建 `AgentHarness` 时使用同一套预装 skill 资源。
5. 补充单元测试覆盖资源注入、工具注册和 System Prompt 可见性。

## 任务清单

- [x] 定位 Pi Agent 主/子 Agent 初始化路径。
- [x] 创建任务文档并记录实现方案。
- [x] 实现预装 skill 资源与只读工具。
- [x] 补充单元测试。
- [x] 更新项目文档。
- [x] 运行匹配验证命令。

## 进度记录

- 2026-06-27 00:45 CST：确认 `pi-agent-core` 支持 `resources.skills` 和 `formatSkillsForSystemPrompt()`，但不会自动把完整 skill 内容暴露给模型；需要 agent-service 提供按需读取能力。
- 2026-06-27 00:52 CST：完成 `design-taste-frontend` 内置资源、`readPreinstalledSkill` 工具、主/子 Agent resources 注入、Docker 资源复制和文档同步；agent-service 类型检查、测试与 Docker bundle 检查通过。

## 验证方式

- `corepack pnpm --filter @opencode-workbench/agent-service typecheck`
- `corepack pnpm --filter @opencode-workbench/agent-service test`
- `corepack pnpm --filter @opencode-workbench/agent-service build:docker`

## 风险与待确认事项

- taste-skill 内容较长，不适合每轮完整注入 System Prompt；按需读取工具可以降低 token 成本，但依赖模型遵守 skill 列表中的读取提示。
- 当前内置版本来自本机已安装的 `taste-skill` 内容；后续如需跟随 GitHub 更新，应通过明确的仓库同步流程升级。
