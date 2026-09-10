# AI 对话与 Agent - System Prompt 渐进式披露重构方案

> 创建日期：2026-07-27
> 状态：方案已审批，设计完成，已完成保守化修订

## 当前状态

方案已于 2026-07-28 完成设计评审，并在同日进行了保守化修订，主要决策：

- **核心动机修正**：拆分 skill 的首要目标是**防止跨任务规则污染**（例如新建 React 页的「优先使用 @preview/sdk」规则误导了运行时转换场景），降低 Token 成本是附带收益而非主要目标
- **Skill 数量定为 7 个**：合并了 `preview-debug` + `canvas-management` → `preview-tools`（两者同属预览/画布交互场景），`external-collaboration` 回归 Tier 1（仅 19 行，太薄不配独立 skill；安全基线不宜延迟加载）
- **`react-high-fidelity` 内容边界收紧**：只保留 React 特有规则（DemoProps、Tailwind、@preview/sdk、import 规则、React 版本约束），Schema 编写规则（format、enum、图片尺寸校验、`$demo.maxItems`）保留在 Tier 1，因为原型页和 React 页共用
- **`buildRuntimeConversionPrompt` 保守简化**：保留文件清单和通用操作要求（~15 行），仅将可复用转换规范移入 `page-runtime-conversion` skill；避免 agent 在未加载 skill 时不知道要操作哪些文件
- **Tier 2 基座约束增加显式「先加载 skill」指令**：不依赖 agent 从 `<available_skills>` 自主匹配，而是在基座中明确要求 `readPreinstalledSkill`
- **条件注册逻辑后移**：`getPreinstalledSkills()` 保持纯扫描 + 缓存不变；条件过滤逻辑移至 `formatPreinstalledSkillsForPrompt(toolNames)`，避免缓存与运行时工具列表的时序耦合
- **新增跨 skill 去重测试**：验证每个 Tier 2/Tier 3 模块的内容在基座与对应 skill 之间不重复
- **无需新增工程设施**：无截图管道、无提取器、无对比工具

## 背景

当前 Pi Agent 的 L2 静态 system prompt（`system-prompt.md`）约 646 行，涵盖身份定义、Workspace Authority、计划审批、子 Agent 委派、页面管理、画布管理、项目配置、页面配置、代码质量标准、React 版本约束、知识库、禁止行为、文件编辑规则、文件修改决策、memory.md 维护、图片处理、外部协作、权限确认、需求确认、预览调试等全部行为约束。

**核心问题不是 Token 消耗，而是规则污染**。所有规则无条件驻留在每一轮对话中，AI 无法区分当前任务适用哪些规则。最典型的冲突：新建 React 页要求「优先使用 @preview/sdk 通用组件」，而运行时转换要求「逐元素还原，禁用通用组件替换」——这两条规则同时存在，AI 缺乏场景意识来做出正确选择。

实验已验证：单独给转换任务提供不含冲突规则的提示词时，即使不用很好的模型，转换效果也大幅提升。这说明问题的根因是规则污染，解法是让每个任务只看到自己需要的规则。

## 目标

1. **首要目标**：通过渐进式披露消除跨任务规则污染，让每个任务的 AI 只看到适用于当前场景的规则，避免相互冲突的指令共存导致行为劣化
2. 将场景限定性模块迁移为可渐进式披露的内置 skills，保留现有 `readPreinstalledSkill` 的 on-demand 加载机制
3. 不新增机制，完全复用 `preinstalled-skills.ts` → `readPreinstalledSkill` 工具链路
4. 附带收益：将 system prompt 瘦身到约 350-380 行核心内容（-41%~-46%），降低每轮对话的 prompt token 成本

## 设计原则

**首要原则：基座自身无冲突**。拆分的主因是消除跨场景规则污染——让互斥的规则不出现在同一上下文中。因此 Tier 2 的最小约束不能仅仅是「精简版规则」，必须在基座中显式声明规则的适用范围和不适用场景，做到即使 AI 不加载任何 skill，基座也不会给出相互矛盾的指令。

模块按行为影响分三层处理：

| 层级 | 策略 | 判定标准 |
|------|------|----------|
| **Tier 1 始终驻留** | 保留在基座 prompt | 每轮对话都需要，或缺失会导致安全/身份问题 |
| **Tier 2 最小约束 + on-demand skill** | 基座保留 3-5 行最小可行约束，完整规则移入 skill | 缺失会导致**结构正确性错误**（非仅质量下降），如产出不符合规范的目录名或文件结构 |
| **Tier 3 纯 on-demand skill** | 基座仅保留 1-2 行引用指令，全部内容移入 skill | 缺失仅导致 agent 不使用某工具或能力，不产生结构错误 |

