# AI Native 页面逻辑图方案

## 背景

创作端当前的多页面项目已经具备页面列表、页面文件、页面配置、项目级配置、画布布局和 viewer 预览能力。每个页面仍然是相对独立的 React 组件，外层 viewer 负责选择当前页面、传入配置并渲染预览。

这种模型适合快速生成和确认页面视觉，但当项目从“页面集合”进入“应用原型”阶段时，会自然出现页面之间的逻辑关系：

- 首页点击商品后进入详情页，详情页需要知道被点击的是哪个商品。
- 详情页点击购买后进入结算页，结算页需要使用上一步选择的数据。
- 问卷、报名、抽奖、活动流程需要根据用户选择跳到不同页面。
- Agent 需要理解页面之间的关系，才能安全插入中间页、重命名页面、修正死链或生成开发交接包。

如果只让 AI 在页面代码里写硬编码跳转，系统会很快失去结构化语义：页面 ID 随机、跳转散落在代码里、页面改名或复制后容易断链，后续交给 Codex 等工程 Agent 时也需要重新猜测业务流程。

因此，页面间关系不应只是代码里的点击事件，而应成为项目级的一等模型。

## 目标

建立一套长期可演进的 AI Native 页面逻辑协议，让创作端项目从“独立页面集合”升级为“可解释、可验证、可迁移的小型应用图”。

具体目标：

| 目标 | 说明 |
|---|---|
| 页面身份稳定 | AI 使用稳定语义标识引用页面，不直接依赖随机页面 ID。 |
| 逻辑关系结构化 | 页面跳转、动作、参数、条件和共享状态集中记录，避免散落在页面代码中。 |
| 页面代码轻量 | 页面组件只表达用户意图，不自行实现路由、状态机或 URL 拼接。 |
| 运行时托管 | viewer shell 统一执行切页、传参、状态更新、URL 同步和错误兜底。 |
| Agent 友好 | Agent 可以通过结构化工具读取、修改、校验和解释页面流程。 |
| 工程交接友好 | 页面和逻辑图可转成正式工程中的路由表、用户流程、验收说明和开发任务。 |

## 范围

本方案覆盖：

- 页面稳定标识 `routeKey` 的定位与生命周期。
- 项目级应用逻辑图 `app.graph.json` 的职责和基础结构。
- 页面代码通过 SDK action 表达业务意图的交互方式。
- viewer 运行时托管页面跳转、参数传递、共享状态和 URL 同步的原则。
- Agent 读取、修改、校验页面逻辑关系的协作模型。
- 未来转交 Codex 等工程工具继续开发时的交接价值。

本方案暂不覆盖：

- 完整状态机执行器。
- UI 流程图编辑器和画布连线能力。

## 核心方案

推荐采用：

```text
routeKey + app.graph.json + SDK trigger(event, payload)
```

三者职责分别是：

| 层级 | 职责 |
|---|---|
| `routeKey` | 页面稳定身份，面向 AI、用户语义和工程迁移。 |
| `app.graph.json` | 项目级应用逻辑图，描述页面节点、用户动作、跳转、参数、条件和共享状态。 |
| `@preview/sdk` 事件接口 | 页面代码触发业务意图，运行时根据逻辑图执行结果。 |

这比单纯的 `navigate(pageId)` 更适合长期演进。`navigate(pageId)` 只能表达“去某页”，而 `trigger(event, payload)` 能表达“用户执行了某个业务动作”。后者对 AI 和工程开发工具更有价值。

## 方案细节

### 页面稳定标识

当前页面元数据以 `id` 作为唯一标识，`id` 同时承担目录名和数据引用职责。该标识适合系统内部使用，但不适合让 AI 长期书写和维护。

建议在页面元数据中新增稳定语义标识 `routeKey`：

```json
{
  "id": "demo_...",
  "name": "商品详情页",
  "routeKey": "product-detail",
  "order": 20,
  "parentId": null
}
```

规则：

| 规则 | 说明 |
|---|---|
| 唯一性 | 同一项目内 `routeKey` 必须唯一。 |
| 稳定性 | 页面重命名、移动文件夹、调整排序时不自动改变。 |
| 可读性 | 使用短横线命名，如 `home`、`product-detail`、`checkout`。 |
| 内外分工 | `id` 面向存储和兼容，`routeKey` 面向 AI、用户流程和工程迁移。 |

当页面复制或从模板创建时，新页面应生成新的 `routeKey`，避免两个页面在逻辑图中语义冲突。

### 应用逻辑图

创作端工作区建议增加 `workspace/app.graph.json`，作为页面关系和运行时逻辑的结构化来源。

