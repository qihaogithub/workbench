# packages/web 历史目录说明

本目录是历史遗留目录，不是当前 monorepo workspace 包，也不是默认源码入口。

当前创作端源码位于 `packages/author-site/`，使用端源码位于 `packages/viewer-site/`。除非任务明确要求追溯历史数据或迁移遗留资产，后续 Agent 不应在本目录新增或修改功能代码。

本目录下的 `data/` 仅作历史追溯参考，不参与 `pnpm dev`、`pnpm build`、`pnpm check:*` 或正式回归测试。
