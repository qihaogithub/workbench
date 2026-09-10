# AI 文件内容拼接污染——系统设计缺陷深度分析

## 当前状态

**已根治。** 通过 editFile 范式对齐 pi-agent 官方最佳实践（多块替换 + fuzzy matching），从架构层面切断了拼接污染的源头。模型不再需要“挬运”完整文件内容，拼接问题不再发生。

早期为缓解拼接问题而添加的临时修复（tool_result hook 截断、tryCompact compaction、Direction A 拼接检测）已全部移除——它们是在「模型必须生成完整文件内容」架构下的事后补丁，已被新范式取代。

本文档保留作为历史复盘记录。

---

## 问题现象（2026-07-14 对话记录实证）

- `prototype.html` 被拼接了 **4 份完整 HTML 文档**，包含 4 个 `<!DOCTYPE html>`、4 套完整 `<html>` 结构
- `prototype.css` 被拼接了 **2 份完整 CSS 文档**
- 拼接模式：占位 HTML + 实际页面 HTML + 占位 HTML + 实际页面 HTML（交替重复）
- AI 在对话中检测到污染并尝试清理，但清理过程本身也可能引入新的拼接

---

## 拼接定性：AI 模型生成，非系统 bug

### 系统写入路径排查结论

逐一排查所有系统写入路径，**全部为覆盖式（overwrite）原子操作，不存在任何 append 逻辑**：

| 写入路径 | 实现 | 语义 |
|----------|------|------|
| `writeTextAtomic`（Authority L957） | `writeFileSync(tmp)` + `renameSync` | 纯覆盖 |
| `put_text`（Authority L776） | 调用 `writeTextAtomic` | 纯覆盖 |
| `commitResource`（Persistence L164） | `authority.mutate` + `put_text` | 纯覆盖 |
| `replaceRoomText`（Collab L698） | Yjs 事务 `delete(0, len)` + `insert(0, content)` | 纯覆盖 |
| `flushRoom`（Collab L565） | 读取 Yjs 内容 → `commitResource` | 纯覆盖 |

拼接模式为**完整文档级重复**（4 份完整 HTML + 2 份完整 CSS），不符合系统竞态导致的碎片化交错特征。系统层面的乐观锁（`expectedHash`）和冲突检测机制会在并发写入时拒绝冲突，而非合并内容。

**结论：拼接内容是 AI 模型在 `writeFile` 的 `content` 参数中生成的，不是系统 bug 导致的。**

---

## 真正的根因：Agent 设计主动诱导 LLM 生成拼接内容

### 核心问题：不是"模型偶然拼接"，而是"架构迫使模型拼接"

拼接不是 LLM 的随机错误，而是当前 agent 数据流设计的**可预测后果**。以下是完整的证据链：

### 证据链 1：harness 对话历史无限累积，从不裁剪

通过阅读 `@earendil-works/pi-agent-core` 源码，确认以下完整调用链：

```
harness.prompt(text)
  → createTurnState()
    → session.buildContext()           // 返回 ALL session entries
      → buildSessionContext(entries)   // 遍历所有 entries，push 所有 messages
  → runAgentLoop(messages, context)
    → runLoop(initialContext)
      → streamAssistantResponse(currentContext)  // 发送 ALL messages 给 LLM
```

关键代码（`agent-harness.js:252-253`）：
```javascript
async createTurnState() {
    const context = await this.session.buildContext();  // 返回全部历史
```

`buildSessionContext`（`session.js:3-53`）遍历所有 entries，将**每条消息完整**推入 messages 数组——包括所有 tool call 的输入参数和返回结果。

**harness 提供了 `compact()` 方法用于裁剪历史，但 `packages/agent-service/src/` 中从未调用过。** `runAgentLoop` 内部也没有任何自动 compaction 逻辑。

### 证据链 2：readFile 返回完整文件内容，永久驻留对话历史

`readFile` 工具（`file-tools.ts:131-148`）：
```typescript
const content = snapshot
  ? snapshot.resources[args.path]
  : await fs.promises.readFile(filePath, "utf-8");
return {
  content: [{ type: "text", text: content }],  // 完整文件内容
};
```

每次 readFile 调用，完整文件内容作为 tool result 存入 session history，**永远不会被截断或移除**。一个 20 轮对话中如果同一文件被读取 5 次，对话历史中就包含该文件的 5 个完整版本。

### 证据链 3：writeFile 要求模型输出完整文件内容

