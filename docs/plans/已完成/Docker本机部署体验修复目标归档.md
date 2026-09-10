# Docker 本机部署体验修复目标归档

## 结论

已完成 2026-07-06 本机 OrbStack Docker 部署实测暴露的浏览端、创作端、配置预览、AI 对话和发布封面体验修复。

本次修复后的当前事实：

- 浏览端 AI 保持只读能力边界，支持本地多会话历史、新建/切换会话、模型分组或供应商展示，并兼容旧 `viewer-ai:${projectId}` 单会话数据。
- 浏览端单页预览对已发布 iframe、高保真动态预览、HTML/CSS 原型页和草图页统一使用深色设备框；项目封面发布时会从绝对路径、`public/`、仓库 `data/` 或 `DATA_DIR` 解析并复制到发布目录。
- HTML/CSS 原型页配置绑定后的 `data-bind-src` / `data-bind-href` 相对资源会继续重写为 session workspace URL，默认图片和默认文案可以进入创作端与浏览端预览。
- 创作端 AI 计划审批卡片进入消息流；发出审批请求后停止 streaming 按钮态，批准后继续执行，用户直接输入新问题时拒绝旧计划并启动新消息。
- 创作端画布单选页面显示单选工具栏，多选仍保留批量对齐工具栏；单页面编辑态图层列表支持临时隐藏/显示，切页或退出编辑态后恢复，不写回项目数据。
- 空项目或无 active page 时单页预览展示明确空状态；有源码但无预览产物时继续源码编译/实时渲染，并显示明确加载文案。
- 管理后台 `enabledModels` 存在时严格按启用列表过滤，空启用列表不再回退展示全量模型，旧缓存不可用时回退到启用列表。
- AI 正在更新且浏览器在线时同步状态优先显示“AI 正在更新”，避免把正常 AI 写入误报为“离线待同步”。
- 配置面板共享配置展示“影响 N 个页面”并可展开页面列表，移除分组字段数量 badge、“影响多个页面”和“仅当前页面”提示。

## 影响范围

- 创作端：AI 对话状态机、计划审批卡片、模型过滤、编辑页同步状态、单页无页面空状态、发布封面复制。
- `@workbench/demo-ui`：配置面板、画布单选工具栏、图层隐藏、预览加载提示、HTML/CSS 原型页绑定资源重写。
- `@workbench/shared`：原型页配置绑定支持 asset rewrite。
- 浏览端：AI 抽屉多会话与模型展示、单页预览设备框。
- 项目文档：已同步更新创作端配置与预览、创作端 AI 对话、使用端预览与配置、使用端 AI 问答及对应索引。

## 验证

已通过：

- `corepack pnpm --filter @workbench/author-site test -- --testPathPatterns=packages/author-site/src/components/demo/prototype-page-preview.test.ts packages/author-site/src/components/demo/prototype-preview-bindings.test.ts packages/author-site/src/components/demo/page-config-panel.test.tsx packages/author-site/src/lib/__tests__/ai-models.test.ts`
- `corepack pnpm --filter @workbench/author-site test -- --testPathPatterns=packages/author-site/components/demo/__tests__/ConfigFormNew.test.tsx packages/author-site/src/components/demo/preview-canvas-interaction-mode.test.tsx`
- `corepack pnpm --filter @workbench/author-site test -- --testPathPatterns=packages/author-site/src/components/demo/home-page.test.tsx --testNamePattern='模板更多菜单支持修改名称和分类'`
- `corepack pnpm --filter @workbench/author-site test -- --testPathPatterns=packages/author-site/src/components/demo/preview-canvas-interaction-mode.test.tsx --testNamePattern='页面组目录切换和拖拽缩放只更新页面组布局|文字工具在画布目标位置点击后创建文字节点'`
- `corepack pnpm --filter @workbench/viewer-site typecheck`
- `corepack pnpm check:viewer`
- `corepack pnpm check:agent`
- `corepack pnpm docker:orbstack:verify`

`corepack pnpm check:author` 的 typecheck 已通过。完整 Jest 在本轮达到 97/99 suites、667/670 tests passed，剩余 3 个失败均为重型 UI 用例在完整套件中的超时；对应 3 个具体用例按文件和 `--testNamePattern` 单独重跑均通过。

## 项目文档索引

- [创作端配置与预览](../../项目文档/创作端/04-配置与预览/INDEX.md)
- [创作端 AI 对话](../../项目文档/创作端/05-AI对话/INDEX.md)
- [使用端预览与配置](../../项目文档/使用端/02-预览与配置/INDEX.md)
- [使用端 AI 问答](../../项目文档/使用端/04-AI问答/INDEX.md)

## 后续注意

- 若后续要把本次浏览端 AI 历史体验继续向创作端完全靠齐，需要进一步抽取跨站点的纯展示对话组件；本次先保持 viewer-site 只读边界和本地多会话持久化。
- 完整 `check:author` 的 3 个超时用例需要在测试稳定性维护中处理；本次相关变更的针对性用例和 Docker 健康检查已通过。