Tier 2 的最小约束必须是**自足的**——agent 即使不调用 `readPreinstalledSkill`，仅凭基座中的最小约束也能产出结构正确的（虽非最优的）结果。skill 中放完整模板、示例和边界情况。

## 范围

| 涉及包 | 涉及文件 | 改动类型 |
|--------|----------|----------|
| `@workbench/agent-service` | `src/preinstalled-skills/` | 新增 7 个内置 SKILL.md 文件 |
| `@workbench/agent-service` | `src/backends/preinstalled-skills.ts` | 目录扫描 + source 字段 + 条件注册后移至 `formatPreinstalledSkillsForPrompt` + 缓存清理 |
| `@workbench/author-site` | `src/lib/agent/prompts/system-prompt.md` | 裁剪模块（Tier 2 保留最小约束 + 显式 load 指令，Tier 3 仅留引用指令） |
| `@workbench/author-site` | `src/lib/agent/system-prompt.ts` | 移除 `buildDeletePageRules`/`buildCanvasLayoutRules`，简化 `buildStaticSystemPrompt` |
| `@workbench/author-site` | `src/app/demo/[id]/edit/page.tsx` | 保守简化 `buildRuntimeConversionPrompt`：保留文件清单 + 通用操作要求（~15 行），可复用规范移入 skill |
| `@workbench/author-site` | `src/lib/agent/__tests__/system-prompt.test.ts` | 更新断言：移除已迁移内容检查，新增 Tier 2 最小约束 + 显式 load 指令检查 |
| `@workbench/agent-service` | `src/backends/pi-agent.ts` | 无需改动（子 Agent 继承裁剪后基座，已有 `readPreinstalledSkill`） |
| `@workbench/agent-service` | `tests/` | 新增跨 skill 去重测试（验证基座与 skill 无重复内容） |
| `@workbench/preview-contract` | `src/rules.ts` | 无需改动（L5 层保持不变） |

## 模块拆分分析

### 一、Tier 1 始终驻留（约 330 行）

这些内容每次对话都需要，或缺失会导致安全/身份问题，不迁移。

| 模块 | 行数 | 理由 |
|------|------|------|
| Agent 身份定义 | ~8 | 角色锚定 |
| Workspace Authority 变更确认约束 | ~8 | 每次文件操作都需要 |
| 用户审批计划与待办 | ~55 | 高频决策路由 |
| 子 Agent 委派 | ~28 | 子 Agent 继承基座 prompt，保留可避免子 Agent 额外调用 `readPreinstalledSkill` 的延迟；含安全规则（禁止递归委派、明确文件边界） |
| 页面内容编辑（名称匹配规则） | ~8 | 每次操作页面都需要 |
| 项目级配置管理 | ~30 | 高频操作 |
| 页面级配置与页面运行时 | ~18 | 每次涉及配置都需要 |
| config.schema.json 编写规则（format、enum、图片尺寸校验、`$demo.maxItems`） | ~35 | 原型页和 React 页共用，与「添加配置项」属于同一业务场景，不宜拆分到 React 专属 skill |
| 代码质量标准（HTML/CSS 原型页部分） | ~15 | 每次生成代码都需要 |
| 外部协作工具（Figma / 钉钉） | ~19 | 安全基线（禁止暴露 token、必须走工具），仅 19 行不值得单开 skill；安全规则延迟加载风险高 |
| 知识库查阅 | ~12 | 每次可能需要 |
| 禁止行为 | ~10 | 全局安全基线 |
| 文件编辑规则 | ~9 | 每次编辑都需要 |
| 文件修改决策规则 | ~12 | 避免 agent 反复询问 |
| 权限确认 | ~10 | 安全基线 |
| 需求确认 | ~12 | UI 规范 |
| Tier 2 最小可行约束（4 个 skill） | ~25 | 结构正确性保底 + 显式 `readPreinstalledSkill` 加载指令 |
| on-demand skill 引用指令（7 个 skill） | ~21 | 指向 `readPreinstalledSkill` 的简短触发提示 |
| memory.md 核心入口 | ~5 | 告知 agent 首消息自动注入 memory.md |

### 二、迁移为内置 Skill（约 280 行）

新增 7 个 skill（加上已有的 `design-taste-frontend`，`<available_skills>` 共 8 个条目）。按层级标注 Tier 2 / Tier 3。

> **skill 内容治理约定**：每个 SKILL.md 力求精简，目标控制在 200 行以内。skill 只包含 agent 需要主动遵守的约定；版本号、白名单等编译器已有强校验的内容不重复写入。后续维护中，向 skill 新增内容前应先评估：这条规则 agent 不读 skill 就做不对吗？如果基座最小约束已足够，不要在 skill 中重复。

