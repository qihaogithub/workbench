# AionUi Agent 接入架构分析报告

> 分析 AionUi 项目的 Agent 接入方式，评估其架构设计和隔离机制，为本项目提供改进建议。
>
> 创建日期：2026-04-02

---

## 一、核心架构对比

### 1.1 AionUi 的 Agent 架构特点

AionUi 采用了一个**高度抽象的工厂模式**来管理多个 Agent（支持 Claude Code、Codex、Opencode、Qwen Code 等 12+ 个后端）。

**架构流程：**

```
用户请求 → AgentFactory → IAgentManager → 具体 Agent (AcpAgent/GeminiAgent/CodexAgent)
```

**关键设计：**

| 特性             | 说明                                      | 实现位置                                 |
| :--------------- | :---------------------------------------- | :--------------------------------------- |
| **统一接口层**   | 所有 Agent 实现 `IAgentManager` 接口      | `src/process/task/IAgentManager.ts`      |
| **工厂模式**     | 根据类型动态创建 Agent                    | `src/process/task/AgentFactory.ts`       |
| **工作空间隔离** | 每个会话独立的 `workingDir`               | `src/process/agent/acp/index.ts`         |
| **会话恢复**     | 通过 `acpSessionId` 实现会话持久化        | `src/process/task/AcpAgentManager.ts`    |
| **事件驱动**     | 统一的 event 回调机制                     | `onStreamEvent`, `onSignalEvent`         |
| **权限管理**     | 内置 ApprovalStore 实现"always allow"缓存 | `src/process/agent/acp/ApprovalStore.ts` |

**核心代码结构：**

```typescript
// src/process/task/IAgentFactory.ts
export interface IAgentFactory {
  register(type: AgentType, creator: AgentCreator): void;
  create(
    conversation: TChatConversation,
    options?: BuildConversationOptions,
  ): IAgentManager;
}

// src/process/task/AgentFactory.ts
export class AgentFactory implements IAgentFactory {
  private creators = new Map<AgentType, AgentCreator>();

  register(type: AgentType, creator: AgentCreator): void {
    this.creators.set(type, creator);
  }

  create(
    conversation: TChatConversation,
    options?: BuildConversationOptions,
  ): IAgentManager {
    const creator = this.creators.get(conversation.type as AgentType);
    if (!creator) throw new UnknownAgentTypeError(conversation.type);
    return creator(conversation, options);
  }
}
```

---

### 1.2 你的项目当前架构

**当前流程：**

```
用户请求 → API Route → session-manager.ts → opencode-client.ts → opencode server
```

**现状评估：**

| 项目                | 状态     | 说明                                |
| :------------------ | :------- | :---------------------------------- |
| ✅ Session 隔离机制 | 已完成   | `/sessions/{sessionId}/` 独立工作区 |
| ✅ 权限配置         | 已完成   | `opencode.json` + `AGENTS.md`       |
| ✅ Session 过期清理 | 已完成   | 2 小时无操作自动销毁                |
| ⚠️ Agent 抽象层     | 缺失     | 直接调用 opencode HTTP API          |
| ⚠️ 统一管理层       | 缺失     | 没有 Agent 生命周期管理             |
| ⚠️ 会话恢复         | 部分完成 | 有 `.session.json` 但未充分利用     |

---

## 二、AionUi 可复用模块分析

### 2.1 AcpAgent 类设计

**文件位置：** `AionUi/src/process/agent/acp/index.ts`

**核心特性：**

```typescript
export class AcpAgent {
  private readonly id: string;              // 会话 ID
  private extra: {
    workspace?: string;                     // 工作目录
    backend: AcpBackend;                    // 后端类型
    cliPath?: string;                       // CLI 路径
    customArgs?: string[];                  // 自定义参数
    customEnv?: Record<string, string>;     // 自定义环境变量
    yoloMode?: boolean;                     // YOLO 模式（自动批准）
    acpSessionId?: string;                  // 会话恢复 ID
    currentModelId?: string;                // 当前模型 ID
    sessionMode?: string;                   // 会话模式
  };

  private connection: AcpConnection;        // ACP 连接
  private adapter: AcpAdapter;              // 协议适配器

  // 回调函数
  private readonly onStreamEvent: (data: IResponseMessage) => void;
  private readonly onSignalEvent?: (data: IResponseMessage) => void;
  private readonly onSessionIdUpdate?: (sessionId: string) => void;

  // 核心方法
  async start(): Promise<void>              // 启动连接和会话
  async sendMessage(data: {...}): Promise<AcpResult>  // 发送消息
  async kill(): Promise<void>               // 断开连接
  cancelPrompt(): void                      // 取消当前 prompt
  async setModelByConfigOption(modelId: string): Promise<AcpModelInfo>  // 切换模型
  async setMode(mode: string): Promise<{success, error}>  // 设置会话模式
}
```

