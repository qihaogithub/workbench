# 原型页静默注册失败与工具链反馈缺失问题分析

## 基本信息

| 字段          | 值                                                            |
| ------------- | ------------------------------------------------------------- |
| Session ID    | `session-1785733253601-r5ed0xl2k`                             |
| 导出时间      | 2026-08-03T05:48:32.298Z                                      |
| 用户请求      | 创建两个页面展示所有 12 种配置类型（1 个原型页 + 1 个高保真页） |
| 对话复杂度    | 高频工具调用（~100+ 次），大量重试和回滚                       |
| Revision 变化 | 118 → 225（107 次文件变更）                                   |
| AI 能耗       | 在原型页注册问题上浪费 ~80% 工具调用，核心任务完成被严重延迟    |

---

## 问题总览

| 问题                                                             | 严重度 | 状态     | 说明                                                                          |
| ---------------------------------------------------------------- | ------ | -------- | ----------------------------------------------------------------------------- |
| 原型页静默注册失败，`runtimeValidation` 无反馈                   | 🔴 P0  | 未修复   | 文件写入全部返回 `ok: true`，但页面从未被注册，AI 无法感知失败原因            |
| `captureScreenshot` 绑定用户 UI 焦点而非 workspace 当前状态       | 🟠 P1  | 已有记录 | 画布布局已修正，截图仍加载用户浏览器焦点页（已删除的 `highfidelity-config_9m4p`） |
| `workspace-tree.json` 系统自动添加 `routeKey` 导致 drift          | 🟡 P2  | 已有沉淀 | 与前序文档 `原型页升级死锁与AI工具链问题沉淀.md` P4 相同，但本次触发频率更高  |
| 页面注册的异步时序与 `listPages` 工具返回不同步                   | 🟠 P1  | 未修复   | 系统后台扫描已在注册页面，但 `listPages` 返回旧快照                            |
| 静默失败导致 AI 工具调用放大                                      | 🔴 P0  | 未修复   | 无诊断信息 → AI 反复重试不同方案 → 工具调用爆炸 → 任务严重延迟                |
| 空目录残留阻止复用页面 ID                                          | 🟡 P3  | 已有记录 | 删除文件后空目录仍存，写入同目录被拒（`WORKSPACE_INVALID_OPERATION`）         |

---

## 时间线（关键节点）

| Revision | 事件                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- |
| 160      | AI 开始：读取 `page-lifecycle` skill，确认工作空间为空                                             |
| 162–163  | AI 创建 `config-prototype_k8m2`（原型页）三文件 + `config-highfidelity_p3n5`（高保真页）schema    |
| 163      | 高保真页 schema 触发 `PROTOTYPE_CONFIG_TYPE_UNSUPPORTED` → AI 随后写入 `index.tsx`，校验通过        |
| 165      | AI 写入 `workspace-tree.json` 注册两个页面 → 系统自动添加 `routeKey`                                |
| 166–176  | **核心问题开始**：`listPages` 只返回高保真页，原型页从未出现                                       |
| 169–170  | `.canvas-layout.json` 残留旧会话的 9 个页面引用（含 `highfidelity-config_9m4p`）                   |
| 170      | `arrangeCanvasPages` 只排列了高保真页 → 原型页仍不可见                                            |
| 171      | `deleteFile` + 重写 schema → `listPages` 仍无原型页 → `WORKSPACE_EXTERNAL_DRIFT`                  |
| 176–179  | AI 尝试第 2 个 ID `prototype-demo_h2k9` → 同样失败                                                 |
| 182–196  | AI 反复修改 schema 类型（`type: "text"` ↔ `type: "string"`）、修改 `routeKey` → 全部无效           |
| 196–199  | AI 尝试第 3 个 ID `scalar-types_p4m7` → 同样失败                                                   |
| 205–209  | 残留空目录 `config-prototype_k8m2` 阻塞写入（`WORKSPACE_INVALID_OPERATION`）                       |
| 210–212  | AI 删除并重建 `.canvas-layout.json` → `arrangeCanvasPages` 仍只返回高保真页                       |
| 216–220  | AI 尝试第 4 个 ID `prototype-mvp_a1b2`（极简 schema: 仅 title + description）→ 同样不注册         |
| 222–223  | AI 试探：移除高保真页 → `listPages` 返回 "No pages found" → 确认原型页从未被注册                   |
| 227      | AI 移除尾部逗号使 JSON 失效 → 系统强制重写 `workspace-tree.json`，名称被改为 "config highfidelity" |

