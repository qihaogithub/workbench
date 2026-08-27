# Workbench「一切皆插件」架构演进方案

> 状态：远期规划  
> 更新日期：2026-08-20  
> 目标：评估 Workbench 是否适合采用类似 DeepSeek Harness 的插件化架构，并定义可落地的边界与演进路径。

## 一、结论

Workbench 可以、也值得朝“一切皆插件”的方向演进，但不应将其理解为所有代码都动态加载。

更准确的目标是：

> 以稳定的平台内核为基础，以领域能力插件为主要扩展方式，以 Profile 组合不同产品运行面。

必须保留稳定边界的内容包括身份、权限、核心数据模型、Workspace Mutation Authority、事件基础设施和插件生命周期。Agent、项目、预览、知识库、图片、协同、发布和外部集成适合做成能力插件；React/Next 基础设施、共享类型和高频热路径应保持静态、类型安全和可直接调用。

## 二、目标分层

```text
Workbench Platform Kernel
├── 身份与租户
├── 配置与依赖注入
├── 事件总线
├── 权限模型
├── 数据访问协议
├── 任务与生命周期
├── 插件加载与卸载
└── API / UI Extension Contract
          ↓
Workbench Capability Plugins
├── Agent
├── Project
├── Workspace
├── Preview / Screenshot
├── Knowledge
├── Collaboration
├── Image
├── Sketch
├── Comments
└── Publishing
          ↓
Product Surfaces
├── Author UI
├── Viewer UI
├── Admin UI
├── CLI
└── Automation
```

内核负责“如何运行”，插件负责“提供什么能力”，产品表面负责“如何呈现”。

## 三、当前系统的插件化基础

当前 Workbench 尚未使用统一的运行时插件树，但已经存在多个候选插件边界：

- `author-site`、`viewer-site`、`agent-service`、`screenshot-service`、`knowledge-service` 等服务包。
- `project-core`、`sketch-core`、`sketch-react` 等领域共享包。
- Agent 内的文件、页面、图片、知识库、预览、Web、计划、审批和子 Agent 工具集。
- `WorkspaceMutationAuthority` 对 live Workspace 的唯一持久写入、串行队列、receipt、恢复和 drift 检测。

当前主要通过 TypeScript import、工厂函数和手工注册进行组合；后续可以在不立即改写实现的情况下，先将这些边界抽象为稳定 Service 和 Event 契约。

## 四、适合插件化的能力

### 4.1 领域能力

项目管理、页面管理、知识库、图片生成与资源管理、截图与预览、协同编辑、评论反馈、草图场景、发布导出以及 Figma/钉钉等外部集成，都适合形成领域插件。

一个完整领域插件可包含：

```text
Domain Plugin
├── Service
├── Storage Provider
├── API Routes
├── Agent Tools
├── UI Extension
└── Domain Events
```

### 4.2 Agent 能力

Agent 可拆分为模型 Provider、Agent Loop、Tool Registry、Prompt Provider、Permission Policy、Session Store、Subagent Provider、Context Provider 和 UI Event Adapter。

Workbench 当前的 `PiAgentBackend`、Pi Tools、Permission Manager、Workspace Authority、Event Mapper 和 checkpoint/run log，已经分别对应这些候选边界，但尚未由统一 Context 和插件生命周期管理。

## 五、不应开放给普通插件替换的内容

### 5.1 平台安全边界

身份认证、租户隔离、密钥保护、Workspace Mutation Authority、审计事件、数据完整性、沙箱边界和资源配额必须由平台内核控制。

插件可以增加 allow、提出 ask 或附加策略，但不能绕过平台级 deny。live Workspace 的写入必须继续经过 Authority，Agent 或领域插件不能直接写文件。

### 5.2 核心数据模型

项目、页面、用户、工作空间、版本和发布状态等核心实体应由平台领域模型统一定义。插件可以扩展实体能力和附加数据，但不应各自重新定义一套 Project 或 Workspace 模型。

### 5.3 前端基础设施与热路径

React/Next 基础设施、根路由、鉴权流程、主题、设计系统、错误边界、共享类型和高频请求路径应保持静态。前端可以提供注册路由、侧边栏、命令、面板和检查器等扩展点，但不能允许普通插件随意替换根布局或全局状态系统。

## 六、插件化的三个层次

### 层次一：代码组织插件化

通过明确模块边界和 Service 接口组织代码，但在构建期固定依赖。优点是类型安全、易调试、构建稳定，适合当前阶段。

### 层次二：运行时组合插件化

服务启动时根据 Profile 选择插件集合：

```typescript
createWorkbench({
  plugins: [projectPlugin(), previewPlugin(), knowledgePlugin()],
});
```

这一层已经可以支持 author、viewer、admin、headless、test 等不同运行面，是 Workbench 的首选目标。

### 层次三：外部安装插件

允许外部包安装、升级和卸载。该层需要额外解决插件签名、权限声明、沙箱、版本兼容、数据迁移和供应链安全，应在内部插件契约稳定后再考虑。

## 七、建议的最小插件契约

```typescript
interface WorkbenchPlugin {
  id: string;
  version: string;
  dependencies?: string[];

  setup(ctx: WorkbenchContext): Promise<void | (() => Promise<void>)>;
}
```