**关键设计亮点：**

1. **统一的回调机制** - 通过 `onStreamEvent` 和 `onSignalEvent` 解耦 Agent 和 UI
2. **会话恢复支持** - 通过 `acpSessionId` 实现跨页面刷新恢复
3. **模型/模式切换** - 运行时动态切换模型和会话模式
4. **错误分类处理** - 根据错误类型返回不同的 `errorType` 和 `retryable` 标志

---

### 2.2 AcpAgentManager 管理层

**文件位置：** `AionUi/src/process/task/AcpAgentManager.ts`

**职责：**

- Agent 生命周期管理（创建/销毁/重启）
- 会话持久化（保存到数据库）
- 模式切换（yoloMode/planMode/default）
- 模型切换（运行时切换模型）
- 流式消息缓冲（120ms 节流写入数据库）
- 斜杠命令缓存

**关键代码片段：**

```typescript
class AcpAgentManager extends BaseAgentManager<
  AcpAgentManagerData,
  AcpPermissionOption
> {
  workspace: string;
  agent: AcpAgent;
  private bootstrap: Promise<AcpAgent> | undefined; // 启动 Promise，避免重复初始化
  private persistedModelId: string | null = null; // 持久化的模型 ID
  private currentMode: string = "default"; // 当前会话模式

  constructor(data: AcpAgentManagerData) {
    super("acp", data, new IpcAgentEventEmitter());
    this.workspace = data.workspace;
    this.currentMode = data.sessionMode || "default";
    this.persistedModelId = data.currentModelId || null;
  }

  initAgent(data: AcpAgentManagerData = this.options) {
    if (this.bootstrap) return this.bootstrap; // 防止重复初始化
    this.bootstrapping = true;
    this.bootstrap = (async () => {
      // 1. 解析配置（cliPath, customArgs, customEnv, yoloMode）
      // 2. 创建 AcpAgent 实例
      // 3. 启动 Agent
      // 4. 应用持久化的模型和模式
      // 5. 缓存模型列表
      return this.agent;
    })();
    return this.bootstrap;
  }

  async sendMessage(data: { content: string; files?: string[] }) {
    this.bootstrapping = false; // 允许流式事件通过
    await this.initAgent(this.options); // 确保 Agent 已初始化

    // 注入预设规则和 skills（首条消息）
    let contentToSend = data.content;
    if (this.isFirstMessage) {
      contentToSend = await prepareFirstMessageWithSkillsIndex(contentToSend, {
        presetContext: this.options.presetContext,
        enabledSkills: this.options.enabledSkills,
      });
    }

    const result = await this.agent.sendMessage({
      ...data,
      content: contentToSend,
    });

    return result;
  }

  async setMode(mode: string): Promise<{ success: boolean; msg?: string }> {
    if (!this.agent) {
      await this.initAgent(this.options);
    }

    const result = await this.agent.setMode(mode);
    if (result.success) {
      this.currentMode = mode;
      this.saveSessionMode(mode); // 持久化到数据库
    }
    return result;
  }

  kill() {
    // 确保 ACP CLI 进程被终止
    void (this.agent?.kill?.() || Promise.resolve())
      .catch((err) => mainWarn("[AcpAgentManager]", "agent.kill() failed", err))
      .then(() => new Promise<void>((r) => setTimeout(r, 500)))
      .finally(() => super.kill());
  }
}
```

---

### 2.3 隔离机制设计

AionUi 采用**三层防护**实现安全隔离：

| 层级   | 机制                                | 强度 | 你的项目状态 |
| :----- | :---------------------------------- | :--- | :----------- |
| **L1** | 权限系统（opencode.json 白名单）    | 强   | ✅ 已有      |
| **L2** | 行为约束（AGENTS.md）               | 软   | ✅ 已有      |
| **L3** | 后端校验（文件变更检测 + 自动回滚） | 强   | ⚠️ 待完善    |

**AionUi 的 L3 实现参考：**

