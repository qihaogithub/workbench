---
covers:
  - packages/shared/src/contracts.ts
  - packages/agent-service/src/collab/
  - packages/agent-service/src/workspace/
  - packages/agent-service/src/backends/pi-tools/
  - packages/author-site/src/hooks/useCollabDocument.ts
  - packages/author-site/src/components/demo/CodeEditor.tsx
  - packages/author-site/src/app/demo/[id]/edit/
---

# 创作端协作内核：多人及多 Agent 实时协作长期方案

> 状态：远期规划，前期范围已收敛  
> 更新日期：2026-09-10  
> 目标：优先解决实时可见、不同文件并行、同文件防覆盖和可靠恢复，不建设同文件多 Agent 语义合并与复杂多会话运行时。

> 当前实施状态：P0 已完成首批写入收敛，P2-lite 已接入服务端路径队列与 Authority 基线门禁；P1 的浏览器双用户断线/重连验收和剩余入口清点仍待完成。

相关文档：[实时协作保存需求](../../项目文档/创作端/03-项目管理/实时协作保存_需求文档.md)、[实时保存与协同编辑](../../项目文档/创作端/03-项目管理/技术/11_实时保存与协同编辑.md)、[对话账本与恢复](../../项目文档/创作端/05-AI对话/技术/11_对话账本与恢复.md)

## 1. 决策

前期只实现以下能力：

1. 多人实时看到修改。
2. 多个 Agent 同时处理不同文件。
3. 同一文件不会被并发覆盖。
4. 所有写入都有 revision、receipt 和恢复记录。

采用“Yjs 实时协作 + 文件级 Agent 队列 + Workspace Authority 提交”的最小方案：

```text
人类编辑 ──→ 文件 Y.Doc ──────────────┐
                                       ├─→ Workspace Authority ─→ receipt / backup / canonical
Agent 任务 ─→ 文件级队列 ─→ 基线校验 ─┘
```

多人依靠 Yjs 合并实时编辑。多个 Agent 可以并行运行，但只并行处理不同文件；同一文件的 Agent 写入排队。Authority 的最终提交继续按 Workspace 短暂串行，以复用现有原子提交和恢复能力。

这不是完整的 Figma 级多 Agent 协作。前期不允许多个 Agent 自动合并同一文件上的业务意图。

## 2. 并发规则

| 场景 | 规则 |
| --- | --- |
| 多人编辑同一文件 | 进入同一个 Y.Doc，由 CRDT 实时合并 |
| 多个 Agent 修改不同文件 | Agent 任务并行；提交进入 Authority 的短临界区 |
| 多个 Agent 修改同一文件 | 按规范化文件路径排队；后一个进入 Authority 临界区时重新读取 canonical 并校验基线，必要时显式冲突，不自动重写模型生成 |
| 人类与 Agent 修改同一文件 | 不锁住人类；Agent 提交必须校验读取时的文件 hash，变化即显式冲突 |
| 一个操作修改多个文件 | 使用现有 Authority 原子 mutation；任一路径基线不符则整体失败 |

文件队列只约束 Agent，不把 Awareness 当作锁，也不长期锁住编辑器。路径必须先经过 Workspace 资源路径规范化，避免同一文件因路径写法不同进入不同队列。

“同时处理”指 Agent 的推理、读取和对不同文件的生成可以并行；持久化提交无需并行。保持 Workspace 级串行提交能显著降低 revision、receipt 和恢复的一致性风险，提交临界区足够短时不会成为前期瓶颈。

## 3. 写入契约

live Workspace 只允许受管写入。每次 Agent mutation 至少包含：

```ts
interface AgentWorkspaceMutation {
  mutationId: string;
  projectId: string;
  workspaceId: string;
  sessionId: string;
  runId?: string;
  baseRevision: number;
  operations: Array<{
    path: string;
    expectedHash?: string;
    expectedAbsent?: boolean;
    content?: string;
  }>;
}
```

