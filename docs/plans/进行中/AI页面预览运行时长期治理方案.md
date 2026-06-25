# AI 页面预览运行时长期治理方案

## 背景

项目 `proj_1782286923644` 中部分页面在编辑器预览区显示为空白。已复现的页面包括：

- `external-guide_k7m2`（站外引导页）
- `age-confirmation_q8n5`（年龄确认弹窗）

这次故障表面上是单个项目、单批页面的白屏，但本质上暴露的是一个更通用的问题：AI 可能生成任意页面代码，而当前预览运行时对“AI 可以使用什么能力、依赖版本如何固定、运行错误如何回流给 AI”缺少统一治理。

本报告不再只聚焦当前两个页面的局部修复，而是给出适合本项目长期演进的优雅方案。

## 目标

- 用户侧预览保持友好，不直接展示技术错误、堆栈或依赖细节。
- AI 可以生成丰富页面，但必须运行在开发阶段预先设计好的稳定能力边界内。
- 依赖选择、版本固定、导出校验、错误修复都由系统自动处理，不要求非技术用户做判断。
- 编辑预览、viewer、截图服务、发布和嵌入使用同一套预览运行时规则，避免不同入口表现不一致。
- 运行失败时，错误必须可靠回流给 AI 进行自修复，而不是静默白屏。

## 范围

### 涉及数据与页面

- 项目数据：`data/projects/proj_1782286923644/`
- 编辑工作区：`data/workspaces/a5862615-26bb-4688-924d-7fd68c132e21/proj_1782286923644/`
- 已确认白屏页面：
  - `data/projects/proj_1782286923644/workspace/demos/external-guide_k7m2/index.tsx`
  - `data/projects/proj_1782286923644/workspace/demos/age-confirmation_q8n5/index.tsx`

### 涉及系统模块

- 动态编译：`packages/author-site/src/lib/compiler.ts`
- 编译 API：`packages/author-site/src/app/api/compile/route.ts`
- 预览 iframe：`packages/shared/src/demo/PreviewPanel.tsx`
- iframe 模板：`packages/shared/src/demo/iframe-template.ts`
- 截图服务编译链路：`packages/screenshot-service/src/`
- 发布与嵌入编译链路：`packages/author-site/src/lib/publish-manager.ts`、`packages/author-site/src/app/api/embed/`
- AI 生成代码提示词与错误回流链路：`packages/author-site/src/lib/agent/`、`packages/author-site/src/components/ai-elements/`

## 已验证现象

### 服务状态

`ops-cli system --json` 显示：

- author-site `3200` 正在运行。
- agent-service `3201` 正在运行且健康。
- 问题不是服务整体不可用。

### 编译阶段

`/api/compile` 对问题页面返回 200，说明服务端 TSX 编译本身成功。

编译器会把：

```ts
import { Chrome } from "lucide-react";
```

改写成：

```ts
import { Chrome } from "https://esm.sh/lucide-react?deps=react@18.3.1,react-dom@18.3.1";
```

当前项目 `project.json` 中没有 `lockedDependencies`，因此第三方依赖走 esm.sh 默认解析。

### 浏览器运行阶段

通过 Playwright 对比验证：

| 页面 | iframe 结果 | postMessage |
| --- | --- | --- |
| `external-guide_k7m2` | `#root` 为空，iframe opacity 为 0 | `RUNTIME_ERROR` |
| `age-confirmation_q8n5` | `#root` 为空，iframe opacity 为 0 | `RUNTIME_ERROR` |
| `activity-loading_x4p1` | `#root` 有 DOM，页面可见 | `LOADED` |

实际错误：

- `external-guide_k7m2`：`lucide-react` 不提供 `Chrome` 导出。
- `age-confirmation_q8n5`：`lucide-react` 不提供 `Soccer` 导出。

## 根因分析

### 直接根因：AI 页面代码引用了运行时不存在的图标导出

证据：

- `external-guide_k7m2` 第 1 行导入 `Chrome`。
- `age-confirmation_q8n5` 第 2 行导入 `Soccer`。
- 浏览器 ESM 加载阶段校验命名导入失败，模块没有执行到组件渲染。

这解释了为什么代码看起来完整，但预览区是空白：组件根本没有成功加载。

### 深层根因 1：预览依赖由 CDN 默认版本决定，缺少稳定运行时能力层

