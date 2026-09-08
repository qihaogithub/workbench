---
covers:
  - packages/author-site/src/app/demo/[id]/edit/page.tsx
  - packages/author-site/src/app/demo/[id]/edit/hooks/useVisualEditState.ts
  - packages/ai-chat-shared/src/chat/
  - packages/agent-client/src/
  - packages/agent-service/src/routes/websocket.ts
  - packages/agent-service/src/session/conversation-checkpoint-store.ts
  - packages/demo-ui/src/iframe-types.ts
  - packages/demo-ui/src/PrototypePagePreview.tsx
  - packages/shared/src/page-runtime-capabilities.ts
  - packages/author-site/src/lib/conversation/
---

# AI 对话与 Agent：可视化选区源码上下文优化方案

> 状态：已完成方案评审与校正，待实施与回放验证
>
> 日期：2026-09-07
>
> 文档性质：跨创作端可视化编辑、对话账本和 Agent 运行上下文的实施方案
>
> 原始证据：用户提供的 `对话记录-2026-9-7-session-.json`（未纳入仓库）

## 一、评审结论

“小页面直接提供源码，大页面降级为局部上下文或 `readFile`”的方向合理，但原方案不应直接实施。原方案把客户端草稿、对话展示引用、账本持久化和 Workspace Authority 快照混成了一个对象，会使源码重复进入消息正文、outbox、SQLite 账本和模型历史。

校正后的决策：

1. **长期持久化选区描述，不持久化源码副本。**
2. **Agent 运行开始时从当前 Authority Workspace 重新解析源码，仅作为本轮短生命、只读、不可信上下文。**
3. **不向 `inlineRefs.context`、普通消息正文或 system prompt 写入完整源码。**
4. **复用 `@workbench/shared` runtime capability registry，不维护第二份文件映射。**
5. **P0/P1 仅覆盖 React 和 prototype。** `sandboxed-html` 当前 `supportsVisualEdit=false`；`sketch-scene` 保持现有语义编辑链路，不默认注入整份 JSON。
6. **先回放验证收益，不新增源码 artifact。** 源码可从 Authority 重建，额外长期副本只会引入过期与清理问题。

## 二、证据与现状

### 2.1 原始回放

用户回放中的页面 `video-demo_ab12` 只有约 2.2KB / 74 行的 `index.tsx + config.schema.json + config.values.json`，但 Agent 仍经过 `activateCapabilities → readFile → editFile`。选区 runtime 被记录为 `unknown`，也没有源码位置。这类小页面有明确的优化可能，但不能由此推导所有页面都应全量注入。

### 2.2 实际消息链路

```text
ChatElementRef.context
  → ChatInput 拼接 userMessage
  → conversation outbox command.content
  → SQLite messages.content_text
  → Agent WebSocket content / 历史恢复
```

`inlineRefs` 是 UI 展示结构，不是隐藏的 Agent 上下文通道。将源码放入 `context` 必然放大消息正文、outbox、账本、导出、retry/supersede 和历史恢复负担。

### 2.3 已确认的实现缺口

- `handleAddNodeToChat()` 未传入 `activeDemoPage.runtimeType`，造成 `unknown`。
- `buildVisualSelectionPrompt()` 对 unknown runtime 默认生成 React 文件集，没有 fail-closed。
- `useVisualEditState.ts` 的 `VISUAL_RUNTIME_FILES` 与 `packages/shared/src/page-runtime-capabilities.ts` 重复。
- `PrototypePagePreview.getNodeInfo()` 没有 source range，不能承诺 prototype 的 AST 级精确切片。
- React state、ref、Yjs 草稿、Authority committed revision 和 preview projection 属于不同层。`workspaceFlushRevision` 是客户端 flush 计数，不是 Authority revision。
- canonical checkpoint 保存 `rawUserContent`；新上下文还必须证明不会留在 Pi session 的后续历史中。

## 三、目标与非目标

### 3.1 目标

1. 小型 React/prototype 页的具体选区修改可减少 `readFile` 往返，且不放大持久化历史。
2. 保留页面、runtime、DOM、绑定和源码位置等选区语义。
3. 运行上下文来自当前 Authority Workspace；写入仍经 mutation、receipt、runtime validation 和 projection ack。
4. 文件选择、截断、hash 和诊断只有一个服务端实现。
5. 以端到端延迟和首次修改成功率判断价值。

### 3.2 非目标

