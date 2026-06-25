# Agent 沙箱观测工具方案（控制台数据 + 截图）

> **状态**：继续推进 | **日期**：2026-06-04 | **前置**：`预览区画布模式Puppeteer截图方案.md`（共享 Puppeteer 基础设施）

> **2026-06-21 校正进度**：控制台观测链路已经落地，`getConsoleLogs` 工具已注册；截图基础设施不是原方案中的 `screenshot-renderer.ts` / `screenshot-compile-cache.ts`，而是当前已存在的独立 `screenshot-service`。本轮已新增 `captureScreenshot` Pi Agent 工具，扩展 `screenshot-service` 支持 `fullPage` 参数，并补充截图工具单元测试。剩余重点是端到端验证与多模态消费验证。

---

## 〇、背景与目标

### 0.1 问题

当前 AI Agent 在创作端工作时，对用户预览区的状态是"盲"的：

- **无法看到页面渲染结果**：Agent 写完代码后，不知道页面实际长什么样，只能靠用户口头描述反馈
- **无法获取控制台输出**：`console.log/warn/error` 等输出对调试至关重要，但 Agent 完全无法访问
- **错误诊断困难**：用户报告"页面白屏"或"样式不对"时，Agent 只能猜测原因

### 0.2 目标

为 Agent 新增两个观测工具：

| 工具                | 能力                         | 场景                                 |
| ------------------- | ---------------------------- | ------------------------------------ |
| `getConsoleLogs`    | 获取 iframe 沙箱的控制台输出 | 调试运行时错误、检查数据流、验证逻辑 |
| `captureScreenshot` | 获取 iframe 沙箱的页面截图   | 检查视觉效果、布局问题、响应式适配   |

### 0.3 与现有方案的关系

- **`预览区画布模式Puppeteer截图方案.md`**：为画布模式 UI 缩略图设计，批量异步生成，面向前端展示
- **本方案**：为 Agent 调试设计，按需单次捕获，面向 LLM 消费

两者共享 `screenshot-service` 的 Puppeteer Browser 池、编译缓存和截图文件读取能力；Agent 侧只新增工具编排层，不在 `agent-service` 内重复维护 Puppeteer。

---

## 一、架构概览

### 1.1 两条独立数据通路

| 能力       | 数据源           | 通路                                                                                                                  | 原因                                                                                    |
| ---------- | ---------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 控制台数据 | 客户端 iframe    | iframe → postMessage → PreviewPanel 回调 → useConsoleBuffer → StreamService → WebSocket → agent-service ConsoleBuffer | 控制台输出依赖真实运行环境（用户交互、React 状态、CDN 加载），服务端 Puppeteer 无法复现 |
| 截图       | 服务端 Puppeteer | agent-service → 读取代码 → 编译 → Puppeteer 渲染 → PNG base64                                                         | 像素级截图需要完整浏览器渲染，客户端 `html2canvas` 保真度低且受 CORS 限制               |

### 1.2 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                     author-site (Next.js:3200)                   │
│                                                                 │
│  iframe sandbox                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  console.* 拦截 → postMessage('CONSOLE_LOG')              │  │
│  │  window.error → postMessage('RUNTIME_ERROR') (已有)       │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │ postMessage                       │
│                              ▼                                   │
│  PreviewPanel (onConsoleEntry 回调)                              │
│                              │                                   │
│                              ▼                                   │
│  useConsoleBuffer Hook (限流 + 缓冲)                            │
│                              │                                   │
│                              ▼                                   │
│  StreamService → WebSocket 'console_data' → agent-service       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                               │
                     WebSocket 'console_data'
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   agent-service (Fastify:3201)                   │
│                                                                 │
│  ConsoleBuffer (per session, 内存)                              │
│  → getConsoleLogs 工具读取                                      │
│                                                                 │
│  captureScreenshot 工具                                         │
│  → 调用 screenshot-service 生成/读取 PNG                        │
│                                                                 │
│  Agent Tools                                                    │
│  ┌──────────────────┐  ┌────────────────────────────┐           │
│  │ getConsoleLogs   │  │ captureScreenshot          │           │
│  │ → 读 ConsoleBuffer│  │ → 调用 screenshot-service │           │
│  └──────────────────┘  └─────────────┬──────────────┘           │
│                                      │                          │
└──────────────────────────────────────┼──────────────────────────┘
                                       │ HTTP POST /api/screenshots/generate
                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              screenshot-service (Fastify:3202)                   │
│  Puppeteer Browser 单例 → 编译 → 渲染 → PNG                     │
│  (与画布截图方案共享基础设施)                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、控制台数据捕获

### 2.1 iframe 侧：拦截 console 方法

在 `iframe-template.ts` 的 `<script type="module">` 中，在所有业务代码之前注入 console 拦截脚本。

