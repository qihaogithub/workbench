---
covers:
  - packages/agent-service/src/backends/pi-tools/ai-mutation-policy.ts
  - packages/agent-service/src/backends/managers/permission-manager.ts
  - packages/agent-service/src/backends/pi-tools/edit-file-tool.ts
  - packages/agent-service/src/backends/pi-tools/file-tools.ts
  - packages/agent-service/src/backends/pi-tools/visibility-tools.ts
  - packages/agent-service/src/backends/pi-tools/config-mutation-validation.ts
  - packages/agent-service/src/backends/pi-tools/authority-result-summary.ts
  - packages/agent-service/src/collab/hocuspocus-server.ts
  - packages/agent-service/src/collab/extensions/authority-persistence.ts
  - packages/agent-service/src/workspace/workspace-mutation-authority.ts
  - packages/agent-service/src/core/types.ts
  - packages/shared/src/contracts.ts
  - packages/author-site/src/lib/agent/prompts/system-prompt.md
---

# AI 对话与 Agent：计划编排与写入授权解耦方案

> 状态：核心实施完成，保留 P2 数据评估项
> 创建日期：2026-09-08
> 修订日期：2026-09-09
> 文档性质：Agent 计划编排、Workspace 写入边界与配置联动确认机制调整方案
> 当前结论：已完成计划审批与写入授权解耦；普通 Schema/配置值直写并受 Authority 契约校验，visibility 规则走绑定实际草稿的专用确认；不建设细粒度 Schema 风险分类器，不新增每个 AI run 的全量项目检查点

## 一、背景与问题

一次真实运行中，用户只要求在页面配置 Schema 增加可选图片字段 `heroImage`。Agent 第一次直接调用 `editFile` 修改 `demos/video-demo_ab12/config.schema.json` 时收到：

```text
FILE_ACCESS_DENIED: 当前角色无权通过 AI 修改此资源。
```

随后 Agent 被迫调用 `requestPlanApproval`、`prepareConfigVisibilityDraft` 和 `commitConfigVisibilityDraft`，并为满足联动草稿校验而同时提交空的 `project.visibility-rules.json`，最终才完成修改。

当前实现混淆了三个相互独立的概念：

1. **计划编排**：AI 为复杂任务拆解步骤、表达方案和维护进度。
2. **写入边界**：系统判断当前身份、Workspace 和目标资源是否允许写入。
3. **提交与恢复**：Authority 保证 mutation 可追踪、失败时原子恢复，项目历史提供用户级历史能力。

根因是 `assertAiMutationAllowed()` 将所有 `config.schema.json` 和 `config.values.json` 写入绑定到 `visibilityPlanApproval`；`requestPlanApproval` 又通过自然语言关键词判断是否生成该证明。结果是：计划文本既承担任务确认，又被错误地当作资源写入凭证，而普通 Schema 修改被迫误用配置联动 workflow。

## 二、现状校正

### 2.1 已确认的实现事实

- `config.schema.json` 和 `config.values.json` 当前确实受 `visibilityPlanApproval` 限制。
- `requestPlanApproval` 会在批准文本命中 `visibility`、`配置联动` 等关键词时写入临时证明。
- `prepareConfigVisibilityDraft` 必须包含 `project.visibility-rules.json`；这一约束适合真实联动变更，不适合普通 Schema 修改。
- visibility draft commit 会通过单次 Authority mutation 原子写入多个资源，并在 Authority 内校验规则引用。
- 普通文件工具已经执行路径检查、资源注册检查、部分 preview/schema validation，并返回结构化结果。
- `formatAuthorityCommitSummary()` 和拒绝结果中的 `details.category` 已经存在；后续工作是补齐和统一覆盖，而不是从零新增。

### 2.2 不能继续作为方案前提的表述

以下能力目前并未完整成立，实施时必须修正：

