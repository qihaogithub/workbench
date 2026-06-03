# AI 对话记忆功能方案 — memory.md

> 版本：v2.2（已上线）  
> 创建日期：2026-06-02  
> 最后更新：2026-06-03  
> 状态：已完成  
> 类型：方案设计 + 实施记录

---

## 一、背景与目标

### 1.1 背景

当前 AI 对话系统缺乏跨会话记忆。每次切换对话，AI 无法记住之前了解到的项目信息、用户偏好、架构决策等上下文。

### 1.2 目标

在工作区根目录创建一个 **面向用户** 的记忆文件 `memory.md`：

- **用户可直接阅读** — 用自然语言描述，非技术人员看得懂
- **用户可直接编辑** — 不满意 AI 写的内容，自己动手改
- **AI 自动维护** — 对话中发现重要信息时自动更新
- **跨会话持久化** — 切换对话后 AI 仍能通过阅读此文件了解上下文

### 1.3 与项目现有 `AGENTS.md` 的区别

| | `AGENTS.md`（系统文件） | `memory.md`（用户记忆文件） |
|---|---|---|
| **用途** | 告诉 AI 项目技术架构和开发规范 | 记录用户偏好、项目约定、关键决策 |
| **读者** | AI（技术人员） | 用户 + AI |
| **语言** | 技术术语、代码结构 | 自然语言、日常表达 |
| **维护者** | 开发者手动编辑 | AI 自动维护、用户可编辑 |
| **内容风格** | 精确、结构化 | 叙事化、易理解 |

> **重要**：`memory.md` 绝不替代或修改 `AGENTS.md`。两者共存，互不干扰。

---

## 二、方案设计

### 2.1 文件位置

```
项目根目录/memory.md
```

例：`/Users/zhangsan/my-project/memory.md`

### 2.2 文件模板（面向用户设计）

```markdown
# 项目记忆

> AI 自动维护 · 最后更新：2026-06-02

## 我的偏好

- 写代码前先说明思路，不要直接动手
- 拿不准时先问，不要自行决定
- 改配置时要解释每个字段是干什么的

## 关键决策

- 首页用轮播 banner 而非静态图 —— 更有动感，素材有多张可用
- 详情页不加下拉刷新 —— 内容一屏够用，加了反而不自然
```

### 2.3 AI 维护规则

以下规则注入到 AI 的 System Prompt 中：

---

#### 何时读取 memory.md

- **每次对话开始时**：AI 应先读取 `memory.md`，了解项目背景和用户偏好
- **用户问及项目信息时**：优先从 memory.md 中查找答案

#### 何时更新 memory.md

AI 在以下情况应主动更新 `memory.md`（使用 writeFile 工具）：

| 触发条件 | 用户典型发言 | 应更新的章节 |
|---|---|---|
| **用户明确要求记住** | "请记住这个"、"以后都这样做"、"把这个记下来" | 按内容放入对应章节 |
| **表达个人偏好** | "我不喜欢……"、"我更习惯……"、"遇到这种情况先问我" | 我的偏好 |
| **做出关键决策** | "那就用……吧"、"不用……了，换成……"、"我们决定……" | 关键决策 |

#### 不应该记录什么

- 一次性操作（如"帮我调大这个按钮"）—— 不是长期记忆
- 讨论过程中的试探和犹豫（如"要不试试 Redux？算了还是 Zustand 吧"）—— 只记最终决定
- 可以从代码里直接看到的信息（如"这个文件叫 index.tsx"）
- 密码、密钥、Token 等敏感信息
- **系统提示词中已有的编码规范**（如文件目录结构、TypeScript、Tailwind、shadcn/ui 等）—— memory.md 只记录对话中新产生的记忆，不重复系统已有的规则

#### 如何更新（操作规范）

1. **先读后写**：更新前必须先用 readFile 读取当前 memory.md 的完整内容
2. **增量编辑**：只修改需要更新的章节，其他章节保持原样不动
3. **保留用户手写内容**：如果某个章节的内容看起来是用户手动写的（格式、措辞与 AI 风格不同），不要覆盖，只追加新内容
4. **去重检查**：新增内容前先确认是否已有类似信息，避免重复
5. **更新日期**：每次修改后在顶部更新「最后更新」日期
6. **极简表达**：每条决策一句话说清，用「——」分隔决定和原因。偏好每条不超过 15 字
7. **控制总长度**：memory.md 建议控制在 1500 字以内。系统会在注入时自动告知当前字数，AI 无需自己统计。接近上限时，写入前先压缩：合并同类项、删过时信息、精简表达

