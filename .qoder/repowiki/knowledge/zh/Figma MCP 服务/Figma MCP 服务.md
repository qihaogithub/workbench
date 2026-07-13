---
kind: external_dependency
name: Figma MCP 服务
slug: figma-mcp-服务
category: external_dependency
scope:
    - '**'
---

### Figma MCP 服务
- **角色**：Figma 设计工具的 Model Context Protocol (MCP) 接口，允许 AI Agent 访问 Figma 设计文件
- **集成点**：agent-service 通过 `FIGMA_MCP_URL`（默认 https://mcp.figma.com/mcp）和 `FIGMA_MCP_REGION` 配置连接
- **用户授权**：author-site 提供 OAuth 流程，需要配置 `FIGMA_OAUTH_CLIENT_ID`、`FIGMA_OAUTH_CLIENT_SECRET`、`FIGMA_OAUTH_REDIRECT_URI` 等
- **认证协议**：OAuth 2.0 + MCP 协议组合，用户级授权而非全局配置
- **用途**：AI 编辑时可以读取 Figma 设计信息，辅助代码生成