它不是正式工程的路由文件，也不是强状态机，而是面向创作端和 Agent 的应用意图模型。

基础结构：

```json
{
  "version": 1,
  "entry": "home",
  "pages": {
    "home": {
      "pageId": "demo_home",
      "title": "首页"
    },
    "product-detail": {
      "pageId": "demo_detail",
      "title": "商品详情页"
    }
  },
  "actions": [
    {
      "from": "home",
      "event": "viewProduct",
      "to": "product-detail",
      "params": ["productId"]
    }
  ],
  "state": {
    "selectedProductId": null
  }
}
```

字段职责：

| 字段 | 职责 |
|---|---|
| `version` | 协议版本，用于后续兼容升级。 |
| `entry` | 项目默认入口页面的 `routeKey`。 |
| `pages` | `routeKey` 到页面元数据的映射。 |
| `actions` | 用户动作到页面流转的声明。 |
| `state` | 跨页面共享的轻量运行时状态默认值。 |

存储边界：

| 场景 | 建议 |
|---|---|
| 创作端工作区 | 放在 `workspace/app.graph.json`，与 `workspace-tree.json` 同级，便于项目读写服务统一管理。 |
| 发布数据 | 随发布产物一起写入，旧项目缺失时按页面列表回退。 |
| 本地工程输入包 | local scaffold manifest 需要增加应用图入口或内联摘要，避免 Codex 等工程工具只拿到页面代码却丢失流程。 |
| Agent 上下文 | 通过确定性工具读取和修改，不要求 Agent 手写 JSON。 |

Action 推荐字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `from` | 是 | 动作来源页面 `routeKey`。 |
| `event` | 是 | 页面代码触发的语义事件名。 |
| `to` | 否 | 目标页面 `routeKey`；无目标时可只更新状态。 |
| `params` | 否 | 事件可接收的参数名列表。 |
| `setState` | 否 | 事件发生后写入共享状态的映射。 |
| `condition` | 否 | 进入目标前的条件表达。第一阶段可只保留字段，不执行复杂表达式。 |
| `fallback` | 否 | 条件不满足或目标缺失时的兜底页面。 |

示例：

```json
{
  "from": "product-detail",
  "event": "buyNow",
  "to": "checkout",
  "params": ["productId"],
  "setState": {
    "selectedProductId": "$params.productId"
  }
}
```

这个动作表达的是“用户立即购买某个商品”，而不是简单的“跳到结算页”。这层语义能让 Agent 更准确地理解业务流程。

### 页面代码接口

页面组件不应直接读写 `app.graph.json`，也不应直接调用浏览器路由。页面只通过 `@preview/sdk` 触发事件。

当前 `@preview/sdk` 是预览编译策略中的受控虚拟模块，而不是普通 npm 包。实现 `trigger` 时应扩展该虚拟模块源码和依赖策略，保持页面代码无需安装额外依赖，也避免 Agent 引入未登记运行时包。

推荐页面侧能力：

| 能力 | 用途 |
|---|---|
| `trigger(event, payload)` | 触发当前页面的一个语义动作。 |
| `PageAction` | 声明式按钮或链接组件，内部触发动作。 |
| `useAppState()` | 读取运行时共享状态。 |
| `useRouteParams()` | 读取由上一个动作传入的参数。 |

页面代码表达的是：

```text
用户点击“查看详情” -> 触发 viewProduct，并携带 productId
```

而不是：

```text
拼接某个 URL 或直接切到某个 demoId
```

这样可以让同一份页面代码在创作端预览、使用端预览、发布端和工程导出时有不同承载方式，但保持相同的业务意图。

### 运行时执行模型

运行时由 viewer shell 统一执行应用图。

需要注意现有组件边界：`PreviewPanel` 负责单个 iframe 的编译、配置投递和 iframe 消息收发，但页面列表、当前选中页、配置面板和 URL 状态由上层编辑页或 viewer 页面持有。因此首期实现不应让 `PreviewPanel` 直接拥有项目路由，而应让它把 iframe 中的应用动作上报给上层 shell，由上层 shell 解释应用图并切换 active page。

推荐流程：

1. 页面 iframe 内的 SDK 接收用户操作。
2. SDK 向父层发送 `APP_ACTION` 消息，携带 `event` 和 `payload`。
3. `PreviewPanel` 校验消息来源，并将动作连同当前页面 `pageId` 上报给外层 shell。
4. 外层 shell 将 `pageId` 映射为当前页面 `routeKey`，查找 `app.graph.json` 中匹配的 action。
5. 运行时校验目标页面、参数和条件。
6. 若 action 包含 `setState`，更新共享状态。
7. 若 action 包含 `to`，切换 active page。
8. 运行时将新的配置、共享状态和路由参数传入目标页面。
9. viewer 同步页面目录、配置面板、画布选中态和 URL。