**注入方式**：将拦截逻辑提取为独立字符串常量 `consoleInterceptScript`，在 `generateIframeHtml()` 中拼接到 `<script type="module">` 开头（React import 之前），保持模板可读性。

```typescript
// iframe-template.ts 新增
const consoleInterceptScript = `
(function() {
  const _orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };

  function _serialize(args) {
    return Array.from(args).map(a => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'object') {
        try { return JSON.stringify(a, null, 2); }
        catch { return String(a); }
      }
      return String(a);
    }).join(' ');
  }

  ['log','warn','error','info','debug'].forEach(lv => {
    console[lv] = function() {
      _orig[lv].apply(console, arguments);
      window.parent.postMessage({
        type: 'CONSOLE_LOG',
        payload: { level: lv, args: _serialize(arguments), timestamp: Date.now() }
      }, '*');
    };
  });
})();
`;
```

**设计决策**：

- **保留原始行为**：拦截后仍调用 `_orig[lv].apply(console, arguments)`，不影响开发者工具中的正常输出
- **序列化策略**：对象尝试 `JSON.stringify`（2 空格缩进），失败则 `String()` 兜底
- **不拦截 `console.clear/trace/group/dir/table`**：对 Agent 调试价值低，避免过度拦截
- **`timestamp` 使用 `Date.now()`**：iframe 与父窗口同源（blob URL），时间戳一致

### 2.2 前端侧：回调链与限流转发

#### PreviewPanel：接收 CONSOLE_LOG

在 `PreviewPanel.tsx` 的 `handleMessage` 中新增 `CONSOLE_LOG` 消息处理：

```typescript
// PreviewPanelProps 新增
onConsoleEntry?: (entry: ConsoleLogPayload) => void;

// handleMessage 内新增分支
if (data.type === 'CONSOLE_LOG' && data.payload) {
  onConsoleEntry?.(data.payload);
}
```

**为什么用回调而非内部状态**：控制台日志是高频数据流，不适合触发 React 重渲染。回调模式让消费方决定如何处理。

#### PreviewGrid：GridIframe 适配

PreviewGrid **不使用 PreviewPanel**，而是使用内部 `GridIframe` 组件。GridIframe 有自己的 iframe 生命周期和消息处理（当前仅处理 `READY`）。

需要修改 GridIframe：

1. 新增 `onConsoleEntry` prop
2. 在 GridIframe 的 `message` 事件监听中增加 `CONSOLE_LOG` 分支

```typescript
// GridIframe props 新增
onConsoleEntry?: (entry: ConsoleLogPayload) => void;

// GridIframe message handler 新增
if (event.data?.type === 'CONSOLE_LOG' && event.data.payload) {
  onConsoleEntry?.(event.data.payload);
}
```

#### PreviewCanvas → CanvasPageItem → PreviewPanel

CanvasPageItem 已在编辑/高缩放状态下渲染 PreviewPanel，只需透传 `onConsoleEntry` prop。

#### useConsoleBuffer Hook：限流 + 缓冲 + 转发

新增 `packages/author-site/src/components/demo/useConsoleBuffer.ts`：

```typescript
interface ConsoleLogPayload {
  level: "log" | "warn" | "error" | "info" | "debug";
  args: string;
  timestamp: number;
}

function useConsoleBuffer(streamService: StreamService | null) {
  const bufferRef = useRef<ConsoleLogPayload[]>([]);
  const pendingRef = useRef<ConsoleLogPayload[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAX_ENTRIES = 500;
  const FLUSH_INTERVAL = 100; // 100ms 限流

  const flush = useCallback(() => {
    if (pendingRef.current.length === 0) return;
    const entries = pendingRef.current;
    pendingRef.current = [];
    timerRef.current = null;

    // 追加到本地缓冲
    bufferRef.current.push(...entries);
    if (bufferRef.current.length > MAX_ENTRIES) {
      bufferRef.current = bufferRef.current.slice(-MAX_ENTRIES);
    }

    // 批量转发到 agent-service
    streamService?.forwardConsoleEntries(entries);
  }, [streamService]);

  const handleConsoleEntry = useCallback(
    (entry: ConsoleLogPayload) => {
      pendingRef.current.push(entry);
      if (!timerRef.current) {
        timerRef.current = setTimeout(flush, FLUSH_INTERVAL);
      }
    },
    [flush],
  );

  const clearBuffer = useCallback(() => {
    bufferRef.current = [];
    pendingRef.current = [];
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 组件卸载时清理
  useEffect(() => () => clearBuffer(), [clearBuffer]);

  return { handleConsoleEntry, clearBuffer };
}
```

**设计决策**：