#### Skill 1: `page-lifecycle` — 页面创建 / 重命名 / 排序 / 文件夹（Tier 2）

**现状**：system-prompt.md 第 114-176 行（约 63 行，原 page-creation + page-management 合并）
**触发条件**：创建页面、重命名页面、调整顺序、文件夹操作
**触发描述**：`创建新页面，新建 demo，重命名页面，调整页面顺序，创建文件夹，移动页面到文件夹`

**基座保留的最小可行约束**（~7 行）：
```
## 页面生命周期操作

- ⚠️ 执行以下操作前，先调用 `readPreinstalledSkill({ name: 'page-lifecycle' })` 获取完整规则
- 创建页面：在 `demos/` 下创建目录（英文名 + 4 位随机字符），默认创建 `prototype.html` + `prototype.css` + `config.schema.json`（空 schema），在 `workspace-tree.json` pages 数组追加记录
- 重命名/改顺序：编辑 `workspace-tree.json` pages 数组的 `name`/`order` 字段
- 文件夹：编辑 `workspace-tree.json` folders 数组
- 完整规则（默认 runtime 选择、文件结构模板、配置项约束、自检规则）见 skill
```

**skill 内容边界**（完整规则）：
- 目录命名规则（英文 + 4 位随机字符，最长 25 字符，不用时间戳/纯数字）
- 默认 runtime 选择策略（prototype-html-css vs high-fidelity-react）
- 默认文件结构（prototype.html/css 或 index.tsx）
- 默认 config.schema.json 模板（含 previewSize）
- workspace-tree.json pages 数组追加规则（id、name、runtimeType、order、parentId）
- 配置项约束（默认空 schema，不自抽取字段）
- 自检规则（不与 project.config.schema.json 重名）
- 重命名/改顺序：编辑 pages 数组 name/order
- 文件夹管理：folders 数组格式、创建/重命名/移动/删除文件夹、子页面处理

#### Skill 2: `page-deletion` — 页面删除（Tier 2）

**现状**：system-prompt.md 第 178-213 行（约 36 行）+ system-prompt.ts `buildDeletePageRules()` 三分支条件渲染
**触发条件**：删除页面时
**触发描述**：`删除页面，移除页面，批量删除，删除所有`

**基座保留的最小可行约束**（~5 行）：
```
## 页面删除

- ⚠️ 执行删除操作前，先调用 `readPreinstalledSkill({ name: 'page-deletion' })` 获取完整流程
- 删除前必须先调 `listPages` 获取精确 ID，不要根据名称猜测
- 通过 `deletePage` / `previewDeletePages` → `executeDeletePagePlan` 删除，不要用 `bash`/`writeFile`/`editFile` 手动删除
- 完整规则（批量删除流程、注意事项）见 skill
```

**skill 内容边界**（完整规则）：
- deletePage 单体删除用法和参数
- previewDeletePages → executeDeletePagePlan 批量删除流程
- 删除文件夹时子页面一并删除
- 注意事项（不要循环调用、不要编造 planId、取消处理等）

**特殊处理**：`buildDeletePageRules()` 的三分支逻辑（transactional / batch / unavailable）改为控制 skill 是否注册到 `<available_skills>`：工具不可用时 not registered，工具可用时注册 skill 并在 SKILL.md 中覆盖对应分支的完整建议方式。

#### Skill 3: `image-handling` — 图片资源处理（Tier 3）

**现状**：system-prompt.md 第 508-553 行（约 45 行）
**触发条件**：处理图片上传、保存、引用时
**触发描述**：`保存图片，上传图片，使用图片，图片引用，素材`

**基座保留的引用指令**（~1 行）：
```
- 图片资源保存、引用和路径规则：先用 `readPreinstalledSkill({ name: 'image-handling' })` 读取
```

**内容边界**：
- saveImage 两种来源（base64 / url）用法和参数
- 保存后工作区路径规则（assets/images/{hash}-{filename}）
- 页面中引用路径规则（../../assets/images/...）
- 发布时自动处理说明
- URL 来源的安全限制（超时 10s、最大 10MB、Content-Type 校验）

#### Skill 4: `preview-tools` — 预览调试与画布管理（Tier 3）

**现状**：system-prompt.md 第 215-234 行 + 第 601-645 行（约 66 行）+ system-prompt.ts `buildCanvasLayoutRules()` 两分支条件渲染
**触发条件**：使用 getConsoleLogs / captureScreenshot 排查问题，或使用 `arrangeCanvasPages` 整理画布时
**触发描述**：`调试预览，获取控制台日志，截图，页面报错，白屏排查，整理画布，排列画布页面，调整画布位置`

**设计理由**：`preview-debug` 和 `canvas-management` 同属预览/画布交互场景，合并为一个 skill 减少碎片化。两者频率都偏低（仅在排查或整理时触发），不需要无条件驻留。

