# 创作端编辑页：AI 自动修复循环与 WMA 外部漂移

## 当前状态

已解决。2026-07-22 通过 Workspace Authority journal 定死整文件倍增根因，修复协同落盘前的全文重复守卫，并通过项目管理 CLI 将现存 8 份重复页恢复为单份。此前 2026-07-13 的消息初始化、修复计数器页面预算、Schema 上下文注入和渲染防御性处理继续保留。

## 问题背景

页面 `product-showcase_a3f2` 每次打开创作端编辑页都触发 AI 自动修复预览，提示：

- 阶段：`module_parse`
- 代码：`DUPLICATE_TOP_LEVEL_DECLARATION`
- 错误：顶层声明 `features` 重复，浏览器会拒绝导入该模块

现象上 AI 修复后问题不保存，重新打开项目仍会触发同样的自动修复。

## 当前结论

### 2026-07-22 根因闭环：重复来自协同落盘，不是 AI 或导出

同一项目的新 live Workspace 保留了完整的内容寻址备份和 mutation journal。`product-showcase_a3f2/index.tsx` 在 AI run 开始前被三次 `collab_autosave` 依次从单份放大为 2、4、8 份，源码字符长度严格按 `7286 → 14572 → 29144 → 58288` 翻倍。后续 AI、author-site 保存、canonical 物化和导出只是在传播已经污染的全文。

服务端已有落盘前重复守卫，但旧算法按换行切半。源码以换行结尾时，两个完整副本拼接后会得到奇数个数组项，旧算法跳过的并不是副本间分隔行，因此真实的 2、4、8 份内容全部漏检。当前守卫先按原始字符串严格切半并递归收敛，再保留历史行级和 JSON 兼容检测；测试覆盖尾部换行、2/4/8 份重复和局部相似源码不误判。

### 根因 1：文件被完整重复拼接

`data/projects/proj_1783334663364_30hsrv/workspace/demos/product-showcase_a3f2/index.tsx` 中整个组件被重复写入了两次：

- 第 8 行第一次 `const features = [...]`
- 第 165 行第二次 `const features = [...]`
- 第 15–158 行与第 172–315 行为两个完全相同的 `ProductShowcase` 组件

这导致 `@workbench/preview-contract` 的 module preflight 命中 `DUPLICATE_TOP_LEVEL_DECLARATION`。

### 根因 2：直接修改文件触发 WMA 外部漂移保护

本项目已落地 WMA（Workspace Mutation Authority）。WMA 的不变量 INV-1 规定：live workspace 激活后，只有 Authority 可以改变其受管资源，任何裸 `fs.write*`、`rm`、shell 重定向都属于违规。

初次排查时直接用 `head` / `SearchReplace` 修改 live workspace 文件，导致 Authority 在 `getSnapshot`/`recover` 时发现实际文件 hash 与 `state.rootHash` 不一致，抛出：

- `WORKSPACE_EXTERNAL_DRIFT`
- 后续 `readFile`、`flushRoom`、Agent `writeFile` 均被拒绝

这正是“AI 修复后无法保存”的技术表现：文件虽然被改掉，但 WMA 不再接受该 workspace 的任何 mutation。

### 根因 3：浏览器仍连接旧的损坏 workspace

用户当前会话绑定到 live workspace `live-1783910193820-6dn45z82f`。即使 canonical workspace 已修复，只要该 live workspace 和 authority state 仍在，刷新页面时仍会复用旧的脏状态。

## 修复方案

1. **修复 canonical workspace**  
   截断 `data/projects/proj_1783334663364_30hsrv/workspace/demos/product-showcase_a3f2/index.tsx`，只保留第一个完整组件（158 行）。

2. **删除损坏的 live workspace**  
   移除 `data/workspaces/projects/proj_1783334663364_30hsrv/live-1783910193820-6dn45z82f`。

3. **清理对应的 Authority 注册状态**  
   移除 `data/workspace-authority/live-1783910193820-6dn45z82f`，避免启动恢复时 `WORKSPACE_NOT_FOUND`。

4. **重启服务**
   - author-site（端口 3200）
   - agent-service（端口 3201）