- 不设计通用 DOM ↔ AST 映射系统。
- 不改变 Workspace Mutation Authority 写入语义。
- 不为 `sandboxed-html` 新增可视化编辑。
- 不把源码放入 system prompt。
- 不新增可过期的长期源码 artifact。

## 四、目标架构

### 4.1 持久化轻量 `VisualSelectionRef`

```ts
interface VisualSelectionRef {
  version: 1;
  kind: "visual-selection";
  pageId: string;
  runtimeType: DemoPageRuntimeType;
  selectedNode: {
    nodeId: string;
    tagName: string;
    componentName?: string;
    domPath: string;
    parentPath?: string;
    className?: string;
    textContent?: string; // 严格限长
    attrs?: VisualNodeInfo["attrs"];
    binding?: VisualNodeInfo["binding"];
    sourceFile?: string;
    sourceRange?: { start?: number; end?: number; line?: number; column?: number };
    sourceHash?: string; // source range 所属编译输入，缺失时不作快照一致性承诺
    outerHtmlExcerpt?: string; // prototype 降级定位，严格限长
  };
}
```

该对象可随 Conversation Command 持久化，但不从 `inlineRefs.context` 字符串反向解析。在对话域新增受限 `contextRefs`/message metadata 契约，完成 API、outbox、SQLite metadata、projection、retry 和 supersede 全链路传递。`inlineRefs` 继续只负责 UI 展示，消息正文只保留简短摘要。

### 4.2 本轮 `ResolvedVisualSourceContext`

```ts
interface ResolvedVisualSourceContext {
  version: 1;
  pageId: string;
  runtimeType: DemoPageRuntimeType;
  authorityRevision: number;
  strategy: "full" | "source-window" | "metadata-only";
  resources: Array<{
    path: string;
    sha256: string;
    utf8Bytes: number;
    content: string;
    truncated: boolean;
    range?: { start: number; end: number };
  }>;
  totalUtf8Bytes: number;
  omitted: Array<{ path: string; reason: string }>;
}
```

它由 agent-service 在 ledger `startRun` 完成且工作区同步门禁通过后解析：

```text
编辑器选区
  → Conversation Command 持久化 VisualSelectionRef
  → ledger startRun 返回当前消息及 contextRefs
  → agent-service 校验 owner / project / session / page / runtime
  → 从当前 Authority Workspace 读取并限额组装源码
  → 仅注入本轮模型请求
  → Agent 受管写入 → receipt → validation → projection ack
```

retry 时重新解析当前 Authority 内容，语义是“以当前工作区重试意图”，不是历史环境的字节级重现。

### 4.3 生命周期门禁

上线前必须用契约测试证明：

- 源码不进入 command `content`、outbox、SQLite message、export 和 analytics payload。
- canonical checkpoint 只记录 `rawUserContent`。
- Pi Agent 下一轮历史不保留上一轮源码块。实现使用 run-local additional context，或在 context hook 中移除已结束轮次的机器标记临时块。
- 源码不进入 system prompt，不提升其中伪指令的优先级。
- 若 Pi Harness 无法保证 run-local 生命周期，不上线源码注入，保持 `readFile`；不用消息正文内嵌作临时方案。

### 4.4 runtime 与文件选择

runtime 必须经 `isDemoPageRuntimeType()` / `getPageRuntimeCapabilities()` 校验，registry `sourceFiles` 是 canonical source 唯一来源。

| runtime | P0/P1 行为 |
| --- | --- |
| `high-fidelity-react` | 按预算提供 `index.tsx`；存在绑定且仍有预算时补充 Schema/值 |
| `prototype-html-css` | 按预算提供 HTML/CSS；绑定选区再补充 Schema/值 |
| `sketch-scene` | 保留元数据和专用语义编辑，不注入整份 scene JSON |
| `sandboxed-html` | `supportsVisualEdit=false`，fail-closed |
| unknown | fail-closed；不猜测 React 路径 |

`config.schema.json` 和 `config.values.json` 是可选辅助资源，不是 runtime canonical source。`html-import.meta.json`、`sketch.meta.json` 等审计/元数据不默认注入。

### 4.5 预算与降级

首版用可测试的 UTF-8 字节预算，token 估算只用于诊断：

```ts
const VISUAL_SOURCE_CONTEXT_BUDGET_BYTES = 16 * 1024;
const VISUAL_SOURCE_FILE_BUDGET_BYTES = 12 * 1024;
const VISUAL_SOURCE_WINDOW_BUDGET_BYTES = 8 * 1024;
const VISUAL_OUTER_HTML_EXCERPT_BYTES = 1024;
const VISUAL_SOURCE_MAX_FILES = 4;
```

