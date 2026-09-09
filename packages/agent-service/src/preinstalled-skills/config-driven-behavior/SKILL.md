---
name: config-driven-behavior
description: 业务配置驱动页面可见性与区域状态的实现规范：项目级配置、visibility-rules 资源、页面/区域目标和发布校验。触发词：配置联动、业务开关、按配置隐藏页面、按条件禁用区域、页面可见性。
---

# 业务配置驱动行为

当需求涉及“某个配置改变后隐藏/禁用其他页面或页面区域”时，先读取本 Skill，再设计或修改实现。

## 协议边界

- 当前版本（规则协议 v1）的联动来源统一使用项目级 `project.config.schema.json` 字段；页面级字段控制当前页面区域仍不属于本协议，不能伪造 `page` 作用域。
- 联动规则只能写入项目根资源 `project.visibility-rules.json`，使用版本化声明式 JSON；不要把规则散落在页面源码、CSS 选择器或宿主路由中。
- 目标只能使用稳定 `pageId`，或 React/原型页源码静态声明的 `regionId`（例如 `data-region-id`）。交互 HTML sandbox 不接受宿主区域联动。禁止按 DOM 文本、数组下标、CSS 类名或动态表达式推断目标。
- 条件支持 `truthy`、标量 `equals`、`oneOf` 以及由显式 predicates 组成的 `all`/`any`；简单条件在顶层声明 `source`，组合条件的来源只声明在各 predicate 内，不得再写一个冗余顶层 `source`。来源字段必须存在且条件值类型必须匹配 Schema。
- 规则可声明 `hidden`、`disabled`、`unavailable` 效果，以及 `unavailable`、`fallback-page`、`alternative-region` 安全策略；`fallback-page` 只能用于页面目标且不得成环，`alternative-region` 只能指向目标页内的专用替代区域，该区域不能同时作为普通规则目标。策略不能携带 URL、脚本、会话、权限或宿主动作。
- 可选 `context` 只能使用服务端提供的非特权 `role`。公开规则禁止用户 ID 等个人标识；上下文只影响只读呈现，不授予任何访问权限，Viewer 不接受客户端伪造上下文。

## 实现流程

1. 读取 `page-lifecycle`、`react-high-fidelity` 或 `page-runtime-conversion`，确认页面目录、运行时和配置 schema 语义。
2. 先调用 `inspectConfigVisibility` 获取权威 page ID、页面 schema 字段和源码声明的 region ID；不要根据页面标题猜测目标。
3. 检查项目级 schema 是否声明来源字段，并在页面代码中为需要区域联动的容器保留稳定 `data-region-id`。
4. 先调用 `validateConfigVisibility` 校验候选规则；需要解释、修复或迁移既有规则时使用 `explainConfigVisibility`、`repairConfigVisibility`、`migrateConfigVisibility`，它们不写工作区。跨文件变更可由 AI 自主决定是否先请求计划，但计划批准不授予写入权限；用 `prepareConfigVisibilityDraft` 生成私有草稿，随后由用户确认实际草稿摘要，再以 `confirm: true` 调用 `commitConfigVisibilityDraft`。该提交会把代码、Schema、配置值和规则作为一条 Authority mutation 写入；失败草稿必须保留诊断，不得触碰已发布版本。
5. 用共享 resolver 在创作端预览中计算状态：创作端保留页面卡片并置灰提示，页面配置表仍可编辑；不要在配置面板中新增跨页面规则编辑器。
6. 发布前执行规则与导航可达性校验；指向条件隐藏页面的链接是允许发布的提示项，只有规则无效或发布后不存在任何可用页面才阻断。规则只写入独立不可变资产，发布清单保存路径、版本和内容哈希，禁止在清单中再嵌一份规则正文。
7. 使用端校验规则资产哈希和版本后再解析；规则无效或被篡改时 fail-closed。隐藏不可见页面，业务配置和规则不可编辑；旧链接指向不可见/不可用页面时优先使用规则声明且当前可用的备用页/替代区域，否则回退到第一个可用页面并给出规则消息。

## 禁止事项

- 不要在页面组件中写跨页面状态机、隐式全局变量或通过 URL 参数绕过发布规则。
- 不要让使用端 AI、评论或普通配置回调修改业务配置与 `project.visibility-rules.json`。
- 普通页面生成、样式调整、组件修改、素材替换不得隐式新增/删除配置字段或联动规则；如果页面代码改了但规则未取得 Authority receipt，不得声称跨页面联动已完成。
- 不要把执行 ticket、原始 HTML 或会话凭据注入页面；可见性 resolver 只接收发布值和明确允许的会话覆盖。
- 不要把可见性当作鉴权；被隐藏资源的服务端访问权限仍必须独立校验。