- 普通 Authority mutation 并非统一执行严格的 `baseRevision === currentRevision` 和 `expectedHash` 校验；不同写入类型采用不同并发语义。
- `editFile`/`writeFile` 对协同资源优先经过 Yjs，但工具层当前可能构造 `revision=0`、空 `rootHash` 的摘要 receipt，不能把它视为真实 durable receipt。
- Authority 的 mutation 备份主要用于提交失败和进程中断恢复，不等于用户可以把任意已成功 AI run 一键回退。
- Session `auto_checkpoint` 是会 flush、校验并复制完整 Workspace 的项目版本快照，不是轻量的 Agent run checkpoint。
- 页面 `config.schema.json`、项目 Schema 与 `config.values.json` 当前拥有的校验深度不同，不能笼统宣称它们都已经完成 Schema/preview 一致性校验。

## 三、设计目标

### 3.1 主要目标

- 计划只服务于 AI 的任务判断和人机协作，不再充当普通写入权限证明。
- AI 自主判断任务是否复杂、是否需要计划、是否需要向用户解释 Schema 影响。
- 普通 Schema、配置值和页面源码在有效 author Workspace 中可以直接受管写入。
- 系统只维护少量、稳定、可机械验证的硬边界，不实现细粒度 `SchemaMutationImpact` 分类器。
- 真正的配置联动继续通过专用 draft、用户确认和单次 Authority mutation 提交。
- 每次成功写入都向模型和前端返回真实、可核查的提交状态。

### 3.2 非目标

- 不取消身份、路径、Workspace、模板页、引用页、只读资源或 Resource Registry 边界。
- 不取消 Schema/JSON 合法性、运行时契约或 visibility 引用完整性校验。
- 不把删除、发布、权限修改、外部副作用或 `project.visibility-rules.json` 变成普通文件写入。
- 不建设字段级风险评分、规则引擎或持续膨胀的 Schema 变更分类体系。
- 不为每个 AI run 创建全量项目快照，也不在本方案中新增用户级“一键撤销整个 AI 任务”。
- 不改变 `visibility-rules` v1 协议本身。

## 四、设计原则

### 4.1 AI 判断语义，系统守住不变量

系统不试图枚举“删除字段一定危险、增加字段一定安全”之类会快速过时的判断。AI 根据用户意图、上下文、影响范围和当前能力决定是否：

- 直接执行；
- 先展示计划；
- 主动说明兼容性、数据或展示影响；
- 在目标不明确时请求用户选择。

服务端只验证与模型能力无关的稳定不变量：

- 当前用户、项目、Session 与 Workspace 绑定有效；
- 路径和资源类型受管理且允许当前角色修改；
- 模板页、引用页和只读资源边界没有被绕过；
- 候选 JSON、Schema 和配置值满足既有结构契约；
- 候选 Schema 不会使当前 `project.visibility-rules.json` 的字段引用失效；
- `project.visibility-rules.json` 只能通过专用原子 workflow 提交；
- 成功状态只能来自真实 committed receipt。

这种边界不会限制 AI 对新型 Schema 改动的理解，也不需要长期维护一套主观风险分类规则。

### 4.2 计划不是权限凭证

保留 `requestPlanApproval` 工具名，避免无必要地扩大调用面变更；其语义调整为：

- AI 在复杂、多步骤、跨模块、需要先调查或需要用户确认方向时自主调用。
- 用户批准表示允许当前 run 按最终计划继续，不额外授予文件或硬操作权限。
- 用户拒绝或取消后，当前 run 停止；Agent 不得把同一计划内的操作改称“普通写入”后继续执行。
- 用户后续发起新的独立请求时，AI 才重新判断是否需要计划。
- 计划结果不再写入 `visibilityPlanApproval`，也不参与普通 mutation allow decision。
- `updatePlan` 继续用于 AI 自己维护任务进度。

系统提示负责指导 AI 如何判断是否需要计划，但服务端不解析计划自然语言来决定文件权限。

### 4.3 普通配置修改直接受管写入

以下资源不再因为缺少计划而被拦截：