这个流程类似“页面把意图交给前台，前台按照项目流程图安排下一步”，页面本身不需要知道外层预览系统如何切页。

### Agent 协作模型

为了让 AI 长期稳定工作，应将页面逻辑图暴露为结构化工具，而不是要求 Agent 手动编辑多个文件。

建议工具能力：

| 工具 | 能力 |
|---|---|
| `listPages` | 返回页面 `id`、`name`、`routeKey`、层级和顺序。 |
| `listAppGraph` | 返回当前入口页、页面节点、动作、状态默认值和校验结果。 |
| `createPageRouteKey` | 为页面生成或修正稳定 `routeKey`。 |
| `addTransition` | 新增页面动作和目标页面关系。 |
| `updateTransition` | 修改动作目标、参数或状态写入规则。 |
| `removeTransition` | 删除不再使用的动作。 |
| `validateAppGraph` | 检查死链、重复 routeKey、入口缺失、未使用页面、无效目标。 |
| `explainFlow` | 用自然语言解释项目主要流程，供用户确认。 |

Agent 行为约束建议：

- 新增页面后，如果页面会参与跳转，必须为其创建 `routeKey`。
- 不允许在页面代码中硬编码随机页面 ID。
- 不允许绕过 SDK 直接写 `window.location` 或自行拼接 viewer URL。
- 修改页面逻辑关系时优先修改 `app.graph.json`，再同步页面按钮的事件名。
- 删除页面前必须先检查逻辑图中是否有入边或出边。
- 重命名页面不应改变 `routeKey`，除非用户明确要求同步语义。

## 与现有系统的关系

### 与页面管理

页面管理继续负责页面的增删改查、文件夹层级和排序。`routeKey` 是页面元数据的增强字段，不替代 `id`。

页面列表仍以 `id` 作为系统内部稳定主键，`routeKey` 作为 AI 和运行时逻辑层的语义地址。

### 与配置系统

页面级配置和项目级配置继续按照既有配置合并规则工作。

应用图中的 `state` 不应和配置 Schema 混用：

| 类型 | 生命周期 | 适合内容 |
|---|---|---|
| 配置 Schema | 创作期和使用期可调 | 文案、颜色、图片、活动参数等可配置内容。 |
| 应用图 state | 用户运行时流转 | 当前选择、临时答案、流程上下文等交互状态。 |

第一阶段应保持 state 轻量，避免把它做成完整业务数据库。

### 与 iframe 预览

现有 iframe 协议已经支持代码更新、配置更新、错误上报和可视化编辑消息。应用图只需要增加一个从 iframe 到父层的动作消息，并由父层统一解释。

这样不会破坏动态编译和 iframe 沙箱的核心边界：页面仍在 iframe 沙箱中运行，外层仍负责预览编排。

画布模式下可能同时存在多个页面 iframe，因此动作消息不能只依赖 iframe 内部自报页面身份。外层 `PreviewPanel` 实例应以自身绑定的 `demoId/pageId` 作为可信来源，再由 shell 映射到 `routeKey`。

### 与画布模式

画布模式展示多个页面时，应用图可作为“页面连线”和“流程说明”的数据来源。第一阶段不要求在画布上画连线，但逻辑图应具备支持后续可视化流程图的结构。

当用户在画布中点击某个页面对象时，仍是选择页面；当页面内部触发 action 时，才进入应用图执行流程。

### 与使用端和发布端

使用端当前通过 viewer 嵌入创作端预览能力。应用图应优先在创作端 viewer 中执行，使用端自然继承行为。

发布数据需要包含 `routeKey` 和应用图，以保证发布后仍能运行相同页面逻辑。

当前 viewer URL 使用页面 `id` 选择页面。后续可新增 `route` 或 `routeKey` 查询参数，并继续兼容既有 `page` 参数；内部切页仍可落到 `pageId`，对外和 Agent 语义层优先暴露 `routeKey`。

### 与本地工程输入包

创作端代码不是最终生产代码，而是高质量工程输入。现有本地 scaffold manifest 已经描述页面的 `id`、`name`、`entry`、`schema`、排序和文件夹关系；引入页面逻辑图后，manifest 也需要携带 `routeKey` 和应用图入口。

建议本地包结构保持简单：