**基座保留的引用指令**（~2 行）：
```
- 预览调试（控制台日志、截图）：先用 `readPreinstalledSkill({ name: 'preview-tools' })` 读取
- 画布布局管理（arrangeCanvasPages）：先用 `readPreinstalledSkill({ name: 'preview-tools' })` 读取
```

**内容边界**：
- getConsoleLogs 使用方式（limit、level、since 参数）和使用场景
- captureScreenshot 使用方式（width、height、fullPage 参数）和使用场景
- 截图基于工作空间文件渲染的约束说明
- arrangeCanvasPages 使用方式和 mode/sizeMode/pageIds 参数
- 与 workspace-tree.json order 的区别说明

**特殊处理**：`buildCanvasLayoutRules()` 的两分支逻辑改为控制 skill 中画布管理部分是否适用：`arrangeCanvasPages` 不可用时，skill 仍然注册（调试部分仍可用），但画布管理部分标注「需要 `arrangeCanvasPages` 工具」。条件注册的粒度从 skill 级别改为 `formatPreinstalledSkillsForPrompt` 级别。

#### Skill 5: `memory-maintenance` — 项目记忆维护（Tier 3，部分驻留）

**现状**：system-prompt.md 第 442-504 行（约 63 行）
**触发条件**：读取/更新 memory.md 时
**触发描述**：`记住，偏好，以后都这样，memory.md`

**基座保留的核心入口**（~3 行）：
```
## 项目记忆 (memory.md)

- 每次对话开始时，memory.md 内容会自动注入到首条消息中
- 如需更新记忆，先用 `readPreinstalledSkill({ name: 'memory-maintenance' })` 读取完整维护规则
```

**skill 内容边界**（完整规则）：
- memory.md 用途说明（用户可读可编辑，AI 自动维护，跨会话持久化）
- 何时读取（用户问及项目信息时）
- 何时更新（明确要求记住、表达偏好、做出关键决策）
- 不应记录什么（一次性操作、试探犹豫、代码可见信息、密码密钥、系统提示词已有规范）
- 如何更新（先读全文、只改相关章节、保留手写内容、避免重复、更新日期）
- 更新频率（一条信息只更新一次、不是每轮都要更新）
- 文件模板

#### Skill 6: `react-high-fidelity` — 高保真 React 页规范（Tier 2）

**现状**：system-prompt.md 第 300-355 行（约 56 行）中 React 特有部分（DemoProps 声明、Tailwind、@preview/sdk 导入、React 版本约束）
**触发条件**：创建或重写 `high-fidelity-react` 页面时
**触发描述**：`高保真，React 页面，index.tsx，DemoProps`
**不适用场景**：页面运行时转换（prototype ↔ high-fidelity），转换场景使用 `page-runtime-conversion` skill

**基座保留的最小可行约束**（~10 行）：
```
## 高保真 React 页（按需创建）

- 仅当用户明确要求 React 或原型页不支持目标效果时才创建 `high-fidelity-react` 页
- 页面源码为 `index.tsx`，必须定义 `interface DemoProps`，使用 Tailwind CSS
- 新建/重写 React 页时，优先从 `@preview/sdk` 导入组件
- ⚠️ 本规范仅适用于「新建」或「重写」React 页；页面运行时类型转换（prototype ↔ high-fidelity-react）不适用本规范，转换场景见 `page-runtime-conversion` skill
- ⚠️ 创建/重写 React 页前，先调用 `readPreinstalledSkill({ name: 'react-high-fidelity' })` 获取完整规范
- 转换场景用 `readPreinstalledSkill({ name: 'page-runtime-conversion' })`
```

**skill 内容边界**（完整规则）：
- DemoProps 接口规范和示例（空 Props / 带配置字段）
- Props 声明规则（只包含页面级配置字段，不包含项目级字段）
- @preview/sdk 优先导入策略
- Icon 组件语义名称使用
- 单一文件约束（不使用 import './xxx'）
- 依赖策略（白名单、命名导入需真实存在）
- React 18.3.1 版本约束、禁止手动 import React

**与 L5 的去重策略**：L5（`generatePreviewAuthoringRules()`）是**编译时强校验规则**，由 `@workbench/preview-contract` 在代码层面执行，agent 不可见其细节。此 skill 是 **agent 行为指导**，告诉 agent 在生成代码时应遵循的约定。两者职责不同：
- L5 保持不变，继续作为编译时校验
- skill 中不重复 L5 的具体版本号和依赖白名单（agent 不需要记住这些，编译器会拒绝不合规代码）
- skill 只保留 agent 需要主动遵守的约定：DemoProps 定义、Props 声明范围、@preview/sdk 优先、单一文件