```typescript
// 后端校验机制（Next.js API 路由层）
export async function validateFileChanges(
  sessionId: string,
  changes: FileChange[],
): Promise<{ valid: boolean; violations: string[] }> {
  // 1. 获取 session 的权限配置
  const sessionConfig = await getSessionConfig(sessionId);
  const allowedFiles = sessionConfig.editWhitelist || [];

  // 2. 校验变更文件是否在白名单内
  const violations = changes
    .filter(
      (change) =>
        !allowedFiles.some((allowed) => change.path.endsWith(allowed)),
    )
    .map((change) => `非法修改：${change.path}`);

  // 3. 如果存在非法操作，自动回滚
  if (violations.length > 0) {
    await rollbackChanges(sessionId, violations);
    await logViolation(sessionId, violations);
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
```

---

## 三、具体实施建议

### 3.1 第一阶段：引入 Agent 抽象层

#### 任务 1.1：创建 OpenCodeAgent 类

**文件位置：** `packages/web/src/lib/opencode-agent.ts`

```typescript
import { OPENCODE_SERVER_URL } from "./constants";

export interface StreamEvent {
  type: "start" | "stream" | "finish" | "error" | "disconnected";
  sessionId: string;
  content?: string;
  error?: string;
}

export interface OpenCodeAgentConfig {
  sessionId: string;
  workingDir: string;
  onStreamEvent: (event: StreamEvent) => void;
  onSessionIdUpdate?: (sessionId: string) => void;
}

export class OpenCodeAgent {
  private sessionId: string;
  private workingDir: string;
  private onStreamEvent: (event: StreamEvent) => void;
  private onSessionIdUpdate?: (sessionId: string) => void;
  private isInitialized = false;

  constructor(config: OpenCodeAgentConfig) {
    this.sessionId = config.sessionId;
    this.workingDir = config.workingDir;
    this.onStreamEvent = config.onStreamEvent;
    this.onSessionIdUpdate = config.onSessionIdUpdate;
  }

  /**
   * 启动 Agent（建立连接）
   */
  async start(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 发送开始事件
      this.onStreamEvent({ type: "start", sessionId: this.sessionId });

      // 可以调用 opencode server 的 /session 端点建立连接
      const response = await fetch(`${OPENCODE_SERVER_URL}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Session: ${this.sessionId}`,
          workingDir: this.workingDir,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`启动失败：${await response.text()}`);
      }

      const data = await response.json();
      this.sessionId = data.id; // 更新为 server 返回的 session ID

      this.isInitialized = true;
      this.onStreamEvent({ type: "finish", sessionId: this.sessionId });
    } catch (error) {
      this.onStreamEvent({
        type: "error",
        sessionId: this.sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(content: string): Promise<void> {
    if (!this.isInitialized) {
      await this.start();
    }

    try {
      // 发送开始事件
      this.onStreamEvent({ type: "start", sessionId: this.sessionId });

      // 调用 opencode server 的消息接口
      const response = await fetch(
        `${OPENCODE_SERVER_URL}/session/${this.sessionId}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts: [{ type: "text", text: content }],
          }),
          signal: AbortSignal.timeout(120000),
        },
      );

      if (!response.ok) {
        throw new Error(`发送消息失败：${await response.text()}`);
      }

      // 处理流式响应
      const reader = response.body?.getReader();
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);

        // 触发流式事件
        this.onStreamEvent({
          type: "stream",
          sessionId: this.sessionId,
          content: chunk,
        });
      }

      // 发送结束事件
      this.onStreamEvent({ type: "finish", sessionId: this.sessionId });
    } catch (error) {
      this.onStreamEvent({
        type: "error",
        sessionId: this.sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 取消当前 prompt
   */
  cancelPrompt(): void {
    // TODO: 调用 opencode server 的取消接口
    this.onStreamEvent({ type: "finish", sessionId: this.sessionId });
  }

  /**
   * 断开连接，清理资源
   */
  async kill(): Promise<void> {
    try {
      // TODO: 调用 opencode server 的断开接口
      this.isInitialized = false;
      this.onStreamEvent({ type: "disconnected", sessionId: this.sessionId });
    } catch (error) {
      console.error("[OpenCodeAgent] kill error:", error);
    }
  }
}
```

---

#### 任务 1.2：创建 AgentManager

**文件位置：** `packages/web/src/lib/agent-manager.ts`

```typescript
import { OpenCodeAgent, StreamEvent } from "./opencode-agent";
import { getSessionPath } from "./fs-utils";

export class AgentManager {
  private agents = new Map<string, OpenCodeAgent>();

  /**
   * 获取或创建 Agent
   */
  getOrCreateAgent(
    sessionId: string,
    callbacks: {
      onStreamEvent: (event: StreamEvent) => void;
      onSessionIdUpdate?: (sessionId: string) => void;
    },
  ): OpenCodeAgent {
    if (!this.agents.has(sessionId)) {
      const agent = new OpenCodeAgent({
        sessionId,
        workingDir: getSessionPath(sessionId),
        onStreamEvent: callbacks.onStreamEvent,
        onSessionIdUpdate: callbacks.onSessionIdUpdate,
      });
      this.agents.set(sessionId, agent);
    }
    return this.agents.get(sessionId)!;
  }

  /**
   * 检查 Agent 是否存在
   */
  hasAgent(sessionId: string): boolean {
    return this.agents.has(sessionId);
  }

  /**
   * 销毁 Agent
   */
  async killAgent(sessionId: string): Promise<void> {
    const agent = this.agents.get(sessionId);
    if (agent) {
      await agent.kill();
      this.agents.delete(sessionId);
    }
  }

  /**
   * 销毁所有 Agent
   */
  async killAll(): Promise<void> {
    const promises = Array.from(this.agents.values()).map((agent) =>
      agent.kill(),
    );
    await Promise.all(promises);
    this.agents.clear();
  }
}

// 单例实例
let globalAgentManager: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!globalAgentManager) {
    globalAgentManager = new AgentManager();
  }
  return globalAgentManager;
}
```

---

#### 任务 1.3：改造 API Routes

**文件位置：** `packages/web/src/app/api/ai/chat/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getAgentManager } from "@/lib/agent-manager";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";

