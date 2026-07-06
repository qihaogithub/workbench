---
covers:
  - packages/sketch-core/src/index.ts
  - packages/sketch-core/tests/sketch-core.test.ts
  - packages/sketch-react/src/index.tsx
  - packages/sketch-react/src/preview.tsx
  - packages/sketch-react/tests/sketch-react.test.tsx
  - packages/sketch-playground/src/components/SketchPlaygroundApp.tsx
  - packages/sketch-playground/src/fixtures/sketch-fixtures.ts
  - packages/shared/src/index.ts
  - packages/shared/src/workspace.ts
  - packages/project-core/src/types.ts
  - packages/project-core/src/service.ts
  - packages/project-core/src/__tests__/service.test.ts
  - packages/author-site/src/lib/authoring-feature-flags.ts
  - packages/author-site/src/lib/sketch-editor-engine.ts
  - packages/author-site/src/lib/sketch-editor-engine.test.ts
  - packages/author-site/src/lib/user-authoring-preferences.ts
  - packages/author-site/src/lib/__tests__/user-authoring-preferences.test.ts
  - packages/author-site/src/app/api/user/authoring-preferences/route.ts
  - packages/author-site/src/app/api/demos/[id]/route.ts
  - packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts
  - packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.test.ts
  - packages/author-site/src/app/demo/[id]/edit/components/SketchEditorEngineHost.tsx
  - packages/author-site/src/app/demo/[id]/edit/hooks/useVersionControl.ts
  - packages/author-site/src/app/demo/[id]/edit/page.tsx
  - packages/author-site/src/app/demo/[id]/edit/__tests__/useVersionControl.test.tsx
  - packages/agent-service/src/routes/collab.ts
  - packages/agent-service/src/collab/workspace-file-persistence.ts
  - packages/agent-service/tests/unit/collab-room-manager.test.ts
  - test/sketch-playground/sketch-playground.spec.ts
  - test/创作端E2E回归测试/sketch-page-regression.spec.ts
---

# 草图绘图 SDK

> 更新日期：2026-07-06

本文描述创作端手绘页面的自研 SDK 技术边界。业务侧定位见 [页面模块需求](../页面模块_需求文档.md)，底层文件协议见 [草图页面运行时](./04_草图页面运行时.md)。

## 1. 包边界

草图绘图能力由三个 workspace 包维护：

| 包 | 职责 |
|:---|:---|
| `@workbench/sketch-core` | 维护 `SketchSceneDocument` 协议、scene 校验、patch reducer、配置绑定、几何计算、命中测试、视觉 hash 和 SVG/HTML 只读渲染。 |
| `@workbench/sketch-react` | 提供受控 React 编辑组件、预览组件、编辑状态机、画布、工具栏、图层列表和属性检查面板。 |
| `@workbench/sketch-playground` | 提供独立开发和验证环境，用 fixtures、JSON、配置数据和性能入口验证 SDK，不依赖创作端登录或项目会话。 |

`packages/shared` 保留草图协议的兼容导出，但新服务端代码优先直接依赖 `sketch-core`。需要编辑能力的前端代码依赖 `sketch-react`；只读使用端优先依赖 `sketch-react/preview`，避免加载编辑器交互代码。

创作端手绘入口仍由 `NEXT_PUBLIC_SKETCH_SCENE_AUTHORING_ENABLED` 控制。该开关只控制创作端是否允许编辑和写入手绘 scene，不改变 `sketch-core`、`sketch-react` 和 `sketch-playground` 的保留路线。

## 2. 数据与渲染流

手绘页面的权威数据始终是 `SketchSceneDocument`。编辑器只产生更新后的 scene 或 scene patch，不把 React 状态、DOM 结构或宿主 UI 状态写入存储格式。

默认 scene、外部导入 scene、服务端 patch 结果和只读渲染输入都必须通过同一份协议校验。无效 scene 不能进入编辑状态；只读渲染遇到无效节点时可以使用安全 fallback，但应尽量保留宿主传入的合法页面尺寸，避免截图、预览或视觉 hash 看到错误画幅。

