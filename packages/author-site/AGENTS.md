# AGENTS.md — @opencode-workbench/author-site

> 本文件为 AI 编码代理提供在创作端包中工作的指南。进入本包前仍需先阅读根目录 `AGENTS.md`。

## 包定位

`@opencode-workbench/author-site` 是创作端 Next.js 14 App Router 应用，负责登录、项目管理、AI 对话、代码编辑、配置预览、截图联动、发布管理和管理后台。

## 关键目录

| 路径 | 说明 |
| --- | --- |
| `src/app/` | App Router 页面、布局、API routes |
| `src/app/api/` | 创作端 API 入口，响应结构需保持统一 |
| `src/components/demo/` | 项目编辑、页面树、预览、配置、截图等核心 UI |
| `src/components/ai-elements/` | AI 对话消息、工具调用、权限确认与流式展示 |
| `src/lib/` | 文件系统、session、项目、发布、模型、编译和 API client 逻辑 |
| `src/middleware.ts` | 登录鉴权、页面/API 保护和 CORS |
| `scripts/` | 包内辅助脚本，例如数据库初始化 |

## 改动边界

- API route 返回值使用 `{ success: true, data }` 或 `{ success: false, error }`，优先复用 `src/lib/fs-utils.ts` 中的 `createApiSuccess`、`createApiError`。
- 项目读写能力正在向 `@opencode-workbench/project-core` 收敛；新增项目管理能力时，优先确认是否应该进入 `project-core`，避免 Web API 与 CLI 行为分叉。
- 改登录、鉴权或 session 时，同步检查 `src/middleware.ts`、`src/lib/auth/`、`src/app/api/auth/` 和前端调用。
- 改 AI 对话时，同步检查 `src/lib/agent-client.ts`、`src/components/ai-elements/`、session API 与 agent-service 事件结构。
- 改截图或预览时，同步检查 `src/lib/screenshot-service.ts`、`src/components/demo/useScreenshotGeneration.ts`、`packages/screenshot-service/` 和相关测试。
- 不要修改 `components/`、`lib/` 根层历史兼容目录，除非确认该路径仍被当前代码引用。

## 文档维护

涉及用户可见功能、业务规则、接口契约或项目数据流变化时，先从 `docs/项目文档/INDEX.md` 找到对应模块，再更新相关需求或技术文档。

常见映射：

| 改动范围 | 文档入口 |
| --- | --- |
| 登录、注册、路由守卫 | `docs/项目文档/创作端/01-用户鉴权/` |
| 项目、页面、文件夹、版本、模板 | `docs/项目文档/创作端/03-项目管理/` |
| 配置表单、编译、预览、截图 | `docs/项目文档/创作端/04-配置与预览/` |
| AI 对话、模型配置、工具事件 | `docs/项目文档/创作端/05-AI对话/` |
| 管理后台 | `docs/项目文档/创作端/08-管理后台/` |

## 验证

优先使用根目录脚本：

```bash
pnpm check:author
```

更小范围验证：

```bash
pnpm --filter @opencode-workbench/author-site typecheck
pnpm --filter @opencode-workbench/author-site test
pnpm --filter @opencode-workbench/author-site test -- --testPathPattern="screenshot-service.test.ts"
```

跨页面关键流程需要本地服务运行后再执行：

```bash
pnpm test:e2e
```
