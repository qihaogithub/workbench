---
covers:
  - packages/agent-service/src/backends/preinstalled-skills.ts
  - packages/agent-service/src/backends/pi-tools/read-preinstalled-skill-tool.ts
  - packages/agent-service/src/backends/pi-agent.ts
  - packages/agent-service/src/preinstalled-skills/config-driven-behavior/SKILL.md
  - packages/agent-service/src/preinstalled-skills/feedback-collection/SKILL.md
  - packages/agent-service/src/preinstalled-skills/image-handling/SKILL.md
  - packages/agent-service/src/preinstalled-skills/memory-maintenance/SKILL.md
  - packages/agent-service/src/preinstalled-skills/page-deletion/SKILL.md
  - packages/agent-service/src/preinstalled-skills/page-lifecycle/SKILL.md
  - packages/agent-service/src/preinstalled-skills/page-runtime-conversion/SKILL.md
  - packages/agent-service/src/preinstalled-skills/preview-tools/SKILL.md
  - packages/agent-service/src/preinstalled-skills/react-high-fidelity/SKILL.md
---

# Agent 运行时内置 Skill 清单与加载机制

> 更新日期：2026-09-10
> 状态：已实现

## 一、定位

运行时内置 Skill 是创作端 Agent 的领域工作规范。它们随 `agent-service` 发布，不写入用户项目，也不替代工具权限、用户确认或 Workspace Mutation Authority。

Skill 正文的源码文件是各目录下的 `SKILL.md`；本文只维护清单和运行机制，不复制正文。具体任务命中某个 Skill 后，Agent 必须通过 `readPreinstalledSkill` 读取对应全文，再按正文执行。

## 二、当前 Skill 清单

当前源码目录中共有 9 个运行时内置 Skill：

| Skill | 适用场景 | 核心约束/职责 | 正文 |
| :--- | :--- | :--- | :--- |
| `page-lifecycle` | 创建、重命名、排序页面和文件夹 | 页面目录、默认文件结构、Schema、runtime 选择，以及页面树边界；默认创建 HTML/CSS 原型页 | [`SKILL.md`](../../../../packages/agent-service/src/preinstalled-skills/page-lifecycle/SKILL.md) |
| `page-deletion` | 删除单页或批量删除页面 | 先获取精确页面 ID；批量删除必须经过预览计划和用户确认；禁止手动删除目录或修改页面树 | [`SKILL.md`](../../../../packages/agent-service/src/preinstalled-skills/page-deletion/SKILL.md) |
| `page-runtime-conversion` | 原型页与高保真 React 页转换 | 以源页面视觉为基准，分别约束 prototype → React 和 React → prototype 的转换，并保留必要的区域声明 | [`SKILL.md`](../../../../packages/agent-service/src/preinstalled-skills/page-runtime-conversion/SKILL.md) |
| `react-high-fidelity` | 新建或重写高保真 React 页 | `DemoProps`、`@preview/sdk` 优先、单文件结构、React 依赖边界和配置驱动区域声明 | [`SKILL.md`](../../../../packages/agent-service/src/preinstalled-skills/react-high-fidelity/SKILL.md) |
| `config-driven-behavior` | 配置联动、页面/区域显隐或禁用 | 使用项目级 `visibility-rules`、稳定 `pageId`/`regionId`、规则校验、draft/Authority 提交和发布死链校验 | [`SKILL.md`](../../../../packages/agent-service/src/preinstalled-skills/config-driven-behavior/SKILL.md) |
| `preview-tools` | 预览报错、白屏排查、截图和画布整理 | 读取控制台日志、捕获截图，并按规则管理画布页面位置 | [`SKILL.md`](../../../../packages/agent-service/src/preinstalled-skills/preview-tools/SKILL.md) |
| `image-handling` | 上传、保存、引用和发布图片素材 | 区分聊天图片自动入库与外部 URL 保存；要求图片 `alt` 文本；发布时由系统处理本地资源 | [`SKILL.md`](../../../../packages/agent-service/src/preinstalled-skills/image-handling/SKILL.md) |
| `feedback-collection` | 用户描述平台故障或 Agent 异常 | 判断是否为用户可感知的系统 Bug，收集必要联系信息，并通过 `submit_feedback` 生成结构化报告 | [`SKILL.md`](../../../../packages/agent-service/src/preinstalled-skills/feedback-collection/SKILL.md) |
| `memory-maintenance` | 用户要求记住偏好或关键决策 | 只维护 `memory.md` 的长期记忆，不修改项目公约，不记录一次性操作或敏感信息 | [`SKILL.md`](../../../../packages/agent-service/src/preinstalled-skills/memory-maintenance/SKILL.md) |

