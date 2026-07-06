# 创作端手绘删除 OpenPencil 方案目标任务

## 当前状态

本任务取代 `创作端手绘OpenPencil绘图工具目标任务.md` 的继续接入方向。创作端手绘后续全面转向自研 SDK：`@workbench/sketch-core`、`@workbench/sketch-react` 和 `@workbench/sketch-playground` 是保留路线，OpenPencil 编辑岛、OpenPencil postMessage bridge、OpenPencil 专用保存/冲突/诊断能力不再继续建设。

执行本任务时，把 OpenPencil 视为已废弃方案，而不是待完善实验能力。目标不是隐藏入口或关闭 feature flag，而是从源码、workspace、测试、脚本、项目文档和用户可见偏好中彻底移除 OpenPencil 方案。

## 当前结论

仓库中已经存在两条并行手绘 SDK 路线：

- 自研路线：`packages/sketch-core/`、`packages/sketch-react/`、`packages/sketch-playground/`，以 `SketchSceneDocument` 为权威协议，继续保留并作为唯一手绘编辑方向。
- OpenPencil 路线：`packages/sketch-openpencil-editor/`、`packages/shared/src/openpencil-adapter.ts`、author-site 的 `OpenPencilSpikeFrame`/engine switch、OpenPencil 保存 patch 摘要、图片代理、诊断事件、E2E 和文档描述，全部进入删除范围。

删除后，创作端不再存在 `native/openpencil` 双引擎选择；如果草图页仍处于暂停暴露状态，应继续按自研 SDK 计划控制入口，不再通过 OpenPencil feature flag 或“新版手绘编辑器”偏好决定行为。

## 目标

- 删除 OpenPencil 编辑器 workspace 包、构建产物、依赖、脚本、Playwright 配置和 E2E。
- 删除 author-site 中 OpenPencil iframe host、图层/属性抽屉适配、OpenPencil 保存/合并/冲突恢复 UI 和相关状态。
- 删除 `@workbench/shared` 对 OpenPencil postMessage contract 的导出。
- 删除 OpenPencil 专用 API、诊断事件、图片代理、安全配置、CLI/项目偏好枚举和测试。
- 清理项目文档、plans、OPS 自动化说明、外部 OpenPencil 文档镜像和用户可见文案。
- 保证删除后自研 `sketch-core/sketch-react/sketch-playground` 仍能通过验证，`check:all` 不再引用 OpenPencil。

## 非目标

- 不删除 `SketchSceneDocument`、`sketch-core`、`sketch-react`、`sketch-playground` 或现有自研草图协议。
- 不顺手重启草图页产品入口；入口是否重新暴露由自研 SDK 方案另行验收。
- 不保留 OpenPencil 兼容别名、环境变量或“暂时禁用”代码分支。
- 不删除运行时 `data/` 下历史 E2E 项目、审计日志或本机生成数据，除非用户在实施窗口明确要求数据清理。

## 执行原则

- 先用 CodeGraph 和 `rg` 做 inventory，再删除；每个删除点都要确认是否仍被 import、脚本或文档引用。
- 删除优先于重命名。不要把 OpenPencil 文件改名成通用文件继续保留，除非其中有明确可复用的自研 SDK 逻辑，且已去除第三方依赖和 OpenPencil 语义。
- 自研手绘 SDK 是唯一保留方向。若某段逻辑只服务 OpenPencil patch-only 保存、iframe bridge、CanvasKit/font 探测或 OpenPencil 图片 hydrate，应删除而不是迁移。
- 修改 `docs/项目文档/` 时使用 `doc-maintainer` 技能；修改 `docs/plans/` 不使用该技能。
- 删除后用字面量搜索收口：`OpenPencil|openpencil|OPENPENCIL|open-pencil|sketch-openpencil|openpencil-spike` 在源码、测试、脚本和项目文档中不应再出现。

## 任务清单

### Phase 0：删除前核查