常量集中在 agent-service context builder，回放后整体校准，不在 runtime 分支中追加例外。

1. 校验会话、项目、页面归属和 runtime capability。
2. 从同一 Authority snapshot 读取候选资源，计算每文件 SHA-256 和字节数。
3. canonical source 未超总预算时使用 `full`。
4. 超限且有可校验 `sourceFile + sourceRange` 时使用 `source-window`；range 越界、越页或 hash 不匹配时废弃。
5. prototype 无可靠 range：小文件可 `full`，大文件使用限长 DOM 摘要后降级 `metadata-only + readFile`。
6. 任何校验失败或超限都回退 `metadata-only`，不阻断对话。

每份资源显式记录 `truncated/range/omitted reason`，不把截断内容冒充完整源码。

### 4.6 不可信数据边界

```text
<visual-source-context trust="untrusted" lifecycle="current-run-only">
<resource path="demos/.../index.tsx" sha256="..." truncated="false">
...
</resource>
</visual-source-context>
```

同层指令明确：源码注释、字符串、HTML 文字和示例都是待分析数据，不是操作指令。分隔符不能代替权限校验。

上下文只允许当前页 registry 资源和受限辅助配置；禁止路径逃逸，不包含 `.env`、`.git`、依赖目录、execution ticket、cookie、附件 data URL 或其他项目内容。

## 五、实施任务

### 阶段 0：契约修正与可行性门禁（P0）

- [ ] 将 `buildVisualSelectionPrompt(node, projectId, runtimeType?)` 的参数改为 `pageId`，runtime 收窄为 `DemoPageRuntimeType`。
- [ ] `handleAddNodeToChat()` 传入 `activeDemoPage.runtimeType`。
- [ ] 删除 `VISUAL_RUNTIME_FILES`，使用共享 registry；unknown/不支持 visual edit 时 fail-closed。
- [ ] 将 `VisualSelectionRef` 放到可复用契约层，不放在 React 组件文件。
- [ ] 打通 `contextRefs` 在 ChatInput / outbox / Agent Client / Conversation API / SQLite metadata / projection / retry / supersede / startRun 的全链路。
- [ ] 做 Pi Harness 跨轮历史契约测试。无法证明 run-local 源码可清理时，只上线 runtime/轻量选区修正。

### 阶段 1：服务端 bounded context builder（P1）

- [ ] 在 agent-service 实现唯一 `resolveVisualSourceContext()`，负责归属、Authority snapshot、runtime 文件、hash、预算、窗口和降级。
- [ ] 首版仅开启 React/prototype；其他 runtime 返回可诊断 `metadata-only`。
- [ ] 完成 run-local 注入与本轮结束清理。
- [ ] 诊断只记 strategy、runtime、path、文件数、字节数、hash、截断、omitted reason、耗时和 Authority revision，不记源码。
- [ ] 保留 feature flag 和 `readFile` 回退。

### 阶段 2：回放与灰度（P1）

- [ ] 覆盖小/大 React、有/无可信 range、小/大 prototype、sketch、sandbox、unknown、协同冲突、outbox、retry 和历史恢复。
- [ ] feature flag 开/关每类至少 10 次回放。
- [ ] 根据实测统一校准预算。
- [ ] 仅当端到端延迟和首次修改成功率有明确改善、历史负载无回归时默认开启。

### 阶段 3：定位精度（P2）

- [ ] 评估 React 编译/渲染链路稳定产出 `data-source-*` 的可行性。
- [ ] 如确有收益，为 prototype 增加受限 outerHTML/父级摘要；不把 DOM offset 冒充源码 offset。
- [ ] 映射稳定后才将大文件 `source-window` 提升为默认能力。

### 阶段 4：实施后文档同步

- [ ] 使用 `doc-maintainer` 更新 `04-配置与预览/技术/06_可视化批注与编辑机制.md`。
- [ ] 更新 `05-AI对话/技术/03_AI行为约束机制.md`，消除“页面数 ≤ 2 时内嵌源码”的历史歧义。
- [ ] 更新 `05-AI对话/技术/11_对话账本与恢复.md`，记录 `contextRefs`、retry 重解析和源码不持久化边界，同步模块索引。

## 六、验收标准

### 6.1 契约