- **100ms 限流**：高频 `console.log`（如循环中）不会逐条触发 WebSocket 消息，100ms 窗口内的条目合并为一次发送
- **前端不持久化**：控制台数据仅内存缓冲，页面刷新即丢失。Agent 需要时从 agent-service 缓冲读取
- **最大 500 条**：防止内存泄漏，超出时丢弃最旧的条目
- **组件卸载清理**：清除定时器和缓冲，避免内存泄漏

#### StreamService：批量转发

`StreamService` 新增控制台数据批量转发方法：

```typescript
// StreamService 新增方法
forwardConsoleEntries(entries: ConsoleLogPayload[]): void {
  if (!this.stream) return;
  // 复用现有模式：直接操作底层 WebSocket
  const ws = (this.stream as any).ws as WebSocket | null;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'console_data',
      entries,  // 批量发送
    }));
  }
}
```

**为什么绕过 AgentStream**：当前 `StreamService` 中 `sendPermissionResponse`、`sendModelChange`、`requestModels` 三个方法均通过 `(this.stream as any).ws` 直接操作底层 WebSocket，因为 `AgentStream` 类仅封装了 `message`/`cancel`/`ping` 三种发送类型。控制台数据转发遵循相同模式，避免为辅助数据通道修改 `AgentStream` SDK。

#### 回调链路全景

```
iframe (console.* 拦截)
  → postMessage('CONSOLE_LOG')
  → PreviewPanel.handleMessage / GridIframe.message handler
  → onConsoleEntry 回调
  → useConsoleBuffer.handleConsoleEntry (100ms 限流)
  → StreamService.forwardConsoleEntries (批量 WebSocket)
  → agent-service websocket.ts (接收 'console_data')
  → ConsoleBuffer.addEntry (内存缓冲)
  → getConsoleLogs 工具读取
```

### 2.3 agent-service 侧：缓冲与工具

#### WebSocket 消息处理

在 `websocket.ts` 的消息处理中新增 `console_data` 类型。当前 `ClientMessage` 接口为固定 6 种 type 的联合类型，需扩展：

```typescript
// websocket.ts ClientMessage 新增
| { type: 'console_data'; entries: ConsoleEntry[] }

// 消息处理新增分支（在 switch 之外，或作为新 case）
if (data.type === 'console_data' && Array.isArray(data.entries)) {
  for (const entry of data.entries) {
    consoleBuffer.addEntry(sessionId, entry);
  }
}
```

**为什么用 `entries` 数组而非单条 `entry`**：与前端 100ms 限流批量发送对齐，减少 WebSocket 消息数。

#### ConsoleBuffer 服务

新增 `packages/agent-service/src/session/console-buffer.ts`：

```typescript
import { logger } from "../utils/logger";

export interface ConsoleEntry {
  level: "log" | "warn" | "error" | "info" | "debug";
  args: string;
  timestamp: number;
}

class ConsoleBuffer {
  private buffers = new Map<string, ConsoleEntry[]>();
  private readonly MAX_ENTRIES_PER_SESSION = 500;

  addEntry(sessionId: string, entry: ConsoleEntry): void {
    let buffer = this.buffers.get(sessionId);
    if (!buffer) {
      buffer = [];
      this.buffers.set(sessionId, buffer);
    }
    buffer.push(entry);
    if (buffer.length > this.MAX_ENTRIES_PER_SESSION) {
      // 就地裁剪，避免频繁创建新数组
      buffer.splice(0, buffer.length - this.MAX_ENTRIES_PER_SESSION);
    }
  }

  getEntries(
    sessionId: string,
    options?: {
      level?: string;
      limit?: number;
      since?: number;
    },
  ): ConsoleEntry[] {
    let entries = this.buffers.get(sessionId) || [];
    if (options?.level) {
      entries = entries.filter((e) => e.level === options.level);
    }
    if (options?.since) {
      entries = entries.filter((e) => e.timestamp >= options.since!);
    }
    if (options?.limit && options.limit > 0) {
      entries = entries.slice(-options.limit);
    }
    return entries;
  }

  clear(sessionId: string): void {
    this.buffers.delete(sessionId);
  }
}

export const consoleBuffer = new ConsoleBuffer();
```

**优化**：使用 `splice` 就地裁剪替代 `slice` + 重新赋值，减少 GC 压力。

**会话生命周期集成**：

- WebSocket 连接建立时：`consoleBuffer.clear(sessionId)`（清空旧数据）
- WebSocket 连接关闭时：`consoleBuffer.clear(sessionId)`（释放内存）
- 与 `snapshotService.clearSnapshot()` 同步清理

#### getConsoleLogs 工具定义

新增 `packages/agent-service/src/backends/pi-tools/console-tool.ts`：