5. **用户侧操作**  
   关闭当前标签页，重新访问：  
   `http://localhost:3200/demo/proj_1783334663364_30hsrv/edit`  
   系统会从修复后的 canonical workspace 创建新的 live workspace。

## 相关代码路径

- 预览校验：`packages/preview-contract/src/runtime.ts`
  - `collectTopLevelModuleIssues`
  - `createDuplicateTopLevelDeclarationIssue`
- AI 工具写入后的校验：`packages/agent-service/src/backends/pi-tools/preview-validation.ts`
  - `validatePreviewFileWrite`
- 文件写入路径：`packages/agent-service/src/backends/pi-tools/file-tools.ts`
  - `createWriteFileTool` → `liveWorkspace.authority.mutate`
- WMA 漂移检测：`packages/agent-service/src/workspace/workspace-mutation-authority.ts`
  - `getSnapshot` 中 `actualRootHash !== state.rootHash` 抛出 `WORKSPACE_EXTERNAL_DRIFT`
  - `recover` 中注册 workspace 与实际目录不匹配抛出 `WORKSPACE_NOT_FOUND`
- 启动恢复：`packages/agent-service/src/workspace/workspace-authority-startup-recovery.ts`
  - `recoverWorkspaceAuthoritiesOnStartup`
- 前端自动修复触发：`packages/author-site/src/app/demo/[id]/edit/page.tsx`
  - `handlePreviewError`（约 1982–2125 行）
  - `setTriggerAutoSend({ kind: "auto_repair" })`
- 自动修复提示渲染：`packages/author-site/src/components/ai-elements/ai-chat.tsx`
  - `triggerAutoSend` useEffect
- 修复历史防重：`packages/author-site/src/lib/auto-preview-repair-guard.ts`

## 验证状态

- [x] canonical workspace `product-showcase_a3f2/index.tsx` 仅有一个 `features` 声明
- [x] `validatePreviewPageSource` 校验通过，无 `DUPLICATE_TOP_LEVEL_DECLARATION`
- [x] 同项目另一页面 `contact-section_k8m2/index.tsx` 无重复声明
- [x] agent-service `/health` 返回 `workspaceAuthorityRecovery.state: ready`
- [x] 用户重新打开项目后确认不再显示"正在修复预览"

## 风险与后续事项

1. **直接改文件不是正确修复方式**。后续若再遇到 workspace 文件损坏，应通过 Authority mutation、API 或删除 live workspace 重建来修复，而不是直接编辑文件系统。
2. **重复根因已由 journal 定死**。后续若再次出现，应先按 `collab_autosave` 的资源 hash 与长度检查是否仍为全文倍增，不再把 AI run 或导出打包当作首要嫌疑。
3. **长期协同契约已同步**。当前事实见 [实时保存与协同编辑](../../项目文档/创作端/03-项目管理/技术/11_实时保存与协同编辑.md)。

## 2026-07-13 平台级修复

### 新发现的根因

#### 根因 4：编辑页初始化不加载已有对话消息

`edit/page.tsx` 在页面初始化时未加载当前会话的历史对话消息，对话区始终显示为空白。用户退出重进编辑页后，即使存在大量历史消息也无法恢复。消息仅在用户手动通过历史对话框切换会话时才会加载。

#### 根因 5：修复计数器 fingerprint 逃逸

修复计数器按错误指纹（fingerprint）独立管理，缺乏页面级跨指纹累计。当 AI 把 A 类型错误修成 B 类型错误时，指纹不同导致计数器重置，形成"修复→引入新错误→再修复"的无限循环。

#### 根因 6：AI 修复 prompt 缺少 page schema 上下文

AI 自动修复指令仅包含错误诊断信息，缺少页面 Schema 结构约定。AI 无法理解 `children` 是 Schema 中的子组件数组，反复误用 `children.data`，导致修复后预览仍报错。

#### 根因 7：消息渲染层缺乏防御性处理

- `AutoRepairMessage` 的 `statusConfig[autoRepair.status]` 在 status 不合法时返回 `undefined`，后续 `.icon` 访问抛 TypeError
- `assistant-message.tsx` 中 `parts.filter/map/some` 缺少 null guard
- `chat-messages.tsx` 无 React ErrorBoundary，一条消息崩溃导致全部消息不可见