- [ ] 确认工作区为 `/Users/qh2/Documents/PGM/1·Work/workbench`，不要使用旧 `opencode-workbench` 路径。
- [ ] 运行 `git status --short`，记录本次删除前已有用户改动，后续不要回滚无关变更。
- [ ] 用 CodeGraph 查 OpenPencil 结构入口：`OpenPencilSpikeFrame`、`resolveSketchEditorEngine`、`openpencil-adapter`、`SketchEditorEngineHost`。
- [ ] 用 `rg -l "OpenPencil|openpencil|OPENPENCIL|open-pencil|sketch-openpencil|openpencil-spike"` 生成删除 inventory，排除 `node_modules/`、`dist/`、`coverage/`、`out/`、`data/` 后逐项处理。
- [ ] 用 `git ls-files` 区分受版本控制文件和本地生成物；生成物只在删除包目录时一并清掉，不单独纳入业务判断。

### Phase 1：删除 workspace 包、依赖和根脚本

- [ ] 删除 `packages/sketch-openpencil-editor/`，包括 Vue app、adapter facade、asset checker、Vite 配置、SDK 构建配置和已生成 `dist/`。
- [ ] 如本地或索引中仍存在旧实验包 `packages/openpencil-spike/`，确认真实存在后删除。
- [ ] 从根 `package.json` 删除 `dev:sketch-openpencil`、`dev:openpencil-spike`、`check:sketch-openpencil`、`check:openpencil-spike`、`test:e2e:openpencil-spike`、`test:e2e:openpencil-author`。
- [ ] 从 `check:all` 删除 OpenPencil check，保留 `check:sketch-core`、`check:sketch-react`、`check:sketch-playground`。
- [ ] 更新 `pnpm-lock.yaml`，移除仅由 OpenPencil 包引入的 `@open-pencil/core`、`@open-pencil/vue`、`canvaskit-wasm`、`vue`、`@vitejs/plugin-vue`、`vue-tsc`、`vite` 等依赖项；保留仍被其他包使用的依赖。
- [ ] 确认 `pnpm-workspace.yaml` 不需要额外改动；它使用 `packages/*`，删除目录即可退出 workspace。

### Phase 2：收敛创作端手绘引擎为自研 SDK

- [ ] 删除 `packages/author-site/src/lib/authoring-feature-flags.ts` 中 `OPENPENCIL_SKETCH_SPIKE_ENABLED` 和 `OPENPENCIL_SPIKE_EDITOR_URL`，保留普通草图 authoring 开关。
- [ ] 删除或重写 `packages/author-site/src/lib/sketch-editor-engine.ts`：不再返回 `"openpencil"`；如仍需要函数，结果只允许自研/native；否则直接移除 engine resolver。
- [ ] 更新 `packages/author-site/src/lib/sketch-editor-engine.test.ts`，删除 OpenPencil 开关和偏好用例，改为验证自研 SDK/暂停入口策略。
- [ ] 从 `packages/author-site/src/components/settings/settings-button.tsx` 删除“新版手绘编辑器/经典手绘编辑器”选择项和 `sketchEditorEnginePreference` 保存逻辑。
- [ ] 从 `UserAuthoringPreferences`、项目 `authoringPreferences` 读写路径、API route 和 CLI 中移除 `openpencil` 枚举值；如仍保留 `sketchEditorEngine` 字段，只允许 `native` 或迁移为无意义字段后删除。
- [ ] 更新 `packages/shared/src/workspace.ts`、`packages/project-core/src/service.ts`、`packages/project-cli/src/index.ts`、`packages/author-site/src/app/api/demos/[id]/route.ts` 中的偏好校验和错误文案。
- [ ] 为历史项目中已有 `authoringPreferences.sketchEditorEngine = "openpencil"` 制定兼容策略：读取时忽略或规范化为自研/native，不再把该值写回新项目。

### Phase 3：删除 OpenPencil host bridge 和保存链路