```typescript
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { consoleBuffer } from "../../session/console-buffer";

const GetConsoleLogsParams = Type.Object({
  level: Type.Optional(
    Type.Union(
      [
        Type.Literal("log"),
        Type.Literal("warn"),
        Type.Literal("error"),
        Type.Literal("info"),
        Type.Literal("debug"),
      ],
      { description: "过滤日志级别，不传则返回所有级别" },
    ),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "返回最近的 N 条日志，默认 50，最大 200",
      minimum: 1,
      maximum: 200,
      default: 50,
    }),
  ),
  since: Type.Optional(
    Type.Number({ description: "Unix 时间戳（毫秒），仅返回此时间之后的日志" }),
  ),
});
type GetConsoleLogsParams = Static<typeof GetConsoleLogsParams>;

export function createGetConsoleLogsTool(
  config: AgentConfig,
): AgentTool<typeof GetConsoleLogsParams> {
  return {
    name: "getConsoleLogs",
    label: "Get Console Logs",
    description:
      "获取 iframe 预览沙箱的控制台输出（console.log/warn/error/info/debug）。" +
      "用于调试用户预览中的运行时问题。返回最近的控制台日志条目。" +
      "注意：仅包含页面加载后实际产生的日志，如果用户尚未预览页面则可能为空。",
    parameters: GetConsoleLogsParams,
    execute: async (_toolCallId: string, args: GetConsoleLogsParams) => {
      const entries = consoleBuffer.getEntries(config.sessionId, {
        level: args.level,
        limit: args.limit ?? 50,
        since: args.since,
      });

      if (entries.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No console logs available. The user may not have opened the preview yet.",
            },
          ],
          details: { count: 0, sessionId: config.sessionId },
        };
      }

      const formatted = entries
        .map(
          (e) =>
            `[${new Date(e.timestamp).toISOString()}] [${e.level.toUpperCase()}] ${e.args}`,
        )
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Console Logs (${entries.length} entries):\n\n${formatted}`,
          },
        ],
        details: {
          count: entries.length,
          filtered: !!(args.level || args.since),
        },
      };
    },
  };
}
```

---

## 三、截图捕获

### 3.1 复用 screenshot-service HTTP API

截图能力通过调用已实现的 `screenshot-service`（端口 3202）HTTP API 完成，而非在 agent-service 中嵌入 Puppeteer：

| 组件             | 位置                                             | 说明                                 |
| ---------------- | ------------------------------------------------ | ------------------------------------ |
| Browser 单例管理 | `screenshot-service/src/utils/browser-pool.ts`   | 懒加载启动、crash 自动重启、并发控制 |
| 编译缓存         | `screenshot-service/src/utils/compile-cache.ts`  | LRU 200 条，避免重复编译             |
| 编译客户端       | `screenshot-service/src/utils/compile-client.ts` | 跨服务调用 author-site /api/compile  |
| HTML 组装        | `shared/src/demo/iframe-template.ts`             | `generateIframeHtml()` 复用          |

**架构决策**：agent-service 通过 HTTP 调用 screenshot-service，而非嵌入 Puppeteer。理由：

| 维度               | 嵌入 Puppeteer                       | 调用 screenshot-service HTTP API         |
| ------------------ | ------------------------------------ | ---------------------------------------- |
| agent-service 依赖 | 需新增 puppeteer-core 依赖           | 无新增依赖                               |
| 进程模型           | agent-service 进程内 Chromium 子进程 | screenshot-service 独立进程              |
| 故障隔离           | Puppeteer crash 影响 Agent 服务      | 互不影响                                 |
| 基础设施复用       | 需重写 browser-pool / compile-cache  | 直接复用 screenshot-service 全部基础设施 |
| 部署复杂度         | agent-service Dockerfile 需 Chromium | 仅 screenshot-service 容器需 Chromium    |

**与画布截图方案的差异**：

| 维度     | 画布截图（已有方案）              | Agent 截图（本方案）                        |
| -------- | --------------------------------- | ------------------------------------------- |
| 触发方式 | 前端进入画布时批量触发            | Agent 工具按需调用                          |
| API 端点 | `/api/screenshots/generate-batch` | `/api/screenshots/generate`（同步单页）     |
| 视口尺寸 | 固定 375×812                      | 可自定义，默认 375×812                      |
| 返回格式 | PNG 文件 URL（持久化）            | `ImageContent`（base64，供 LLM 多模态消费） |
| 存储位置 | `data/screenshots/`（磁盘缓存）   | 不落盘（内存中直接返回）                    |

### 3.2 captureScreenshot 工具定义

新增 `packages/agent-service/src/backends/pi-tools/screenshot-tool.ts`：

```typescript
const CaptureScreenshotParams = Type.Object({
  width: Type.Optional(
    Type.Number({
      description: "视口宽度（px），默认 375",
      minimum: 200,
      maximum: 1920,
      default: 375,
    }),
  ),
  height: Type.Optional(
    Type.Number({
      description: "视口高度（px），默认 812",
      minimum: 200,
      maximum: 1920,
      default: 812,
    }),
  ),
  fullPage: Type.Optional(
    Type.Boolean({
      description: "是否截取完整页面（含滚动区域），默认 true",
      default: true,
    }),
  ),
});
```

工具描述：

```
截取预览沙箱的页面截图。用于检查页面的视觉效果、布局和样式问题。
截图基于当前工作空间中的代码，在服务端通过 Puppeteer 渲染后返回图片。
注意：截图反映的是代码文件的最新状态，如果用户正在编辑但尚未保存，截图可能与用户看到的预览不同。
```

### 3.3 截图执行流程

```
Agent 调用 captureScreenshot
  │
  ▼