- `project.config.schema.json`；
- `project.config.values.json`；
- `demos/{pageId}/config.schema.json`；
- `demos/{pageId}/config.values.json`；
- 当前普通任务涉及的页面源码和其他已注册可写资源。

直接写入仍必须依次满足：

1. `isPathAllowed`、Workspace Resource Registry 和角色/资源边界；
2. 最终候选内容的 JSON、Schema、配置值及页面运行时契约校验；
3. 使用候选 Schema 重新校验当前 visibility 文档的引用完整性；
4. 按资源类型进入正确的 Yjs/Authority 提交路径；
5. 返回真实 committed receipt 和运行时校验状态。

如果候选 Schema 会使现有 visibility 规则引用失效，系统不判断这次 Schema 修改“风险高低”，只拒绝产生不一致状态，并明确提示 Agent：把 Schema 与规则调整放入 `prepareConfigVisibilityDraft`，通过一次原子 mutation 提交。

资源上传、替换和删除仍走现有资源管理工具；直接修改配置值只能引用已经登记且允许使用的资源，不能借 JSON 写入绕过资产约束。

### 4.4 配置联动使用窄而明确的专用确认

`project.visibility-rules.json` 继续只能经过：

```text
inspect / validate
  → prepareConfigVisibilityDraft
  → 用户确认具体 draft
  → commitConfigVisibilityDraft
```

不建设覆盖删除、发布、外部副作用等所有场景的重型统一凭证平台。本方案只为 visibility draft 增加最小专用确认记录，并复用现有 `permission_request` 事件通道和卡片能力。

确认记录由服务端保存，不由模型自行构造，至少绑定：

- `approvalId` 和 `approvalKind=config_visibility`；
- `draftId` 及规范化 draft payload hash；
- `sessionId`、`projectId`、`workspaceId`；
- `approverUserId`、批准时角色和授权来源；
- draft 的 base revision/root hash；
- 创建时间、过期时间和单次消费状态。

确认发生在 draft 准备之后，使用户看到并批准的是实际影响摘要。commit 时必须在 Authority 临界区内完成以下动作：

1. 校验确认记录与当前用户、Session、Workspace 和 draft 完全匹配；
2. 校验当前 revision/root hash 仍等于 draft 基线；
3. 原子标记确认记录已消费并提交 mutation；
4. 提交失败时允许对同一未变化 draft 安全重试，不能产生重复提交。

删除、发布和外部写操作继续使用各自现有确认机制；只有出现真实重复和维护成本后，再单独评估是否抽取共享底层结构。

### 4.5 并发与 receipt 按真实写入模型处理

不强迫所有资源使用同一种并发模型：

- **协同文本资源**：继续以 Yjs 为内容合并入口，再由 Authority 持久化；工具必须获得并返回这次 Authority 提交生成的真实 receipt，不得自行构造 `revision=0` 或空 `rootHash` 的伪 receipt。
- **冻结 payload、多资源和非协同操作**：在 Authority lease 内校验当前基线和目标资源前置条件，避免在 Authority 外检查后再提交造成 TOCTOU。
- **visibility draft**：属于冻结的多资源操作，必须严格匹配 draft 基线并原子提交。

如果 AI 精确编辑基于旧文本，提交层必须选择“在最新 Yjs 文档上重新应用编辑”或“发现前置内容已变化后拒绝并让 AI 重读”，不能无提示地整文件覆盖并发修改。

### 4.6 可追踪与用户级恢复分开处理

本方案不新增每 run 全量 `auto_checkpoint`。原因是现有 Session checkpoint 会 flush、严格校验、复制完整 Workspace 并更新项目版本历史，成本和副作用都不适合隐式发生在每次 AI 写入前。

本方案只要求：

- Authority 对单次 mutation 保持 journal、真实 receipt、提交前备份和失败时原子恢复；
- RunSummary 记录本轮实际 committed mutation；
- 继续沿用项目现有自动保存、命名版本和资源历史策略，不重复建立第二套历史系统；
- UI 不把 Authority 的崩溃恢复能力描述为“可撤销任意已成功 AI 任务”。

