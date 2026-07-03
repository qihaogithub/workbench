---
covers:
  - packages/project-cli/src/index.ts
  - packages/project-cli/src/cli-all-commands.test.ts
  - packages/project-core/src/service.ts
  - packages/project-core/src/types.ts
  - packages/project-scaffold/src/index.ts
---

# CLI 能力自动化清单

> 更新日期：2026-07-03

## 用途

这份清单是 CLI 自动维护定时任务的“对账表”。自动任务用它判断：

- Web 或领域服务里的能力是否需要 CLI 覆盖。
- CLI 是否已有对应命令。
- 命令属于低风险自动合入，还是必须人工审核。
- 缺口应该生成报告、草案 PR、待审核 PR，还是只输出方案。

清单中的能力编号应长期稳定。后续新增能力时，优先新增行，不随意改旧编号。

## 自动化等级

| 等级 | 含义 | 默认处理 |
|:-----|:-----|:-----|
| L1 | 只报告 | 不自动改代码 |
| L2 | 自动起草 | 自动改代码、补测试、补文档，生成草案 PR |
| L3 | 自动合入 | 验证全绿后可自动合入 |
| L4 | 人工审核 | 自动完成 PR，但必须人工确认 |
| L5 | 禁止自动合入 | 只生成方案、风险说明或草案 |

## 能力清单