① 定位代码文件
  │  config.workingDir + config.demoId → 读取 {workingDir}/{demoId}/index.tsx
  │  读取 config.schema.json 获取默认 configData
  │
  ▼
② 调用 screenshot-service API
  │  POST ${SCREENSHOT_SERVICE_URL}/api/screenshots/generate
  │  body: { projectId: config.demoId, pageId: config.demoId, code, configData, width, height }
  │
  │  screenshot-service 内部流程：
  │    → 编译缓存命中检查
  │    → POST author-site /api/compile（如缓存未命中）
  │    → generateIframeHtml() HTML 组装
  │    → Puppeteer Browser 渲染 + 截图
  │    → 返回 { url, hash, elapsed }
  │
  ├── 编译失败 → 返回 COMPILE_ERROR
  ├── screenshot-service 不可达 → 返回 SERVICE_UNAVAILABLE
  │
  ▼
③ 获取 PNG 文件
  │  GET ${SCREENSHOT_SERVICE_URL}${url}
  │  获取 PNG Buffer
  │
  ▼
④ 转换为 base64 返回 ImageContent
  │  content: [{ type: 'image', data: base64, mimeType: 'image/png' }]
  │  details: { width, height, sizeKB }
```

### 3.4 代码文件定位策略

Agent 工作空间中可能有多个 demo 页面。截图工具通过 `config` 中的信息定位代码：

```
config.demoId  →  当前 Agent 会话关联的 demo ID（同时用作 projectId 和 pageId）
config.workingDir  →  工作空间根目录

代码文件路径: path.join(workingDir, demoId, 'index.tsx')
配置文件路径: path.join(workingDir, demoId, 'config.schema.json')
```

**projectId 获取**：`workingDir` 可能是正式空间 `data/projects/{projectId}/workspace`，也可能是编辑会话空间 `data/sessions/{projectId}/{sessionId}`。工具从路径片段中的 `projects/{projectId}` 或 `sessions/{projectId}` 反推项目 ID。

**configData 获取**：从工作空间中的 `config.schema.json` 读取各属性的 `default` 值组装默认 configData，与 iframe 路由的行为一致。

### 3.5 返回格式

Pi Agent Core 的 `AgentToolResult.content` 类型为 `(TextContent | ImageContent)[]`，其中 `ImageContent = { type: 'image', data: string, mimeType: string }`，**原生支持图片返回**。

```typescript
// 成功返回
{
  content: [
    {
      type: 'text',
      text: `Screenshot captured (${width}x${height}, ${sizeKB}KB)`
    },
    {
      type: 'image',
      data: base64String,     // PNG base64（不含 data:image/png;base64, 前缀）
      mimeType: 'image/png'
    }
  ],
  details: { width, height, sizeKB, fullPage: true/false }
}

// 失败返回
{
  content: [{ type: 'text', text: 'Error: Failed to capture screenshot: ...' }],
  details: { error: 'COMPILE_ERROR' | 'RENDER_TIMEOUT' | 'BROWSER_UNAVAILABLE' },
  isError: true
}
```

---

## 四、WebSocket 协议扩展

### 4.1 新增客户端 → 服务端消息

在 `packages/agent-service/src/routes/websocket.ts` 的 `ClientMessage` 联合类型中新增：

```typescript
| { type: 'console_data'; entries: ConsoleEntry[] }
```

在消息处理中新增分支（在现有 switch 之外添加，因为 `console_data` 是辅助数据通道，不需要 Agent 实例）：

```typescript
if (data.type === "console_data" && Array.isArray(data.entries)) {
  for (const entry of data.entries) {
    consoleBuffer.addEntry(sessionId, entry);
  }
  return; // 不走 Agent 消息处理流程
}
```

**设计决策**：`console_data` 不经过 Agent 的 `sendMessage` 流程，直接写入 ConsoleBuffer。这是辅助数据通道，不应触发 Agent 响应。

### 4.2 类型定义

在 `packages/agent-client/src/types.ts` 中新增 `ConsoleEntry` 类型：

```typescript
export interface ConsoleEntry {
  level: "log" | "warn" | "error" | "info" | "debug";
  args: string;
  timestamp: number;
}
```

---

## 五、共享类型

### 5.1 `packages/shared/src/demo/iframe-types.ts`（新增）

集中定义 iframe 与父窗口之间的 postMessage 消息类型，替代当前散落在各组件中的字符串字面量：

```typescript
/** iframe → 父窗口消息类型 */
export type IframeOutMessageType =
  | "READY"
  | "LOADED"
  | "COMPONENT_READY"
  | "RUNTIME_ERROR"
  | "RESIZE"
  | "THUMBNAIL_LAYOUT_RESULT"
  | "THUMBNAIL_LAYOUT_ERROR"
  | "CONSOLE_LOG"; // 新增

