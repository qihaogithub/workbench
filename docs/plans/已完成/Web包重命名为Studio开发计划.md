# Web 包重命名为 Author-site 开发计划

> **变更概述**：将 `packages/web` 文件夹更名为 `packages/author-site`，npm 包名由 `@opencode-workbench/web` 更名为 `@opencode-workbench/author-site`

---

## 一、变更范围分析

### 1.1 核心配置文件（必须修改，共 7 处）

| 文件路径 | 修改内容 |
|---------|---------|
| `packages/web/package.json` | `name`: `@opencode-workbench/web` → `@opencode-workbench/author-site` |
| `packages/web/` 目录 | 重命名为 `packages/author-site/` |
| `package.json`（根目录） | 所有 `@opencode-workbench/web` 引用 → `@opencode-workbench/author-site`；`dev`/`dev:agent` 脚本中 `PROJECTS_BASE_DIR=../web/data` → `../author-site/data`；`dev:web` → `dev:author` |
| `AGENTS.md`（根目录） | 包名（6 处 `@opencode-workbench/web`）、命令说明、目录结构中 `packages/web/` 引用 |
| `packages/web/src/lib/templates/permission-config.ts` | 第 38 行 `packages/web` → `packages/author-site` |
| `packages/web/src/lib/agent-prompts/demo-generator.template.md` | 第 126 行 `packages/web` → `packages/author-site` |
| `OPS/CLI/src/commands/system.ts` | 第 118 行 `packages/web` → `packages/author-site` |

### 1.2 文档引用（建议修改，共 3 处）

| 文件路径 | 说明 |
|---------|------|
| `docs/plans/已完成/配置项备注功能.md` | 已标注待实施状态，提及此变更 |
| `docs/plans/已完成/使用端方案.md` | 已标注待实施状态，提及此变更 |
| `docs/项目文档/创作端/README.md` | 第 11 行包含 `@opencode-workbench/web` 引用 |

> **说明**：以下文档虽包含 `@opencode-workbench/web` 或 `packages/web` 引用，但属于历史快照或用户数据，**不建议修改**：
> - `docs/plans/已完成/*.md`（除上述 2 个已标注待实施的文档外）— 已归档的历史文档
> - `docs/plans/进行中/*.md`（除本文档外）— 进行中的方案文档，路径引用为编写时的快照
> - `docs/项目文档/**/*.md`（除上述 README.md 外）— 项目技术文档，路径引用为编写时的快照
> - `packages/web/data/**/*` — 用户数据文件

### 1.3 数据文件（无需修改）

以下为用户数据文件，变更后保持原样：
- `packages/web/data/workspaces/*/markdown-example.md` — workspace 快照中的示例文档
- `packages/web/data/snapshots/*/markdown-example.md` — 项目快照中的示例文档
- `packages/web/data/projects/*/project.json` — 项目配置文件（含绝对路径快照，运行时重新生成）

### 1.4 自动更新文件（无需手动修改）

| 文件路径 | 说明 |
|---------|------|
| `pnpm-lock.yaml` | `pnpm install` 时自动更新 `packages/web:` → `packages/author-site:` |

---

## 二、实施步骤

### 步骤 1：备份与准备

```bash
# 确认当前工作区干净
git status
```

### 步骤 2：重命名目录

```bash
# 重命名 packages/web → packages/author-site
# Windows:
move packages\web packages\author-site
# macOS/Linux:
# mv packages/web packages/author-site
```

### 步骤 3：更新 package.json

修改 `packages/author-site/package.json`：
```json
{
  "name": "@opencode-workbench/author-site"
}
```

### 步骤 4：更新根 package.json

修改根目录 `package.json` 中的所有 `@opencode-workbench/web` 为 `@opencode-workbench/author-site`，同时更新 `PROJECTS_BASE_DIR` 路径和脚本名：