**结论**：AI 从 revision 165 发现原型页不注册，到 revision 227 被用户打断，共尝试 4 个页面 ID、多次切换 schema 类型、反复重写 workspace-tree，全部失败。用户最终询问"为什么这么久"。

---

## P0：原型页静默注册失败 — 零反馈死锁

### 现象

AI 创建原型页的完整文件结构（`prototype.html` + `prototype.css` + `config.schema.json`），`writeFile` 每步返回：

```json
{
  "runtimeValidation": { "ok": true, "issues": [] },
  "prototypeGate": { "decision": "accept_prototype" }
}
```

`workspace-tree.json` 也正确包含页面条目，但 `listPages` 从未列出该页面。AI 无法从任何工具返回值中得知失败原因。

### 证据汇总

| 页面 ID                   | 文件完整性 | runtimeValidation | prototypeGate        | listPages 结果 | 尝试次数 |
| ------------------------- | ---------- | ----------------- | -------------------- | -------------- | -------- |
| `config-prototype_k8m2`   | ✅ 3 文件  | `ok: true`        | `accept_prototype`   | 未出现         | ~15 次    |
| `prototype-demo_h2k9`     | ✅ 3 文件  | `ok: true`        | `accept_prototype`   | 未出现         | ~10 次    |
| `scalar-types_p4m7`       | ✅ 3 文件  | `ok: true`        | `accept_prototype`   | 未出现         | ~8 次     |
| `prototype-mvp_a1b2`      | ✅ 3 文件  | `ok: true`        | `accept_prototype`   | 未出现         | ~5 次     |

### 系统行为补充观察

在 AI 使 `workspace-tree.json` 意外变成无效 JSON（删除尾部逗号）后，系统**完全重写了该文件**：不仅移除了原型页条目，还将高保真页的 `name` 改为 "config highfidelity"、`order` 改为 0、`routeKey` 改为 "config-highfidelity"。这表明系统在检测到 workspace-tree 不符合预期时会进行**全量覆盖重写**，而非增量修正。

### 根因分析（推测）

1. **页面注册存在异步验证管线**：文件写入时的 `runtimeValidation` 是 agent-service 侧即时校验，而页面注册（`listPages` 可见）依赖 project-core 服务端的异步扫描/索引。两个阶段之间存在时间窗口，且后一个阶段的失败信息不反馈给 AI 工具。

2. **可能的注册失败原因**：原型页的 `type: "text"` 在 config.schema.json 中被静默拒绝。虽然 agent-service 的即时校验返回 `ok: true`，但 project-core 的语义校验可能认为该类型在原型页中不属于有效标量类型（与文档所述矛盾）。

3. **workspace-tree 的全量覆盖机制**：当系统检测到 `workspace-tree.json` 中的页面未能通过注册，可能触发整棵树的重建而非回退该条目。

### 影响

- AI 在无诊断信息的情况下反复重试，消耗大量工具调用
- 用户等待时间被显著延长，最终感知为"卡住"
- 会话过程中产生了 4 个废弃页面目录的残留文件

### 相关代码（待确认）

| 组件                  | 推测位置                                                     | 说明                                               |
| --------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| 即时校验              | `packages/agent-service/src/backends/pi-tools/file-tools.ts` | `writeFile` 返回 `runtimeValidation`                |
| 页面注册/扫描         | `packages/project-core/src/service.ts`                       | 异步页面发现与 `listPages` 数据源                   |
| schema 类型校验       | 未知                                                         | 对 `type: "text"` 在 prototype 下的语义校验         |
| workspace-tree 重写   | 未知                                                         | 全量覆盖而非增量修改的原因                         |

---

## P1：`captureScreenshot` 绑定用户 UI 焦点而非 Workspace 当前状态

### 现象

AI 反复清理 `.canvas-layout.json` 并重新排列画布后，`captureScreenshot` 仍然报错：

```
Error: preview code file not found: demos/highfidelity-config_9m4p/index.tsx
```

### 根因

`captureScreenshot` 截取的是**用户浏览器 UI 当前聚焦的页面预览**，而非 workspace 文件中记录的当前状态。当用户在 UI 中焦点停留在已删除的旧页面时，截图工具始终尝试加载该页面。

### 对比

`arrangeCanvasPages` 操作 workspace 后台状态，与用户前端 UI 焦点**完全解耦**。这导致 AI 可以通过工具操作修正 workspace 状态，但无法改变截图工具的行为（后者绑定前端焦点）。

### 影响