/** 父窗口 → iframe 消息类型 */
export type IframeInMessageType =
  | "UPDATE_CODE"
  | "UPDATE_CONFIG"
  | "COLLECT_THUMBNAIL_LAYOUT";

/** 控制台日志条目（iframe postMessage payload） */
export interface ConsoleLogPayload {
  level: "log" | "warn" | "error" | "info" | "debug";
  args: string;
  timestamp: number;
}
```

---

## 六、System Prompt 集成

在 Agent 的 system prompt 中追加工具使用指引（由 `buildStaticSystemPrompt()` 生成）：

```
## 预览观测工具

你可以使用以下工具来观察用户的预览效果：

### getConsoleLogs
获取预览沙箱的控制台输出。当用户报告运行时错误或行为异常时，先查看控制台日志定位问题。
- 使用 level='error' 过滤错误日志
- 使用 since 参数获取最近时间段的日志
- 如果返回为空，说明用户可能尚未预览页面

### captureScreenshot
截取预览沙箱的页面截图。当你需要确认视觉效果或布局问题时使用。
- 默认截取移动端视口（375×812）
- 设置 fullPage=true 获取完整页面截图
- 截图基于当前代码文件状态，与用户实时预览可能有短暂差异

建议工作流：
1. 用户报告问题 → getConsoleLogs 检查错误 → 修复代码
2. 修改样式后 → captureScreenshot 确认效果 → 继续调整
```

---

## 七、错误处理

| 场景             | getConsoleLogs                      | captureScreenshot                          |
| ---------------- | ----------------------------------- | ------------------------------------------ |
| 用户未打开预览   | 返回空 + 提示"用户可能尚未预览页面" | N/A（服务端渲染，不依赖用户预览）          |
| WebSocket 未连接 | 返回空 + 提示"数据通道未建立"       | N/A（不依赖 WebSocket）                    |
| Puppeteer 不可用 | N/A                                 | 返回错误"截图服务不可用"                   |
| 编译失败         | N/A                                 | 返回错误 + 编译错误信息                    |
| 截图超时（15s）  | N/A                                 | 返回错误"截图超时"                         |
| 渲染崩溃（白屏） | N/A                                 | 返回截图（白屏 PNG），Agent 可通过视觉判断 |
| 控制台缓冲溢出   | 自动丢弃最旧条目                    | N/A                                        |
| 代码文件不存在   | N/A                                 | 返回错误"未找到页面代码文件"               |

---

## 八、文件变更清单

### 8.1 新增文件（5 个，已实施）

| 文件                  | 位置                                            | 说明                                 | 状态 |
| --------------------- | ----------------------------------------------- | ------------------------------------ | ---- |
| `console-tool.ts`     | `packages/agent-service/src/backends/pi-tools/` | `getConsoleLogs` 工具定义            | ✅   |
| `console-buffer.ts`   | `packages/agent-service/src/session/`           | 控制台数据内存缓冲服务               | ✅   |
| `iframe-types.ts`     | `packages/shared/src/demo/`                     | iframe postMessage 消息类型定义      | ✅   |
| `useConsoleBuffer.ts` | `packages/author-site/src/components/demo/`     | 控制台缓冲 React Hook（限流 + 转发） | ✅   |

### 8.2 待新增文件

| 文件                 | 位置                                            | 说明                         | 状态   |
| -------------------- | ----------------------------------------------- | ---------------------------- | ------ |
| `screenshot-tool.ts` | `packages/agent-service/src/backends/pi-tools/` | `captureScreenshot` 工具定义 | 待实施 |

### 8.3 修改文件（12 个，已实施）

| 文件                                                                              | 变更                                                                                                                    | 状态 |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---- |
| `packages/shared/src/demo/iframe-template.ts`                                     | 注入 console 拦截脚本                                                                                                   | ✅   |
| `packages/shared/src/demo/types.ts`                                               | `PreviewPanelProps`/`PreviewCanvasProps` 新增 `onConsoleEntry`；导出 `iframe-types`                                     | ✅   |
| `packages/shared/src/demo/PreviewPanel.tsx`                                       | 新增 `onConsoleEntry` prop；处理 `CONSOLE_LOG` 消息                                                                     | ✅   |
| `packages/shared/src/demo/PreviewCanvas.tsx`                                      | 透传 `onConsoleEntry` 到 CanvasPageItem                                                                                 | ✅   |
| `packages/shared/src/demo/CanvasPageItem.tsx`                                     | 透传 `onConsoleEntry` 到 PreviewPanel                                                                                   | ✅   |
| `packages/shared/src/demo/index.ts`                                               | 导出 `IframeOutMessageType`/`IframeInMessageType`/`ConsoleLogPayload`                                                   | ✅   |
| `packages/agent-service/src/backends/pi-tools/index.ts`                           | 注册 `getConsoleLogs` 工具                                                                                              | ✅   |
| `packages/agent-service/src/routes/websocket.ts`                                  | ClientMessage 新增 `console_data` 类型和 `entries` 字段；处理逻辑；连接生命周期清理 consoleBuffer                       | ✅   |
| `packages/agent-service/src/routes/agent.ts`                                      | 会话销毁时清理 consoleBuffer                                                                                            | ✅   |
| `packages/author-site/src/components/ai-elements/chat/services/stream-service.ts` | 新增 `forwardConsoleEntries` 方法                                                                                       | ✅   |
| `packages/author-site/src/components/ai-elements/ai-chat.tsx`                     | 新增 `externalStreamServiceRef` prop                                                                                    | ✅   |
| `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts`   | 新增 `externalStreamServiceRef` 选项；同步到 StreamService ref                                                          | ✅   |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx`                            | 接入 `useConsoleBuffer`；透传 `onConsoleEntry` 到 PreviewPanel/PreviewCanvas；传递 `externalStreamServiceRef` 到 AIChat | ✅   |
| `packages/agent-client/src/types.ts`                                              | 新增 `ConsoleEntry` 类型                                                                                                | ✅   |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md`                     | 添加 `getConsoleLogs` 工具使用指引                                                                                      | ✅   |

> **注**：`PreviewGrid.tsx` 和 `GridIframe` 已从代码库中移除，控制台功能通过 PreviewCanvas → CanvasPageItem → PreviewPanel 链路覆盖。

### 8.4 依赖的前置实施 ✅ 已就绪

本方案的 `captureScreenshot` 工具依赖 `preview-service`（端口 3202）的 HTTP API，以下组件已实施：

| 组件                   | 文件                                             | 状态 |
| ---------------------- | ------------------------------------------------ | ---- |
| Puppeteer Browser 单例 | `screenshot-service/src/utils/browser-pool.ts`   | ✅   |
| 编译缓存               | `screenshot-service/src/utils/compile-cache.ts`  | ✅   |
| 编译调用逻辑           | `screenshot-service/src/utils/compile-client.ts` | ✅   |
| 截图路由               | `screenshot-service/src/routes/screenshots.ts`   | ✅   |

agent-service 仅需新增 `SCREENSHOT_SERVICE_URL` 环境变量（默认 `http://localhost:3202`），通过 HTTP 调用即可。

