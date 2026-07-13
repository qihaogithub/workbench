---
kind: external_dependency
name: Pi Agent 核心框架
slug: pi-agent-core
category: external_dependency
category_hints:
    - vendor_identity
    - framework_behavior
scope:
    - '**'
---

### Pi Agent 核心框架
- **角色**：项目 AI 对话能力的核心后端框架，通过进程内嵌入方式运行，不依赖外部 CLI 子进程
- **集成点**：`packages/agent-service/src/backends/pi-agent.ts` 作为唯一支持的 Agent 后端实现
- **供应商配置**：通过 `PI_AGENT_PROVIDER`（默认 jojo）、`PI_AGENT_MODEL`（默认 deepseek-v4-flash）、`PI_AGENT_API_KEY` 等环境变量配置
- **关键行为**：支持子 Agent（`PI_AGENT_SUBAGENTS_ENABLED`）、Web 读取工具、Web 搜索工具（需 Brave Search API Key）
- **已知问题**：模型可能陷入无限 thinking 循环，需要三层超时保护机制
- **验证**：参考 `docs/plans/进行中/AI对话与Agent-模型无限思考导致harness卡死.md` 中的修复方案