const agentManager = getAgentManager();

export async function POST(request: Request) {
  try {
    const { sessionId, content } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        createApiError("INVALID_PARAMS", "sessionId 是必填参数"),
        { status: 400 },
      );
    }

    if (!content) {
      return NextResponse.json(
        createApiError("INVALID_PARAMS", "content 是必填参数"),
        { status: 400 },
      );
    }

    // 获取或创建 Agent
    const agent = agentManager.getOrCreateAgent(sessionId, {
      onStreamEvent: (event) => {
        // TODO: 通过 WebSocket 或 SSE 推送给前端
        console.log("[StreamEvent]", event);
      },
    });

    // 发送消息
    await agent.sendMessage(content);

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error("[AI Chat API] Error:", error);
    return NextResponse.json(createApiError("AI_CHAT_ERROR", error.message), {
      status: 500,
    });
  }
}
```

---

### 3.2 第二阶段：增强隔离机制

#### 任务 2.1：完善文件变更校验

**文件位置：** `packages/web/src/lib/session-guard.ts`（增强现有文件）

```typescript
import { getSessionPath, getDemoPath } from "./fs-utils";
import fs from "fs";
import path from "path";

export interface FileChange {
  path: string;
  action: "modified" | "added" | "deleted";
  content?: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: string[];
  autoRolledBack: boolean;
}

/**
 * 校验文件变更是否在白名单内
 */
export function validateFileChanges(
  sessionId: string,
  changes: FileChange[],
): ValidationResult {
  const ALLOWED_FILES = ["index.tsx", "config.schema.json", "AGENTS.md"];
  const sessionPath = getSessionPath(sessionId);

  const violations: string[] = [];

  for (const change of changes) {
    // 获取相对路径
    const relativePath = path.relative(sessionPath, change.path);

    // 检查是否在白名单内
    const isAllowed = ALLOWED_FILES.some(
      (allowed) =>
        relativePath === allowed || relativePath.endsWith("/" + allowed),
    );

    if (!isAllowed) {
      violations.push(`非法修改：${relativePath}`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    autoRolledBack: false,
  };
}

/**
 * 自动回滚非法变更
 */
export async function rollbackChanges(
  sessionId: string,
  violations: string[],
): Promise<void> {
  const sessionPath = getSessionPath(sessionId);
  const demoPath = getDemoPath(sessionId.replace("session-", "demo-"));

  for (const violation of violations) {
    const relativePath = violation.replace("非法修改：", "");
    const sessionFilePath = path.join(sessionPath, relativePath);
    const demoFilePath = path.join(demoPath, relativePath);

    // 从原始 Demo 目录恢复文件
    if (fs.existsSync(demoFilePath)) {
      fs.copyFileSync(demoFilePath, sessionFilePath);
      console.log(`[Rollback] 恢复文件：${relativePath}`);
    }
  }
}

/**
 * 记录违规操作日志
 */
export function logViolation(sessionId: string, violations: string[]): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    sessionId,
    violations,
  };

  // TODO: 写入日志文件或数据库
  console.warn("[Violation]", JSON.stringify(logEntry));
}
```

---

#### 任务 2.2：实现会话持久化

**文件位置：** `packages/web/src/lib/session-manager.ts`（增强现有文件）

```typescript
// 在现有的 createEditSession 函数中增强：

