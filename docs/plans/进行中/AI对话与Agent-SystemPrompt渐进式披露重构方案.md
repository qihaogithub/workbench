# AI 对话与 Agent - System Prompt 渐进式披露重构方案

> 创建日期：2026-07-27
> 状态：方案待审批

## 当前状态

方案已根据代码验证修订：子 Agent `readPreinstalledSkill` 支持已确认、三层分类已建立、skill 数量已收敛为 8 个。待评审后进入实施。

## 背景

当前 Pi Agent 的 L2 静态 system prompt（`system-prompt.md`）约 610 行 / 32KB，涵盖身份定义、Workspace Authority、计划审批、子 Agent 委派、页面管理、画布管理、项目配置、页面配置、代码质量标准、React 版本约束、知识库、禁止行为、文件编辑规则、文件修改决策、memory.md 维护、图片处理、外部协作、权限确认、需求确认、预览调试等全部行为约束。

每次对话都发送全部内容。其中多个模块仅在特定场景下才需要，始终驻留造成不必要的 prompt token 消耗和注意力稀释。

## 目标

1. 将 system prompt 瘦身到约 310-330 行核心内容（-46%~-49%），降低每轮对话的 prompt token 成本
2. 将场景限定性模块迁移为可渐进式披露的内置 skills，保留现有 `readPreinstalledSkill` 的 on-demand 加载机制
3. 不新增机制，完全复用 `preinstalled-skills.ts` → `readPreinstalledSkill` 工具链路
4. 保持 agent 行为遵循度不降低

## 设计原则

模块按行为影响分三层处理，而非简单二分"驻留 vs 迁移"：

| 层级 | 策略 | 判定标准 |
|------|------|----------|
| **Tier 1 始终驻留** | 保留在基座 prompt | 每轮对话都需要，或缺失会导致安全/身份问题 |
| **Tier 2 最小约束 + on-demand skill** | 基座保留 3-5 行最小可行约束，完整规则移入 skill | 缺失会导致**结构正确性错误**（非仅质量下降），如产出不符合规范的目录名或文件结构 |
| **Tier 3 纯 on-demand skill** | 基座仅保留 1-2 行引用指令，全部内容移入 skill | 缺失仅导致 agent 不使用某工具或能力，不产生结构错误 |

Tier 2 的最小约束必须是**自足的**——agent 即使不调用 `readPreinstalledSkill`，仅凭基座中的最小约束也能产出结构正确的（虽非最优的）结果。skill 中放完整模板、示例和边界情况。

## 范围

| 涉及包 | 涉及文件 | 改动类型 |
|--------|----------|----------|
| `@workbench/agent-service` | `src/preinstalled-skills/` | 新增 8 个内置 SKILL.md 文件 |
| `@workbench/agent-service` | `src/backends/preinstalled-skills.ts` | 目录扫描 + source 字段 + 条件注册 + 缓存清理 |
| `@workbench/author-site` | `src/lib/agent/prompts/system-prompt.md` | 裁剪模块（Tier 2 保留最小约束，Tier 3 仅留引用指令） |
| `@workbench/author-site` | `src/lib/agent/system-prompt.ts` | 移除 `buildDeletePageRules`/`buildCanvasLayoutRules`，简化 `buildStaticSystemPrompt` |
| `@workbench/author-site` | `src/lib/agent/__tests__/system-prompt.test.ts` | 更新断言：移除已迁移内容检查，新增 Tier 2 最小约束检查 |
| `@workbench/agent-service` | `src/backends/pi-agent.ts` | 无需改动（子 Agent 继承裁剪后基座，已有 `readPreinstalledSkill`） |
| `@workbench/preview-contract` | `src/rules.ts` | 无需改动（L5 层保持不变） |

## 模块拆分分析