| 内容 | 建议 |
|---|---|
| 页面 manifest | 每个页面增加 `routeKey`。 |
| 应用图文件 | 输出 `src/app.graph.json` 或项目根 `app.graph.json`，由 manifest 指向。 |
| 同步回写 | 本地修改页面、删除页面或新增页面时，同步校验应用图。 |
| Codex 交接 | 在包内生成一份流程说明或验收清单，来源于应用图而不是重新扫描 TSX。 |

这样 Codex 等工程工具可以直接从应用图理解“页面如何组成应用”，而不是从按钮文案和点击事件里反推业务流程。

## 方案对比

| 方案 | 优点 | 问题 | 结论 |
|---|---|---|---|
| 页面代码硬编码 URL | 实现最简单 | AI 易猜错，页面复制和重命名易断，难校验 | 不推荐 |
| `navigate(pageId)` | 可快速切页 | 语义弱，依赖随机 ID，难表达参数和条件 | 仅适合作为临时能力 |
| `routeKey + navigate(routeKey)` | 页面身份稳定 | 仍只表达“去哪里”，业务动作缺失 | 可作为过渡方案 |
| 完整状态机 | 严谨，可验证 | 对普通原型过重，用户和 Agent 心智成本高 | 可作为高级演进方向 |
| `routeKey + app.graph.json + trigger` | 语义清晰、结构化、可校验、可迁移 | 需要新增协议、校验和运行时解释层 | 推荐 |

## 设计依据

本方案基于以下现状和长期目标判断：

1. 当前页面已经是项目内独立组件，外层 viewer 负责 active page 和配置传入，因此外层具备托管跳转的天然位置。
2. 当前页面 `id` 兼具目录和主键职责，适合系统内部使用，但不适合作为 AI 长期书写的业务标识。
3. 使用端已采用 iframe 直嵌创作端 viewer 的架构，页面逻辑如果在 viewer 层统一执行，可以减少两端重复实现。
4. 创作端代码定位是高质量工程输入，而不是最终生产代码；结构化应用图能成为后续 Codex 工程化迁移的重要上下文。
5. Agent 更擅长编辑结构化模型，而不是在多份 TSX 文件中搜索和猜测散落的字符串跳转。

因此，页面间关系应从“代码行为”提升为“项目协议”。

## 分阶段落地建议

### 阶段一：稳定页面身份

- 页面元数据支持 `routeKey`。
- 旧项目读取时可按 `id` 或页面名称生成兼容 `routeKey`，但写回时应固化到页面元数据。
- 页面创建、复制、模板导入时生成唯一 `routeKey`。
- 页面列表和 Agent 上下文展示 `routeKey`。
- 增加基础校验：重复、缺失、非法格式。

### 阶段二：最小应用图

- 创作端工作区支持 `workspace/app.graph.json`。
- 只实现 `entry`、`pages`、`actions.from/event/to`。
- `PreviewPanel` 上报 action，上层编辑页或 viewer shell 根据 action 切换页面。
- SDK 提供 `trigger(event, payload)`。
- 校验入口缺失、目标不存在、重复 action。

### 阶段三：参数与共享状态

- action 支持 `params` 和 `setState`。
- viewer 维护轻量运行时 state。
- 页面可读取 route params 和 app state。
- 配置面板、页面切换、URL 同步保持一致。

### 阶段四：Agent 工具化

- 增加读取、修改、校验应用图的确定性工具。
- 将行为约束写入 Agent prompt。
- 页面删除、重命名、复制时联动检查应用图。
- 生成自然语言流程说明供用户确认。

### 阶段五：工程交接

- 导出开发交接包时包含 `app.graph.json`、页面目录、截图和验收说明。
- 将 `routeKey` 映射为正式工程路由建议。
- 将 actions 映射为用户流程、路由表、状态管理建议和测试用例。
- 更新本地 scaffold manifest 和同步逻辑，确保本地开发包不会丢失应用图。

## 任务清单

- [x] 梳理页面间跳转和逻辑关系的长期建模方向。
- [x] 明确推荐协议：`routeKey + app.graph.json + SDK trigger(event, payload)`。
- [x] 将方案沉淀到 `docs/plans/进行中/`。
- [x] 对照现有页面元数据、iframe 协议、viewer 和本地 scaffold 结构复核可实施性。
- [x] 与产品/开发确认是否采用该协议作为后续实现方向。
- [x] 完成首期实现：`routeKey`、`app.graph.json`、SDK action、viewer 执行、发布与 scaffold 输出。
- [x] 实施完成后，同步更新 `docs/项目文档/` 下对应模块文档。
- [ ] 完成端到端验证并记录结果。

## 进度记录

