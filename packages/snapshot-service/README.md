# packages/snapshot-service 历史目录说明

本目录是旧截图/快照方案遗留目录，当前没有 `package.json`，不属于有效 workspace 包。

当前截图服务源码位于 `packages/screenshot-service/`。根脚本中保留的 `dev:snapshot:legacy` 仅用于历史排查，不作为默认开发、构建或回归入口。

除非任务明确要求调查旧方案，本目录不应作为功能修改入口；相关新改动应进入 `packages/screenshot-service/` 或对应项目文档。