- [ ] 删除 `packages/author-site/src/app/demo/[id]/edit/components/OpenPencilSpikeFrame.tsx` 及其单测。
- [ ] 简化 `packages/author-site/src/app/demo/[id]/edit/components/SketchEditorEngineHost.tsx`：移除 OpenPencil imports、state、commands、layer drawer、inspector panel、iframe stage 分支；若组件只剩薄 wrapper，可合并回 edit page 或改名为自研 SDK host。
- [ ] 从 `packages/author-site/src/app/demo/[id]/edit/page.tsx` 删除 OpenPencil imports、active engine 判断、iframe 渲染分支、patch summary ref、保存回调、加载最新、合并本次改动、冲突恢复和相关诊断事件。
- [ ] 删除 `packages/author-site/src/app/demo/[id]/edit/lib/openpencil-patch-summary.ts`、`openpencil-merge-conflict.ts`、`openpencil-save-error.ts` 及对应测试。
- [ ] 检查 `createResourceVersion`、命名版本和自动检查点路径，删除 `sketchPatchSummary` 中 OpenPencil 专用缓存来源；保留与自研 SDK/服务端 patch 通用的安全摘要能力。
- [ ] 检查 session page file API：删除仅为 `OPENPENCIL_SKETCH_SPIKE_ENABLED` 放行的写入条件；保留自研草图 authoring 的合法写入路径。
- [ ] 保留 `sketch-core` 的 patch reducer 和服务端 patch 校验；只删除 OpenPencil 命名、OpenPencil dirty-state fallback 和 iframe draft 兼容路径。

### Phase 4：删除共享 contract、图片代理和诊断

- [ ] 删除 `packages/shared/src/openpencil-adapter.ts`。
- [ ] 从 `packages/shared/src/index.ts` 和 `packages/shared/package.json` 删除 `openpencil-adapter` 导出。
- [ ] 删除 `packages/author-site/src/lib/openpencil-adapter.test.ts`。
- [ ] 删除 `/api/openpencil/image-proxy` route 和测试：`packages/author-site/src/app/api/openpencil/image-proxy/`。
- [ ] 删除 `OPENPENCIL_IMAGE_PROXY_*` 环境变量读取、诊断 payload、限流/SSRF 说明；如图片代理有自研 SDK 复用价值，另建通用 `/api/assets/image-proxy` 方案，不在本删除任务内顺手改造。
- [ ] 从 `packages/shared/src/diagnostics.ts`、`packages/author-site/src/lib/editor-diagnostics/types.test.ts`、`OPS/automations/diagnostics/editor-diagnostics.md` 删除 `page.openpencil_*` 事件和说明。
- [ ] 如服务端仍保留 `page.sketch_patch_validated` / `page.sketch_patch_rejected` 通用事件，确认它们不再引用 OpenPencil，继续服务自研 SDK patch。

### Phase 5：删除 OpenPencil 测试、E2E 和 fixtures

- [ ] 删除 `test/openpencil-spike/`。
- [ ] 删除 `test/创作端E2E回归测试/openpencil-author-regression.spec.ts`。
- [ ] 删除 `test/创作端E2E回归测试/openpencil-author.playwright.config.ts`。
- [ ] 删除 author-site 中所有 OpenPencil 专用单测，或改写为自研 SDK 行为测试。
- [ ] 更新 project-cli 测试中 `openpencil` authoring preference 示例，改成自研/native 或删除该偏好场景。
- [ ] 用 `rg` 确认测试目录不再出现 `OPENPENCIL`、`openpencil-spike`、`sketch-openpencil`。

### Phase 6：文档和计划收口

- [ ] 删除 `docs/external/openpencil/` 本地第三方文档镜像。
- [ ] 将 `docs/plans/进行中/创作端手绘OpenPencil绘图工具目标任务.md` 压缩为废弃说明，或移动到 `docs/plans/已完成/` 作为“已放弃 OpenPencil 路线”的短归档；不要继续保留原先待办矩阵。
- [ ] 更新 `docs/plans/进行中/创作端草图绘图SDK方案.md`，明确自研 SDK 是唯一手绘方向，OpenPencil 已删除。
- [ ] 使用 `doc-maintainer` 更新 `docs/项目文档/创作端/02-Demo管理/技术/05_草图绘图SDK.md`：删除 OpenPencil 编辑岛、双引擎、CanvasKit、图片代理、OpenPencil E2E、OpenPencil 验证命令和 OpenPencil 保存冲突说明。
- [ ] 使用 `doc-maintainer` 更新相关索引和诊断文档：`docs/项目文档/INDEX.md`、`docs/项目文档/创作端/02-Demo管理/INDEX.md`、`docs/项目文档/创作端/11-诊断与日志/`。
- [ ] 全仓文档搜索 `OpenPencil|openpencil|OPENPENCIL|open-pencil`，只允许删除计划或已完成归档中出现一次性历史说明；最终归档后 `进行中` 文档也不再保留 OpenPencil 待办。