### 一、Tier 1 始终驻留（约 300 行）

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
| 代码质量标准（HTML/CSS 原型页部分） | ~15 | 每次生成代码都需要 |
| 知识库查阅 | ~12 | 每次可能需要 |
| 禁止行为 | ~10 | 全局安全基线 |
| 文件编辑规则 | ~9 | 每次编辑都需要 |
| 文件修改决策规则 | ~12 | 避免 agent 反复询问 |
| 权限确认 | ~10 | 安全基线 |
| 需求确认 | ~12 | UI 规范 |
| Tier 2 最小可行约束（3 个 skill） | ~15 | 结构正确性保底，详见各 skill 说明 |
| on-demand skill 引用指令（8 个 skill） | ~24 | 指向 `readPreinstalledSkill` 的简短触发提示 |
| memory.md 核心入口 | ~5 | 告知 agent 首消息自动注入 memory.md |

### 二、迁移为内置 Skill（约 310 行）

新增 8 个 skill（加上已有的 `design-taste-frontend`，`<available_skills>` 共 9 个条目）。按层级标注 Tier 2 / Tier 3。

#### Skill 1: `page-lifecycle` — 页面创建 / 重命名 / 排序 / 文件夹（Tier 2）

**现状**：system-prompt.md 第 114-176 行（约 63 行，原 page-creation + page-management 合并）
**触发条件**：创建页面、重命名页面、调整顺序、文件夹操作
**触发描述**：`创建新页面，新建 demo，重命名页面，调整页面顺序，创建文件夹，移动页面到文件夹`

**基座保留的最小可行约束**（~5 行）：
```
## 页面生命周期操作

- 创建页面：在 `demos/` 下创建目录（英文名 + 4 位随机字符），默认创建 `prototype.html` + `prototype.css` + `config.schema.json`（空 schema），在 `workspace-tree.json` pages 数组追加记录
- 重命名/改顺序：编辑 `workspace-tree.json` pages 数组的 `name`/`order` 字段
- 文件夹：编辑 `workspace-tree.json` folders 数组
- 完整规则（默认 runtime 选择、文件结构模板、配置项约束、自检规则）：先用 `readPreinstalledSkill({ name: 'page-lifecycle' })` 读取
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

**基座保留的最小可行约束**（~3 行）：
```
## 页面删除

