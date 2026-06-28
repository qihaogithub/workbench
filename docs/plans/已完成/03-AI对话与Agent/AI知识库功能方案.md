# AI Agent 知识库功能方案

> 版本：v2.0
> 创建日期：2026-06-04
> 最后更新：2026-06-04
> 状态：方案设计（未实施）
> 类型：方案设计

---

## 一、背景与目标

### 1.1 背景

当前 AI Agent 具备以下上下文获取能力：

| 能力 | 实现方式 | 层级 | 局限 |
|:-----|:---------|:-----|:-----|
| 行为规则 | System Prompt 静态注入 | L2 | 仅系统预设规则，不可扩展 |
| 工作空间状态 | 每条消息前缀动态注入 | L3 | 仅页面列表等结构信息 |
| 参考手册 | `references/` 目录，L2 硬编码路径引导 AI 查阅 | L3 | 无索引机制，AI 靠 L2 盲查；用户不可见 |
| 跨会话记忆 | `memory.md` 首条消息注入 | L4 | 仅记录偏好和决策，1500 字上限 |

**缺失的场景**：用户拥有项目专属的领域知识（设计规范、业务术语、API 文档、组件用法等），需要 AI 在对话中参考这些知识来做出更准确的判断。当前这些知识无处存放，AI 无法感知。

**`references/` 的问题**：

- L2 中硬编码 `readFile("references/config-system.md")`，不灵活
- 没有 index 机制，AI 只能靠 L2 指令"盲查"
- 用户完全看不到系统预设了什么参考，缺乏透明度
- 与知识库功能在 AI 视角下完全同构（都是"只读 Markdown 知识源，AI 按需 readFile"），却分两个目录维护

### 1.2 目标

为 Agent 添加**项目知识库**功能，同时**合并 `references/`** 为统一知识源：

- **统一知识源** — 将 `references/` 合并进 `knowledge/`，系统预设条目与用户条目共存，通过 `source` 字段区分
- **用户可管理** — 通过创作端 UI 添加、编辑、删除 Markdown 格式的知识文档；系统预设条目对用户只读
- **AI 可感知** — Agent 在对话中能查阅知识库内容，作为决策参考；统一的索引机制取代 L2 硬编码路径
- **项目级隔离** — 每个项目拥有独立的知识库，互不干扰
- **与记忆系统互补** — 知识库存放领域知识，记忆系统记录用户偏好，职责分明

### 1.3 知识库 vs 记忆系统

| 维度 | 知识库（新增，合并 references） | 记忆系统（L4） |
|:-----|:-------------------------------|:-------------|
| **内容性质** | 项目领域知识、设计规范、业务术语、系统参考 | 用户偏好、关键决策 |
| **维护者** | 系统预设条目（只读）+ 用户手动管理 | AI 自动维护 + 用户可编辑 |
| **文件数量** | 多文件（系统预设 + 用户自由添加） | 单文件 `memory.md` |
| **容量** | 无硬性上限（按需注入） | 1500 字上限 |
| **变化频率** | 低（偶尔增删改） | 中（对话中可能更新） |
| **注入策略** | 索引常驻 L3 + AI 按需 readFile | 首条消息全量注入 |

---

## 二、方案设计

### 2.1 存储设计

#### 2.1.1 文件位置

```
{项目工作空间}/knowledge/
├── manifest.json              # 知识库清单（元数据索引）
├── 配置系统参考.md             # 系统预设（原 references/config-system.md）
├── 设计规范.md                 # 用户添加的知识文档
├── 业务术语表.md               # 用户添加的知识文档
└── API接口文档.md              # 用户添加的知识文档
```

- 知识文档统一存放在工作空间 `knowledge/` 目录下
- `manifest.json` 为系统维护的元数据索引，记录每个知识文档的来源、标题、描述、文件名、添加时间
- 文件名由标题生成，用户看到的是标题
- 原 `references/` 目录废弃，内容迁移至 `knowledge/` 作为系统预设条目

#### 2.1.2 manifest.json 结构

```json
{
  "version": 1,
  "items": [
    {
      "id": "kb_sys_001",
      "title": "配置系统参考",
      "source": "system",
      "description": "配置系统支持的控件类型、扩展字段和完整示例",
      "fileName": "配置系统参考.md",
      "addedAt": "2026-06-04T10:00:00Z",
      "updatedAt": "2026-06-04T10:00:00Z",
      "sizeBytes": 4096
    },
    {
      "id": "kb_001",
      "title": "设计规范",
      "source": "user",
      "description": "项目UI设计规范，包含颜色、字体、间距标准",
      "fileName": "设计规范.md",
      "addedAt": "2026-06-04T10:00:00Z",
      "updatedAt": "2026-06-04T10:00:00Z",
      "sizeBytes": 2048
    }
  ]
}
```

