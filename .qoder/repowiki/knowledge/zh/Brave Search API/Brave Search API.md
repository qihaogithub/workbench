---
kind: external_dependency
name: Brave Search API
slug: brave-search-api
category: external_dependency
scope:
    - '**'
---

### Brave Search API
- **角色**：可选的 Web 搜索工具，为 Pi Agent 提供网页搜索能力
- **集成点**：通过 `PI_AGENT_WEB_SEARCH_ENABLED` 开关控制，需要配置 `BRAVE_SEARCH_API_KEY`
- **认证协议**：API Key 认证，通过环境变量注入
- **配置项**：`PI_AGENT_WEB_SEARCH_TIMEOUT_MS`（默认10s）、`PI_AGENT_WEB_SEARCH_CACHE_TTL_MS`（默认600s）
- **状态**：默认禁用（`false`），需要显式启用并配置 API Key