- 2026-06-26：围绕“页面独立但需要互相跳转”和“创作端代码是高质量工程输入”进行方案讨论。
- 2026-06-26：形成核心判断：不要只做 `navigate(pageId)`，而应将页面关系建模为 Agent 可读、可改、可验证的应用逻辑图。
- 2026-06-26：将方案文档放入 `docs/plans/进行中/`，当前状态为方案讨论中，尚未进入实现。
- 2026-06-26：复核现有实现后补充关键边界：`PreviewPanel` 只负责 iframe 消息收发，切页应由上层 shell 执行；`@preview/sdk` 是受控虚拟模块；本地 scaffold 和发布数据都需要携带应用图。
- 2026-06-26：进入首期实现。共享类型新增 `routeKey` 与 `AppGraph`；author-site 工作区读写会为旧页面补齐稳定 `routeKey`，并维护 `workspace/app.graph.json`。
- 2026-06-26：预览运行时新增 `@preview/sdk.trigger`、`PageAction`、`useAppState`、`useRouteParams`；iframe 通过 `APP_ACTION` 上报动作，`PreviewPanel` 只转发，viewer shell 解释应用图并切页、传参、更新 state 和同步 URL。
- 2026-06-26：发布产物写出 `app.graph.json`，本地 scaffold manifest 增加页面 `routeKey` 和 `appGraph` 入口，Agent 工作区扫描展示 `routeKey`。
- 2026-06-26：已同步更新项目文档：[预览系统实时机制](../../项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md) 与 [Project Admin CLI 能力层](../../项目文档/创作端/03-项目管理/技术/10_Project_Admin_CLI能力层.md)。

## 验证方式

首期实现验证方式：

- 页面创建、复制、删除时的 `routeKey` 校验测试。
- `app.graph.json` 解析、校验和旧项目迁移测试。
- iframe SDK action 消息到 viewer 切页的集成测试。
- 发布数据包含应用图后的回放验证。
- 本地 scaffold 导出应用图的测试。
- 根目录 `pnpm check:author`、`pnpm check:project-core`、`pnpm check:project-scaffold`。
- 服务启动后执行 `pnpm test:e2e` 验证多页面关键流程。

## 风险与待确认事项

| 风险 | 说明 | 应对 |
|---|---|---|
| 协议过早复杂化 | 一开始支持过多状态机能力会拖慢落地。 | 第一阶段只做页面身份和简单 action。 |
| 页面代码与应用图不一致 | 页面触发了未声明 event，或图中 action 未被使用。 | 编译或预览时提示，Agent 工具做校验。 |
| `routeKey` 生命周期不清 | 页面复制、模板导入、重命名时可能冲突。 | 所有页面变更入口统一生成和校验。 |
| state 滥用 | 运行时 state 被当成业务数据库使用。 | 限定为轻量流程上下文，复杂数据交给后续工程层。 |
| 发布兼容 | 已发布旧项目没有应用图。 | 缺失时回退为当前页面列表行为，入口为首个页面。 |
| 本地包丢失流程 | 只导出页面代码和 manifest 会让 Codex 无法获得页面逻辑。 | scaffold manifest 和导出条目同步携带 `routeKey` 与应用图。 |
| 组件职责越界 | 若把路由执行塞进 `PreviewPanel`，会和编辑页、viewer、画布状态重复。 | `PreviewPanel` 只上报 action，外层 shell 解释和执行。 |

待确认事项：

- `routeKey` 是否作为页面元数据的必填字段，还是先作为可选字段逐步迁移。
- `app.graph.json` 在创作端是否固定为 `workspace/app.graph.json`，本地 scaffold 中放在项目根还是 `src/` 下。
- SDK action 首期是否只支持 `trigger`，还是同时提供 `PageAction` 组件。
- 画布是否需要在首期展示应用图关系，还是仅在运行时执行。
- 工程交接包是否在本方案首期内一并考虑，还是放到后续独立方案。

## 推荐决策

建议将“AI Native 页面逻辑图”作为创作端多页面能力的长期协议方向。

短期不应只补一个页面跳转 API，而应从第一步就引入稳定页面身份 `routeKey`，并预留项目级应用图。这样即使第一阶段只实现简单跳转，后续也可以自然扩展到参数传递、条件分支、共享状态、流程校验和工程交接。

最终形态应是：

```text
页面负责展示和触发事件
应用图负责表达业务流程
viewer 负责执行流程
Agent 负责编辑和校验结构化意图
Codex 等工程工具负责把确认后的意图工程化
```

这符合“创作端代码是高质量工程输入”的定位，也能让页面之间的逻辑关系长期保持可解释、可维护、可迁移。