**`source` 字段说明**：

| 值 | 含义 | 用户权限 | AI 权限 | 删除 |
|:---|:-----|:---------|:--------|:-----|
| `"system"` | 系统预设（原 references 内容） | 只读 | 只读 | 不可删除 |
| `"user"` | 用户添加 | 可编辑 | 只读 | 可删除 |

#### 2.1.3 文件命名规则

- 用户添加知识文档时指定标题，系统以标题作为文件名（后缀 `.md`）
- 同名文件自动追加序号：`设计规范.md` → `设计规范_2.md`
- 文件名仅允许中文、英文、数字、下划线、连字符，其余字符替换为下划线

### 2.2 注入策略

采用**索引常驻 + 按需读取**策略，统一覆盖系统预设和用户添加的所有知识文档。

#### 2.2.1 L3 动态上下文增强

在每次发送消息前的 L3 动态上下文扫描中，增加知识库索引信息：

```
当前工作空间中的页面（系统自动扫描）：
- 首页 (home)
- 详情页 (detail)

项目知识库（共 4 篇）：
- 配置系统参考：配置系统支持的控件类型、扩展字段和完整示例（knowledge/配置系统参考.md）
- 设计规范：项目UI设计规范，包含颜色、字体、间距标准（knowledge/设计规范.md）
- 业务术语表：核心业务概念和术语解释（knowledge/业务术语表.md）
- API接口文档：后端API接口定义和调用说明（knowledge/API接口文档.md）
→ 需要查阅时请用 readFile 读取对应文件
```

**设计理由**：

- 索引信息极短（每篇一行标题+描述），不显著增加 token
- AI 看到索引后可自行判断是否需要读取具体文件
- 避免将所有知识文档内容全量注入导致 token 浪费
- 统一索引覆盖系统预设和用户文档，AI 不再需要 L2 硬编码路径

#### 2.2.2 L2 系统提示调整

在 `system-prompt.md` 中：

**新增**知识库查阅指引段落：

```
## 知识库查阅

项目知识库中包含系统参考和用户添加的知识文档（knowledge/ 目录）。当用户的问题涉及以下场景时，应先读取相关知识文档：
- 生成或修改 config.schema.json 时，必须先读取配置系统参考文档
- 用户提及项目特有的设计规范、样式标准
- 用户使用项目特有的业务术语
- 用户要求遵循特定的编码约定或组件用法
- 用户明确要求"按照知识库中的规范来做"

查阅方式：先从上下文中的知识库索引确定需要读取的文件名，再用 readFile 读取 knowledge/{文件名}。
```

**删除**原有 `references/` 相关内容：

- 删除 `# 参考文件` 段落（`生成或修改 config.schema.json 前，**必须先读取** references/config-system.md`）
- 删除 `config.schema.json` 要求中的 `（详见 references/config-system.md）`，改为 `（详见知识库中配置系统参考文档）`

> **注意**：system-prompt.md 内容变化会导致 LLM API 缓存短暂失效一次。之后新缓存持续命中，无持续影响。

#### 2.2.3 不采用全量注入的原因

| 方案 | 优点 | 缺点 |
|:-----|:-----|:-----|
| **全量注入每条消息** | AI 始终能看到全部知识 | 知识库可能很大，token 浪费严重 |
| **全量注入首条消息** | 类似 L4 记忆，简单 | 知识库可能远超 1500 字，首条消息过长 |
| **索引常驻 + 按需读取** ✅ | token 效率高，按需加载 | 需要额外一次 readFile 调用 |

### 2.3 权限设计（L1 层）

**读取权限**：`allowedPaths` 首条规则 `**` 已覆盖所有路径（包括 `knowledge/`），无需额外添加白名单条目。

**写保护**：AI 只能**读取**知识库文件，不能**修改或删除**。采用 **L1 硬限制 + L2 软约束** 双重保障：

- L1：`beforeToolCall` 钩子拦截 `writeFile` 对 `knowledge/` 路径的写入
- L2：`system-prompt.md` 明确告知 AI「知识库由用户管理，AI 不得修改」