#### 更新频率控制

- 同一对话中，同一条信息只更新一次，不要反复写
- 不是每轮对话都要更新，只在「发现值得记录的新信息」时才写
- 如果对话只是简单问答或代码调试，不需要更新

---

### 2.4 在约束架构中的定位（L4 记忆层）

根据项目现有的 AI 行为约束机制（L1-L4 四层架构），将 memory.md 定义为新增的 **L4 记忆层**，原用户确认层顺延为 **L5**。

```
┌──────────────────────────────────────────────────────┐
│ L5: 用户确认层 (原 L4)                                │
│   敏感操作需用户手动确认                               │
├──────────────────────────────────────────────────────┤
│ L4: 记忆层 (新增)                                     │
│   memory.md 注入到会话首条消息，提供跨会话长期记忆      │
├──────────────────────────────────────────────────────┤
│ L3: 动态上下文层                                      │
│   工作空间状态（页面列表、配置状态），每次发消息前刷新   │
├──────────────────────────────────────────────────────┤
│ L2: 系统提示层                                        │
│   AI 行为规则（100% 静态），应用启动时注入             │
├──────────────────────────────────────────────────────┤
│ L1: 文件系统权限层                                    │
│   路径/命令白黑名单 + beforeToolCall 拦截              │
└──────────────────────────────────────────────────────┘
```

**分层逻辑**：

| 层级 | 本质 | 变化频率 | 注入时机 |
|---|---|---|---|
| L1 | 硬限制（绝对不能做） | 几乎不变 | 工具层实时拦截 |
| L2 | 软约束（应该怎么做） | 应用启动后不变 | System Prompt（静态） |
| L3 | 动态感知（当前有什么） | 每次发消息可能变 | 每条消息前缀 |
| **L4** | **长期记忆（以前约定过什么）** | **对话之间可能变** | **会话首条消息注入** |
| L5 | 人工审核（关键操作需确认） | 每次操作可能触发 | 操作前弹出对话框 |

**为什么放在 L3 和 L5 之间而非依赖 AI 主动读取**：

- AI 主动用 readFile 读取 → 可能忘记、多一次工具调用、增加延迟
- 注入到消息中 → 保证每条新会话的首次消息 AI 都能看到，零额外开销

### 2.5 注入策略

memory.md 内容极简（几行偏好+几条决策），不会显著增加 token 消耗。

**注入时机**：仅在**会话首条消息**时，读取 memory.md 并注入到消息内容之前。

```
首条消息：${L3前缀} + ${L4记忆内容} + ${用户消息}
后续消息：${L3前缀} + ${用户消息}  （不重复注入 L4）
```

**字数提示**：系统读取 memory.md 后，自动在末尾附加当前字数统计：

```
[系统：当前 memory.md 共 847 字]
```

这样 AI 无需手动计数，看到接近 1500 就知道该压缩了。该行仅注入时不写入文件。

**为什么只注入首条消息**：

- L3 每次刷新是因为页面列表可能变了；memory.md 在会话中几乎不会变
- 重复注入浪费 token，且可能让 AI 过度关注记忆内容而非用户当前消息

**实现位置**：`packages/author-site/src/lib/agent/system-prompt.ts` 的 `buildDynamicContextPrefix()` 或其调用方（stream-service.ts / api/ai/chat/route.ts），在 L3 前缀之后追加 memory.md 内容及字数统计。

### 2.6 实现方式

#### 2.6.1 记忆注入（L4 层）

在发送消息前，读取工作区根目录的 `memory.md`，将内容注入到会话首条消息中：

- **位置**：`packages/author-site/src/lib/agent/system-prompt.ts` 或其调用方（stream-service.ts / api/ai/chat/route.ts）
- **逻辑**：首条消息时读取 `{workingDir}/memory.md`，将内容拼接在 L3 前缀之后
- **容错**：若 memory.md 不存在，跳过注入，不影响正常对话

#### 2.6.2 AI 维护规则（L2 层）