如果后续数据证明用户确实需要“一键回退整个 AI run”，再以独立方案设计轻量 restore point、协作者冲突处理、容量策略和恢复入口，而不是复用当前 Session checkpoint 名称和实现。

### 4.7 模型可见状态与错误反馈

保留现有 `details.receipt`、RunSummary 和 `formatAuthorityCommitSummary()`，并补齐所有 Workspace 写工具的覆盖：

```text
Authority committed: revision=<n>; runtimeValidation=<ok|failed|not_applicable>; previewProjection=<verified|not_verified>.
```

规则：

- 只有真实 receipt 的 `committed=true` 才能输出 `committed`；
- 没有 projection ack 时只能输出 `not_verified`；
- runtime validation 失败时保留结构化诊断和自修复指令；
- receipt 继续放在 `details.receipt`，不复制出另一套顶层状态；
- 拒绝结果保留兼容错误码，并在模型可见文本和 `details.category` 中给出准确原因及下一步。

建议的稳定拒绝类别包括：

- `unverified`：重新建立有效 author session；
- `template_page` / `readonly_resource`：目标资源不可由当前角色修改；
- `config_visibility`：使用 visibility draft 和专用确认；
- `visibility_reference_conflict`：候选 Schema 会破坏已有规则引用，需要原子调整；
- `workspace_path`：目标不在受管路径或 Registry 中；
- `resource_reference`：配置值引用了未登记或不可用资源；
- `workspace_conflict`：内容或基线已变化，需要重读后重试。

## 五、实施方案

### P0-A：先补齐安全基础，不改变现有放行结果

- [x] 让 Yjs/Authority 持久化链路把真实 receipt 返回给 `editFile`/`writeFile`，移除工具层伪 receipt。
- [x] 明确协同文本与冻结 payload 的并发语义；精确编辑经 Yjs 写入前校验快照哈希/不存在前置条件，内容变化时转入 Authority 冲突路径，禁止静默覆盖。
- [x] 为页面/项目 Schema 和配置值补齐与各自契约相匹配的最终候选内容校验。
- [x] 增加“候选 Schema + 当前 visibility rules”引用完整性校验；只有引用失效时要求使用 visibility draft。
- [x] 基于现有 `permission_request` 增加 draft 后的 `config_visibility` 专用确认，服务端绑定批准人和实际 draft。
- [x] 将专用确认的校验、单次消费与 visibility mutation 放入受控提交边界（Authority 临界区严格校验 revision/rootHash/expectedHash，成功后单次消费确认记录）。

### P0-B：原子切换计划与写入语义

以下改动必须与 P0-A 中的 visibility 专用确认同时发布，不能留下 visibility 无法提交的中间版本：

- [x] 普通 Schema/配置值写入不再依赖 `visibilityPlanApproval` 或 `visibility-draft` workflow。
- [x] `requestPlanApproval` 不再写入 `visibilityPlanApproval`，计划文本不再参与 mutation allow decision。
- [x] visibility draft commit 改用新的专用确认记录。
- [x] 部署时使旧 `visibilityPlanApproval` 统一失效；项目未上线，不增加旧状态兼容分支。
- [x] 更新 system prompt 和 config-driven-behavior Skill，区分 AI 计划、普通写入和专用硬确认。

### P1：状态、诊断和文档收敛

- [x] 复用现有 `formatAuthorityCommitSummary()`，补齐所有写工具的真实 receipt、validation 和 projection 状态。
- [x] 统一拒绝类别、模型可见建议和诊断事件字段。
- [x] 日志明确区分 plan review、visibility approval、mutation receipt 和 projection ack。
- [x] 更新 AI 对话、配置与预览、项目管理相关项目文档和模块索引。

### P2：数据驱动的后续评估