```typescript
// pi-agent.ts beforeToolCall 增强
function isKnowledgeBasePath(filePath: string, workingDir: string): boolean {
  // 统一为相对路径再判断，兼容绝对路径和相对路径输入
  const resolved = path.resolve(workingDir, filePath);
  const relative = path.relative(workingDir, resolved);
  const normalized = relative.replace(/\\/g, '/');
  return normalized === 'knowledge' ||
         normalized.startsWith('knowledge/') ||
         normalized.startsWith('knowledge\\');
}

beforeToolCall: async (context) => {
  const toolName = context.toolCall.name;

  // 知识库写保护：仅拦截 writeFile，允许 readFile / listFiles
  if (toolName === 'writeFile') {
    const args = context.args as { path?: string };
    if (args.path && isKnowledgeBasePath(args.path, this.config.workingDir ?? '')) {
      return {
        block: true,
        reason: '知识库文件由用户管理，AI 不可修改。如需更新请提示用户在知识库面板中操作。',
      };
    }
  }

  // ... 原有 isPathAllowed 权限检查逻辑
};
```

### 2.4 在约束架构中的定位

知识库不新增独立层级，而是**增强现有的 L2 + L3 层**：

```
┌──────────────────────────────────────────────────────────────────┐
│ L5: 用户确认层                                                    │
├──────────────────────────────────────────────────────────────────┤
│ L4: 记忆层 (memory.md)                                           │
├──────────────────────────────────────────────────────────────────┤
│ L3: 动态上下文层（增强）                                          │
│   工作空间页面列表 + 【知识库索引（系统+用户统一）】                │ ← 增强
├──────────────────────────────────────────────────────────────────┤
│ L2: 系统提示层（增强）                                            │
│   行为规则 + 记忆维护规则 + 【知识库查阅指引】 + 权限确认说明       │ ← 增强
│   （删除 references/ 硬编码路径，改为统一索引指引）                │
├──────────────────────────────────────────────────────────────────┤
│ L1: 文件系统权限层（增强）                                        │
│   路径白黑名单 + 【knowledge/ 只读保护（beforeToolCall）】         │ ← 增强
└──────────────────────────────────────────────────────────────────┘
```

**不新增 L6 的原因**：知识库的注入机制（索引常驻 + 按需读取）属于 L3 层的扩展，不需要独立层级。

---

## 三、创作端 UI 设计

### 3.1 Tab 结构调整

将当前左侧栏「代码」Tab 重命名为「文件」，内部增加**视图切换**：

```
┌──────────────────────────────────────────┐
│  [AI对话]  [页面]  [文件]  [版本]         │  ← "代码" → "文件"
├──────────────────────────────────────────┤
│  [文档视图]  [代码视图]                    │  ← 子视图切换
├──────────────────────────────────────────┤
│                                          │
│  当前视图的内容                           │
│                                          │
└──────────────────────────────────────────┘
```

**视图切换设计**：

| 视图 | 面向用户 | 内容 | 交互 |
|:-----|:---------|:-----|:-----|
| **文档视图** | 所有用户 | 知识库文档列表（系统预设 + 用户添加） | 阅读、添加、编辑、删除 |
| **代码视图** | 技术用户 | 工作空间文件树 | 浏览、查看代码、编辑白名单文件 |

**设计理由**：

- 知识库文档本质上是工作空间文件的一部分，属于同一个 Tab 的内容
- 文档视图提供用户友好的阅读体验，无需接触代码
- 代码视图保留完整的文件树和代码编辑能力
- 避免左侧栏 Tab 过多（当前已有 4 个 Tab）

### 3.2 文档视图

```
┌─────────────────────────────────────┐
│  项目知识库                    [+添加] │
├─────────────────────────────────────┤
│                                     │
│  🔒 配置系统参考              [系统]   │  ← 系统预设，只读
│     配置系统支持的控件类型和完整示例    │
│                                     │
│  📄 设计规范                        │  ← 用户添加，可编辑/删除
│     项目UI设计规范，包含颜色、字体…   │
│     添加于 06-04              [···]  │
│                                     │
│  📄 业务术语表                      │
│     核心业务概念和术语解释            │
│     添加于 06-03              [···]  │
│                                     │
│  📄 API接口文档                     │
│     后端API接口定义和调用说明         │
│     添加于 06-02              [···]  │
│                                     │
├─────────────────────────────────────┤
│  💡 AI 对话中会自动参考知识库内容     │
└─────────────────────────────────────┘
```

- 系统预设条目：显示 `[系统]` 标签，无编辑/删除按钮，点击可阅读
- 用户条目：显示添加日期，`[···]` 菜单含编辑、删除
- `[+添加]` 按钮：打开添加对话框（仅添加用户条目）
- 点击任意条目标题：打开阅读/编辑视图

### 3.3 文档阅读/编辑视图

点击知识库条目后，在侧边栏内展开阅读视图（不弹窗，利用侧边栏已有空间）：

**系统条目（只读）**：