约束如下：

- `mutationId` 是幂等键，同一 ID 只能对应同一 payload。
- 修改已有文件必须携带 `expectedHash`，创建文件必须携带 `expectedAbsent`。
- Agent 基于读取时快照生成候选内容；取得文件队列后由 Authority 在临界区重新读取 canonical 并校验基线，旧基线不匹配即显式冲突，不自动重放模型请求。
- 基线不符时返回 `WORKSPACE_RESOURCE_CONFLICT`；前期不做自动语义合并，也不重放整轮模型请求。
- 只有 `committed: true` 的 durable receipt 才能报告写入成功。
- 不得在 Yjs 写入失败后绕过协同状态静默直写磁盘。

前期允许 Agent 以带基线的整文件替换或现有 edit 操作提交，不强制建设范围 patch 协议。文件队列和 `expectedHash` 已能满足“不并发覆盖”；增量 patch 只在冲突率或大文件性能证明必要时再引入。

## 4. 状态与恢复

| 事实 | 权威来源 |
| --- | --- |
| 活跃文件内容与多人实时同步 | 文件 Y.Doc |
| revision、原子提交和恢复 | Workspace Authority |
| 成功证明 | durable receipt |
| 可发布文件 | canonical Workspace |
| 预览是否已消费提交 | Projection Ack |

持久化沿用现有 Authority 能力：

- 每次提交生成单调递增的 Workspace revision。
- receipt 记录 mutation、actor、资源路径及提交前后 hash。
- 修改前保存 prepared/journal 和 committed backup；中途失败回滚到上一提交态。
- 进程重启时处理未完成 mutation，并校验 Authority root hash 与 canonical Workspace。
- Yjs revision gap 或本地状态失效时从已验证状态重建，禁止用旧本地全文覆盖远端。

本地已修改、Yjs 已同步、Authority 已提交和预览已应用仍是四个不同状态，界面不得互相冒充。

## 5. 现有基础与必要改动

当前已经具备 Yjs/Hocuspocus 房间、Authority Workspace 队列、`expectedHash`、revision、receipt、backup、journal 和恢复机制，不需要重建协作后端。

前期只补齐：

1. 增加服务端 Agent 文件队列，键为 `workspaceId + normalizedPath`。
2. Agent 写工具在取得队列后读取最新协同内容，并保留 `expectedHash` 最终校验。
3. 清除或关闭会把协同冲突降级为非协同成功的 fallback；失败必须显式返回。
4. 所有成功写入统一返回并传播真实 receipt，补齐 `runId`/`sessionId`/路径诊断。
5. 增加多人、多 Agent、断线和崩溃恢复的并发测试。

## 6. 实施顺序

### P0：写入收敛

- 盘点并关闭 live Workspace 的未受管写入和静默 fallback。
- 统一 mutation 身份、基线、receipt 与终态表达。
- 验证 Authority prepared、rollback、backup 和启动恢复链路。

### P1：多人实时协作

- 稳定文本类文件的 Y.Doc 加载、同步、保存和断线重连。
- 确保两个用户编辑同一文件时最终收敛且不重复内容。
- presence 只展示协作者和当前文件，不承担锁语义。

### P2-lite：不同文件并行、同文件排队

- 允许多个 Agent 任务同时运行。
- Agent 写入按规范化文件路径排队，不同路径互不阻塞。
- 同一路径取得队列后重新读取，提交时校验 hash；冲突则显式失败。
- Authority 保持 Workspace 级串行提交，不改造为并行事务引擎。

完成 P0、P1 和 P2-lite 后即结束前期实施。

## 7. 前期验收标准