## 三、加载机制

### 3.1 Skill 目录解析

服务启动后，注册器按以下顺序寻找 Skill 根目录，使用第一个存在的目录：

1. `PI_AGENT_PREINSTALLED_SKILLS_DIR` 指定的目录。
2. 当前工作目录下的 `preinstalled-skills/`。
3. 当前工作目录下的 `src/preinstalled-skills/`。
4. 仓库中的 `packages/agent-service/src/preinstalled-skills/`。

根目录下每个包含 `SKILL.md` 的子目录都会被加载。frontmatter 中的 `name` 和 `description` 用于构造 Skill 条目；未填写时分别回退到目录名和默认描述。

### 3.2 渐进披露

运行时提示词只附加 Skill 的名称、简介、来源和 `readPreinstalledSkill` 读取入口，不把所有 Skill 正文注入每轮上下文。任务匹配后按以下路径使用：

1. Agent 根据任务和 Skill 描述判断是否命中。
2. Agent 调用 `readPreinstalledSkill({ name })` 读取完整正文。
3. Agent 按正文执行，并继续遵守工具权限、用户确认和 Workspace Authority 约束。

`readPreinstalledSkill` 只读取服务端预装资源；它不会扩大 `readFile` 的工作空间范围，也不会把 Skill 文件写入用户项目。

### 3.3 可见性过滤

一般情况下 9 个 Skill 都会出现在提示词的预装 Skill 列表中。实现层会过滤声明了 `disableModelInvocation` 的 Skill；当前源码中的 Skill 没有此标记。

`page-deletion` 还会根据当前工具集过滤：只有会话包含页面删除相关工具时，才向 Agent 展示该 Skill。这个过滤只影响首轮提示词展示，不改变服务端权限检查。

主 Agent 和普通子 Agent 使用同一套预装 Skill。子 Agent 不能继续创建子 Agent；在 live Workspace 中，`delegateTask` 可运行但文件写入必须经 Authority 的按文件队列、CAS、actor/runId 与 receipt 约束，因此 Skill 共享不代表可以绕过工作区写入边界。

## 四、Skill 之间的协作边界

- 创建或调整页面时，先使用 `page-lifecycle`；涉及跨页面或跨区域联动时，再使用 `config-driven-behavior`。
- 新建或重写 React 页面时使用 `react-high-fidelity`；已有页面切换 runtime 时使用 `page-runtime-conversion`，不能混用两者的适用场景。
- 页面删除使用 `page-deletion`，不通过 `page-lifecycle` 或通用文件工具代替。
- 预览调试使用 `preview-tools`；Schema 合法不等于运行中的配置面板已经完成 UI 验收。
- 图片处理使用 `image-handling`；图像生成、抠图等工具是否可用由独立的图像配置和工具注册控制，不由 Skill 单独授予权限。
- `memory-maintenance` 只负责长期记忆；项目硬性规则仍以 `AGENTS.md`、项目公约和项目文档为准。

## 五、维护规则

新增或调整运行时 Skill 时：

1. 在 `packages/agent-service/src/preinstalled-skills/{skill-name}/SKILL.md` 中维护完整正文和 frontmatter。
2. 保持 `name` 与 Agent 调用 `readPreinstalledSkill` 时使用的名称一致。
3. 更新本文的清单、适用场景和边界说明。
4. 更新本目录的 `INDEX.md` 或相关入口链接，避免产生孤儿文档。
5. 如果加载机制、工具过滤、权限边界或子 Agent 行为改变，同时更新 [AI 行为约束机制](../../创作端/05-AI对话/技术/03_AI行为约束机制.md) 和 [独立 Agent 服务层索引](../README.md)。
6. 完成功能改动后，按 `agent-service` 的测试范围验证 Skill 注册、提示词展示和 `readPreinstalledSkill` 读取行为。

仓库中的 `.agents/skills/` 是 Codex 研发代理使用的仓库协作 Skill，不属于本文维护的 Agent 运行时内置 Skill 清单。