---

## 九、实施步骤

### Phase 1：控制台数据捕获 ✅ 已实施

> 实施日期：2026-06-04

1. ✅ 新增 `iframe-types.ts`，定义消息类型和 `ConsoleLogPayload`
2. ✅ 修改 `iframe-template.ts`，注入 console 拦截脚本
3. ✅ 修改 `PreviewPanel.tsx`，处理 `CONSOLE_LOG` 消息，新增 `onConsoleEntry` prop
4. ✅ ~~修改 `PreviewGrid.tsx`~~（文件已移除，功能由 PreviewCanvas → CanvasPageItem → PreviewPanel 链路覆盖）
5. ✅ 修改 `PreviewCanvas.tsx` + `CanvasPageItem.tsx`，透传 `onConsoleEntry` 到 PreviewPanel
6. ✅ 新增 `useConsoleBuffer.ts` Hook（100ms 限流 + 缓冲 + 转发）
7. ✅ 新增 `console-buffer.ts` 服务（agent-service 侧）
8. ✅ 修改 `websocket.ts`，处理 `console_data` 消息，连接生命周期清理
9. ✅ 新增 `console-tool.ts`（`getConsoleLogs` 工具）
10. ✅ 注册工具到 `pi-tools/index.ts`
11. ✅ 修改 `stream-service.ts`，新增 `forwardConsoleEntries` 方法
12. ✅ 更新 `agent-client/types.ts`，新增 `ConsoleEntry` 类型
13. ✅ 修改 `AIChat` + `useChatStream`，暴露 `externalStreamServiceRef`
14. ✅ 修改编辑页面 `page.tsx`，接入 `useConsoleBuffer` + 透传 `onConsoleEntry` 到所有预览组件
15. ✅ 更新 `shared/demo/index.ts`，导出新类型
16. ✅ 更新 `system-prompt.md`，添加 `getConsoleLogs` 工具指引
17. ✅ 修改 `agent.ts`，会话销毁时清理 `consoleBuffer`
18. ✅ TypeScript 编译验证通过（agent-service / author-site / agent-client / shared）