当前编译器对非核心依赖生成的 URL 没有固定版本：

```ts
https://esm.sh/${packageName}?deps=react@18.3.1,react-dom@18.3.1
```

这意味着：

- 今天 esm.sh 解析到一个版本，明天可能解析到另一个版本。
- AI 生成代码时以为某个导出可用，但实际预览加载的版本未必支持。
- 同一份代码在不同时间、不同入口、不同缓存状态下可能表现不同。

项目已有 `lockedDependencies` 设计，但它不是完整根治：

- viewer 这类无登录 session 的预览入口不一定能拿到项目锁定依赖。
- 截图、发布、嵌入也需要统一规则。
- 依赖锁定属于结果缓存，不应承担全部运行时治理职责。

### 深层根因 2：AI 直接操作底层 npm 依赖，缺少面向页面生成的产品能力层

AI 当前会直接写：

```tsx
import { Chrome, Soccer } from "lucide-react";
```

这要求 AI 同时了解：

- 当前项目使用哪个图标库。
- 当前图标库的精确版本。
- 该版本有哪些导出。
- 浏览器 CDN 版本和本地开发版本是否一致。

这些都是底层工程细节，不适合暴露给 AI 自由发挥，也不适合交给非技术用户处理。

更合理的抽象应是：

```tsx
<Icon name="browser" />
<Icon name="football" />
```

由系统决定这些语义图标映射到哪个真实组件。AI 负责表达页面意图，系统负责保证运行稳定。

### 深层根因 3：运行错误没有进入稳定的 AI 自修复闭环

iframe 已经通过 `postMessage` 发出 `RUNTIME_ERROR`，但用户看到的是空白。

对非技术用户来说，预览区不应该显示技术错误；但系统内部不能丢失错误。正确流向应该是：

1. iframe 捕获运行错误。
2. 父页面记录结构化错误。
3. 错误进入 AI 对话上下文或自动修复任务。
4. AI 修改当前页面代码。
5. 预览重新验证。

当前问题在于错误虽然被捕获，但没有形成足够可靠、产品化的“AI 自修复闭环”，最终表现为用户侧空白。

## 长期治理方案

### 总体原则

不要把 AI 生成页面当作普通前端源码直接运行，而要把它当作“不可信但可修复的页面描述”。

系统需要提供一个稳定的 AI 页面运行时：

- AI 可以自由设计页面结构、文案、布局、交互和视觉表现。
- AI 不直接决定底层 npm 包、包版本和导出名称。
- 开发团队在开发阶段定义页面可用能力。
- 运行阶段只做自动校验、自动回流和自动修复，不把技术决策抛给用户。

### 方案一：建设 AI 页面 SDK

建立面向 AI 页面生成的稳定 SDK，例如：

```ts
import { Icon, Button, Card, Modal, Motion, Chart, ImageAsset } from "@preview/sdk";
```

SDK 不是给业务代码复用的通用组件库，而是给 AI 生成页面使用的运行时能力层。

能力设计应按真实需求分层。当前产品的大多数页面属于第一类需求：活动页、落地页、弹窗、抽奖页、排行榜、进度条、任务列表、简单动效、简单数据展示等。这些页面不应该依赖 AI 随机引入第三方库，而应由 React、Tailwind 和 SDK 基础能力完成。

少数页面会需要第二类专项能力。第二类能力可以在开发阶段预置一批高价值能力，但不开放任意依赖选择。

首批基础能力建议：

| 能力 | 说明 |
| --- | --- |
| `Icon` | 使用语义名称，不暴露 `lucide-react` 具体导出 |
| `Button` / `Card` / `Modal` | 提供稳定基础 UI 语义 |
| `ImageAsset` | 统一图片资源、安全 URL 和占位策略 |
| `Format` 工具 | 日期、数字、金额等格式化 |
| `Countdown` | 活动倒计时、开奖倒计时、任务截止时间展示 |
| `Progress` | 进度条、步骤进度、加载状态 |

首批增强能力建议：

| 能力 | 说明 |
| --- | --- |
| `Motion` | 封装常用动画能力，内部可基于 `framer-motion` |
| `Chart` | 封装折线、柱状、环形、排行等常用图表 |
| `Confetti` | 中奖、完成任务、表彰页等庆祝效果 |
| `Lottie` | 播放开发阶段预置或上传后的 Lottie 动画 |
| `MediaViz` | 视频/音频波形、播放状态、媒体装饰性可视化 |
| `Carousel` | 轮播、横滑奖品、活动说明卡片 |