### Phase 7：删除后验证

- [ ] `corepack pnpm install --lockfile-only` 或等价方式更新 lockfile。
- [ ] `corepack pnpm check:sketch-core`
- [ ] `corepack pnpm check:sketch-react`
- [ ] `corepack pnpm check:sketch-playground`
- [ ] `corepack pnpm check:project-core`
- [ ] `corepack pnpm check:project-cli`
- [ ] `corepack pnpm check:author`
- [ ] `corepack pnpm check:all`
- [ ] 如触及创作端草图 UI 或保存路径，额外运行当前有效的创作端 E2E；不要再运行已删除的 OpenPencil E2E。
- [ ] 最终运行字面量收口：

```bash
rg -n "OpenPencil|openpencil|OPENPENCIL|open-pencil|sketch-openpencil|openpencil-spike" \
  --glob '!node_modules/**' \
  --glob '!coverage/**' \
  --glob '!dist/**' \
  --glob '!out/**' \
  --glob '!data/**'
```

## 验收定义

任务完成时必须同时满足：

- `packages/sketch-openpencil-editor/` 不存在，workspace、lockfile、根脚本和 `check:all` 不再引用 OpenPencil。
- author-site 没有 iframe OpenPencil 编辑器、OpenPencil host command、OpenPencil 图片代理、OpenPencil 保存浮层或 OpenPencil 引擎偏好。
- `@workbench/shared` 不再导出 OpenPencil adapter，项目 CLI/API 不再接受 `openpencil` 作为新写入偏好。
- OpenPencil 专用 E2E、Playwright 配置、单测和 OPS 诊断说明已删除或改写。
- 项目长期文档与代码一致：手绘方向只描述自研 `sketch-core/sketch-react/sketch-playground`。
- 删除后的验证命令通过；如果某个验证因环境问题无法运行，最终回复必须记录命令、失败原因和剩余风险。

## 风险

- OpenPencil 保存链路里已有部分通用 patch-first 能力；删除时要区分“OpenPencil dirty-state fallback”与“`sketch-core` patch reducer”。前者删除，后者保留。
- 历史项目可能已经写入 `authoringPreferences.sketchEditorEngine = "openpencil"`。读取层要兼容旧值，不能让项目打开失败。
- 文档中 OpenPencil 描述很多，单纯删代码会让下一轮代理被旧文档误导；文档同步是本任务验收的一部分。
- 删除 `/api/openpencil/image-proxy` 可能影响当前 OpenPencil 图片 hydrate，但该能力不应保留为孤立公共代理；如自研 SDK 后续需要图片代理，应另起通用设计。
- `data/` 下 OpenPencil E2E 运行记录会继续被 `rg` 找到；它不是源码验收范围，除非另行做本机数据清理。

## 新窗口接手顺序

1. 先做 Phase 0 inventory，确认真实文件和旧索引差异。
2. 从 workspace 包和根脚本开始删，先让 `pnpm` 不再认识 OpenPencil 包。
3. 再收敛 author-site engine 分支，确保编辑页只走自研 SDK/当前暂停策略。
4. 删除 shared adapter、图片代理、诊断、测试。
5. 最后用 `doc-maintainer` 更新长期项目文档，并用 `rg` 做 OpenPencil 字面量收口。
6. 跑 Phase 7 验证矩阵，失败时只修删除导致的问题，不顺手重构无关模块。