- 删除前必须先调 `listPages` 获取精确 ID，不要根据名称猜测
- 通过 `deletePage` / `previewDeletePages` → `executeDeletePagePlan` 删除，不要用 `bash`/`writeFile`/`editFile` 手动删除
- 完整规则（批量删除流程、注意事项）：先用 `readPreinstalledSkill({ name: 'page-deletion' })` 读取
```

**skill 内容边界**（完整规则）：
- deletePage 单体删除用法和参数
- previewDeletePages → executeDeletePagePlan 批量删除流程
- 删除文件夹时子页面一并删除
- 注意事项（不要循环调用、不要编造 planId、取消处理等）

**特殊处理**：`buildDeletePageRules()` 的三分支逻辑（transactional / batch / unavailable）改为控制 skill 是否注册到 `<available_skills>`：工具不可用时 not registered，工具可用时注册 skill 并在 SKILL.md 中覆盖对应分支的完整建议方式。

#### Skill 3: `image-handling` — 图片资源处理（Tier 3）

**现状**：system-prompt.md 第 472-516 行（约 45 行）
**触发条件**：处理图片上传、保存、引用时
**触发描述**：`保存图片，上传图片，使用图片，图片引用，素材`

**内容边界**：
- saveImage 两种来源（base64 / url）用法和参数
- 保存后工作区路径规则（assets/images/{hash}-{filename}）
- 页面中引用路径规则（../../assets/images/...）
- 发布时自动处理说明
- URL 来源的安全限制（超时 10s、最大 10MB、Content-Type 校验）

#### Skill 4: `preview-debug` — 预览调试工具（Tier 3）

**现状**：system-prompt.md 第 565-610 行（约 46 行）
**触发条件**：使用 getConsoleLogs / captureScreenshot 排查问题时
**触发描述**：`调试预览，获取控制台日志，截图，页面报错，白屏排查`

**内容边界**：
- getConsoleLogs 使用方式（limit、level、since 参数）
- 使用场景（白屏→error、修改后→确认无警告）
- captureScreenshot 使用方式（width、height、fullPage 参数）
- 使用场景（布局/颜色/间距检查、结合控制台日志判断）
- 截图基于工作空间文件渲染的约束说明

#### Skill 5: `external-collaboration` — 外部协作工具（Figma / 钉钉）（Tier 3）

**现状**：system-prompt.md 第 520-538 行（约 19 行）
**触发条件**：使用 Figma MCP 或钉钉工具时
**触发描述**：`Figma，设计稿，钉钉，文档，dws`

**内容边界**：
- Figma MCP 授权模型（用户级授权，不暴露全局 token）
- 钉钉 dws 访问规则（仅 doc/sheet/wiki，不通过 bash 直接调用）
- 未授权/过期时的处理（前端展示授权卡片，不要求用户去设置页）

**条件注册**：仅在运行时工具列表包含 `figmaMcp` 或 `dingtalk` 时注册到 `<available_skills>`，利用 `formatPreinstalledSkillsForPrompt` 中已有的 `disableModelInvocation` 过滤能力（`preinstalled-skills.ts:103`）。

#### Skill 6: `memory-maintenance` — 项目记忆维护（Tier 3，部分驻留）

**现状**：system-prompt.md 第 406-468 行（约 63 行）
**触发条件**：读取/更新 memory.md 时
**触发描述**：`记住，偏好，以后都这样，memory.md`

**基座保留的核心入口**（~5 行）：
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

#### Skill 7: `canvas-management` — 画布管理（Tier 3）

**现状**：system-prompt.md 第 215-234 行（约 20 行）+ system-prompt.ts `buildCanvasLayoutRules()` 两分支条件渲染
**触发条件**：使用 `arrangeCanvasPages` 工具时
**触发描述**：`整理画布，排列画布页面，调整画布位置，改变画布尺寸`

**内容边界**：
- arrangeCanvasPages 使用方式
- mode 选项说明（preserveGroups / grid）
- sizeMode 选项说明（preserve / preview）
- pageIds 参数使用
- 与 workspace-tree.json order 的区别说明

**特殊处理**：`buildCanvasLayoutRules()` 的两分支逻辑改为控制 skill 是否注册：`arrangeCanvasPages` 不可用时 not registered。

#### Skill 8: `react-high-fidelity` — 高保真 React 页规范（Tier 2）

**现状**：system-prompt.md 第 300-355 行（约 56 行）
**触发条件**：创建或修改 `high-fidelity-react` 页面时
**触发描述**：`高保真，React 页面，index.tsx，DemoProps`

**基座保留的最小可行约束**（~5 行）：
```
## 高保真 React 页（按需创建）

- 仅当用户明确要求 React 或原型页不支持目标效果时才创建 `high-fidelity-react` 页
- 页面源码为 `index.tsx`，必须定义 `interface DemoProps`，使用 Tailwind CSS，优先从 `@preview/sdk` 导入
- 完整规则（Props 声明、依赖策略、config.schema.json 对应规则）：先用 `readPreinstalledSkill({ name: 'react-high-fidelity' })` 读取
```

**skill 内容边界**（完整规则）：
- DemoProps 接口规范和示例
- Props 声明规则（只包含页面级配置字段，不包含项目级字段）
- @preview/sdk 优先导入策略
- Icon 组件语义名称使用
- 单一文件约束（不使用 import './xxx'）
- 依赖策略（白名单、命名导入需真实存在）
- config.schema.json 对应规则（format: image/color、enum、ui:options 图片尺寸校验）

**与 L5 的去重策略**：L5（`generatePreviewAuthoringRules()`）是**编译时强校验规则**，由 `@workbench/preview-contract` 在代码层面执行，agent 不可见其细节。此 skill 是 **agent 行为指导**，告诉 agent 在生成代码时应遵循的约定。两者职责不同：
- L5 保持不变，继续作为编译时校验
- skill 中不重复 L5 的具体版本号和依赖白名单（agent 不需要记住这些，编译器会拒绝不合规代码）
- skill 只保留 agent 需要主动遵守的约定：DemoProps 定义、Props 声明范围、@preview/sdk 优先、单一文件、config.schema.json 对应规则

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
├── preview-debug/            # Skill 4 (Tier 3)
│   └── SKILL.md
├── external-collaboration/   # Skill 5 (Tier 3, 条件注册)
│   └── SKILL.md
├── memory-maintenance/       # Skill 6 (Tier 3, 部分驻留)
│   └── SKILL.md
├── canvas-management/        # Skill 7 (Tier 3, 条件注册)
│   └── SKILL.md
└── react-high-fidelity/      # Skill 8 (Tier 2)
    └── SKILL.md
```