> **设计决策**：config.schema.json 编写规则（format: image/color、enum、ui:options 图片尺寸校验、`$demo.maxItems` 模块数量限制）保留在 Tier 1。这些规则是原型页和 React 页共用的配置能力，与「添加配置项」属于同一业务场景，放入 React 专属 skill 会导致原型页场景下 AI 意识不到需要读取。

#### Skill 7: `page-runtime-conversion` — 页面运行时类型转换（Tier 2）

**现状**：`page.tsx` 中 `buildRuntimeConversionPrompt` 内联约 45 行转换规则，属于 system prompt 之外的另一套隐藏提示词。当前问题：
- 转换提示词与系统提示词中 `react-high-fidelity` 的「优先使用 @preview/sdk」规则内置冲突
- AI 无法区分「新建一个有创意的 React 页」和「还原一个已有页面的视觉」，导致用通用组件替换自定义视觉

**触发条件**：用户通过 UI 按钮或命令触发页面运行时切换（原型 ↔ React）
**触发描述**：`转换页面运行时，切换为 React 页，切换为原型页，prototype-html-css，high-fidelity-react`
**不适用场景**：新建页面（使用 `page-lifecycle`）、重建或重写已有 React 页（使用 `react-high-fidelity`）。此 skill 仅在用户**显式触发运行时切换操作**时加载。

**基座保留的最小可行约束**（~6 行）：
```
## 页面运行时类型转换

- ⚠️ 此规则仅适用于用户显式触发运行时类型切换（UI 按钮或命令），不适用于新建或重写页面
- 以源页面当前渲染效果为视觉 ground truth
- 不得用 @preview/sdk 通用组件替换源页面的自定义视觉
- ⚠️ 执行转换前，先调用 `readPreinstalledSkill({ name: 'page-runtime-conversion' })` 获取完整转换规范
```

**skill 内容边界**（完整规则）：

- **核心约束**：以源页面视觉为 ground truth，逐元素逐样式还原。不得擅自用 @preview/sdk 通用组件（Button/Card/Modal/Icon 等）替换源页面自定义视觉。只有源页面的某个视觉效果在当前目标运行时确实无法实现时，才允许替换，并需说明原因。

- **prototype → React 转换规范**：
  1. 读取源文件：`prototype.html`、`prototype.css`、`config.schema.json`
  2. 理解视觉结构后重写为 `index.tsx`
  3. 必须保留的视觉要素：背景（background-image/color/gradient）、阴影（box-shadow/text-shadow）、圆角、边框全部属性、装饰元素、字体（font-family/size/weight/line-height）、颜色、布局（position/z-index/transform/flex/grid）、资源引用（项目内相对路径，不得丢弃或替换为占位图）
  4. 允许用 Tailwind CSS 表达样式，但以视觉还原为准
  5. 保留 `prototype.html` 和 `prototype.css` 作为降级备份

- **React → prototype 转换规范**：
  1. 读取 `index.tsx` 和 `config.schema.json`
  2. 从 React 组件渲染逻辑中提取静态 HTML 结构和内联 CSS
  3. 写入 `prototype.html` 和 `prototype.css`
  4. 不得包含 script、iframe、远程资源、javascript: 链接、form[action]
  5. 必须保留所有视觉要素（同上述清单）

- **文件操作**：修改前先读目标文件确认当前状态；使用 writeFile 写完整文件；更新 `workspace-tree.json` 中 `runtimeType` 字段；验证 `config.schema.json` 在两个运行时下 schema 兼容（字段名/类型/默认值一致）

- **转换后自检清单**：目标文件已写入且内容完整；`workspace-tree.json` 中 `runtimeType` 已更新；`config.schema.json` 未丢失字段；项目内资源引用路径正确；未引入脚本/iframe/远程资源违规

**与 `buildRuntimeConversionPrompt` 的关系**：方案实施后，`page.tsx` 中的 `buildRuntimeConversionPrompt` 保留文件清单和通用操作要求（~15 行），可复用转换规范（视觉 ground truth 约束、分运行时细则、自检清单）移入 skill 按需加载。不再维护两套独立的转换提示词。

*`buildRuntimeConversionPrompt` 保留内容*：
- 源/目标运行时标签（`sourceLabel` / `targetLabel`）
- 页面元信息（pageName、pageId）
- 必须处理的文件清单（`demos/{pageId}/index.tsx`、`config.schema.json`、`prototype.html`、`prototype.css`、`workspace-tree.json`）
- 通用操作要求（先读源文件、后更新 runtimeType、保留源文件作为回退）
- 触发 skill 指令：`先用 readPreinstalledSkill({ name: 'page-runtime-conversion' }) 读取完整转换规范`