1. 两个用户编辑同一文件时能实时看到对方修改；断线重连后内容一致且不重复。
2. 两个 Agent 修改不同文件时可以同时运行，均获得各自真实 receipt。
3. 两个 Agent 修改同一文件时按队列执行；后一个基于最新内容操作，或返回显式冲突，不得覆盖前一个结果。
4. 人类在 Agent 运行期间修改目标文件，Agent 的旧基线不能提交成功。
5. 每次成功写入都可按 mutation、session、run、path 和 revision 追溯。
6. 任意一次多文件 mutation 中途失败时不留下部分结果；服务重启后可恢复到最近 committed revision。

## 8. 后续按需建设

以下能力不进入前期主线：

- 同一文件的多 Agent 自动语义合并或逐字符协作。
- 页面树、配置、白板全面结构化 CRDT 化。
- 多对话运行中切换、独立 runtime 和后台审批恢复。
- 关闭浏览器后继续执行的 durable background job。
- 完整 offline-first、多实例 room owner、fencing token、共享 pub/sub 和自动故障转移。
- Agent 光标、选区和逐字符操作动画。

只有实际冲突率、性能、部署规模或用户体验数据证明必要时，才逐项立项。

## 9. 当前实施进度

- [x] Agent mutation 增加可选 `runId`，durable receipt 保留 `sessionId`/`runId` 关联信息。
- [x] 委派子 Agent 使用独立 child `runId` 与 `mutationActor: "subagent"`，receipt 不再与父 Agent 的运行身份混淆。
- [x] 新增按 `workspaceId + normalizedPath` 的 Agent 文件级队列；多文件请求按稳定路径顺序取队列，避免锁反转。
- [x] Agent `put_text`、`put_staged_text`、`put_binary`、`delete_path` 和 `move_path` 在 Authority 临界区强制校验 `expectedHash`/`expectedAbsent`；冲突返回 `WORKSPACE_RESOURCE_CONFLICT`。
- [x] `writeFile`/`editFile` 关闭协同失败后静默回退 Authority 的旁路，Agent 写入统一以 Authority receipt 为成功边界。
- [x] Authority committed receipt 回写活跃 Yjs room：房间仍在原基线时安全投影；检测到未落盘人类编辑则阻止 stale flush、清理旧 room snapshot 并要求重连收敛。
- [x] Sketch scene 与 canvas arrange 的 live 基线读取改为 Authority snapshot，避免 Agent 从磁盘旁路读取旧协同内容；提交仍使用资源级 CAS。
- [x] 新建 knowledge 文档与 `knowledge/manifest.json` 合并为同一 Authority mutation，避免正文/manifest 半提交。
- [x] 补充路径队列单元测试、同文件 Agent 冲突测试、不同文件并发回归和 `./path` 规范化覆盖。
- [x] 修复 CodeMirror 协同弹窗的 provider 生命周期：`ytext`/Awareness 就绪后重新挂载 `yCollab` 扩展，避免首次空 provider 导致编辑器退化为单机输入。
- [ ] 为所有 Agent mutation 调用补齐真实对话 `runId`（公共 Agent 路由和评论任务已刷新；少数恢复/后台入口仍使用 session 级回退）。
- [ ] 完成 P1 两个浏览器协作者的实时可见、断线重连和不重复收敛验收；再决定是否扩大到页面树/配置结构化 CRDT。

## 10. 本轮验证状态

- 2026-09-10：Agent Authority、队列、协同持久化、live 文件/Sketch/canvas 工具、页面/配置工具和评论任务的定向回归共 11 个文件、110 个测试通过。
- `@workbench/agent-service` 与 `@workbench/author-site` 类型检查通过；`check:workspace-authority` 与 `check:contracts` 通过；`git diff --check` 通过。
- 完整 Agent Service 套件仍有既有环境限制（worker 中 `process.chdir`、沙箱禁止监听本地 WebSocket）及脏工作区基线计数差异；这些不作为本轮 P1 浏览器验收结论。
- P1 仍需在可运行的双用户服务环境中补做浏览器级实时可见、断线重连、重复收敛和 receipt 追踪验收。