每个 SKILL.md 遵循 `design-taste-frontend/SKILL.md` 的 frontmatter 格式：
```markdown
---
name: page-lifecycle
description: 创建/重命名/排序页面和文件夹的完整规则：目录命名、默认文件结构、workspace-tree.json 编辑、配置项约束。触发词：创建新页面、新建 demo、重命名页面、调整页面顺序、创建文件夹。
---
```

### 阶段二：扩展 preinstalled-skills.ts

`getPreinstalledSkills()` 不再硬编码 `design-taste-frontend`，改为扫描 `preinstalled-skills/` 目录下所有 `SKILL.md` 文件。

**关键实现细节**：

1. **`source` 字段区分来源**：外部 skill 用 `github:...`（如 `design-taste-frontend`），内置 skill 用 `workbench:internal:{name}`。
2. **缓存策略**：保留模块级 `cachedSkills` 缓存，但提供 `clearPreinstalledSkillsCache()` 函数供测试调用。生产环境 skill 文件不变，缓存安全；开发时修改 SKILL.md 需重启或调用清缓存。
3. **条件注册**：`getPreinstalledSkills()` 增加可选参数 `toolNames?: string[]`，用于条件注册：
   - `page-deletion`：需要 `deletePage` 或 `deletePages` 或 `previewDeletePages`
   - `canvas-management`：需要 `arrangeCanvasPages`
   - `external-collaboration`：需要 `figmaMcp` 或 `dingtalk`
   - 不满足条件时设置 `disableModelInvocation: true`，`formatPreinstalledSkillsForPrompt` 已有过滤逻辑（`preinstalled-skills.ts:103`）

```typescript
// 伪代码
function getPreinstalledSkills(toolNames?: string[]): PreinstalledSkill[] {
  if (cachedSkills) return cachedSkills;

  const skillsDir = resolveSkillRoot();
  const skills: PreinstalledSkill[] = [];
  for (const entry of fs.readdirSync(skillsDir)) {
    const skillPath = path.join(skillsDir, entry, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      const skill = loadSkill(skillPath, entry);
      skill.disableModelInvocation = !isSkillApplicable(skill.name, toolNames);
      skills.push(skill);
    }
  }
  cachedSkills = skills;
  return skills;
}

export function clearPreinstalledSkillsCache(): void {
  cachedSkills = null;
}
```

### 阶段三：裁剪 system-prompt.md

1. 移除所有 Tier 3 模块的完整内容，替换为 1-2 行引用指令
2. 移除 Tier 2 模块的完整内容，替换为 3-5 行最小可行约束 + 引用指令
3. **不移除** Tier 1 内容（含子 Agent 委派，约 28 行）
4. 重新编号和组织剩余内容

### 阶段四：简化 system-prompt.ts

- `buildDeletePageRules()` 逻辑移除，改为在 `getPreinstalledSkills(toolNames)` 中控制 `page-deletion` skill 的 `disableModelInvocation`
- `buildCanvasLayoutRules()` 逻辑移除，改为同上控制 `canvas-management` skill
- `buildStaticSystemPrompt` 简化为纯静态内容拼接 + L5 规则（`generatePreviewAuthoringRules()` 保持不变）
- `buildSubagentSystemPrompt` 无需改动（子 Agent 继承裁剪后的基座 prompt，已有 `readPreinstalledSkill` 工具和 `<available_skills>` 注入）

