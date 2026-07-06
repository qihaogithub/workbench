# AGENTS.md - project-scaffold

> 本包负责创作端项目包协议与本地脚手架转换。它是 `project-cli`、后续 Web 下载包和模板本地开发共同复用的转换层。

## 边界

- 可以读取本地 `workbench.project.json`、`.workbench/sync-state.json` 和脚手架源码文件。
- 可以通过 `ProjectAdminService` 读取或提交线上项目数据。
- 不负责解析 CLI 参数、打印终端文本、启动 dev server、安装依赖或管理 Web 路由。
- 不直接操作 `data/projects/*/workspace` 的内部文件；线上读写必须经过 `project-core`。

## 代码约定

- 对外导出稳定函数和类型，优先返回 `ProjectAdminResult<T>`。
- 本地项目包协议变更时同步更新计划文档和项目管理技术文档。
- 新增能力需要覆盖 `src/scaffold.test.ts`，并运行 `pnpm check:project-scaffold`。
- 不新增 `as any`、`@ts-ignore`、`@ts-expect-error`。

## 验证

```bash
pnpm check:project-scaffold
pnpm check:project-cli
```