*移入 skill 的内容*：
- 视觉 ground truth 约束（逐元素还原、禁用 @preview/sdk 替换）
- 分运行时转换细则（prototype→React、React→prototype）
- 转换后自检清单

## 实施路径

### 阶段一：新建内置 SKILL.md 文件

在 `packages/agent-service/src/preinstalled-skills/` 下按 skill 名创建子目录和 SKILL.md：

```
src/preinstalled-skills/
├── design-taste-frontend/    # 已有
│   └── SKILL.md
├── page-lifecycle/           # Skill 1 (Tier 2)
│   └── SKILL.md
├── page-deletion/            # Skill 2 (Tier 2)
│   └── SKILL.md
├── image-handling/           # Skill 3 (Tier 3)
│   └── SKILL.md
├── preview-tools/            # Skill 4 (Tier 3, canvas 部分条件注册)
│   └── SKILL.md
├── memory-maintenance/       # Skill 5 (Tier 3, 部分驻留)
│   └── SKILL.md
├── react-high-fidelity/      # Skill 6 (Tier 2)
│   └── SKILL.md
└── page-runtime-conversion/  # Skill 7 (Tier 2)
    └── SKILL.md
```

每个 SKILL.md 遵循 `design-taste-frontend/SKILL.md` 的 frontmatter 格式：
```markdown
---
name: page-lifecycle
description: 创建/重命名/排序页面和文件夹的完整规则：目录命名、默认文件结构、workspace-tree.json 编辑、配置项约束。触发词：创建新页面、新建 demo、重命名页面、调整页面顺序、创建文件夹。不适用于页面删除或运行时类型转换。
---
```

### 阶段二：扩展 preinstalled-skills.ts

`getPreinstalledSkills()` 不再硬编码 `design-taste-frontend`，改为扫描 `preinstalled-skills/` 目录下所有 `SKILL.md` 文件。

**关键实现细节**：

1. **`source` 字段区分来源**：外部 skill 用 `github:...`（如 `design-taste-frontend`），内置 skill 用 `workbench:internal:{name}`。
2. **缓存策略**：保留模块级 `cachedSkills` 缓存，但提供 `clearPreinstalledSkillsCache()` 函数供测试调用。生产环境 skill 文件不变，缓存安全；开发时修改 SKILL.md 需重启或调用清缓存。`getPreinstalledSkills()` 保持纯扫描 + 缓存不变，不接收 `toolNames` 参数，避免缓存与运行时工具列表的时序耦合。
3. **条件注册后移**：`getPreinstalledSkills()` 返回全部已扫描 skill（含 `disableModelInvocation: false`），条件过滤逻辑移至 `formatPreinstalledSkillsForPrompt(skills, toolNames?)`。调用者传入当前工具列表，由该函数决定哪些 skill 在 `<available_skills>` 中可见：
   - `page-deletion`：需要 `deletePage` 或 `deletePages` 或 `previewDeletePages`
   - `preview-tools` 中画布管理部分：需要 `arrangeCanvasPages`（skill 始终注册，仅内容中的画布部分标注条件）
   - 不满足条件时设置 `disableModelInvocation: true`，被过滤出 `<available_skills>`
4. **`external-collaboration` 不再作为 skill**：其内容（19 行）回归 Tier 1 基座 prompt，无需条件注册逻辑。

```typescript
// 伪代码
function getPreinstalledSkills(): PreinstalledSkill[] {
  if (cachedSkills) return cachedSkills;

  const skillsDir = resolveSkillRoot();
  const skills: PreinstalledSkill[] = [];
  for (const entry of fs.readdirSync(skillsDir)) {
    const skillPath = path.join(skillsDir, entry, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      skills.push(loadSkill(skillPath, entry));
    }
  }
  cachedSkills = skills;
  return skills;
}

export function formatPreinstalledSkillsForPrompt(
  skills: PreinstalledSkill[],
  toolNames?: string[],
): string {
  const visibleSkills = skills.filter((skill) => {
    if (skill.disableModelInvocation) return false;
    return isSkillApplicable(skill.name, toolNames);
  });
  // ... 渲染 XML
}

export function clearPreinstalledSkillsCache(): void {
  cachedSkills = null;
}
```

### 阶段三：裁剪 system-prompt.md

1. 移除所有 Tier 3 模块的完整内容，替换为 1-2 行引用指令（含 `readPreinstalledSkill` 调用提示）
2. 移除 Tier 2 模块的完整内容，替换为 3-6 行最小可行约束 + **显式 `readPreinstalledSkill` 加载指令**（不依赖 agent 从 `<available_skills>` 自主匹配）
3. `react-high-fidelity` 中不留 config.schema.json 编写规则（format、enum、图片尺寸校验、`$demo.maxItems`），这些保留在 Tier 1 的「页面级配置与页面运行时」段
4. **不移除** Tier 1 内容（含子 Agent 委派，约 28 行；含 `external-collaboration` 约 19 行）
5. 重新编号和组织剩余内容
6. 每个 Tier 2 模块在基座中使用 `⚠️` 前缀标注显式加载指令，例如：`⚠️ 创建页面前，先调用 readPreinstalledSkill({ name: 'page-lifecycle' })`