只读渲染统一从 `sketch-core` 生成 SVG/HTML。author-site 预览、viewer-site、screenshot-service 和 playground 使用同一套解析、配置绑定和视觉 hash 规则。视觉 hash 以最终 SVG 输出为准：不会影响画面的 metadata、未使用配置字段或隐藏对象不应触发截图重建；实际改变 SVG 的配置值必须改变 hash。

## 3. 编辑器宿主

创作端编辑页使用 `SketchEditorEngineHost` 承接自研 SDK。host 只负责把当前页面 scene、配置数据和预览尺寸传给 `sketch-react`，并把 `onSceneChange` 写回编辑页状态；工具栏、图层面板和属性面板都共享同一个 `useSketchEditorState` controller。

当前没有双引擎选择。`resolveSketchEditorEngine` 只会在单页预览、当前页面为 `sketch-scene`、用户进入手绘编辑态且没有查看知识文档时返回 `native`；其他情况返回 `null`。项目级和用户级 `authoringPreferences.sketchEditorEngine` 只接受 `native`，历史持久化中的其他值读取时会被忽略，不再写回新项目。

编辑器能力包括：

- 绘制矩形、圆形、线条、箭头、文本、图片和便签。
- 单选、多选、框选、拖拽、缩放、旋转、复制、删除、层级调整、左/顶对齐和水平分布。
- 锁定、隐藏、撤销、重做、方向键微调和对象属性编辑。
- 展示节点配置绑定，并允许从属性面板移除绑定；新增配置字段仍由宿主写入 `config.schema.json`。

## 4. Patch 与保存边界

Scene patch reducer 是服务端、Agent 和编辑器共享的写入门槛。`add`、`update`、`duplicate`、`group`、`reorder`、`set-locked`、`set-visible`、`bind` 和 `unbind` 等操作都先形成候选 scene，再通过协议校验后提交；非法几何、协议外节点类型、重复 id、悬空 group child 或不会产生实际变化的 patch 不应刷新 scene，也不应更新 `updatedAt`。

Session 页面文件 API 保留通用 `sketchPatch` 写入路径。服务端读取当前 session scene，检查 patch 基线是否仍匹配，再用 `applySketchScenePatchOperations` 回放生成最终 scene；如果客户端同时提交目标 scene，服务端还会确认回放结果与目标 scene 等价。验证通过后写入 `sketch.scene.json`，验证失败时返回结构化错误并记录诊断。

诊断事件只保留安全摘要。`page.sketch_patch_validated` 和 `page.sketch_patch_rejected` 记录状态、操作数、是否存在基线 key、当前/目标节点数量、目标来源和失败原因，不保存 scene、operations 或节点内容。

页面资源版本仍可携带 `sketchPatchSummary`，只记录操作数、基线标记和前后节点数，用于资源版本 metadata 审计。该摘要不参与恢复内容，也不携带 scene 或 patch operations。

## 5. 协同与自动保存

手绘 scene 使用 `page-sketch-scene` 协同资源。编辑页本地 scene 变化会进入现有 Workspace 自动保存链路：前端先把 Workspace 标记为待落盘，随后执行 Workspace flush，再通过 `persist-workspace` 推进项目当前 Workspace。

当协同文本回流到编辑页时，前端必须先用 `SketchSceneDocument` 解析；解析失败不能覆盖本地 scene。服务端 flush 前也会用文件哈希基线防止旧协同房间覆盖已经被 AI 工具或其他外部写入推进过的磁盘文件。

## 6. 验证入口

保留的验证入口如下：

| 范围 | 命令 |
|:-----|:-----|
| 协议、patch、渲染和视觉 hash | `corepack pnpm check:sketch-core` |
| React 编辑器与预览组件 | `corepack pnpm check:sketch-react` |
| 独立 playground 类型检查 | `corepack pnpm check:sketch-playground` |
| Playground 浏览器冒烟 | `corepack pnpm test:e2e:sketch-playground` |
| 创作端手绘编辑态回归 | `corepack pnpm test:e2e -- sketch-page-regression.spec.ts` |
| 创作端类型与单测 | `corepack pnpm check:author` |

`corepack pnpm check:all` 应覆盖 `sketch-core`、`sketch-react` 和 `sketch-playground`，不包含已删除的第三方编辑器命令。