| 能力编号 | 模块 | CLI 命令 | 风险 | 自动化 | 状态 | 说明 |
|:-----|:-----|:-----|:-----|:-----|:-----|:-----|
| system.doctor | 系统 | `doctor` | 低 | L3 | 已覆盖 | 本地环境诊断 |
| system.commands | 系统 | `commands` | 低 | L3 | 已覆盖 | 输出机器可读命令清单 |
| admin.capabilities | 管理 | `admin capabilities` | 低 | L3 | 已覆盖 | 查看当前能力和权限 |
| scaffold.validate | 本地项目包 | `validate` | 低 | L3 | 已覆盖 | 校验本地项目包 |
| scaffold.diff | 本地项目包 | `diff` | 低 | L3 | 已覆盖 | 查看本地改动摘要 |
| scaffold.upgrade | 本地项目包 | `upgrade` | 中 | L4 | 已覆盖 | 更新脚手架托管文件 |
| scaffold.submit | 本地项目包 | `submit` | 中 | L4 | 已覆盖 | 提交本地项目包变更 |
| project.list | 项目 | `project list` | 低 | L3 | 已覆盖 | 查询项目列表 |
| project.get | 项目 | `project get` | 低 | L3 | 已覆盖 | 查询项目详情 |
| project.pull | 项目 | `project pull` | 低 | L3 | 已覆盖 | 拉取项目为本地项目包 |
| project.runtime.validate | 项目 | `project validate-runtime` | 低 | L3 | 已覆盖 | 校验项目当前版本页面是否符合创作端预览运行契约 |
| project.create | 项目 | `project create` | 中 | L4 | 已覆盖 | 创建项目 |
| project.update | 项目 | `project update` | 中 | L4 | 已覆盖 | 修改项目基础信息 |
| project.duplicate | 项目 | `project duplicate` | 中 | L4 | 已覆盖 | 复制项目 |
| project.delete | 项目 | `project delete-preview`、`project delete-execute` | 高 | L5 | 已覆盖 | 删除项目必须保留预览和确认 |
| project.cover.set | 项目 | `project set-cover` | 中 | L4 | 已覆盖 | 设置封面 |
| project.cover.delete | 项目 | `project delete-cover` | 中 | L4 | 已覆盖 | 删除封面 |
| template.list | 模板 | `template list` | 低 | L3 | 已覆盖 | 查询模板列表 |
| template.get | 模板 | `template get` | 低 | L3 | 已覆盖 | 查询模板详情 |
| template.create | 模板 | `template create-from-project` | 中 | L4 | 已覆盖 | 保存项目为模板 |
| template.update | 模板 | `template update-meta` | 中 | L4 | 已覆盖 | 修改模板元信息 |
| template.health | 模板 | `template health-check` | 低 | L3 | 已覆盖 | 检查模板健康度 |
| template.delete | 模板 | `template delete-preview`、`template delete-execute` | 高 | L5 | 已覆盖 | 删除模板必须保留预览和确认 |
| template.recommend | 模板 | `template recommend` | 低 | L3 | 已覆盖 | 推荐模板 |
| template.instantiate | 模板 | `template instantiate` | 中 | L4 | 已覆盖 | 从模板创建项目 |
| template.local.init | 模板 | `template init` | 中 | L4 | 已覆盖 | 从模板初始化本地项目包 |
| template.local.submit | 模板 | `template submit` | 中 | L4 | 已覆盖 | 提交本地项目包并保存模板 |
| edit.begin | 编辑事务 | `edit begin` | 中 | L4 | 已覆盖 | 打开编辑事务 |
| edit.status | 编辑事务 | `edit status` | 低 | L3 | 已覆盖 | 查看事务状态 |
| edit.diff | 编辑事务 | `edit diff` | 低 | L3 | 已覆盖 | 查看事务差异 |
| edit.validate | 编辑事务 | `edit validate` | 低 | L3 | 已覆盖 | 校验事务工作区 |
| edit.commit | 编辑事务 | `edit commit` | 中 | L4 | 已覆盖 | 提交事务生成版本 |
| edit.discard | 编辑事务 | `edit discard` | 中 | L4 | 已覆盖 | 丢弃事务 |
| edit.extend | 编辑事务 | `edit extend` | 低 | L3 | 已覆盖 | 延长事务有效期 |
| page.list | 页面 | `page list` | 低 | L3 | 已覆盖 | 查询页面树 |
| page.get | 页面 | `page get` | 低 | L3 | 已覆盖 | 查询页面代码和配置 |
| page.runtime.validate | 页面 | `page validate-runtime` | 低 | L3 | 已覆盖 | React 页面走预览运行契约校验，HTML/CSS 原型页走静态安全边界校验 |
| page.create | 页面 | `page create` | 中 | L4 | 已覆盖 | 新建高保真 React 页面或 HTML/CSS 原型页 |
| page.duplicate | 页面 | `page duplicate` | 中 | L4 | 已覆盖 | 复制页面 |
| page.update.code | 页面 | `page update-code` | 中 | L4 | 已覆盖 | 更新 React 页面代码 |
| page.update.prototype | 页面 | `page update-prototype` | 中 | L4 | 已覆盖 | 更新 HTML/CSS 原型页内容和元信息 |
| page.switch-runtime | 页面 | `page switch-runtime` | 中 | L4 | 已覆盖 | 在编辑事务内切换页面运行时类型，并复用共享层运行时校验与文件写入保护 |
| page.update.schema | 页面 | `page update-schema` | 中 | L4 | 已覆盖 | 更新页面 Schema |
| page.update.meta | 页面 | `page update-meta` | 中 | L4 | 已覆盖 | 修改页面元信息 |
| page.version.list | 页面 | `page version-list` | 低 | L3 | 已覆盖 | 查询页面历史版本列表 |
| page.version.get | 页面 | `page version-get` | 低 | L3 | 已覆盖 | 读取单个页面历史版本内容 |
| page.version.create | 页面 | `page version-create` | 中 | L4 | 已覆盖 | 创建命名页面版本快照 |
| page.delete | 页面 | `page delete-preview`、`page delete-execute` | 高 | L5 | 已覆盖 | 删除页面必须保留预览和确认 |
| page.reorder | 页面 | `page reorder` | 中 | L4 | 已覆盖 | 页面和文件夹排序 |
| page.restore | 页面 | `page restore-version` | 高 | L5 | 已覆盖 | 恢复历史版本可能覆盖现状 |
| folder.create | 文件夹 | `folder create` | 中 | L4 | 已覆盖 | 创建虚拟文件夹 |
| folder.update | 文件夹 | `folder update` | 中 | L4 | 已覆盖 | 修改文件夹 |
| folder.delete | 文件夹 | `folder delete-preview`、`folder delete-execute` | 高 | L5 | 已覆盖 | 删除文件夹必须保留预览和确认 |
| config.project.get | 配置 | `config get-project-schema` | 低 | L3 | 已覆盖 | 读取项目级配置 |
| config.project.set | 配置 | `config set-project-schema` | 中 | L4 | 已覆盖 | 设置项目级配置 |
| config.project.delete | 配置 | `config delete-project-schema` | 高 | L5 | 已覆盖 | 删除项目级配置 |
| config.page.validate | 配置 | `config validate-page-schema` | 低 | L3 | 已覆盖 | 校验页面 Schema |
| config.merged.validate | 配置 | `config validate-merged-schema` | 低 | L3 | 已覆盖 | 校验合并配置 |
| config.generate | 配置 | `config generate-from-code` | 低 | L3 | 已覆盖 | 生成候选配置 |
| config.visual.patch | 配置 | `config apply-visual-patch` | 中 | L4 | 已覆盖 | 应用可视化配置补丁 |
| asset.list | 资产 | `asset list` | 低 | L3 | 已覆盖 | 查询资产 |
| asset.upload | 资产 | `asset upload` | 中 | L4 | 已覆盖 | 上传资产 |
| asset.replace | 资产 | `asset replace` | 中 | L4 | 已覆盖 | 替换资产并改引用 |
| asset.delete | 资产 | `asset delete-preview`、`asset delete-execute` | 高 | L5 | 已覆盖 | 删除资产必须保留预览和确认 |
| preview.compile | 预览 | `preview compile` | 低 | L3 | 已覆盖 | 源码运行契约校验与编译预检 |
| preview.render | 预览 | `preview render` | 低 | L3 | 已覆盖 | 获取预览入口 |
| preview.screenshot | 预览 | `preview screenshot` | 低 | L3 | 已覆盖 | 截图服务状态 |
| preview.logs | 预览 | `preview console-logs` | 低 | L3 | 已覆盖 | 控制台日志 |
| preview.errors | 预览 | `preview runtime-errors` | 低 | L3 | 已覆盖 | 运行时错误 |
| preview.health | 预览 | `preview healthcheck` | 低 | L3 | 已覆盖 | 预览健康检查 |
| publish.check | 发布 | `publish check` | 中 | L4 | 已覆盖 | 发布前检查 |
| publish.project | 发布 | `publish project` | 高 | L5 | 已覆盖 | 正式发布或降级发布状态 |
| publish.status | 发布 | `publish status` | 低 | L3 | 已覆盖 | 查询发布状态 |
| publish.rollback | 发布 | `publish rollback` | 高 | L5 | 已覆盖 | 回滚发布状态 |
| publish.artifacts | 发布 | `publish artifacts` | 低 | L3 | 已覆盖 | 查询发布产物 |
| ai.session.list | AI 会话 | `ai session-list` | 低 | L3 | 已覆盖 | 查询会话摘要 |
| ai.session.get | AI 会话 | `ai session-get` | 低 | L3 | 已覆盖 | 查询单个会话 |
| ai.run.logs | AI 会话 | `ai run-logs` | 低 | L3 | 已覆盖 | 查询运行日志 |
| ai.workspace.context | AI 会话 | `ai workspace-context` | 低 | L3 | 已覆盖 | 查询工作区上下文 |
| ai.send.message | AI 会话 | `ai send-message` | 中 | L4 | 已覆盖 | 向在线 AI 会话发送指令 |
| audit.list | 审计 | `audit list` | 低 | L3 | 已覆盖 | 查询审计列表 |
| audit.get | 审计 | `audit get` | 低 | L3 | 已覆盖 | 查询审计详情 |
| admin.lock | 管理 | `admin lock-project` | 高 | L5 | 已覆盖 | 锁定项目 |
| admin.unlock | 管理 | `admin unlock-project` | 高 | L5 | 已覆盖 | 解锁项目 |