**实施备注**：

- `ClientMessage.entries` 字段类型使用 `'log' | 'warn' | 'error' | 'info' | 'debug'` 字面量联合类型，确保与 `ConsoleEntry.level` 类型一致
- `console_data` 消息在 switch 之前处理并 return，不走 Agent sendMessage 流程
- `externalStreamServiceRef` 通过 `useChatStream` → `AIChat` → 编辑页面的链路传递，使 `useConsoleBuffer` 能访问 StreamService 的底层 WebSocket
- `getConsoleLogs` 已随 Pi Agent 工具注册测试覆盖；控制台链路的更细粒度 vitest 仍可继续补充

### Phase 2：截图捕获 ✅ 已实施

> 实施日期：2026-06-08
> 架构变更：从嵌入式 Puppeteer 改为调用 screenshot-service HTTP API

1. ✅ agent-service `config.ts` 新增 `screenshotServiceUrl` 环境变量（`SCREENSHOT_SERVICE_URL`，默认 `http://localhost:3202`）
2. ✅ 新增 `screenshot-tool.ts`（`captureScreenshot` 工具，通过 HTTP 调用 screenshot-service）
3. ✅ 实现截图逻辑：读取代码 → 读取 configData → POST screenshot-service /generate → GET PNG → base64 ImageContent
4. ✅ 注册工具到 `pi-tools/index.ts`
5. ✅ 更新 `system-prompt.md`，追加 `captureScreenshot` 工具使用指引
6. ✅ 更新 `agent-service/AGENTS.md`，新增工具到列表
7. ⬜ 编写 vitest 测试（mock fetch + 工具测试）

1. ✅ 校正基础设施：复用现有 `screenshot-service`，不再新增 `screenshot-renderer.ts`
2. ✅ 新增 `screenshot-tool.ts`（`captureScreenshot` 工具）
3. ✅ 实现截图逻辑：定位页面代码 → 提取 schema 默认配置 → 调用 screenshot-service → 读取 PNG → base64 返回
4. ✅ 注册工具到 `pi-tools/index.ts`
5. ✅ 扩展 screenshot-service：`fullPage` 参数进入渲染与缓存 hash
6. ✅ 更新 Pi Agent 工具注册测试
7. ✅ 补充 `captureScreenshot` 成功返回图片与缺少代码文件错误路径单元测试

### Phase 3：System Prompt 与集成测试（部分完成）

1. ✅ 更新静态 system prompt，追加 `captureScreenshot` 使用指引
2. ⏳ 端到端验证：Agent 对话 → 调用 getConsoleLogs → 调用 captureScreenshot → 修复代码
3. ⏳ 验证多模态模型能否正确消费 `ImageContent` 返回

---

## 十、风险与缓解

| 风险                                  | 影响                                 | 缓解措施                                                                   |
| ------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| console 拦截影响 iframe 性能          | 大量 console 输出时 postMessage 频繁 | 100ms 限流批量转发；前端 useConsoleBuffer 合并发送                         |
| Puppeteer 截图耗时影响 Agent 响应速度 | 用户等待时间长                       | 超时 15s；工具描述中说明可能耗时                                           |
| 控制台缓冲内存泄漏                    | 长时间会话占用过多内存               | 500 条上限 + 会话结束清理 + splice 就地裁剪                                |
| WebSocket 断连导致控制台数据丢失      | Agent 获取不到最新日志               | 前端保留最近 500 条缓冲；重连后新日志继续写入                              |
| 渲染崩溃导致截图白屏                  | Agent 无法从截图中获取有用信息       | 白屏截图仍返回，Agent 可结合 getConsoleLogs 诊断                           |
| screenshot-service 不可达             | Agent 无法截图                       | 工具返回 SERVICE_UNAVAILABLE 错误；截图服务独立部署，不影响 Agent 核心功能 |

---

## 十一、未来扩展

- **网络请求捕获**：拦截 `fetch`/`XMLHttpRequest`，让 Agent 看到网络请求和响应
- **DOM 状态快照**：获取 iframe 的 DOM 结构（简化版），用于布局调试
- **交互录制**：记录用户在预览中的操作序列，帮助 Agent 复现问题
- **实时推送**：控制台错误实时推送给 Agent（无需主动调用 getConsoleLogs）
- **AgentStream 规范化**：将 `sendPermissionResponse`/`sendModelChange`/`forwardConsoleEntries` 等绕过 AgentStream 的方法下沉到 SDK，统一消息发送接口
