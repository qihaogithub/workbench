# AfterClass页面迁移

> 状态：已完成  
> 完成日期：2026-06-29

## 背景

用户要求将本机 `uiweb-vue` 项目中的 AfterClass（课后服务）页面迁移到 `opencode-workbench` 项目数据。源页面位于 `/Users/qh2/Documents/PGM/1·Work/uiweb-vue/src/pages/APP_learning/AfterClass/`，包含手机和平板两个 Vue 组件。

## 目标

- 将 AfterClass 手机和平板页面在目标项目中还原为 React TSX Demo。
- 保持广告图、状态导航图、服务卡片、指导师头像、入口图标、文案和预览尺寸与源页面一致。
- 遵守项目级与页面级 schema 字段边界，避免配置字段冲突。

## 范围

- 目标项目：`data/projects/proj_1779608458649`（学习页-课后）。
- 目标页面：
  - `demo_1779608460500_a1b2c3`（课后服务-手机）
  - `demo_1779608461000_d4e5f6`（课后服务-平板）
- 不处理重复草稿项目 `proj_1779608460370`。
- 不修改平台运行时代码。

## 方案

- 项目级 schema 保留跨手机和平板共用的 `bannerImage`。
- 页面级 schema 保留页面预览尺寸；手机页保留已有 `serviceTitle` 默认值。
- TSX 组件使用远程 OSS 图片地址复刻 Vue 资源，不新增本地资源文件。
- 根容器显式设置 `height: '100vh'`，避免预览 iframe 内高度计算异常。
- 修正平板 banner 高度为 Vue 源页面的 `112px`。

## 任务清单

- [x] 定位 Vue 源页面、资源和可配置事件。
- [x] 识别目标项目和 demo 页面。
- [x] 读取目标 project/page schema 与 TSX。
- [x] 修正目标 TSX 视觉差异。
- [x] 运行迁移验证脚本。
- [x] 记录最终验证结果和剩余风险。

## 进度记录

- 2026-06-29：定位源页面 `APP_learning/AfterClass/phone.vue` 与 `pad.vue`，源页面仅通过 `updateImage1` 更新广告图。
- 2026-06-29：确认 `proj_1779608458649` 是已发布且结构完整的“学习页-课后”项目，`proj_1779608460370` 是未发布重复草稿，本次不处理。
- 2026-06-29：预验证 `node .agents/skills/uiweb-page-migrator/scripts/validate-migrated-project.mjs proj_1779608458649` 通过，后续只做局部视觉修正。
- 2026-06-29：完成目标 TSX 局部修正：手机和平板根容器显式设置 `height: '100vh'`，平板预览宽度改为 `1133`，平板 banner 高度改为 `112px`，并把 `bannerImage` 收敛为显式 props。
- 2026-06-29：最终验证通过：迁移脚本返回 `ok: true`，项目级字段为 `bannerImage`，检测到 2 个页面 schema 和 2 个 TSX 文件，无 warning。
- 2026-06-29：本机 `http://localhost:3200` 未运行，未执行 viewer 路由视觉验证。

## 验证方式

- 运行 `node .agents/skills/uiweb-page-migrator/scripts/validate-migrated-project.mjs proj_1779608458649`。
- 若需要更大范围验证，再根据改动范围补充 author-site 检查；本次不修改运行时代码，优先使用迁移脚本验证。

## 风险与待确认事项

- 当前仓库存在大量与本任务无关的 dirty changes，本任务只修改 AfterClass 目标项目和本计划文档。
- 本次迁移使用源项目中的 OSS 图片 URL，不复制本地图片文件。
- 未运行 author-site 端到端视觉验证；当前已通过迁移脚本的 JSON、schema 冲突、previewSize 和 TSX 转译检查。