## 新增能力登记规则

当 Web 或领域服务新增业务能力时，自动任务必须先在本清单登记，再决定是否实现 CLI。

登记时遵守以下规则：

| 场景 | 登记方式 |
|:-----|:-----|
| 纯查询、只读、状态类能力 | 默认 L3 |
| 创建、更新、提交类能力 | 默认 L4 |
| 删除、回滚、发布、权限、鉴权 | 默认 L5 |
| 管理后台能力 | 默认暂不覆盖 |
| 业务语义不清 | 标记待确认，不自动实现 |

## 自动任务使用方式

自动任务扫描到新能力后，应按以下顺序处理：

1. 在本清单中查找能力编号。
2. 如果找不到，新增一行并标记状态为待确认或待覆盖。
3. 根据风险和自动化等级决定是否自动实现。
4. 实现后更新状态和 CLI 命令列。
5. 补充测试覆盖信息。
6. 在运行报告中引用能力编号。

## 清单维护要求

- 能力编号不能复用。
- 命令改名时保留旧能力编号，并在说明里写明命令变化。
- 一个能力可以对应多个 CLI 命令，特别是预览和执行分开的高风险能力。
- 如果能力暂不覆盖，必须说明原因。
- 自动任务不能因为清单缺失就默认实现高风险能力。