### 阶段四：简化 system-prompt.ts 和 page.tsx

- `buildDeletePageRules()` 逻辑移除，改为在 `formatPreinstalledSkillsForPrompt(skills, toolNames)` 中控制 `page-deletion` skill 的 `disableModelInvocation`
- `buildCanvasLayoutRules()` 逻辑移除，画布管理规则合并入 `preview-tools` skill；skill 始终注册，条件仅在 `formatPreinstalledSkillsForPrompt` 中根据 `arrangeCanvasPages` 是否可用控制可见性
- `buildStaticSystemPrompt` 简化为纯静态内容拼接 + L5 规则（`generatePreviewAuthoringRules()` 保持不变）；`external-collaboration` 内容保留在基座中不再动态替换
- `buildSubagentSystemPrompt` 无需改动（子 Agent 继承裁剪后的基座 prompt，已有 `readPreinstalledSkill` 工具和 `<available_skills>` 注入）
- **保守简化 `buildRuntimeConversionPrompt`**：保留文件清单和通用操作要求（~15 行），仅将可复用转换规范（视觉 ground truth 约束、分运行时细则、自检清单）移入 `page-runtime-conversion` skill
  - *保留*：源/目标运行时标签、页面元信息、必须处理的文件清单、先读源文件再操作、后更新 runtimeType、保留源文件作为回退
  - *移入 skill*：逐元素还原规则、禁止 @preview/sdk 替换、prototype↔React 分项转换细则、自检清单
  - 在保留内容末尾追加：`先用 readPreinstalledSkill({ name: 'page-runtime-conversion' }) 读取完整转换规范`

### 阶段五：更新测试

`system-prompt.test.ts` 中有 18 个测试用例检查 system prompt 中的具体内容。迁移后部分内容从 system prompt 移到 skill，需要同步更新：

- **移除的断言**：检查已迁移内容是否存在于 system prompt 的断言（如 `"previewDeletePages"`、`"arrangeCanvasPages"` 等具体工具用法；注意 `"data-bind-text"` 等原型页配置绑定规则保留在 Tier 1，不移除）
- **保留的断言**：检查 Tier 1 内容的断言（如 `"OneFlow Authoring Agent"`、`"子 Agent 委派"`、`"delegateTask"`、`"禁止行为"`、`"Figma"` 等）
- **修改的断言**：`delete page rules` 和 `canvas layout rules` 的条件分支测试 → 改为验证 skill 注册/隐藏的单元测试
- **新增的断言**：检查 Tier 2 最小可行约束 + 显式 `readPreinstalledSkill` 加载指令是否存在（如 `"readPreinstalledSkill({ name: 'page-lifecycle' })"`、`"readPreinstalledSkill({ name: 'page-deletion' })"`、`"readPreinstalledSkill({ name: 'react-high-fidelity' })"`）
- **新增 skill 加载测试**：在 `agent-service` 测试中验证 `getPreinstalledSkills()` 返回所有 7 个内置 skill，frontmatter 解析正确
- **新增跨 skill 去重测试**（`agent-service` 包内）：验证每个 Tier 2/Tier 3 模块的内容在基座与对应 skill 之间不重复。具体方法：读取裁剪后的 `system-prompt.md` 和每个 `SKILL.md`，对每个 skill 名检查其核心规则片段是否同时出现在基座和 skill 中

### 阶段六：验证

- `pnpm check:agent` 确保类型检查通过
- `pnpm check:author` 确保 author-site 类型检查通过
- `pnpm --filter @workbench/agent-service test` 确保更新后的测试通过
- `pnpm --filter @workbench/author-site test` 确保 system-prompt 测试通过
- 手动验证：启动 agent-service，确认 `<available_skills>` 正确列出所有内置 skill（8 个，含 design-taste-frontend）
- 手动验证：发送触发类消息（如"创建一个新页面"），确认 agent 能正确调用 `readPreinstalledSkill` 加载完整规则
- 手动验证：子 Agent 委派场景，确认子 Agent 能访问 `<available_skills>` 和 `readPreinstalledSkill`
- 手动验证：**原型页 → React 页运行时转换**，确认 agent 调用 `readPreinstalledSkill("page-runtime-conversion")` 并按像素级还原规则执行，不随意用 @preview/sdk 替换自定义视觉
- 手动验证：确认 `external-collaboration`（Figma/钉钉）规则在基座 prompt 中仍然完整且可被 agent 直接读取，无需额外工具调用
- `pnpm test:e2e` 确保创作端回归测试通过