```json
{
  "scripts": {
    "dev": "concurrently -n author,agent,viewer -c blue,green,cyan \"pnpm --filter @opencode-workbench/author-site dev\" \"cross-env PROJECTS_BASE_DIR=../author-site/data pnpm --filter @opencode-workbench/agent-service dev\" \"pnpm --filter @opencode-workbench/viewer-site dev\"",
    "dev:author": "pnpm --filter @opencode-workbench/author-site dev",
    "dev:agent": "cross-env PROJECTS_BASE_DIR=../author-site/data pnpm --filter @opencode-workbench/agent-service dev",
    "dev:viewer": "pnpm --filter @opencode-workbench/viewer-site dev",
    "build": "pnpm --filter @opencode-workbench/author-site build",
    "build:viewer": "pnpm --filter @opencode-workbench/viewer-site build",
    "lint": "pnpm --filter @opencode-workbench/author-site lint",
    "typecheck": "pnpm --filter @opencode-workbench/author-site typecheck",
    "typecheck:viewer": "pnpm --filter @opencode-workbench/viewer-site typecheck",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

> **关键变更点**：
> 1. `@opencode-workbench/web` → `@opencode-workbench/author-site`（5 处）
> 2. `dev:web` → `dev:author`
> 3. `PROJECTS_BASE_DIR=../web/data` → `../author-site/data`（2 处：`dev` 和 `dev:agent`）
> 4. `concurrently -n web,` → `-n author,`

### 步骤 5：更新 AGENTS.md

修改 `AGENTS.md` 中以下内容：
1. 项目概览：`@opencode-workbench/web` → `@opencode-workbench/author-site`，描述更新
2. 根目录命令：`dev:web` → `dev:author`，所有 `@opencode-workbench/web` → `@opencode-workbench/author-site`（6 处）
3. 包管理命令：`@opencode-workbench/web` → `@opencode-workbench/author-site`
4. 目录结构：`packages/web/` → `packages/author-site/`

### 步骤 6：更新源代码中的路径引用

修改以下 2 个文件中的 `packages/web` → `packages/author-site`：
- `packages/author-site/src/lib/templates/permission-config.ts`（第 38 行）
- `packages/author-site/src/lib/agent-prompts/demo-generator.template.md`（第 126 行）

### 步骤 7：更新文档引用（可选）

选择性更新以下文档：
- `docs/plans/已完成/配置项备注功能.md`
- `docs/plans/已完成/使用端方案.md`
- `docs/项目文档/创作端/README.md`

### 步骤 8：安装验证

```bash
# 重新安装依赖（pnpm-lock.yaml 会自动更新）
pnpm install

# 验证构建
pnpm build

# 验证类型检查
pnpm typecheck
```

---

## 三、验证清单

- [ ] `packages/author-site/package.json` 存在且 name 为 `@opencode-workbench/author-site`
- [ ] `packages/author-site` 目录存在，原 `packages/web` 目录不存在
- [ ] `pnpm install` 成功，无依赖错误
- [ ] `pnpm build` 成功
- [ ] `pnpm typecheck` 成功
- [ ] `pnpm dev:author` 可正常启动开发服务器
- [ ] `pnpm dev:agent` 可正常启动（验证 `PROJECTS_BASE_DIR=../author-site/data` 生效）
- [ ] 访问 http://localhost:3200 页面正常渲染
- [ ] `permission-config.ts` 和 `demo-generator.template.md` 中路径已更新


---

## 五、注意事项

1. **数据文件不受影响**：用户数据文件（workspaces、snapshots、projects）中的 markdown-example.md 和 project.json 无需修改，它们是历史快照和用户数据。project.json 中的绝对路径快照在运行时会重新生成
2. **node_modules**：重命名后 pnpm install 会自动重新创建 node_modules
3. **.next 缓存**：建议删除 `.next` 目录后重新 build
4. **其他包的 workspace 引用**：`packages/author-site/package.json` 中的 `dependencies` 使用 `workspace:*` 通配符，无需手动修改
5. **turbo.json 和 pnpm-workspace.yaml**：均使用通配符配置（`packages/*`），不受影响
6. **PROJECTS_BASE_DIR 路径**：根 `package.json` 中 `dev` 和 `dev:agent` 脚本的 `PROJECTS_BASE_DIR=../web/data` 必须同步更新为 `../author-site/data`，否则 agent-service 将无法找到数据目录
7. **pnpm-lock.yaml**：`pnpm install` 时会自动更新，无需手动修改
