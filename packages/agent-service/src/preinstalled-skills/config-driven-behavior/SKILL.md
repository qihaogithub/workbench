---
name: config-driven-behavior
description: 业务配置驱动页面可见性与区域状态的实现规范：项目级配置、visibility-rules 资源、页面/区域目标和发布校验。触发词：配置联动、业务开关、按配置隐藏页面、按条件禁用区域、页面可见性。
---

# 业务配置驱动行为

当需求涉及“某个配置改变后隐藏/禁用其他页面或页面区域”时，先读取本 Skill，再设计或修改实现。

## 协议边界

- 当前版本（规则协议 v1）的联动来源统一使用项目级 `project.config.schema.json` 字段；页面级字段控制当前页面区域的能力属于后续协议扩展，不能在 v1 规则中伪造 `page` 作用域。
- 联动规则只能写入项目根资源 `project.visibility-rules.json`，使用版本化声明式 JSON；不要把规则散落在页面源码、CSS 选择器或宿主路由中。
- 目标只能使用稳定 `pageId`，或页面源码明确声明的 `regionId`（例如 `data-region-id`）。禁止按 DOM 文本、数组下标、CSS 类名推断目标。
- 条件仅支持 `truthy` 与标量 `equals`；同一目标和效果出现冲突规则时必须修复规则，不要在运行时猜测优先级。

## 实现流程

1. 读取 `page-lifecycle`、`react-high-fidelity` 或 `page-runtime-conversion`，确认页面目录、运行时和配置 schema 语义。
2. 先调用 `inspectConfigVisibility` 获取权威 page ID、页面 schema 字段和源码声明的 region ID；不要根据页面标题猜测目标。
3. 检查项目级 schema 是否声明来源字段，并在页面代码中为需要区域联动的容器保留稳定 `data-region-id`。
4. 先调用 `validateConfigVisibility` 校验候选规则；跨文件变更使用 `prepareConfigVisibilityDraft` 生成私有草稿，等待用户批准高影响计划后再以 `confirm: true` 调用 `commitConfigVisibilityDraft`。该提交会把代码、Schema、配置值和规则作为一条 Authority mutation 写入。
5. 用共享 resolver 在创作端预览中计算状态：创作端保留页面卡片并置灰提示，页面配置表仍可编辑；不要在配置面板中新增跨页面规则编辑器。
6. 发布前执行规则和死链校验并把规则和哈希写入不可变发布快照。发布失败时报告具体 `ruleId`、来源字段和目标页面/区域。
7. 使用端只读取发布快照和已发布配置值，隐藏不可见页面；业务配置和规则不可编辑，旧链接指向不可见页面时回退到第一个可见页面并给出提示。

## 禁止事项

- 不要在页面组件中写跨页面状态机、隐式全局变量或通过 URL 参数绕过发布规则。
- 不要让使用端 AI、评论或普通配置回调修改业务配置与 `project.visibility-rules.json`。
- 不要把执行 ticket、原始 HTML 或会话凭据注入页面；可见性 resolver 只接收发布值和明确允许的会话覆盖。