export async function createEditSession(
  demoId: string,
): Promise<CreateSessionResult> {
  // ... 现有代码 ...

  // 增强：检查是否有已保存的 session 可以恢复
  const savedSession = findSavedSession(demoId);
  if (savedSession) {
    // 恢复已有会话
    return {
      sessionId: savedSession.sessionId,
      code: fs.readFileSync(
        getSessionPath(savedSession.sessionId) + "/index.tsx",
        "utf-8",
      ),
      schema: fs.readFileSync(
        getSessionPath(savedSession.sessionId) + "/config.schema.json",
        "utf-8",
      ),
    };
  }

  // ... 现有代码 ...
}

/**
 * 查找已保存的会话（支持恢复）
 */
export function findSavedSession(
  demoId: string,
): { sessionId: string; demoId: string } | null {
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) {
    return null;
  }

  try {
    const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const metaPath = path.join(sessionsDir, entry.name, ".session.json");
      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        // 查找同一 demoId 的会话（即使过期也可以恢复）
        if (meta.demoId === demoId && meta.saved) {
          return { sessionId: meta.sessionId, demoId: meta.demoId };
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * 保存会话（标记为可恢复）
 */
export function saveSessionMeta(sessionId: string): void {
  const sessionPath = getSessionPath(sessionId);
  const metaPath = path.join(sessionPath, ".session.json");

  if (!fs.existsSync(metaPath)) return;

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  meta.saved = true; // 标记为已保存
  meta.savedAt = Date.now();

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}
```

---

### 3.3 第三阶段：多 Agent 支持（可选）

如果未来需要支持多个 AI 后端（如 opencode + Claude Code + Codex），可以引入工厂模式：

**文件位置：** `packages/web/src/lib/agent-factory.ts`

```typescript
import { OpenCodeAgent } from "./opencode-agent";
// import { ClaudeAgent } from './claude-agent';  // 未来扩展
// import { CodexAgent } from './codex-agent';    // 未来扩展

export type AgentType = "opencode" | "claude" | "codex";

export interface AgentConfig {
  sessionId: string;
  workingDir: string;
  backend?: AgentType;
  onStreamEvent: (event: any) => void;
}

export interface BaseAgent {
  start(): Promise<void>;
  sendMessage(content: string): Promise<void>;
  kill(): Promise<void>;
  cancelPrompt(): void;
}

/**
 * Agent 工厂函数
 */
export function createAgent(type: AgentType, config: AgentConfig): BaseAgent {
  switch (type) {
    case "opencode":
      return new OpenCodeAgent({
        sessionId: config.sessionId,
        workingDir: config.workingDir,
        onStreamEvent: config.onStreamEvent,
      });

    case "claude":
      // 未来扩展
      // return new ClaudeAgent(config);
      throw new Error("Claude Agent 尚未实现");

    case "codex":
      // 未来扩展
      // return new CodexAgent(config);
      throw new Error("Codex Agent 尚未实现");

    default:
      throw new Error(`未知的 Agent 类型：${type}`);
  }
}
```

---

## 四、关键设计模式总结

| 模式           | AionUi 应用位置                           | 你的项目借鉴                               |
| :------------- | :---------------------------------------- | :----------------------------------------- |
| **工厂模式**   | `AgentFactory` 根据类型创建不同 Agent     | `createAgent()` 函数，便于未来扩展         |
| **单例模式**   | `ChannelManager`, `ChannelMessageService` | `getAgentManager()` 单例                   |
| **观察者模式** | `onStreamEvent`, `onSignalEvent` 回调     | 事件驱动架构，解耦 Agent 和 UI             |
| **策略模式**   | 不同 Backend 使用不同的 `AcpAdapter`      | 未来支持多 Agent 时的适配器                |
| **状态机模式** | `BasePlugin` 生命周期管理                 | Agent 生命周期（pending/running/finished） |
| **复合键模式** | `SessionManager.buildKey(userId, chatId)` | `sessionId` 作为唯一键                     |

---

## 五、实施路线图

### Week 1: 创建 OpenCodeAgent 类

- [ ] 创建 `packages/web/src/lib/opencode-agent.ts`
- [ ] 实现基本方法：`start()`, `sendMessage()`, `kill()`
- [ ] 实现事件回调机制
- [ ] 编写单元测试

### Week 2: 创建 AgentManager

- [ ] 创建 `packages/web/src/lib/agent-manager.ts`
- [ ] 实现 Agent 缓存和复用
- [ ] 实现资源清理机制
- [ ] 集成到现有 session-manager

### Week 3: 改造 API Routes

- [ ] 改造 `/api/ai/chat` 使用新的 Agent 架构
- [ ] 添加 WebSocket 或 SSE 支持（流式推送）
- [ ] 添加错误处理和重试机制
- [ ] 前端适配新的 API

### Week 4: 增强隔离机制

- [ ] 完善 `session-guard.ts` 文件校验
- [ ] 实现自动回滚机制
- [ ] 添加违规日志
- [ ] 实现会话持久化和恢复

---

## 六、参考资源

### AionUi 核心文件

| 文件                 | 说明              | 路径                                            |
| :------------------- | :---------------- | :---------------------------------------------- |
| `IAgentFactory.ts`   | Agent 工厂接口    | `AionUi/src/process/task/IAgentFactory.ts`      |
| `AgentFactory.ts`    | Agent 工厂实现    | `AionUi/src/process/task/AgentFactory.ts`       |
| `AcpAgent.ts`        | ACP Agent 核心类  | `AionUi/src/process/agent/acp/index.ts`         |
| `AcpAgentManager.ts` | Agent 管理层      | `AionUi/src/process/task/AcpAgentManager.ts`    |
| `AcpConnection.ts`   | ACP 连接层        | `AionUi/src/process/agent/acp/AcpConnection.ts` |
| `acpConnectors.ts`   | 后端连接器        | `AionUi/src/process/agent/acp/acpConnectors.ts` |
| `ARCHITECTURE.md`    | Channels 架构文档 | `AionUi/src/process/channels/ARCHITECTURE.md`   |

### 你的项目现有文件

| 文件                   | 说明            | 路径                                                  |
| :--------------------- | :-------------- | :---------------------------------------------------- |
| `session-manager.ts`   | Session 管理器  | `packages/web/src/lib/session-manager.ts`             |
| `opencode-client.ts`   | opencode 客户端 | `packages/web/src/lib/opencode-client.ts`             |
| `session-guard.ts`     | Session 守卫    | `packages/web/src/lib/session-guard.ts`               |
| `fs-utils.ts`          | 文件系统工具    | `packages/web/src/lib/fs-utils.ts`                    |
| `permission-config.ts` | 权限配置模板    | `packages/web/src/lib/templates/permission-config.ts` |

---

## 七、总结与建议

### ✅ 你的项目已经做得很好的地方：

1. **Session 隔离机制清晰** - Clone → Inject → Mount → Sync → Merge/Drop 工作流完善
2. **权限配置完善** - `opencode.json` + `AGENTS.md` 双重约束
3. **文件结构设计合理** - demos/sessions 分离，元数据管理清晰

### 🔧 需要改进的地方：

1. **引入 Agent 抽象层** - 封装 opencode API，提供统一接口
2. **增强会话管理** - 支持会话恢复、状态持久化
3. **完善文件校验** - 添加后端校验和自动回滚
4. **事件驱动架构** - 解耦 Agent 和 UI，便于未来扩展

### 📚 从 AionUi 可以学到的核心思想：

1. **工厂模式** - 便于未来扩展多个 Agent
2. **事件驱动** - 解耦 Agent 和 UI
3. **会话隔离** - 每个 conversation 独立的工作空间
4. **状态持久化** - 支持会话恢复
5. **分层架构** - Agent → Manager → Factory 清晰分层

---

**报告完成日期：** 2026-04-02  
**分析版本：** v1.0  
**下次更新：** 实施完成后更新最佳实践