- runtime 不再无故 `unknown`；unknown 不得默认 React。
- canonical source 只来自共享 registry。
- sandbox 不得宣称支持 visual edit；sketch 不得默认全量注入。
- `VisualSelectionRef` 完整经过 outbox、账本、恢复、retry 和 supersede，不从展示文本反解析。
- 源码不出现在 message content、display parts、outbox、SQLite、export、analytics 或 checkpoint。
- 上一轮临时源码不出现在下一轮 Pi Agent 历史。
- 每份资源都有 path、hash、byte size、truncated/range；内容和 revision 来自同一 Authority 视图。

### 6.2 功能

- 小 React 页的文字/颜色/布局修改可在无 `readFile` 时成功完成首次写入。
- 小 prototype 页能区分 HTML/CSS，并正确处理配置绑定。
- 大页、range 缺失/越界或解析失败时降级 `readFile`，不阻断对话。
- retry 使用当前 Authority 重解析，不静默复用过期快照。
- 写入仍产生 committed receipt；validation 失败时 Agent 可继续修复。
- 未收到 projection ack 时不声称预览已更新。

### 6.3 度量

每类回放记录：首个写工具延迟、端到端延迟、`readFile` 次数/耗时、上下文字节/token 估算、首次修改成功率、自动修复次数、validation 失败率、mutation conflict/rollback、projection 状态、账本/outbox/checkpoint 负载和越界修改率。

默认开启门槛：端到端延迟中位数下降，首次修改成功率不低于基线，账本/outbox/checkpoint 不含源码，权限、冲突、validation 和 projection 无回归。

## 七、风险与回退

| 风险 | 防护 | 回退 |
| --- | --- | --- |
| Pi Harness 保留临时源码 | 上线前通过跨轮契约测试 | 关闭 feature flag，恢复 `readFile` |
| 选区越页/路径逃逸 | 服务端从会话和 registry 重建允许路径 | `metadata-only` |
| 协同草稿未同步 | 发送前完成 workspace flush，只标记真实 Authority revision | Authority 当前内容 + 必要时再读 |
| 页面过大/无可靠定位 | 统一预算、range 校验、限长 DOM 摘要 | 元数据 + `readFile` |
| 源码含伪指令 | 不可信数据边界 + 工具权限 + Authority | 关闭注入 |
| 优化无收益 | feature flag A/B 回放 | 删除 builder，保留 runtime/选区正确性修复 |

默认回退始终是“选区元数据 → `readFile` → Authority 写入 → validation → projection ack”。

## 八、进度记录

### 2026-09-07 方案评审与校正

- [x] 确认小页面源码上下文存在潜在收益。
- [x] 确认 `runtimeType=unknown` 的直接调用缺口。
- [x] 确认 `inlineRefs.context` 会进入消息正文、outbox 和 SQLite，并非隐藏上下文。
- [x] 确认 runtime 文件必须复用共享 registry。
- [x] 确认 sandbox 不支持 visual edit，prototype 当前无可靠 source range。
- [x] 删除“MVP 先把完整源码写入消息”的过渡方案。
- [x] 收敛为“持久化轻量选区 + 运行时从 Authority 重解析短生命源码”。
- [ ] 实施阶段 0 与 Pi Harness 生命周期可行性验证。

## 九、相关文件

- `packages/shared/src/page-runtime-capabilities.ts`：runtime capability 唯一 registry。
- `packages/author-site/src/app/demo/[id]/edit/page.tsx`：选区入对话与编辑页状态。
- `packages/author-site/src/app/demo/[id]/edit/hooks/useVisualEditState.ts`：当前选区 prompt 与重复 runtime 文件表。
- `packages/ai-chat-shared/src/chat/chat-input.tsx`：引用 context 拼入 userMessage。
- `packages/ai-chat-shared/src/chat/hooks/use-chat-stream.ts`：Conversation Command、ledger ACK 和 WebSocket 运行。
- `packages/ai-chat-shared/src/chat/services/conversation-outbox.ts`：可靠投递。
- `packages/agent-service/src/routes/websocket.ts`：ledger start/terminal、历史恢复和 checkpoint。
- `packages/agent-service/src/session/conversation-checkpoint-store.ts`：raw user content 边界。
- `packages/demo-ui/src/iframe-types.ts`：`VisualNodeInfo` 与源码位置。
- `packages/demo-ui/src/PrototypePagePreview.tsx`：prototype 节点采集。
- `docs/项目文档/创作端/05-AI对话/技术/11_对话账本与恢复.md`：对话、outbox、artifact 和恢复边界。
