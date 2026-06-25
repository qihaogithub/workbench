# Project Admin CLI 管理员模板维护手册

> 更新日期：2026-06-25

本文面向需要维护团队模板库的管理员。基础安装与通用操作见 [Project Admin CLI 使用指南](./Project-Admin-CLI使用指南.md)。

## 模板分层

模板支持三种层级：

- `personal`：个人草稿模板，适合个人反复试验。
- `team`：团队可复用模板，适合稳定工作流。
- `official`：官方推荐模板，适合在推荐、培训和交付中优先展示。

`official: true` 是官方标记。官方模板通常同时使用 `scope: "official"`。

## 维护流程

### 从线上项目保存模板

```bash
ow project get proj_xxx --json
ow publish check proj_xxx --json
ow template create-from-project proj_xxx \
  --category "活动模板" \
  --name "官方活动模板" \
  --description "适合活动页快速复用" \
  --scope official \
  --official true \
  --json
ow template health-check --json
```

### 本地开发模板

```bash
ow template init tpl_xxx ./local-template --json
cd ./local-template
pnpm install
pnpm dev
ow validate --json
ow diff --json
ow template submit \
  --category "活动模板" \
  --name "新版活动模板" \
  --description "从本地项目包提交" \
  --json
```

## 定期检查

建议定期运行：

```bash
ow template health-check --json
ow template list --scope official --json
```

健康检查会覆盖模板元数据、workspace、页面文件和 Schema。发现 blocking 级问题时，先从模板初始化本地项目包，修复后再提交为新的模板快照。

## 高风险操作

删除模板前必须先调用删除预览命令，确认影响范围后再携带确认 token 执行。删除模板不会删除已从该模板创建的项目。
