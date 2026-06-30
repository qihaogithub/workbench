# banduAd页面迁移

## 背景

用户要求将 `uiweb-vue` 中的 `banduAd` 页面迁移到当前 `opencode-workbench` 项目数据中。源页面位于 `/Users/qh2/Documents/PGM/1·Work/uiweb-vue/src/pages/bandu/banduAd/`，包含手机和平板两个版本。

## 目标

- 将伴读广告手机和平板页面对齐 Vue 源页面的视觉结构、默认资源和配置项。
- 保持项目级共享配置与页面级预览尺寸边界清晰，避免 schema 字段冲突。
- 通过迁移校验脚本确认项目配置和 TSX 可编译。

## 范围

- 目标项目：`data/projects/proj_1779608460371`
- 手机 demo：`demo_1779608460372_f5g6h7`
- 平板 demo：`demo_1779608460373_h7i8j9`
- 不改动平台运行时、鉴权、截图服务或长期项目文档。

## 方案

- 项目级 schema 承载三个资源上传项：手机一行广告图、平板一行广告图、轮播广告图。
- 页面级 schema 只保留 `$demo.previewSize`，不再声明源页面不存在的标题和按钮文案。
- TSX 使用静态 OSS 图片 URL 复刻 Vue 页面切片布局，并给根容器设置明确 `height: "100vh"`。
- 手机和平板保持独立组件实现，避免为一次性页面迁移引入抽象。

## 任务清单

- [x] 读取迁移技能、文档维护技能和相关参考规则。
- [x] 定位 Vue 源页面、页面配置和目标项目。
- [x] 量取源页面关键图片尺寸，确定默认资源 URL。
- [x] 更新项目级 schema、页面级 schema 和两个 TSX demo。
- [x] 运行迁移校验脚本并记录结果。

## 进度记录

- 2026-06-29：确认 CodeGraph 数据存在但当前会话未暴露 `codegraph_*` 工具，改用 `rg` 与文件读取定位上下文。
- 2026-06-29：源页面配置 `banduAd` 包含三个上传资源：`updateImage1`、`updateImage2`、`updateImage3`。
- 2026-06-29：目标项目 `proj_1779608460371` 已存在，但当前实现是标题/按钮占位页面，不符合 Vue 源页面。
- 2026-06-29：确认源页面预览尺寸为手机 `375x812`、平板 `1133x749`；手机广告槽约 `344x180`，平板主广告槽 `1005x180`，轮播首图槽 `210x100`。
- 2026-06-29：完成项目级 schema、手机 demo 和平板 demo 迁移修正；源页面不存在的标题和按钮配置已移除。
- 2026-06-29：迁移校验脚本通过；`localhost:3200` 未运行，未进行浏览器 viewer 预览。

## 验证方式

- 运行 `node .agents/skills/uiweb-page-migrator/scripts/validate-migrated-project.mjs proj_1779608460371`。
- 如本地 `localhost:3200` 已运行，再检查 viewer 页面；否则记录限制。

验证结果：

```json
{
  "ok": true,
  "projectConfigFields": ["phoneSingleAdImage", "padSingleAdImage", "carouselAdImage"],
  "pageSchemas": 2,
  "tsxFiles": 2,
  "warnings": []
}
```

## 风险与待确认事项

- 源 Vue `phone.vue` 的 `onBeforeUnmount` 引用了未定义的 `handleAdImageUpdate`，迁移时按实际事件意图修正为 React props，不复刻该卸载 bug。
- 若 OSS 中不存在部分本地静态切片的同路径资源，预览会依赖远程资源可用性；本次按现有项目迁移习惯使用 OSS URL。

## 最终状态

已完成。此次为单个项目内容迁移，没有改变平台运行时、配置合并规则或长期产品行为，因此不更新 `docs/项目文档/`。