这样 AI 生成页面时仍然有足够表达力，但不再直接接触底层依赖细节。

暂不纳入的第二类能力：

- 3D 场景。
- 地图 SDK。
- 富文本编辑或富文本渲染。
- 日历组件。

这些能力不是当前主要场景，通常会带来更高体积、权限、安全或交互复杂度。若未来产品明确需要，应通过专项方案加入 SDK，而不是让 AI 直接引入第三方依赖。

### 方案二：统一预览依赖策略

建立 `previewDependencyPolicy`，由开发团队维护。

它负责回答四个问题：

- 哪些能力可用。
- 这些能力依赖哪些 npm 包。
- 每个 npm 包使用哪个固定版本。
- 这些包如何映射到 CDN URL 或本地运行时。

示例规则：

```ts
{
  react: { version: "18.3.1", kind: "core" },
  "react-dom": { version: "18.3.1", kind: "core" },
  "lucide-react": { version: "0.323.0", kind: "internal" },
  "framer-motion": { version: "...", kind: "internal" }
}
```

重要约束：

- AI 页面不允许直接 import 未登记 npm 包。
- 对已登记包必须生成固定版本 URL。
- `lockedDependencies` 可以继续存在，但作为项目级缓存或发布固化结果，不作为唯一依赖来源。
- 编辑、viewer、截图、发布、嵌入都必须复用同一策略。

### 方案三：编译前做页面运行时契约校验

编译前增加轻量校验，不追求完整 TypeScript 类型检查，而是检查 AI 页面是否符合预览运行时契约。

建议校验项：

- 禁止未知 npm import。
- 禁止无法解析的相对 import。
- 禁止直接 import `lucide-react`，引导使用 `Icon`。
- 如果短期仍允许 `lucide-react`，必须校验 named import 是否存在。
- 必须存在可渲染的默认导出，或能被自动包装为默认导出。
- 检测明显空渲染风险，例如顶层 `return null`、根节点透明或全局隐藏。

校验失败时不把错误显示在预览区，而是生成结构化错误给 AI。

### 方案四：错误回流 AI，而不是展示给用户

用户侧预览区策略：

- 不展示技术堆栈。
- 可以保留上一张成功预览截图。
- 可以显示非技术状态，例如“正在修复预览”或“预览生成中”。

系统内部错误策略：

```json
{
  "stage": "dependency_import",
  "pageId": "external-guide_k7m2",
  "file": "demos/external-guide_k7m2/index.tsx",
  "message": "Icon dependency import failed",
  "details": "lucide-react does not export Chrome",
  "instruction": "Use Icon name=\"browser\" or replace with an available semantic icon."
}
```

该错误应进入 AI 上下文，用于自动修复当前页面。

### 方案五：所有入口共用同一预览运行时

需要统一的不是一个 API，而是一条运行时链路：

```text
AI 生成代码
  → 页面运行时契约校验
  → SDK / 依赖策略解析
  → TSX 编译
  → iframe 执行
  → 运行错误捕获
  → 错误回流 AI
  → 重新验证
```

必须接入的入口：

- 编辑页实时预览
- viewer 页面预览
- screenshot-service 截图
- publish 发布
- embed 嵌入

否则会出现“编辑页好了、截图还是白、发布又失败”的不一致。

## 分阶段实施计划

### 第一阶段：止血与观测

- [ ] 替换当前项目中已确认不可用的图标导入。
- [ ] 修复 `RUNTIME_ERROR` 的内部记录链路，确保错误能进入 AI 上下文。
- [ ] 预览区不显示技术错误，改为友好占位或保留上一张成功截图。
- [ ] 为截图服务记录运行时错误原因，避免只产出纯白截图。

验收标准：

- 当前两个白屏页面不再空白。
- 再出现运行时错误时，AI 能拿到结构化错误。
- 用户不需要理解依赖、版本或堆栈。

### 第二阶段：统一依赖策略

- [ ] 新增预览依赖策略模块。
- [ ] `compiler.ts` 不再为第三方依赖生成未固定版本 CDN URL。
- [ ] `/api/compile`、viewer、截图、发布、嵌入共用同一依赖解析入口。
- [ ] 未登记依赖返回结构化错误给 AI，不询问用户。