- AI 无法通过工具调用获取当前页面的预览截图来验证自己的工作结果
- 与 P0 叠加：AI 既看不到原型页的注册状态，也截不了预览图，完全失去验证手段

---

## P2：`workspace-tree.json` 自动添加 `routeKey` 导致 drift

与已有文档 `原型页升级死锁与AI工具链问题沉淀.md` P4 相同。本次会话中该问题触发频率更高，因为 AI 反复重写 `workspace-tree.json`（尝试不同页面 ID）。

**本次新发现**：当 `workspace-tree.json` 变为无效 JSON 时，系统会进行**全量覆盖重写**（而非拒绝写入），包括修改已有页面的 `name`、`order`、`routeKey` 为系统自动生成的值。这增加了 AI 调试的复杂度。

---

## P3：页面注册的异步时序与 `listPages` 快照不一致

### 现象

用户打断 AI 时发来的系统扫描输出显示原型页已被注册（id: `prototype-mvp_a1b2`，runtimeType: `prototype-html-css`），但 AI 在前序所有 `listPages` 调用中都未看到该页面。

### 推测

`listPages` 返回的是某个时刻的快照，系统后台扫描可能有索引延迟。当 AI 快速连续创建页面并立即调用 `listPages` 时，页面尚未通过后台扫描管线完成注册。

### 影响

AI 依赖 `listPages` 作为页面是否存在的权威来源，快照延迟导致 AI 误判页面创建失败，从而进入无意义的重试循环。

---

## P4：静默失败 → AI 工具调用放大

### 模式

```
1. 操作（如 writeFile schema）→ 返回 ok: true
2. 验证（如 listPages）→ 页面不存在
3. 无诊断信息 → AI 推测失败原因
4. AI 尝试另一种方案（改 schema 类型、改页面 ID、改 routeKey...）
5. 仍失败 → 回到步骤 3
```

本会话中该循环重复了 ~40 次，每次涉及 2-5 个工具调用，共浪费 ~100 次工具调用。

### 根因

`runtimeValidation` 的 `ok: true` / `issues: []` 字段对 AI 产生误导——它告诉 AI "写入成功"，但实际上项目级注册是失败的。两阶段校验（agent-service 即时 + project-core 异步）之间的**信息断层**是根本原因。

### 可能的改进方向

1. **`writeFile` 返回值增加异步注册结果**：将 project-core 的注册结果异步回传，或在 AI 调用 `listPages` 时携带注册诊断
2. **`listPages` 增加失败原因字段**：对 workspace-tree 中存在但未成功注册的条目，返回拒绝原因
3. **`runtimeValidation` 增加警告级别**：对可能触发后续注册失败的情况（如 `type: "text"` 在 prototype 下）给出 warning 而非 silence

---

## 与已有文档的关系

| 已有文档                                        | 关联问题               | 本次新增发现                                |
| ----------------------------------------------- | ---------------------- | ------------------------------------------ |
| `原型页升级死锁与AI工具链问题沉淀.md` P4         | EXTERNAL_DRIFT         | workspace-tree 全量覆盖重写行为              |
| `创作端编辑页-AI自动修复循环与WMA外部漂移.md`    | EXTERNAL_DRIFT         | drift 触发频率因反复重试而显著升高           |
| 各种 `routeKey` 相关讨论                         | routeKey 自动添加       | 无效 JSON 时的全量覆盖行为                   |

本次分析的**核心新发现**是：原型页静默注册失败 + 零反馈诊断 + 工具调用放大的恶性循环。

---

## 验证状态

- [ ] 未执行代码修复，本报告为纯分析文档
- [ ] 待确认根因：原型页注册失败的具体原因（需在 project-core 日志中追踪 `prototype-mvp_a1b2` 的注册流水）
- [ ] 待确认时序：`listPages` 快照延迟的实际量级

---

## 后续事项

1. **复现并定位注册失败根因**：用 `prototype-mvp_a1b2` 的 schema 在本地复现，追踪 project-core 的页面发现/注册日志
2. **增加诊断通道**：`listPages` 或 `writeFile` 返回值需包含页面注册拒绝原因（至少 error 级别）
3. **消除异步时序问题**：考虑让 `writeFile` 在返回前等待 project-core 完成页面注册，或在 `listPages` 中标记"扫描中"状态
4. **`captureScreenshot` 解耦前端焦点**：允许指定 pageId 独立截图，不依赖用户 UI 焦点状态
5. **空目录自动清理**：当页面所有文件被删除后，自动移除空目录