- [ ] 回放代表性任务，测量计划调用率、重复工具调用率、写入冲突率和 visibility draft 使用率。
- [ ] 观察用户是否真实需要 run 级回退，再决定是否单独设计轻量 restore point。
- [ ] 仅在数据证明必要时增加无进展循环 guard；先记录命中，再灰度阻断。
- [ ] 不因个别误判引入细粒度 Schema 风险分类器；优先改进 prompt、上下文和验证反馈。

## 六、验证方式

### 6.1 单元测试

- 无计划时，普通页面和项目 Schema/配置值可进入受管写入。
- 计划批准或拒绝不改变普通资源的服务端写入权限。
- 计划被拒绝后当前 run 停止，不能继续执行同一计划中的普通写入。
- 候选 Schema 不影响现有 visibility 引用时允许提交。
- 候选 Schema 破坏现有 visibility 引用时拒绝普通提交，并返回 `visibility_reference_conflict`。
- 配置值不是合法 JSON、违反既有 Schema 契约或引用未登记资源时拒绝。
- 模板页、引用页、只读资源、越权路径和过期 Session 继续 fail closed。
- visibility 专用确认绑定错误用户、draft、payload、Workspace 或基线时拒绝。
- 专用确认只能被成功消费一次；安全重试不产生重复 mutation。

### 6.2 集成测试

- 回放 `video-demo_ab12`：一次普通 Schema 写入完成 `heroImage` 增量，不创建或修改空的 visibility rules。
- 修改被现有规则引用的字段时，普通写入不会留下失效规则；Schema 与规则可经 draft 原子提交。
- 页面 Schema 经 Yjs/Authority 写入后返回真实非零 revision、真实 root hash 和 committed receipt。
- 并发编辑发生在 AI 读取之后、提交之前时，结果为正确合并或明确冲突，不静默覆盖。
- visibility draft 只有在用户批准实际 draft 后才能提交；批准后 Workspace 基线变化则要求重新准备。
- Authority mutation 中途失败时恢复提交前状态，journal、receipt 和当前 state 一致。
- 未创建 AI run 全量项目快照，既有自动保存和版本历史行为不变。

### 6.3 验收标准

1. 简单 Schema 或配置值修改不再弹出计划审批，也不因缺少计划而被拦截。
2. AI 仍自主决定复杂任务是否需要计划，不受硬编码 Schema 风险分类器限制。
3. 计划确认不授予文件权限；计划拒绝会停止当前 run。
4. 普通 Schema 写入不能破坏既有 visibility 引用完整性。
5. visibility 规则只能通过批准实际 draft 的专用 workflow 原子提交。
6. 所有成功的 Workspace 写工具都返回真实 Authority receipt，不再出现 revision 0 或空 root hash 的成功摘要。
7. 模板、引用、只读、越权、删除、发布、权限和外部副作用边界没有被放开。
8. 不新增每 run 全量 checkpoint，不重复建设项目历史系统。

### 6.4 本轮验证记录

- 2026-09-09：`@workbench/agent-service` 与 `@workbench/ai-chat-shared` typecheck 通过。
- 2026-09-09：计划门禁、权限管理、配置候选校验、visibility Authority、Authority receipt、协同持久化及文件工具定向测试共 106 项通过。
- 2026-09-09：完整 `agent-service` 测试为 75/80 文件通过、590/602 用例通过；剩余 12 项集中在既有模型 Mock/API 断言、路由监听 EPERM、文件工具 Mock/隔离和旧图片预描述断言，未将其归因于本方案；需在独立工程质量任务中处理。

## 七、关键权衡与风险

### 7.1 选择 AI 自主判断，而不是 Schema 风险分类器

收益：

- 不把当前模型能力和经验固化成长期维护的规则系统；
- AI 能根据完整任务语义判断影响，而不是只看 JSON diff；
- 新字段类型和新产品能力无需持续扩展风险枚举；
- 服务端边界更少、更稳定、更容易测试。

代价：