将「2.3 AI 维护规则」注入到 System Prompt 的 L2 静态部分（`DEMO_GENERATOR_TEMPLATE` 末尾或 `buildStaticSystemPrompt()` 中），告知 AI 何时、如何更新 memory.md。

#### 2.6.3 无需额外开发

- writeFile / readFile 工具已存在（`file-tools.ts`）
- 工作区路径已注入上下文
- 文件变更已通过 `afterToolCall` 自动捕获

#### 2.6.4 可选增强（后续迭代）

- 在作者端 UI 侧边栏显示 memory.md 内容，允许在线编辑
- 支持 AI 在对话中主动引用：「根据 memory.md 中记录的……」

---

## 三、与原方案的关键差异

| 维度 | 原方案（v1.0） | 优化方案（v2.0） |
|---|---|---|
| **文件名** | `AGENTS.md`（与系统文件冲突） | `memory.md`（独立，明确用途） |
| **读者定位** | AI 为主 | 用户为主，AI 为辅 |
| **模板语言** | 代码式占位符 `{日期}`, `[类型]` | 自然语言，完整描述 |
| **AI 规则** | 笼统的「何时更新」 | 表格化的触发条件 + 操作规范 |
| **用户编辑保护** | 仅测试方案提及 | 正式纳入操作规范 |
| **内容过期** | 无 | 无进度信息，无需过期机制 |
| **实现改动** | 声称「零代码」但不准确 | 明确标注需改 System Prompt |

---

## 四、实施计划

### 第一阶段：Prompt 调整（已完成 ✅）

1. ✅ 将「2.3 AI 维护规则」翻译为 System Prompt 格式
2. ✅ 注入到 `buildStaticSystemPrompt()` 的 L2 层
3. ✅ 确认 AI 能看到并理解 memory.md 的操作规范
4. ✅ 本地测试验证

### 第二阶段：初始记忆创建（已完成 ✅）

1. ✅ 用一场对话让 AI 了解项目基础信息
2. ✅ AI 自动生成第一版 memory.md
3. ✅ 人工检查内容是否准确、易读
4. ✅ 将 memory.md 纳入 `.gitignore`（因为包含用户个人偏好）

### 第三阶段：行为观察与调优（未开始 🔲）

1. 观察 AI 的实际记录行为
2. 根据表现调整记录的敏感度和频率
3. 优化模板结构

---

## 五、实施记录

### 5.1 第一阶段实施（2026-06-02）

#### 已完成的代码改动

| 文件 | 改动内容 |
|---|---|
| `packages/author-site/src/lib/agent/system-prompt.ts` | 新增 `MEMORY_MAINTENANCE_RULES` 常量（约 60 行，完整翻译自方案 2.3 节）；新增 `buildMemoryPrefix(content)` 函数（纯字符串格式化，含字数统计）；`L4_NOTICE` 重命名为 `USER_CONFIRMATION_NOTICE`（现为 L5）；`buildStaticSystemPrompt()` 的拼接顺序改为 `[DEMO_GENERATOR_TEMPLATE, MEMORY_MAINTENANCE_RULES, USER_CONFIRMATION_NOTICE]` |
| `packages/author-site/src/lib/agent/scan-workspace.ts` | 新增 `readMemoryContent(workingDir)` 函数（服务端文件读取，容错返回 null） |
| `packages/author-site/src/app/api/ai/chat/route.ts` | HTTP 路径：在 L3 上下文后追加 memory.md 内容注入；清理调试日志 |
| `packages/author-site/src/app/api/agent/workspace-context/route.ts` | API 响应新增 `memoryContent` 字段，供 streaming 客户端获取 |
| `packages/author-site/src/components/ai-elements/chat/services/stream-service.ts` | 新增 `hasInjectedMemory` 标记，首条消息注入 L4 记忆（后续消息跳过）；`close()` 时重置标记；函数 `fetchDynamicContextPrefix` 重命名为 `fetchContextPrefix`，返回 `{ l3, memory }`；清理调试日志 |
| `packages/agent-service/src/routes/websocket.ts` | `updateSystemPrompt()` 调用从 `agent.start()` 之前移至之后（修复时序 Bug）；将调用方式从 `'updateSystemPrompt' in agent` 改为 `agent instanceof BackendAgent && agent.updateSystemPrompt()` |
| `packages/agent-service/src/routes/agent.ts` | 同上，HTTP 路径的 `updateSystemPrompt()` 时序修复 + 类型安全调用 |
| `packages/agent-service/src/core/backend-agent.ts` | 新增 `updateSystemPrompt(newPrompt)` 方法，委托到 `this.backend.updateSystemPrompt()`（阻塞问题根因修复） |
| `packages/agent-service/src/backends/pi-agent.ts` | `updateSystemPrompt()` 日志从 `logger.debug` 改为 `logger.info`（便于诊断） |
| `packages/agent-service/tests/unit/update-system-prompt.test.ts` | 新增 2 个 BackendAgent 委托测试 |
| `.gitignore` | 添加 `memory.md` |