### 阶段五：更新测试

`system-prompt.test.ts` 中有 20+ 个断言检查 system prompt 中的具体内容。迁移后部分内容从 system prompt 移到 skill，需要同步更新：

- **移除的断言**：检查已迁移内容是否存在于 system prompt 的断言（如 `"previewDeletePages"`、`"arrangeCanvasPages"`、`"data-bind-text"` 等具体工具用法）
- **保留的断言**：检查 Tier 1 内容的断言（如 `"OneFlow Authoring Agent"`、`"子 Agent 委派"`、`"delegateTask"`、`"禁止行为"` 等）
- **新增的断言**：检查 Tier 2 最小可行约束是否存在（如 `"demos/"`、`"prototype.html"`、`"listPages"`）
- **新增 skill 加载测试**：在 `agent-service` 测试中验证 `getPreinstalledSkills()` 返回所有 8 个内置 skill，frontmatter 解析正确

### 阶段六：验证

- `pnpm check:agent` 确保类型检查通过
- `pnpm check:author` 确保 author-site 类型检查通过
- `pnpm --filter @workbench/agent-service test` 确保更新后的测试通过
- `pnpm --filter @workbench/author-site test` 确保 system-prompt 测试通过
- 手动验证：启动 agent-service，确认 `<available_skills>` 正确列出所有内置 skill（9 个，含 design-taste-frontend）
- 手动验证：发送触发类消息（如"创建一个新页面"），确认 agent 能正确调用 `readPreinstalledSkill` 加载完整规则
- 手动验证：子 Agent 委派场景，确认子 Agent 能访问 `<available_skills>` 和 `readPreinstalledSkill`
- `pnpm test:e2e` 确保创作端回归测试通过

## 待办

- [ ] 评审方案，确认 skill 拆分清单和三层分类
- [ ] 确认 `external-collaboration` 条件注册的触发时机（运行时工具列表 vs 环境变量）
- [ ] 实施阶段一：新建 SKILL.md 文件（8 个）
- [ ] 实施阶段二：扩展 preinstalled-skills.ts（目录扫描 + source 字段 + 条件注册 + 缓存清理）
- [ ] 实施阶段三：裁剪 system-prompt.md（Tier 2 保留最小约束，Tier 3 仅留引用指令）
- [ ] 实施阶段四：简化 system-prompt.ts（移除条件渲染，改为 skill 条件注册）
- [ ] 实施阶段五：更新测试（system-prompt.test.ts 断言调整 + skill 加载测试）
- [ ] 实施阶段六：验证

## 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Agent 不主动调用 `readPreinstalledSkill` | Tier 3 skill 规则缺失，agent 不使用对应工具或能力 | description 写精准触发词；基座保留引用指令 |
| Agent 不主动调用 `readPreinstalledSkill` | Tier 2 skill 完整规则缺失，产出非最优但结构正确 | **Tier 2 基座保留最小可行约束**，即使不调用 skill 也能产出结构正确的结果 |
| memory-maintenance 规则首消息注入被遗漏 | 会话之间信息丢失 | 基座保留 ~5 行核心入口，明确指向 on-demand skill |
| 子 Agent 需额外调用 `readPreinstalledSkill` 获取规则 | 子 Agent 延迟增加一轮工具调用 | 子 Agent 委派规则保留在基座（Tier 1），子 Agent 直接继承无需调用 |
| `<available_skills>` 膨胀 | 抵消瘦身收益 | 9 个条目（含已有 design-taste-frontend）约 45 行 XML，可接受；条件注册的 skill 在工具不可用时不出现 |
| 新旧 system prompt 行为差异 | agent 创作质量下降 | E2E 回归测试 + 创作场景手动验证 |
| L5 与 react-high-fidelity skill 内容不一致 | agent 生成的代码被编译器拒绝 | skill 中不重复 L5 的版本号/白名单，只保留 agent 需主动遵守的约定；编译器是最终防线 |