## 待办

- [x] 评审方案，确认 skill 拆分清单和三层分类
- [x] 确认 `external-collaboration` 回归 Tier 1（仅 19 行，安全基线不宜延迟加载）
- [x] 确认 `react-high-fidelity` 内容边界（Schema 规则保留 Tier 1，仅 React 特有规则入 skill）
- [x] 确认 `page-runtime-conversion` 作为 Skill 7 纳入实施方案
- [x] 确认保守简化 `buildRuntimeConversionPrompt`（保留文件清单 + 通用操作要求 ~15 行）
- [x] 确认 `preview-debug` + `canvas-management` 合并为 `preview-tools`
- [x] 确认条件注册逻辑后移至 `formatPreinstalledSkillsForPrompt`
- [ ] 实施阶段一：新建 SKILL.md 文件（7 个）
- [ ] 实施阶段二：扩展 preinstalled-skills.ts（目录扫描 + source 字段 + `formatPreinstalledSkillsForPrompt` 条件过滤 + 缓存清理）
- [ ] 实施阶段三：裁剪 system-prompt.md（Tier 2 保留最小约束 + 显式 load 指令，Tier 3 仅留引用指令；config.schema.json 规则保留 Tier 1；external-collaboration 保留 Tier 1）
- [ ] 实施阶段四：简化 system-prompt.ts（移除条件渲染，改为 `formatPreinstalledSkillsForPrompt` 条件过滤）+ 保守简化 page.tsx 中 buildRuntimeConversionPrompt（保留 ~15 行操作约束）
- [ ] 实施阶段五：更新测试（system-prompt.test.ts 断言调整 + skill 加载测试 + 跨 skill 去重测试）
- [ ] 实施阶段六：验证

## 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Agent 不主动调用 `readPreinstalledSkill` | Tier 3 skill 规则缺失，agent 不使用对应工具或能力 | description 写精准触发词 + 不适用场景说明；基座保留 `先用 readPreinstalledSkill(...)` 引用指令 |
| Agent 不主动调用 `readPreinstalledSkill` | Tier 2 skill 完整规则缺失，产出非最优但结构正确 | **Tier 2 基座保留最小可行约束 + ⚠️ 显式加载指令**，即使不调用 skill 也能产出结构正确的结果 |
| memory-maintenance 规则首消息注入被遗漏 | 会话之间信息丢失 | 基座保留 ~5 行核心入口，明确指向 on-demand skill |
| 子 Agent 需额外调用 `readPreinstalledSkill` 获取规则 | 子 Agent 延迟增加一轮工具调用 | 子 Agent 委派规则保留在基座（Tier 1），子 Agent 直接继承无需调用 |
| `<available_skills>` 膨胀 | 抵消瘦身收益 | 8 个条目（含已有 design-taste-frontend）约 40 行 XML，可接受；条件注册的 skill 在工具不可用时不出现 |
| 新旧 system prompt 行为差异 | agent 创作质量下降 | E2E 回归测试 + 创作场景手动验证 |
| L5 与 react-high-fidelity skill 内容不一致 | agent 生成的代码被编译器拒绝 | skill 中不重复 L5 的版本号/白名单，只保留 agent 需主动遵守的约定；编译器是最终防线 |
| `page-runtime-conversion` skill 不被触发 | 转换行为回退到默认 React 规范 | `buildRuntimeConversionPrompt` 中显式要求调用 `readPreinstalledSkill("page-runtime-conversion")`；基座 Tier 2 最小约束中保留转换场景的核心禁止规则（不得用 @preview/sdk 替换自定义视觉）；skill description 标注「仅在用户显式触发运行时切换时使用」 |
| `react-high-fidelity` 与 `page-runtime-conversion` 边界模糊 | agent 在创建 React 页时错误地读取转换 skill，或反之 | 两个 skill 的 `description` 均含显式互斥声明：`react-high-fidelity` 标注「仅适用于新建/重写 React 页，不适用于运行时类型转换」；`page-runtime-conversion` 标注「仅在用户显式触发运行时切换操作（UI 按钮或命令）时使用，不适用于新建或重写页面」 |
| skill 内容随时间膨胀 | 抵消渐进式披露收益 | skill 内容治理约定：目标控制在 200 行以内，不重复写入编译器已有强校验的版本号/白名单；新增内容前评估基座最小约束是否已足够 |
| 基座与 skill 内容重复 | 维护漂移导致不一致 | 跨 skill 去重测试（阶段五）：验证每个 skill 的核心规则片段不重复出现在基座中 |