#### 遇到的 Bug 及修复

| # | Bug | 根因 | 修复 |
|---|---|---|---|
| 1 | `Module not found: Can't resolve 'fs'` | `system-prompt.ts` 导入了 `fs`/`path`，但该文件被客户端 `stream-service.ts` 引用，浏览器环境无 Node.js 模块 | 将 `readMemoryContent()` 从 `system-prompt.ts` 移至纯服务端的 `scan-workspace.ts`；`buildMemoryPrefix()` 保留在 `system-prompt.ts`（纯字符串操作） |
| 2 | `updateSystemPrompt` 调用时机错误 | 在 `agent.start()` 之前调用，此时 Pi Agent 的 `this.agent` 实例尚未创建（在 `initialize()` 中创建），`updateSystemPrompt` 检测到 `!this.agent` 后静默返回 | 将 `updateSystemPrompt()` 调用移至 `agent.start()` 之后，并移出 `if (agent.status === 'initializing')` 块以确保覆盖已有会话 |
| 3 | **System Prompt 注入核心阻塞**（最严重） | `manager.getOrCreate()` 返回 `BaseAgent`（实际为 `BackendAgent`），但 `updateSystemPrompt` 定义在 `PiAgentBackend` 上，`BackendAgent` 未转发此方法。`'updateSystemPrompt' in agent` 对 `BackendAgent` 返回 `false` | 在 `BackendAgent` 上新增 `updateSystemPrompt()` 委托方法；调用方改用 `agent instanceof BackendAgent` 检查 |

#### System Prompt 最终传递链路

```
stream-service.ts (STATIC_SYSTEM_PROMPT = buildStaticSystemPrompt())
  → AgentStream.send(content, id, { systemPrompt: STATIC_SYSTEM_PROMPT })
    → WebSocket JSON: { type: "message", systemPrompt: "...", ... }
      → websocket.ts: message.systemPrompt
        → agent instanceof BackendAgent && agent.updateSystemPrompt(message.systemPrompt)
          → BackendAgent.updateSystemPrompt() → this.backend.updateSystemPrompt()
            → PiAgentBackend.updateSystemPrompt() → this.agent.state.systemPrompt = newPrompt
```

---

## 六、风险与缓解

| 风险 | 缓解措施 |
|---|---|
| AI 过度记录，文件变长 | 建议 1500 字上限；系统自动附字数提示，接近上限时 AI 压缩后再写入 |
| AI 覆盖用户手写内容 | 操作规范要求「保留用户手写内容」 |
| AI 遗忘更新 | 对话结束前 System Prompt 提醒 AI 检查是否有遗漏 |
| 多个项目混用 | 每个项目根目录独立一个 memory.md |
| 敏感信息泄露 | System Prompt 明确禁止记录密码/密钥 |

---

## 七、总结

优化方案的核心改进：

1. **名称改为 `memory.md`** — 不与系统 `AGENTS.md` 冲突，含义清晰
2. **模板极简** — 每条决策一句话，用「——」分隔决定和原因；偏好每条不超过 15 字
3. **定位为 L4 记忆层** — 夹在 L3（动态上下文）和 L5（用户确认，原 L4）之间，自动化、无额外延迟
4. **会话首条消息注入** — 不依赖 AI 主动读取，保证每次新会话都能看到；不每条消息重复注入，节省 token
5. **保护用户编辑** — 明确要求 AI 检测并保留用户手动修改的内容

实施成本低（L2 加维护规则 + 消息发送前加 memory.md 读取），风险可控，可随时回退。