`writeFile` 工具描述（`file-tools.ts:190-191`）：
> "Write the complete new content of a file, replacing the entire existing content."

writeFile 的 `content` 参数要求模型生成**完整的新文件内容**。模型必须从对话历史中的某个版本"复制"内容，然后在此基础上修改。

### 证据链 4：前端对话历史前缀造成冗余上下文

`buildConversationHistoryPrefix`（`use-chat-stream.ts:48-69`）取最近 8 条消息（每条截断到 2000 字符），作为 system-injected prefix 拼接到用户消息前面。

但 harness 内部已经维护了完整对话历史。这导致模型**同时看到两份文件内容来源**：
1. harness 内部的完整工具调用结果（未截断）
2. 前端注入的截断历史片段（可能包含不完整的文件内容）

截断片段可能包含半个文件内容，与 harness 中的完整版本混合，进一步增加拼接风险。

### 拼接发生的精确时序

```
Turn 1: 用户要求创建页面
  → AI 调用 readFile → harness 历史存入 prototype.html v1（50行）
  → AI 调用 writeFile(v1) → harness 历史存入 v1 内容

Turn 2: 用户要求修改页面
  → AI 调用 readFile → harness 历史存入 prototype.html v2（50行）
  → AI 生成 writeFile 内容时，模型上下文中包含 v1 + v2
  → AI 调用 writeFile(v2) → harness 历史存入 v2 内容

Turn 3: 用户要求进一步修改
  → AI 调用 readFile → harness 历史存入 prototype.html v3（50行）
  → AI 生成 writeFile 内容时，模型上下文中包含：
    - v1（50行，来自 Turn 1 的 readFile 结果）
    - v1（50行，来自 Turn 1 的 writeFile 参数）
    - v2（50行，来自 Turn 2 的 readFile 结果）
    - v2（50行，来自 Turn 2 的 writeFile 参数）
    - v3（50行，来自 Turn 3 的 readFile 结果）
    - 前端注入的截断历史（可能包含 v1/v2 的片段）
  → 模型在 6 个版本中"选择"内容，可能生成 v2+v3 的拼接（100行）
  → Direction A 检测：content.includes(existing) → existing 是 v3，
    但拼接内容是 v2+v3，不包含完整 v3 → 检测不触发
  → 污染写入成功

Turn 4+: 后续每次编辑都在已污染内容上操作，拼接越来越严重
```

### 证据链 5：harness 提供 compaction 能力但从未被调用；tool_result hook 已用于观测但未用于内容截断

**`compact()` 从未被调用**：`AgentHarness` 的 `compact()` 方法（`agent-harness.js:603-650`）支持完整的对话历史压缩：
- 调用 `session.getBranch()` 获取所有 entries
- 调用 `prepareCompaction()` 计算裁剪点
- 调用 `generateSummary()` 生成结构化摘要替换旧消息（含文件操作列表）
- 裁剪后只保留最近的 `keepRecentTokens`（默认 20000 tokens）预算内的消息
- 支持增量压缩：多次 compaction 自动合并摘要

但 `packages/agent-service/src/` 中**没有任何代码调用 `harness.compact()`**，`runAgentLoop` 内部也没有自动 compaction 逻辑。

**`tool_result` hook 已注册但仅用于观测**：`pi-agent.ts:383-395` 中已注册 `tool_result` hook，由 `ToolHookManager` 处理文件变更追踪、mutation receipt 记录、计划更新和知识库读取追踪。但 hook handler `return undefined`（L393），**没有修改 tool result 内容**——完整文件内容原样存入 session。harness 的 `afterToolCall`（`agent-harness.js:354-366`）支持通过 hook 返回值修改 `content`/`details`/`isError`/`terminate`，但项目代码未利用此能力。

### 为什么检测机制未能拦截

Direction A 的检测条件：

```typescript
args.content.length > existing.length * 1.5 &&
args.content.includes(existing) &&
args.content.length > 200
```

这个检测**只比较新内容与"磁盘上当前版本"的关系**。但问题的本质是：

1. **`includes` 要求精确匹配**：模型在 Turn 3 生成内容时，可能基于 Turn 1 的旧版本（而非磁盘当前版本）进行拼接。旧版本与磁盘版本有差异，`includes` 返回 false，检测完全失效
2. **检测时机太晚**：模型已经生成了拼接内容，检测只是拒绝写入。模型收到错误后重试，但对话历史中又多了失败尝试的内容，进一步增加拼接风险
3. **只覆盖 writeFile**：editFile 完全没有拼接检测

