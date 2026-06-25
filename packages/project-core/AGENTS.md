# AGENTS.md — @opencode-workbench/project-core

> 本文件为 AI 编码代理提供在项目核心服务包中工作的指南。进入本包前仍需先阅读根目录 `AGENTS.md`。

## 包定位

`@opencode-workbench/project-core` 是 Node-only 项目读写领域服务层，目标是让创作端 Web API、Project Admin CLI 和未来自动化入口复用同一套项目管理能力。

## 关键目录

| 路径 | 说明 |
| --- | --- |
| `src/service.ts` | 项目、模板、页面、文件夹、配置、发布检查等领域操作 |
| `src/types.ts` | CLI 与 Web API 可复用的稳定业务类型 |
| `src/cli-prompt.ts` | CLI 使用提示词与命令速查生成 |
| `src/__tests__/` | 使用临时目录的单元测试 |

## 改动边界

- 本包只承载确定性的项目读写和校验逻辑，不依赖 Next.js、React、Fastify 或浏览器 API。
- Web API 与 CLI 都应调用本包，不要在调用方复制项目读写逻辑。
- 文件系统写入必须围绕显式 `dataDir` 或测试临时目录，测试不得直接修改仓库根 `data/`。
- 对外返回结构应保持业务语义稳定，不泄漏内部文件布局作为调用契约。
- 涉及删除、覆盖、发布前检查等高风险操作时，优先提供 dry-run 或明确的错误结构。

## 文档维护

改动项目、模板、页面、文件夹、发布检查或 CLI 共享能力时，同步检查：

- `docs/plans/进行中/创作端项目管理CLI本地开发长期方案.md`
- `docs/项目文档/创作端/03-项目管理/`

## 验证

优先使用根目录脚本：

```bash
pnpm check:project-core
```

更小范围验证：

```bash
pnpm --filter @opencode-workbench/project-core typecheck
pnpm --filter @opencode-workbench/project-core test
```