```
┌─────────────────────────────────────┐
│  ← 返回列表    配置系统参考    [系统]  │
├─────────────────────────────────────┤
│                                     │
│  （Markdown 渲染预览）               │
│                                     │
│  # 配置系统                          │
│                                     │
│  配置系统支持以下控件类型...          │
│                                     │
└─────────────────────────────────────┘
```

**用户条目（可编辑）**：

```
┌─────────────────────────────────────┐
│  ← 返回列表    设计规范       [编辑]  │
├─────────────────────────────────────┤
│                                     │
│  （Markdown 渲染预览 / 编辑模式切换） │
│                                     │
│  # 设计规范                          │
│                                     │
│  ## 颜色标准                         │
│  主色：#1a1a2e...                    │
│                                     │
└─────────────────────────────────────┘
```

- 默认渲染预览模式，点击 `[编辑]` 切换为 Markdown 源码编辑
- 编辑模式下显示保存/取消按钮
- 复用现有 `MemoryMarkdownEditor` 组件（支持预览/编辑双模式）

### 3.4 添加知识文档

点击 `[+添加]` 按钮后，在侧边栏内展开添加表单：

```
┌─────────────────────────────────────┐
│  ← 返回列表    添加知识文档           │
├─────────────────────────────────────┤
│  标题：[_________________________]  │
│  描述：[_________________________]  │
│                                     │
│  内容（Markdown）：                   │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │  （Markdown 编辑器）         │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  或 [上传 .md 文件]                  │
│                                     │
│         [取消]    [添加]             │
└─────────────────────────────────────┘
```

**上传方式**：

- 支持拖拽或点击上传 `.md` 文件
- 自动提取文件名作为标题，首段作为描述
- 上传后可编辑标题和描述

### 3.5 删除知识文档

点击 `[···]` → 删除，弹出确认对话框后删除。删除操作同时移除文件和 manifest.json 中的记录。系统条目不可删除。

### 3.6 代码视图

代码视图保持现有 `WorkspaceFileTree` 不变：

- 展示工作空间文件目录树（懒加载子目录）
- `knowledge/` 目录从文件树中隐藏（`HIDDEN_ENTRIES`），由文档视图管理
- 点击文件 → 弹出 `WorkspaceCodeDialog` 查看代码/编辑

---

## 四、API 设计

### 4.1 创作端 API（author-site）

知识库文件存储在工作空间目录中，创作端通过文件系统操作（与现有工作空间管理方式一致）。

API 设计对齐现有 `workspace-context` 接口的 `workingDir` 参数模式：

| 方法 | 路径 | 说明 |
|:-----|:-----|:-----|
| GET | `/api/agent/workspace-context` | 已有接口，扩展返回 `knowledgeIndex` 字段 |
| GET | `/api/knowledge?workingDir=...` | 获取知识库列表（读取 manifest.json） |
| POST | `/api/knowledge?workingDir=...` | 添加知识文档（仅 `source: "user"`，写入 .md + 更新 manifest） |
| PUT | `/api/knowledge/{docId}?workingDir=...` | 更新知识文档（仅 `source: "user"` 条目可更新） |
| DELETE | `/api/knowledge/{docId}?workingDir=...` | 删除知识文档（仅 `source: "user"` 条目可删除） |

> **设计说明**：
> - 使用 `workingDir` 查询参数而非路径中的 `projectId`，因为知识库存储在工作空间文件系统中，`workingDir` 是唯一直接可用的定位键。现有 `workspace-context` API 也采用此模式。
> - PUT / DELETE 操作需校验 `source === "user"`，系统条目返回 403。

### 4.2 workspace-context API 扩展

现有 `api/agent/workspace-context/route.ts` 返回 `{ ...context, memoryContent }`，扩展返回知识库索引：

```typescript
// 扩展后响应结构
{
  projectName: string;
  projectConfigStatus: string;
  pageCount: number;
  pageList: string;
  workspacePath: string;
  memoryContent: string | null;     // 已有：L4 记忆原始内容
  knowledgeIndex: string | null;    // 新增：知识库索引（格式化文本，无知识库时为 null）
}
```

客户端 `fetchContextPrefix()` 获取后，由 `buildDynamicContextPrefix()` 渲染 L3，知识库索引独立拼接（不混入 workspace-status 模板），与 L4 记忆的拼接方式一致。

`knowledgeIndex` 格式示例：

```
项目知识库（共 4 篇）：
- 配置系统参考：配置系统支持的控件类型、扩展字段和完整示例（knowledge/配置系统参考.md）
- 设计规范：项目UI设计规范，包含颜色、字体、间距标准（knowledge/设计规范.md）
- 业务术语表：核心业务概念和术语解释（knowledge/业务术语表.md）
- API接口文档：后端API接口定义和调用说明（knowledge/API接口文档.md）
→ 需要查阅时请用 readFile 读取对应文件
```