---

## 现有防护及其盲区

### 方向 A：writeFile 拼接检测（`file-tools.ts:251-279`）

**4 个具体盲区：**

| # | 盲区 | 说明 |
|---|------|------|
| 1 | **精确字符串匹配 `includes`** | 要求新内容完整包含磁盘上旧内容的每一个字符。AI 对旧内容做微小修改（多一个空行、少一个空格）即绕过 |
| 2 | **长度比阈值 1.5x** | 当旧内容本身很短时，拼接后的长度比可能不够大；当 AI 只拼接部分内容时，长度比也可能不触发 |
| 3 | **仅覆盖 writeFile** | editFile 工具完全没有拼接检测 |
| 4 | **只比较当前版本** | 无法检测"基于历史版本拼接"的情况——模型可能基于 Turn 1 的旧版本拼接，而非磁盘当前版本 |

### 方向 F：先读后写指令（`edit/page.tsx` auto-repair prompt）

auto-repair prompt（L2164）已增加：
> "修复前必须先用 readFile 读取当前文件内容"
> "使用 writeFile 时必须输出完整的新文件内容，不要将旧内容与新内容拼接"

问题：
- 仅影响 auto-repair 场景，不影响正常编辑流程
- 只是 prompt 指令，LLM 不一定遵守
- **即使 AI 先读了文件，harness 对话历史中仍有旧版本内容，模型仍可能基于旧版本拼接**

### 方向 G：工具描述增强

writeFile 工具描述改为"Write the complete new content of a file, replacing the entire existing content"——只是语义提示，对 LLM 约束力有限。

### 方向 B：fingerprint 修复

解决了自动修复循环终止问题，但不解决拼接发生本身。

---

## 其他系统设计缺陷

### 缺陷 2：editFile 完全没有拼接防护

`edit-file-tool.ts` 读取全文→替换→写回，无任何拼接检测。当文件已被污染时：
- `old_string` 可能在拼接内容中出现多次，触发多重匹配拒绝
- AI 被迫改用 writeFile，而 writeFile 的拼接检测又有盲区
- editFile 的替换操作在污染内容上执行，可能产生更复杂的污染

### 缺陷 3：没有结构性内容校验

系统缺乏对文件内容结构的校验。以下特征可以低成本检测拼接：
- HTML：多个 `<!DOCTYPE html>` 标签、多个 `<html>` 开标签
- CSS：多个相同选择器块、文件长度异常增长

这种结构性检测完全不依赖精确字符串匹配，能覆盖 AI 对旧内容做了微小修改的场景。

### 缺陷 4：写后验证而非写前验证

当前流程：AI 生成内容 → writeFile 写入 → 预览编译 → 发现错误 → 触发修复。文件先被污染到磁盘，验证才触发。

### 缺陷 5：System Prompt 缺乏防拼接指导

`system-prompt.md`（594 行）中没有任何关于防止文件内容拼接的指令——没有提到"不要将旧内容与新内容拼接"，没有提到"writeFile 必须输出完整独立的新文件"，没有提到"如果文件包含多个 DOCTYPE/html 标签必须先清理"。

### 缺陷 6：自动修复循环的"修复即污染"困境

当拼接被检测到后触发自动修复：
1. AI 读取被污染的文件 → 对话历史又多了污染版本
2. AI 尝试清理 → 但 harness 历史中已有污染版本
3. AI 生成"清理后"版本，可能再次拼接
4. 循环继续

方向 B 解决了循环终止，但每次循环中仍可能引入新拼接。

---

## 现有 P3 "已修复"标记的问题

| 方向 | 实施状态 | 实际效果 |
|------|----------|----------|
| A（拼接检测） | ✅ 已实施 | 精确匹配条件易被绕过，只覆盖 writeFile |
| F（先读后写） | ✅ 已实施 | 仅覆盖 auto-repair 场景，只是 prompt 指令 |
| G（工具描述） | ✅ 已实施 | 语义提示，约束力有限 |
| B（fingerprint） | ✅ 已实施 | 解决循环终止，不解决拼接发生 |
| D（写前验证） | ❌ 未实施 | 写入后才发现污染 |
| C（服务端预算） | ❌ 未实施 | 无 |
| E（自动截断） | ❌ 未实施 | 无 |

**所有已实施的方向都是在"写入端"做事后检测，没有解决"模型为什么生成拼接内容"的根因。**

