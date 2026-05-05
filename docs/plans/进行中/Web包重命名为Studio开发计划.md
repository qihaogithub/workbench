# Web 包重命名为 Studio 开发计划

> **变更概述**：将 `packages/web` 文件夹更名为 `packages/studio`，npm 包名由 `@opencode-workbench/web` 更名为 `@opencode-workbench/studio`

---

## 一、变更范围分析

### 1.1 核心配置文件（必须修改，共 4 处）

| 文件路径 | 修改内容 |
|---------|---------|
| `packages/web/package.json` | `name`: `@opencode-workbench/web` → `@opencode-workbench/studio` |
| `packages/web/` 目录 | 重命名为 `packages/studio/` |
| `package.json`（根目录） | 所有 `@opencode-workbench/web` 引用 → `@opencode-workbench/studio` |
| `AGENTS.md`（根目录） | 包名和命令说明更新 |

### 1.2 文档引用（建议修改，共 2 处）

| 文件路径 | 说明 |
|---------|------|
| `docs/plans/进行中/配置项备注功能.md` | 已标注待实施状态，提及此变更 |
| `docs/plans/进行中/使用端方案.md` | 已标注待实施状态，提及此变更 |

> **说明**：以下文档虽包含 `@opencode-workbench/web` 或 `packages/web` 引用，但属于历史快照或用户数据，**不建议修改**：
> - `docs/plans/进行中/AI对话多模态模型识别方案.md` — 仅含 pnpm 命令引用
> - `docs/plans/已完成/*.md` — 已归档的历史文档
> - `docs/项目文档/**/*.md` — 项目文档
> - `packages/web/data/**/*` — 用户数据文件

### 1.3 数据文件（无需修改）

以下为用户数据文件，变更后保持原样：
- `packages/web/data/workspaces/*/markdown-example.md` — workspace 快照中的示例文档
- `packages/web/data/snapshots/*/markdown-example.md` — 项目快照中的示例文档
- `packages/web/data/projects/*/project.json` — 项目配置文件

---

## 二、实施步骤

### 步骤 1：备份与准备

```bash
# 确认当前工作区干净
cd /Users/qh2/Documents/PGM/1·Work/opencode-workbench
git status
```

### 步骤 2：重命名目录

```bash
# 重命名 packages/web → packages/studio
mv packages/web packages/studio
```

### 步骤 3：更新 package.json

修改 `packages/studio/package.json`：
```json
{
  "name": "@opencode-workbench/studio",
  // ... 其他内容保持不变
}
```

### 步骤 4：更新根 package.json

修改根目录 `package.json` 中的所有 `@opencode-workbench/web` 为 `@opencode-workbench/studio`：

```json
{
  "scripts": {
    "dev": "concurrently -n studio,agent -c blue,green \"pnpm --filter @opencode-workbench/studio dev\" \"pnpm --filter @opencode-workbench/agent-service dev\"",
    "dev:studio": "pnpm --filter @opencode-workbench/studio dev",
    "dev:all": "concurrently -n studio,agent,viewer -c blue,green,cyan \"pnpm --filter @opencode-workbench/studio dev\" \"pnpm --filter @opencode-workbench/agent-service dev\" \"pnpm --filter @opencode-workbench/viewer-site dev\"",
    "build": "pnpm --filter @opencode-workbench/studio build",
    "lint": "pnpm --filter @opencode-workbench/studio lint",
    "typecheck": "pnpm --filter @opencode-workbench/studio typecheck"
  }
}
```

### 步骤 5：更新 AGENTS.md

修改 `AGENTS.md` 中的包名和命令说明。

### 步骤 6：更新文档引用（可选）

选择性更新以下 2 个文档：
- `docs/plans/进行中/配置项备注功能.md`
- `docs/plans/进行中/使用端方案.md`

### 步骤 7：安装验证

```bash
# 重新安装依赖
pnpm install

# 验证构建
pnpm build

# 验证类型检查
pnpm typecheck
```

---

## 三、验证清单

- [ ] `packages/studio/package.json` 存在且 name 为 `@opencode-workbench/studio`
- [ ] `packages/studio` 目录存在，原 `packages/web` 目录不存在
- [ ] `pnpm install` 成功，无依赖错误
- [ ] `pnpm build` 成功
- [ ] `pnpm typecheck` 成功
- [ ] `pnpm dev:studio` 可正常启动开发服务器
- [ ] 访问 http://localhost:3200 页面正常渲染

---

## 四、回滚方案

如需回滚，执行以下操作：

```bash
# 1. 停止开发服务器

# 2. 还原目录名
mv packages/studio packages/web

# 3. 还原 package.json 中的 name 字段
# 4. 还原根 package.json 中的脚本引用
# 5. 还原 AGENTS.md

# 6. 重新安装
pnpm install
```

---

## 五、注意事项

1. **数据文件不受影响**：用户数据文件（workspaces、snapshots、projects）中的 markdown-example.md 和 project.json 无需修改，它们是历史快照和用户数据
2. **node_modules**：重命名后 pnpm install 会自动重新创建 node_modules
3. **.next 缓存**：建议删除 `.next` 目录后重新 build
4. **其他包的 workspace 引用**：`packages/studio/package.json` 中的 `dependencies` 使用 `workspace:*` 通配符，无需手动修改
5. **turbo.json**：使用通配符配置，不受影响