### 4.3 Agent-service 侧

无需新增 API。Agent 通过已有的 `readFile` 工具读取 `knowledge/` 目录下的文件，通过 `listFiles` 工具列出知识库文件。

---

## 五、实现方案

### 5.1 涉及模块与改动

#### 5.1.1 author-site 改动

| 文件 | 改动内容 |
|:-----|:---------|
| `src/lib/agent/scan-workspace.ts` | 新增 `scanKnowledgeIndex(workingDir)` 函数，读取 `knowledge/manifest.json` 并格式化为索引文本 |
| `src/lib/agent/prompts/system-prompt.md` | 新增知识库查阅指引段落；删除 `references/config-system.md` 硬编码引用，改为"详见知识库中配置系统参考文档" |
| `src/lib/agent/system-prompt.ts` | 新增 `buildKnowledgeIndexPrefix(content)` 函数（纯字符串格式化，与 `buildMemoryPrefix` 同模式） |
| `src/app/api/agent/workspace-context/route.ts` | 响应新增 `knowledgeIndex` 字段 |
| `src/app/api/knowledge/route.ts` | 新增知识库 CRUD API（GET / POST，`workingDir` 查询参数，PUT/DELETE 校验 source） |
| `src/app/api/knowledge/[docId]/route.ts` | 新增知识库单文档 API（PUT / DELETE，校验 source === "user"） |
| `src/components/ai-elements/chat/services/stream-service.ts` | `fetchContextPrefix()` 返回值新增 `knowledgeIndex`，拼接到 L3 前缀之后、L4 记忆之前 |
| `src/lib/workspace-file-utils.ts` | `HIDDEN_ENTRIES` 移除 `"references"`，新增 `"knowledge"` |
| `src/lib/fs-utils.ts` | `ensureWorkspaceFiles()` 改为创建 `knowledge/` 目录 + 系统预设条目 + `manifest.json`（替代原 references/ 复制） |
| `src/components/demo/WorkspaceFileTree.tsx` | 无改动（代码视图保持不变） |
| `src/components/demo/KnowledgePanel.tsx` | 新增文档视图组件（知识库列表 + 阅读/编辑/添加） |
| `src/app/demo/[id]/edit/page.tsx` | "代码" Tab 重命名为"文件"；内部增加文档视图/代码视图切换；集成 KnowledgePanel |

#### 5.1.2 agent-service 改动

| 文件 | 改动内容 |
|:-----|:---------|
| `src/backends/pi-agent.ts` | `beforeToolCall` 钩子增加 `knowledge/` 目录写保护（新增 `isKnowledgeBasePath()` 辅助函数） |

> **注意**：`permissions.ts` 无需修改。`allowedPaths` 首条 `**` 已覆盖读取权限；写保护通过 `beforeToolCall` 在 `pi-agent.ts` 中实现，与现有 `isPathAllowed` 检查分离，职责更清晰。

#### 5.1.3 shared 改动

无需改动。System Prompt 已从 shared 迁移至 `author-site/src/lib/agent/prompts/system-prompt.md`。

#### 5.1.4 项目模板改动

| 文件 | 改动内容 |
|:-----|:---------|
| `data/projects/proj_*/workspace/references/` | 删除 `references/` 目录 |
| `data/projects/proj_*/workspace/knowledge/` | 新增 `knowledge/` 目录，含系统预设 .md 文件和 `manifest.json` |

### 5.2 核心实现逻辑

#### 5.2.1 知识库索引扫描

```typescript
// scan-workspace.ts（与现有 scanWorkspaceContext / readMemoryContent 同模式，同步 fs 操作）
export function scanKnowledgeIndex(workingDir: string): string | null {
  const manifestPath = path.join(workingDir, 'knowledge', 'manifest.json');
  try {
    if (!fs.existsSync(manifestPath)) return null;
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);
    if (!manifest.items || manifest.items.length === 0) return null;
    const lines = manifest.items.map(
      (item: { title: string; description: string; fileName: string }) =>
        `- ${item.title}：${item.description}（knowledge/${item.fileName}）`
    );
    return `项目知识库（共 ${manifest.items.length} 篇）：\n${lines.join('\n')}\n→ 需要查阅时请用 readFile 读取对应文件`;
  } catch {
    return null;
  }
}
```

#### 5.2.2 上下文拼接（stream-service.ts）

对齐现有 `sendMessage()` 中的拼接逻辑，知识库索引插入 L3 与 L4 之间：