- AI 仍可能低估某次 Schema 修改的业务影响；
- 计划调用率和影响说明质量依赖模型与 prompt。

接受该代价的前提是：系统继续机械地保护身份、只读资源、结构合法性、visibility 引用完整性、资源登记和真实提交状态。模型误判可以造成业务结果不理想，但不能造成越权、结构损坏、悬空规则或虚假成功。

### 7.2 不新增每 run 项目检查点

收益是避免每次 AI 写入前 flush、全量复制 Workspace、推进版本基线和制造历史噪音。代价是暂不提供“一键撤销整个 AI run”。当前使用 Authority 事务恢复和既有项目/资源历史满足基础追踪需求；是否需要更强的用户级回退由真实使用数据决定。

### 7.3 专用确认保持窄范围

只实现 visibility draft 所需的确认闭环，避免提前抽象覆盖删除、发布和外部副作用。未来若多个流程形成稳定相同结构，再抽取共享底层存储和消费原语；产品交互和授权语义仍由各操作自行定义。

## 八、已确认决策

- 计划编排与普通写入权限解耦。
- Schema 修改是否复杂、是否需要计划，主要交由 AI 根据语义判断。
- 不实现细粒度 `SchemaMutationImpact` 分类器。
- 系统保留候选 Schema 对既有 visibility 引用完整性的硬校验。
- visibility 确认绑定准备完成后的实际 draft，不依赖计划关键词，也不接受模型自行设置的 `confirm=true` 作为用户授权。
- 不新增每个 AI run 的全量 `auto_checkpoint`。
- 旧 `visibilityPlanApproval` 在新链路上线时直接失效，不建设兼容层。
- 复用现有 `permission_request` 事件通道，减少 UI 和协议扩张。

## 九、进度记录

- 2026-09-08：根据真实会话、失败草稿和 Authority journal，确认普通 Schema 写入被 `config_definition` 策略误拦截。
- 2026-09-08：形成第一版计划编排、写入授权和可恢复性解耦方案。
- 2026-09-09：完成只读架构评审，发现普通 CAS、Yjs receipt、checkpoint 语义、visibility 授权切换顺序和计划拒绝语义需要校正。
- 2026-09-09：确认采用 AI-first 的轻量设计：不建设 Schema 风险分类器，不新增每 run 全量检查点；以少量系统不变量、真实 receipt 和 draft 级专用确认为边界。
- 2026-09-09：完成 P0/P1 核心实施：移除旧计划证明状态，普通 Schema/配置值直写并在工具层与 Authority 双重校验；visibility 草稿使用 `config_visibility` 确认记录，严格绑定用户、草稿 payload 和 revision/rootHash，并返回真实 Authority receipt；同步更新提示词、Skill、共享事件类型和项目文档。

## 十、相关证据

- 用户提供的原始会话记录：`/Users/qh2/Downloads/对话记录-2026-9-8-session-.json`（未纳入仓库）。
- 失败草稿：[visibility_failed_e425d6d431d1a660.json](../../packages/agent-service/data/agent-visibility-drafts/d644ce56633bbc6e2db5e720e39f9815/failed/visibility_failed_e425d6d431d1a660.json)
- Authority journal：[journal.jsonl](../../data/workspace-authority/live-1787895066314-d67ahlorl/journal.jsonl)
- 当前计划门禁：[ai-mutation-policy.ts](../../packages/agent-service/src/backends/pi-tools/ai-mutation-policy.ts)
- 当前 visibility workflow：[visibility-tools.ts](../../packages/agent-service/src/backends/pi-tools/visibility-tools.ts)
- Authority：[workspace-mutation-authority.ts](../../packages/agent-service/src/workspace/workspace-mutation-authority.ts)
- Yjs 持久化入口：[authority-persistence.ts](../../packages/agent-service/src/collab/extensions/authority-persistence.ts)
- 模型可见摘要：[authority-result-summary.ts](../../packages/agent-service/src/backends/pi-tools/authority-result-summary.ts)