### 已实施的修复

| 修复        | 文件                            | 内容                                                                               |
| ----------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| 渲染防御    | `message.tsx`                   | AutoRepairMessage statusConfig 增加 `?? { fallback }`                              |
| 渲染防御    | `assistant-message.tsx`         | 所有 `parts`/`block.parts` 的 filter/map/some 增加 `?? []` null guard              |
| 错误隔离    | `chat-messages.tsx`             | 新增 `MessageErrorBoundary` 包裹每条消息（含 streaming），增加重置机制             |
| 消息清洗    | `sanitize-hydrated-messages.ts` | 新建：过滤非法 role、保证 parts 为数组、归一化 autoRepair.status                   |
| 消息加载    | `edit/page.tsx`                 | 初始化时 GET messages + sanitizeHydratedMessages；onSelectSession 同步使用清洗函数 |
| 页面预算    | `auto-preview-repair-guard.ts`  | 新增 `getPageRepairBudget` 和 `PAGE_REPAIR_BUDGET_LIMIT = 5`                       |
| 预算检查    | `edit/page.tsx`                 | handlePreviewError 中增加页面级修复总数检查（跨 fingerprint）                      |
| Schema 注入 | `edit/page.tsx`                 | hiddenPrompt 条件注入 page schema 结构约定（仅 schema 相关错误时）                 |

### 验证状态更新

- [x] TypeScript 编译零错误
- [x] 867/871 测试通过（4 个预存失败在 useVisualEditState.test.tsx，与本次无关）
- [x] auto-preview-repair-guard.test.ts 通过
- [x] getPageRepairBudget 测试覆盖（5 个用例：空历史、跨 fingerprint 累计、跨页排除、过期忽略、常量值校验）
- [x] cleanupOrphanWorkspaces 测试覆盖（5 个用例：过期清理、live 保留、活跃 session 保留、无 meta 按 mtime、空目录）
- [x] workspace-manager.test.ts writeWorkspace 路径结构修正为 {user}/{project}/{workspace}
- [x] 用户重启服务 + 清除 localStorage 后确认对话区显示正常
- [x] AI 自动修复使用新 prompt 后不再误用 children.data

### 后续事项

1. **P2：修复后验证闭环** — AI 修复完成后应等待预览重新编译，检查错误是否消除（15 秒观察窗口）
2. **P3：会话管理** — ~~`data/workspaces/` 下孤儿会话目录清理机制~~ 已实现并验证：`workspace-manager.ts` 的 `cleanupOrphanWorkspaces()` 在启动和每 30 分钟定时清理（含 5 个单元测试覆盖）
3. **用户操作** — 首次使用需清除浏览器 localStorage `workbench:auto-preview-repair-history:v1` 以重置旧的修复预算

## 2026-07-13 验证与测试补充

### 文档准确性核查

对文档中描述的 8 项修复、4 项根因和后续事项进行了逐项代码核查：

- 8 项修复全部在代码中确认存在，描述与实现一致
- 根因 4–6 原描述含实现细节（API 路径、内部变量名、localStorage），已修正为意图层描述
- 后续事项 P3“会话管理”发现已过时（`cleanupOrphanWorkspaces()` 已实现），更新为已解决状态

### 新增测试

| 测试文件                            | 新增用例数 | 覆盖内容                                                                                           |
| ----------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `auto-preview-repair-guard.test.ts` | 5          | `getPageRepairBudget` 跨 fingerprint 累计、跨页排除、过期忽略、空历史、常量值                      |
| `workspace-manager.test.ts`         | 5          | `cleanupOrphanWorkspaces` 过期清理、scope=live 保留、活跃 session 保留、无 meta 回退 mtime、空目录 |

### 测试辅助修正

`workspace-manager.test.ts` 的 `writeWorkspace` helper 原路径结构为 `workspaces/projects/{projectId}/{workspaceId}`（硬编码 "projects" 作为 user 层），与实际代码 `{userId}/{projectId}/{workspaceId}` 不一致。已修正：

- `writeWorkspace` 新增 `userId` 参数
- 3 个已有调用点全部更新
- 12/12 测试通过（7 个原有 + 5 个新增）