---

## 改进建议

### 根治方案 vs 修复方案的区别

之前提出的所有方案（增强检测算法、加结构性校验、改 System Prompt）都是在**"AI 模型必须生成完整文件内容"**这个架构前提下做事后修补。它们能降低拼接发生的概率，但无法根除——因为只要文件内容通过模型上下文搬运，拼接就是 LLM 的自然倾向。

**根治 = 改变数据流架构，让模型不再承担"文件内容搬运"的角色。**

---

### 根治方案 A（最高优先级）：harness 对话历史中工具结果裁剪

**为什么这是根治**：拼接发生的直接原因是模型上下文中存在多个历史版本的完整文件内容。裁剪工具结果后，模型不再看到旧版本，拼接的信息来源被切断。

**具体做法**：

1. 在 harness 的 session 层面，对 readFile/writeFile 工具结果做截断——只保留最近 1 次的完整文件内容，更早的结果替换为摘要（如"[文件 X 已读取，150 行，上次修改 revision 149]"）
2. 当同一文件被多次读取时，自动移除旧的读取结果，只保留最新版本
3. 在 harness 发送请求给 LLM 前，对对话历史中的长文本工具结果做压缩

**实现路径**（已确认 harness 支持）：
- **路径 1（最快见效）**：利用 harness 的 `tool_result` hook（`agent-harness.js:354-366`），在 readFile/writeFile 结果存入 session 前截断——将完整内容替换为摘要（如"[文件 X 已读取，150 行]"）+ 前 50 行 + 后 20 行
- **路径 2（中期）**：在 `pi-agent.ts` 中定期调用 `harness.compact()`，当对话历史超过阈值时自动压缩
- **路径 3（长期）**：向 `@earendil-works/pi-agent-core` 提需求，增加 auto-compaction 配置项，在 `runAgentLoop` 中自动触发

---

### 根治方案 B：将 writeFile 限制为仅创建新文件

**为什么这是根治**：writeFile 要求模型生成完整文件内容，是拼接的最大来源。如果 writeFile 只能创建新文件，不能覆盖已有文件，那么对已有文件的修改只能通过 editFile（只输出变更部分），模型不再需要生成完整文件内容。

**具体做法**：

1. writeFile 增加检查：如果目标文件已存在，拒绝写入并提示"文件已存在，请使用 editFile 进行局部修改"
2. editFile 成为修改已有文件的唯一工具
3. readFile 返回完整内容（模型需要看到当前内容才能做局部修改），但配合方案 A 裁剪历史中的旧版本

**影响范围**：
- 需要评估当前有多少场景依赖 writeFile 覆盖已有文件（如 auto-repair 场景）
- auto-repair 可能需要特殊处理（允许在修复场景下覆盖写入，但增加结构性校验）

---

### 根治方案 C：readFile 返回结构化摘要而非完整内容

**为什么这是根治**：模型不需要看到完整文件内容就能做编辑决策。readFile 返回文件结构（如"HTML 文件，150 行，包含以下主要部分：head(1-15)、header(16-30)、main(31-120)、footer(121-150)"），模型基于结构描述决定要修改哪些行，然后用 editFile 做精确修改。

**具体做法**：

1. readFile 返回文件摘要：行数、主要结构段落、关键标签位置
2. 新增 `readFileLines(start, end)` 工具：只返回指定行范围的内容
3. 模型工作流变为：readFile（获取结构） → readFileLines（获取目标区域） → editFile（局部修改）
4. 模型始终只看到需要修改的部分， never 看到完整文件

**影响范围**：
- 模型对文件全貌的理解可能下降，需要摘要质量足够高
- 对新建文件场景不适用（仍需 writeFile）

---

### 修复方案（短期缓解，配合根治方案实施）

以下方案不能根治问题，但在根治方案实施前可以降低拼接发生率：

#### R1：增强拼接检测算法（弥补方向 A 盲区）

将 `content.includes(existing)` 替换为更鲁棒的检测：
- **结构性检测**：HTML 文件检查 `<!DOCTYPE html>` 出现次数 > 1；CSS/TSX 检查重复顶层结构
- **行级相似度检测**：检查新内容的前 N 行与旧内容的前 N 行的行匹配率
- **长度异常检测**：新内容长度 > 旧内容 × 1.8 时标记为可疑

#### R2：editFile 增加拼接防护

写入前检查 `newContent` 是否包含多个文档结构标记、长度是否异常增长。

