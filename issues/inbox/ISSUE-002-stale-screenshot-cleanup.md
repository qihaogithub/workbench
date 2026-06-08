# ISSUE-002: 过期截图缺乏清理机制

## 1. 元信息

- 类型：Feature
- 优先级：Medium
- 状态：Todo
- 创建来源：Issue Builder
- 是否需要代码修改：Yes

## 2. 用户原始描述

过期截图缺乏清理机制

## 3. 任务背景

截图服务（`screenshot-service`）为每个页面生成 PNG 截图并存储在 `data/screenshots/{projectId}/` 目录下。每个页面会保留当前版本和最多 5 个历史版本（`maxHistoryFiles: 5`）。随着时间推移，截图文件会不断积累。

## 4. 当前问题 / 当前需求

当前系统存在多个层面的截图清理缺失：

**4.1 项目删除不清理截图**

`deleteProject` 函数仅删除 `data/projects/{projectId}/` 目录，不清理对应的 `data/screenshots/{projectId}/` 目录。

实际数据验证：当前存在 4 个孤儿截图目录（`demo_1780550141175_a79047`、`nocache_1780559486887`、`speed_test_3`、`test_project`），其对应的项目已不存在。

**4.2 页面删除不清理截图**

页面被删除后，其在 `data/screenshots/{projectId}/` 下的截图文件（`{pageId}.png`、`{pageId}.{hash}.png`、`{pageId}.meta.json`）仍然保留。

**4.3 历史版本仅按页面粒度清理**

`cleanupOldScreenshots` 仅在每次新截图生成时对当前页面的旧 hash 版本做清理（保留 `maxHistoryFiles: 5` 个）。无全局性定期清理机制。

**4.4 无磁盘用量监控或上限**

截图目录无总大小限制或告警。当前 `data/screenshots/` 占用 6.5MB，其中 `proj_1779608460378` 单独占 5.5MB（63 个文件）。

## 5. 期望结果

- 项目删除时，对应的截图目录应被同步清理
- 页面删除时，该页面的所有截图文件应被同步清理
- 孤儿截图目录（无对应项目的截图目录）应有定期清理或按需清理机制
- 截图目录应有磁盘用量上限或告警机制

## 6. 影响范围

- `data/screenshots/` 目录磁盘空间持续增长
- 已删除项目的孤儿截图文件永久残留
- 已删除页面的截图文件永久残留
- 部署环境（Docker/本地）的存储消耗

## 7. 相关代码文件路径

### 高相关

- `packages/screenshot-service/src/utils/screenshot-store.ts`
  - 关联原因：截图存储核心模块，包含唯一的清理函数 `cleanupOldScreenshots`
  - 证据：`cleanupOldScreenshots`（L167-198）仅按页面粒度清理不在 `history` 列表中的旧 hash 文件；`writeScreenshot`（L97-121）每次生成新截图后调用此清理
  - 置信度：High

- `packages/author-site/src/lib/fs-utils.ts`
  - 关联原因：项目/页面删除逻辑所在，删除时未清理截图
  - 证据：`deleteProject`（L1055-1064）仅 `rmSync` 项目目录，不涉及 `data/screenshots/`
  - 置信度：High

- `packages/screenshot-service/src/routes/screenshots.ts`
  - 关联原因：截图生成路由，清理的唯一触发点
  - 证据：L122 `cleanupOldScreenshots(projectId, pageId).catch(() => {})` 是清理函数的唯一调用处
  - 置信度：High

### 中相关

- `packages/screenshot-service/src/config.ts`
  - 关联原因：截图存储配置，包含 `maxHistoryFiles`、`dataDir` 等
  - 证据：`maxHistoryFiles: 5`（L33）、`dataDir` 指向 `data/screenshots`（L12-13）
  - 置信度：Medium

- `packages/author-site/src/lib/project-api.ts`
  - 关联原因：包含 `deleteDemoPage` API 调用
  - 证据：`deleteDemoPage`（L188）发送删除请求但不涉及截图清理
  - 置信度：Medium

- `packages/author-site/src/app/api/demos/[id]/route.ts`
  - 关联原因：项目删除的 API 路由入口
  - 证据：调用 `deleteProject(id)` 后无截图清理步骤
  - 置信度：Medium

- `packages/author-site/src/app/api/screenshots/ensure/route.ts`
  - 关联原因：新增的截图补生 API，增加了截图生成的触发点
  - 证据：POST 端点调用截图服务 `generate-batch`，会生成更多截图文件
  - 置信度：Medium

### 低相关

- `packages/agent-service/src/workspace/project-workspace-manager.ts`
  - 关联原因：Agent 服务也有项目删除逻辑
  - 证据：`deleteProject`（L269）同样不涉及截图清理
  - 置信度：Low

- `docker-compose.yml`
  - 关联原因：Docker 部署中 screenshot-service 的数据卷配置
  - 证据：截图目录的挂载方式影响存储持久化
  - 置信度：Low

## 8. 执行约束

- 截图清理必须保证不删除当前正在使用的截图（`meta.json` 中的 `currentHash` 对应的文件）
- 项目删除时的截图清理应为同步操作（不能异步 fire-and-forget，否则可能因进程退出而遗漏）
- 清理操作不应阻塞主业务流程（如截图生成、页面加载）
- 需兼容 `data/screenshots/` 和 `data/projects/` 可能位于不同路径的部署场景（通过 `DATA_DIR` 环境变量）

## 9. 不要做的事

- 不要修改截图生成逻辑（`generateScreenshot` 函数）
- 不要修改 `meta.json` 的数据结构
- 不要修改截图服务的路由接口（`/generate`、`/generate-batch`、`/file`、`/status`）
- 不要引入外部存储清理服务

## 10. 验收标准

- [ ] 删除项目后，对应的 `data/screenshots/{projectId}/` 目录被清理
- [ ] 删除页面后，该页面在 `data/screenshots/{projectId}/` 下的所有文件（`.png`、`.meta.json`）被清理
- [ ] 存在孤儿截图目录的清理机制（定期扫描或手动触发 API）
- [ ] 清理操作不影响正在使用的截图文件

## 11. 建议验证方式

1. 创建一个测试项目，生成截图后删除项目，确认 `data/screenshots/` 下对应目录已清理
2. 在测试项目中删除一个页面，确认该页面的截图文件已清理
3. 运行孤儿清理后，确认不再存在无对应项目的截图目录
4. 验证清理前后，首页和编辑页的截图显示不受影响

## 12. 不确定信息

- 截图服务的 `dataDir` 是否可能与 author-site 的 `DATA_DIR` 在不同物理路径——当前默认值相同（`data/screenshots` 相对于 `data/`），但环境变量可分别配置
- 是否有大量并发删除场景需要考虑竞态条件

## 13. 完成后必须输出

- 修改文件列表
- 如何验证
- 遗留风险