验收标准：

- 同一页面在编辑、viewer、截图、发布中使用相同依赖版本。
- esm.sh 默认版本变化不会影响已生成页面。

### 第三阶段：AI 页面 SDK

- [ ] 提供 `@preview/sdk` 或等价虚拟模块。
- [ ] 首批实现 `Icon`、基础 UI、图片、格式化、倒计时、进度条等基础能力。
- [ ] 预置增强能力：动画、图表、庆祝效果、Lottie、媒体可视化、轮播。
- [ ] 明确暂不开放 3D、地图、富文本编辑/渲染、日历能力。
- [ ] 编译器将 `@preview/sdk` 映射到受控运行时实现。
- [ ] AI prompt 改为要求使用 SDK 能力，不直接使用底层 npm 包。

验收标准：

- AI 生成图标、按钮、弹窗、活动页、抽奖页、排行榜、简单图表、常见动画时不需要直接 import 底层库。
- 图标使用语义名称，不因图标库导出名变化导致白屏。
- 第二类预置能力可以满足少量复杂视觉需求，但不会开放任意第三方依赖。

### 第四阶段：契约校验与自动修复闭环

- [ ] 编译前增加页面运行时契约校验。
- [ ] 将校验错误、编译错误、运行错误统一成 AI 可读的结构化上下文。
- [ ] 增加“一次失败自动修复一次”的机制，避免用户手动催促 AI 排查。
- [ ] 对连续失败设置安全上限，避免无限循环。

验收标准：

- AI 生成不可运行页面时，系统自动反馈并触发修复。
- 用户只看到稳定状态，不看到技术错误。

## 当前页面的短期修复建议

在长期方案落地前，当前项目可以先做局部修复：

- `external-guide_k7m2`：不要使用 `Chrome`，可改为系统已有图标或后续 `Icon name="browser"`。
- `age-confirmation_q8n5`：不要使用 `Soccer`，可改为系统已有图标或后续 `Icon name="football"`。

这只是止血，不是根治。

## 风险与取舍

### 对 AI 发挥的影响

AI 的底层依赖自由会被限制，但页面创意不应被限制。

AI 仍可自由组合：

- 页面结构
- 文案
- 配色
- Tailwind 布局
- 交互状态
- 动画语义
- 图表语义
- Lottie 和庆祝效果
- 媒体可视化
- 配置项
- 多页面流程

被限制的是：

- 随机 npm 包。
- 不确定版本。
- 不存在的导出。
- 运行时不可控能力。
- 当前不需要的高复杂能力，例如 3D、地图、富文本编辑/渲染、日历。

这是面向非技术用户产品必须接受的工程边界。

### 对开发成本的影响

建设 SDK 和依赖策略需要开发成本，但它会换来：

- 更少白屏。
- 更少截图空图。
- 更稳定发布。
- 更可靠 AI 自动修复。
- 更低非技术用户认知负担。

### 对现有 `lockedDependencies` 的定位

`lockedDependencies` 不应删除，但要重新定位：

- 它适合作为项目级依赖固化记录。
- 它不适合作为唯一的依赖治理机制。
- 依赖治理的源头应是开发阶段维护的预览依赖策略与 SDK 能力层。

## 验证方式

长期方案需要覆盖以下验证：

- 单页编辑预览：AI 生成页面后可正常显示。
- viewer 预览：无 session 状态下与编辑页一致。
- 截图服务：失败时不产出静默纯白截图，错误可回流。
- 发布与嵌入：使用相同依赖版本和 SDK 运行时。
- AI 自动修复：注入错误后能修改页面并通过二次验证。

## 结论

当前白屏不是孤立页面 bug，而是 AI 页面运行时治理不足的表现。

长期优雅方案不是让用户审批依赖，也不是简单扩大 npm 白名单，而是由开发团队在系统内建设稳定的 AI 页面能力层：

- 用 SDK 表达页面能力。
- 用统一依赖策略固定运行环境。
- 用契约校验拦截不可运行代码。
- 用错误回流让 AI 自动修复。
- 用友好占位保护用户预览体验。

这样才能支持 AI 未来生成任意页面，同时保证非技术用户看到的是稳定产品，而不是依赖、版本和运行时报错。