#### R3：System Prompt 增加防拼接指令

明确约束"writeFile 输出完整独立的新文件""不要将对话历史中的旧版本复制到新内容中"。

---

### 方案对比

| 方案 | 类型 | 效果 | 实施难度 | 副作用 |
|------|------|------|----------|--------|
| A（harness 历史裁剪） | 根治 | 切断拼接信息来源 | 中（需改 harness 或提需求） | 模型可能缺少历史上下文 |
| B（writeFile 限新文件） | 根治 | 消除全量重写场景 | 低 | auto-repair 等场景需特殊处理 |
| C（readFile 返回摘要） | 根治 | 模型不再看到完整文件 | 高 | 模型理解力下降 |
| R1（增强检测） | 修复 | 提高拦截率 | 低 | 不解决拼接发生 |
| R2（editFile 防护） | 修复 | 覆盖 editFile 盲区 | 低 | 不解决拼接发生 |
| R3（System Prompt） | 修复 | 引导模型行为 | 低 | LLM 不一定遵守 |

**推荐实施顺序**：B + R1（短期见效）→ A（中期根治）→ C（长期增强）

---

## 关键文件清单

| 文件 | 角色 | 问题 |
|------|------|------|
| `@earendil-works/pi-agent-core` AgentHarness | 对话历史管理 | **核心根因**：session 对话历史无裁剪（`compact()` 未调用），工具结果完整累积 |
| `agent-harness.js:252-253` | `createTurnState()` | 调用 `session.buildContext()` 返回全部历史，无裁剪 |
| `session.js:3-53` | `buildSessionContext()` | 遍历所有 entries，push 所有 messages，包括完整 tool results |
| `agent-harness.js:603-650` | `compact()` 方法 | **已提供但从未被调用**，支持对话历史压缩，含增量摘要和文件操作追踪 |
| `agent-harness.js:354-366` | `tool_result` hook（`afterToolCall`） | **已注册用于观测（追踪文件变更），但 handler 返回 `undefined`，未修改 tool result 内容** |
| `agent-service/src/backends/pi-agent.ts:194-222` | Harness 初始化 | 创建 session 后无历史管理逻辑，未注册 compaction 或 tool result 截断 |
| `agent-service/src/backends/pi-tools/file-tools.ts:131-148` | readFile 工具 | 返回完整文件内容，永久驻留对话历史 |
| `agent-service/src/backends/pi-tools/file-tools.ts:251-279` | writeFile 拼接检测 | 检测算法有 4 个盲区，精确匹配易绕过 |
| `agent-service/src/backends/pi-tools/edit-file-tool.ts` | editFile 工具 | 完全没有拼接检测 |
| `author-site/src/lib/agent/prompts/system-prompt.md` | AI 系统提示词 | 无防拼接指令 |
| `author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts:48-69` | 对话历史前缀 | 截断到 2000 字符的片段与 harness 历史叠加，造成冗余上下文 |

---

## 结论

拼接污染反复出现的**真正根因**是 agent 数据流架构的设计缺陷：

> **拼接不是 LLM 的随机错误，而是当前 agent 设计的可预测后果。** 对话历史无限累积，`readFile` 返回完整内容永久驻留 session，`writeFile` 要求完整输出，模型在多个完整版本中"选择"内容时拼接是 LLM 的自然倾向。即使上下文远未达窗口上限，同一文件被读取 3-4 次后就足以诱发拼接。

**已实施根治**：

1. **editFile 工具重写**（`edit-file-tool.ts`）：对齐 pi-agent 官方参考实现，支持 `edits[]` 多块替换 + fuzzy matching + BOM/CRLF 保留。模型只需描述变更意图，不再挬运完整文件内容。
2. **writeFile 描述引导**（`file-tools.ts`）：通过工具描述引导模型使用 editFile 修改已有文件，writeFile 仅用于新建或完全重写。
3. **System Prompt 编辑规则**（`system-prompt.md`）：新增 File Editing Rules 段落，指导模型选择正确工具。
4. **移除临时修复**：
   - `tool_result` hook 的 readFile 截断逻辑（`pi-agent.ts:419-463`）—— 已移除，editFile 范式下不再需要
   - turn 间自动 compaction `tryCompact()`（`pi-agent.ts`）—— 已移除，editFile 范式下不再需要
   - writeFile Direction A 拼接检测（`file-tools.ts:251-279`）—— 已移除，editFile 范式下拼接源头已消除