```typescript
// stream-service.ts sendMessage() 中
let finalContent = message;
if (workingDir) {
  let ctx = await fetchContextPrefix(workingDir);
  // ... 重试逻辑同现有代码 ...
  if (ctx.l3) {
    // 知识库索引：每条消息都注入（与 L3 同频，因为知识库可能被用户更新）
    const knowledgePrefix = ctx.knowledgeIndex
      ? buildKnowledgeIndexPrefix(ctx.knowledgeIndex)
      : '';
    // L4 记忆：仅首条消息注入
    const memoryPrefix = (!this.hasInjectedMemory && ctx.memory)
      ? ctx.memory
      : '';
    if (memoryPrefix) this.hasInjectedMemory = true;
    finalContent = `${ctx.l3}${knowledgePrefix}${memoryPrefix}${message}`;
  }
}
```

拼接顺序：`L3页面列表` + `知识库索引` + `L4记忆(仅首条)` + `用户消息`

**为什么知识库索引每条消息都注入**：与 L3 同频，因为用户可能在对话中途通过文档视图添加/删除了文档，索引需要反映最新状态。索引本身极短（每篇一行），token 开销可忽略。

#### 5.2.3 知识库写保护

见 [2.3 权限设计](#23-权限设计l1-层) 中的 `isKnowledgeBasePath()` 和 `beforeToolCall` 实现。

#### 5.2.4 工作空间初始化（替代 references/ 复制）

```typescript
// fs-utils.ts ensureWorkspaceFiles() 修改
// 原：通过 fs.cpSync 从项目模板复制 references/ 目录
// 新：显式创建 knowledge/ 目录 + 系统预设条目

function ensureKnowledgeDir(workspacePath: string): void {
  const knowledgeDir = path.join(workspacePath, 'knowledge');
  if (fs.existsSync(knowledgeDir)) return;

  fs.mkdirSync(knowledgeDir, { recursive: true });

  // 写入系统预设知识文档
  const systemDoc = {
    id: 'kb_sys_001',
    title: '配置系统参考',
    source: 'system',
    description: '配置系统支持的控件类型、扩展字段和完整示例',
    fileName: '配置系统参考.md',
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 系统预设文档内容（原 references/config-system.md 内容）
  fs.writeFileSync(
    path.join(knowledgeDir, systemDoc.fileName),
    CONFIG_SYSTEM_REFERENCE_CONTENT,  // 常量或从模板读取
    'utf-8'
  );

  // 写入 manifest.json
  fs.writeFileSync(
    path.join(knowledgeDir, 'manifest.json'),
    JSON.stringify({ version: 1, items: [systemDoc] }, null, 2),
    'utf-8'
  );
}
```

### 5.3 知识库 CRUD API 实现

```typescript
// api/knowledge/route.ts

// GET - 获取知识库列表
// 1. 从 workingDir 查询参数获取工作空间路径
// 2. 读取 {workingDir}/knowledge/manifest.json，返回 items 数组
// 3. manifest.json 不存在时返回空数组（首次使用）

// POST - 添加知识文档（仅 source: "user"）
// 1. 确保 {workingDir}/knowledge/ 目录存在（首次创建）
// 2. 从请求体获取 title、description、content
// 3. 生成安全文件名（sanitize title → fileName）
// 4. 同名文件追加序号
// 5. 写入 {workingDir}/knowledge/{fileName}
// 6. 初始化或更新 manifest.json（追加 item，source 固定为 "user"，生成 docId）
// 7. 返回新创建的 item

// api/knowledge/[docId]/route.ts

// PUT - 更新知识文档（仅 source: "user"）
// 1. 从 manifest.json 查找 item by docId
// 2. 校验 source === "user"，否则返回 403
// 3. 覆盖写入 .md 文件
// 4. 更新 manifest.json 中的 updatedAt / description
// 5. 返回更新后的 item

// DELETE - 删除知识文档（仅 source: "user"）
// 1. 从 manifest.json 查找 item by docId
// 2. 校验 source === "user"，否则返回 403
// 3. 删除 .md 文件
// 4. 从 manifest.json 移除 item
// 5. 返回成功
```

### 5.4 references/ 迁移策略

对于已存在 `references/` 目录的旧项目工作空间，需在首次加载时自动迁移：

```typescript
// scan-workspace.ts 或 fs-utils.ts 中
export function migrateReferencesToKnowledge(workingDir: string): void {
  const referencesDir = path.join(workingDir, 'references');
  const knowledgeDir = path.join(workingDir, 'knowledge');

  // 仅在 references/ 存在且 knowledge/ 不存在时迁移
  if (!fs.existsSync(referencesDir) || fs.existsSync(knowledgeDir)) return;

  fs.mkdirSync(knowledgeDir, { recursive: true });

  // 读取 references/ 下所有 .md 文件
  const files = fs.readdirSync(referencesDir).filter(f => f.endsWith('.md'));
  const items = files.map((file, index) => {
    const title = file.replace(/\.md$/, '');
    // 复制文件到 knowledge/
    fs.copyFileSync(
      path.join(referencesDir, file),
      path.join(knowledgeDir, file)
    );
    return {
      id: `kb_sys_${String(index + 1).padStart(3, '0')}`,
      title,
      source: 'system',
      description: `系统预设参考文档`,
      fileName: file,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  // 写入 manifest.json
  if (items.length > 0) {
    fs.writeFileSync(
      path.join(knowledgeDir, 'manifest.json'),
      JSON.stringify({ version: 1, items }, null, 2),
      'utf-8'
    );
  }

  // 删除旧 references/ 目录
  fs.rmSync(referencesDir, { recursive: true });
}
```

迁移时机：`workspace-context` API 被调用时（即每次 AI 对话前），在 `scanKnowledgeIndex()` 之前执行 `migrateReferencesToKnowledge()`。迁移仅执行一次（knowledge/ 目录存在后跳过）。

---

## 六、数据流总览

### 6.1 知识库索引注入流程

```
用户发送消息
  ↓
stream-service.ts / api/ai/chat/route.ts
  ↓
fetchContextPrefix(workingDir)
  ├─ scanWorkspaceContext(workingDir) → L3 页面列表
  ├─ migrateReferencesToKnowledge(workingDir) → 旧项目迁移（仅一次） ← 新增
  ├─ scanKnowledgeIndex(workingDir)  → 知识库索引（系统+用户统一）  ← 新增
  └─ readMemoryContent(workingDir)   → L4 记忆
  ↓
finalContent = `${L3页面列表}${知识库索引}${L4记忆(仅首条)}${用户消息}`
  ↓
发送到 agent-service
```

### 6.2 AI 查阅知识库流程

```
AI 收到消息，看到知识库索引
  ↓
AI 判断需要查阅某个知识文档（如配置系统参考）
  ↓
AI 调用 readFile("knowledge/配置系统参考.md")
  ↓
L1 权限检查：isPathAllowed → ** 通配命中 → ✅ 读取通过
L1 写保护检查：readFile 非 writeFile → 跳过
  ↓
AI 获取知识文档内容，结合内容回答用户问题
```

### 6.3 用户管理知识库流程

```
用户在创作端打开"文件" Tab → 文档视图
  ↓
GET /api/knowledge?workingDir=... → 获取知识库列表
  ↓
用户点击"添加" → 填写标题、描述、内容
  ↓
POST /api/knowledge?workingDir=... → 写入 .md + 更新 manifest
  ↓
文档视图刷新，新文档出现在列表中
  ↓
下次 AI 对话时，L3 索引自动包含新文档
```

---

## 七、边界情况与约束

### 7.1 容量控制

| 场景 | 处理策略 |
|:-----|:---------|
| 单个文档过大（>50KB） | 添加时提示用户文档过大，建议拆分；不硬性阻止 |
| 文档总数过多（>20篇） | 索引信息仍然简短，不影响性能；AI 按需读取 |
| manifest.json 损坏 | 容错处理：扫描 knowledge/ 目录重建索引 |

### 7.2 文件安全

| 场景 | 处理策略 |
|:-----|:---------|
| 用户上传非 Markdown 文件 | 前端限制仅接受 .md 文件 |
| 文件名包含特殊字符 | sanitize 为安全文件名 |
| 路径穿越攻击（如 `../../etc/passwd`） | 文件名 sanitize + 写入路径校验 |
| AI 尝试修改知识库 | L1 beforeToolCall 拦截 + L2 软约束 |
| 用户尝试编辑/删除系统条目 | API 层校验 source === "user"，返回 403 |

### 7.3 一致性

| 场景 | 处理策略 |
|:-----|:---------|
| manifest.json 与实际文件不一致 | 启动时或读取时校验，自动修复（删除无记录文件、补全缺失记录） |
| 用户直接在文件系统中操作 knowledge/ 目录 | 下次读取 manifest 时检测差异并同步 |
| 多个会话同时操作知识库 | 文件系统级操作，无并发冲突（manifest.json 整体覆写） |

### 7.4 references/ 迁移

| 场景 | 处理策略 |
|:-----|:---------|
| 旧项目工作空间存在 references/ | 首次加载时自动迁移到 knowledge/，删除旧目录 |
| 迁移过程中断（如文件系统错误） | 下次加载时重试（knowledge/ 不存在则重新迁移） |
| 项目模板中仍有 references/ | 更新项目模板，移除 references/，添加 knowledge/ |

---

## 八、实施计划

### 第一阶段：references/ 迁移 + 后端核心

1. `pi-agent.ts` 新增 `isKnowledgeBasePath()` + `beforeToolCall` 知识库写保护
2. `scan-workspace.ts` 新增 `migrateReferencesToKnowledge()` 迁移函数
3. 更新项目模板：删除 `references/`，添加 `knowledge/` + `manifest.json`

### 第二阶段：上下文注入（author-site 服务端）

1. `system-prompt.md` 新增知识库查阅指引；删除 references/ 硬编码引用
2. `system-prompt.ts` 新增 `buildKnowledgeIndexPrefix()` 函数
3. `scan-workspace.ts` 新增 `scanKnowledgeIndex()`
4. `workspace-context/route.ts` 扩展返回 `knowledgeIndex`
5. `stream-service.ts` 拼接知识库索引（L3 之后、L4 之前）
6. `workspace-file-utils.ts` 的 `HIDDEN_ENTRIES` 移除 `"references"`，新增 `"knowledge"`
7. `fs-utils.ts` 的 `ensureWorkspaceFiles()` 改为创建 knowledge/ + 系统预设条目

### 第三阶段：知识库 CRUD API（author-site）

1. 新增 `api/knowledge/route.ts`（GET / POST）
2. 新增 `api/knowledge/[docId]/route.ts`（PUT / DELETE，校验 source）
3. manifest.json 读写 + 文件系统操作 + 文件名 sanitize

### 第四阶段：创作端 UI

1. `page.tsx` 中"代码" Tab 重命名为"文件"，增加文档视图/代码视图切换
2. 新增 `KnowledgePanel.tsx` 文档视图组件（列表 + 阅读/编辑/添加）
3. 集成到"文件" Tab 的文档视图中

### 第五阶段：测试与验证

1. agent-service 单元测试：写保护拦截
2. author-site API 测试：CRUD 操作 + 系统条目保护
3. 迁移测试：旧项目 references/ 自动迁移
4. E2E 验证：AI 能看到索引 → AI 能读取知识文档 → AI 不能修改知识文档

---

## 九、风险与缓解

| 风险 | 影响 | 缓解措施 |
|:-----|:-----|:---------|
| 知识库文档过大导致 AI 读取超时 | AI 无法获取完整知识 | 添加时提示建议拆分；AI 可分段读取 |
| AI 忽略知识库索引，不主动查阅 | 知识库形同虚设 | L2 查阅指引明确触发条件（含"必须先读取配置系统参考"）；观察调优 |
| manifest.json 与文件系统不一致 | 索引信息不准确 | 读取时校验 + 自动修复 |
| 用户添加敏感信息到知识库 | AI 可能泄露 | L2 规则提示不要在回复中原样输出长段知识内容；与 memory.md 同等对待 |
| knowledge/ 目录被 AI 工具误删 | 知识库丢失 | `beforeToolCall` 拦截 writeFile 到 knowledge/ 路径；bash 工具黑名单含 `rm`/`rmdir`，无法通过命令行删除 |
| references/ 迁移失败 | 旧项目 AI 查不到配置系统参考 | 迁移在 scanKnowledgeIndex 前执行，失败则回退（保留 references/）；L2 指引同时提及 knowledge/ 和 references/ 作为兜底 |

---

## 十、后续优化方向

| 优先级 | 方向 | 说明 |
|:-------|:-----|:-----|
| P2 | 知识库搜索 | 在文档视图中支持按标题/内容搜索 |
| P2 | 知识库文档预览优化 | Markdown 渲染预览体验优化（目录、代码高亮等） |
| P3 | 知识库标签分类 | 支持给文档打标签，按标签筛选 |
| P3 | 知识库导入导出 | 支持批量导入 .md 文件、导出为 .zip |
| P3 | 智能推荐 | AI 根据对话内容主动推荐相关知识文档 |
| P4 | 向量检索 | 对大型知识库实现语义检索，替代全量读取 |

---

## 十一、相关文档

- [AI行为约束机制](../../../项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md) — L1-L5 五层约束架构
- [AI对话记忆功能方案](./AI对话记忆功能.md) — L4 记忆层设计参考
- [AIChat分层架构](../../../项目文档/创作端/05-AI对话/技术/02_AIChat分层架构.md) — 前端对话组件架构
- [独立Agent服务层-架构设计](../../../项目文档/独立Agent服务层/01-架构设计.md) — Agent 服务整体架构
- [独立Agent服务层-接口规范](../../../项目文档/独立Agent服务层/02-接口规范.md) — Agent API 接口规范