Context 只暴露稳定服务：

```typescript
interface WorkbenchContext {
  config: ConfigService;
  events: EventBus;
  auth: AuthService;
  projects: ProjectService;
  workspaces: WorkspaceService;
  storage: StorageService;
  tasks: TaskService;
  agent?: AgentService;
  ui?: UiExtensionService;
}
```

插件通过 Context 获取服务，不直接 import 其他插件的具体实现。每项注册都必须可撤销，以便测试隔离、Profile 切换、热重载和服务停止时释放资源。

## 八、事件模型

建议将事件分为三类：

### 8.1 Durable Events：持久事实

```text
project/created
page/created
workspace/committed
workspace/reconciled
agent/user-message
agent/tool-call
agent/tool-result
plan/approved
publish/completed
```

这些事件需要支持恢复、审计和重放。

### 8.2 Live Events：运行过程

```text
agent/stream
agent/thought
tool/executing
preview/rendering
screenshot/capturing
task/progress
```

这些事件用于实时 UI 和运行状态，不应被误当作持久事实。

### 8.3 Policy Events：策略拦截点

```text
workspace/pre-mutate
tool/pre-execute
agent/pre-request
publish/pre-flight
file/pre-delete
```

这些事件用于审批、改写和拒绝。应明确区分“已提交”“正在执行”和“是否允许执行”。

## 九、示例：领域插件如何协作

```text
Workbench Workspace Plugin
├── 提供 workspace service
├── 提供受管 mutation API
├── 监听 fs / tools 事件
└── 输出 receipt 和诊断事件

Workbench Approval Plugin
├── 监听 tools/pre-execute
├── 生成 permission request
├── 挂起 Agent
└── 接收前端 allow / reject

Workbench Preview Plugin
├── 注册 screenshot / console 工具
├── 监听 workspace/committed
└── 触发预览验证

Workbench Chat Adapter
├── 监听 agent/session events
├── 转换为现有 WebSocket 协议
└── 保留前端终态语义
```

这些插件可以共享平台 Context，但不需要互相 import 具体实现。

## 十、分阶段演进路线

### 第一阶段：定义边界

- 明确 `ProjectService`、`WorkspaceService`、`PreviewService`、`KnowledgeService`、`ImageService`、`AgentService` 和 `CollaborationService`。
- 清理跨模块直接 import，记录稳定接口和禁止依赖方向。
- 不改变当前运行时实现。

### 第二阶段：引入统一 Context

- 建立 `WorkbenchContext`。
- 将 Fastify、Agent、CLI 和自动任务需要的服务统一装配。
- 消除各模块到处 `new service` 和直接访问实现细节的情况。

### 第三阶段：引入 Setup / Dispose 生命周期

- 每个领域模块提供 `setup()` 和 `dispose()`。
- 按依赖顺序加载，按逆序释放。
- 为测试、Profile 切换和故障隔离提供基础。

### 第四阶段：统一事件模型

- 优先统一 `workspace/*`、`agent/*`、`preview/*`、`project/*` 和 `publish/*`。
- 区分 Durable、Live 和 Policy 事件。
- 逐步归一 WebSocket、EventEmitter、诊断 JSONL 和数据库回调中的事实。

### 第五阶段：引入 Profile

支持以下能力组合：

```text
author profile
viewer profile
headless agent profile
admin profile
test profile
```

不同 Profile 选择不同插件集合、模型 Provider、工具集和权限策略。

### 第六阶段：评估外部插件生态

只有在内部插件协议稳定后，才考虑 `plugin.json`、权限声明、签名、版本约束和沙箱。外部插件不是当前阶段的前置目标。

## 十一、成功标准

演进完成后，应满足：

- author、viewer、CLI 和 automation 可以复用同一领域 Service，而不复制业务逻辑。
- 新增一个领域能力主要是新增插件，不需要修改 Agent Loop、根路由或全局状态。
- Agent Runtime 可以替换，且不改变 Workspace Authority、审批和前端事件契约。
- 插件可按 Profile 启用、禁用和替换，并可在停止时完整撤销注册。
- 所有模型可见的持久事实、工具执行和关键状态都能被审计或重放。
- 任意插件都不能绕过身份、权限、Authority 和审计边界。

## 十二、最终判断

Workbench 应借鉴 DeepSeek Harness 的“一切皆插件”思想，但不应复制其全部实现或把所有内容动态化。

最适合 Workbench 的架构是：

```text
稳定内核
  + 领域能力插件
  + Profile 运行时组合
  + 统一 Service / Event 契约
  + 不可绕过的安全与数据一致性边界
```

这能获得插件化带来的可替换性和多运行面能力，同时保留 Workbench 对项目数据、协同写入、预览发布和 Agent 安全的控制权。

## 相关资料

- 当前 Agent 架构：`docs/项目文档/独立Agent服务层/01-架构设计.md`
- 当前 Agent 服务指南：`packages/agent-service/AGENTS.md`
- Workspace Authority：`packages/agent-service/src/workspace/workspace-mutation-authority.ts`
- DeepSeek Harness 架构：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- Cordis Primer：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md>
