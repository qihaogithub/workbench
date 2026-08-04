# 配置面板 — 回退 config.ts，回归 config.schema.json 单源方案

> **创建日期**: 2026-08-02
> **状态**: ✅ 方案已审计，待执行
> **目标**: 彻底移除 `config.ts` 语法层与 `config-compiler`，回归 `config.schema.json` 作为唯一配置源

---

## 1. 问题分析

`config.ts` 重构引入了"双层真相源"问题：

1. **AI 看不到生效产物** — AI 写 `config.ts`，编译器产出 `config.schema.json`，但 AI 永远看不到最终产物。编译器 bug 或映射遗漏时 AI 完全不知情。
2. **编译器是沉默故障点** — 41 个测试（实际为 55 个）只覆盖已知映射，任一边界情况静默出错，调试需同时读两个文件。
3. **并未真正简化** — 类型映射表（string→{type:string}、text→{type:string,maxLength:1000}…）说明它就是 JSON Schema 的浅封装，本质不变，多了一层编译器。
4. **复杂度净增** — 系统新增 955 行编译器、双轨权限遮盖逻辑、写入钩子自动编译、提示词双倍约束，而收益仅为一种"看起来更自然"的书写风格。

## 2. 回退范围（已审计确认）

### 2.1 待删除文件（4 个）

| 文件 | 说明 |
|------|------|
| `packages/shared/src/config-compiler.ts` | 955 行编译器，依赖 `acorn` 解析 TS AST |
| `packages/shared/src/config-compiler.test.ts` | 55 个测试用例 |
| `packages/shared/vitest.config.ts` | 编译器专用测试配置（仅包含 `src/**/*.test.ts`，该目录下仅此一个测试文件） |
| `scripts/migration/migrate-config-schema-to-config-ts.ts` | 249 行存量迁移脚本（正向：schema.json → config.ts） |

### 2.2 待修改文件（14 个，逐文件精确行号）

#### shared 包（3 个）

| 文件 | 行号 | 变更 |
|------|------|------|
| `packages/shared/src/index.ts` | L335 | 移除 `export { compileConfigTs, ConfigCompileError, decompileSchema } from "./config-compiler";` |
| `packages/shared/package.json` | L16 | 移除 `"acorn": "^8.18.0"` 依赖 |
| `packages/shared/src/contracts.ts` | L186 | 正则 `config\.(schema\.json\|ts)` 改为 `config\.schema\.json`（仅保留 schema.json） |

#### agent-service（7 个）

| 文件 | 行号 | 变更 |
|------|------|------|
| `packages/agent-service/src/backends/managers/permission-manager.ts` | L29-39 | 移除 `isShadowedSchemaJson` 函数定义 |
| 同上 | L87-101 | 移除 `validateToolCall` 中的编译产物遮蔽保护逻辑 |
| `packages/agent-service/src/backends/pi-tools/file-tools.ts` | L11 | 移除 `import { compileConfigTs } from "@workbench/shared";` |
| 同上 | L541-604 | 移除 `writeFile` 中的 `config.ts` 检测 + 自动编译 `config.schema.json` 钩子（含 `schemaCompileError`/`schemaCompileText` 变量） |
| 同上 | L746-832 | 移除 `listFiles` 中当同目录存在 `config.ts` 时隐藏 `config.schema.json` 的逻辑（含 Authority snapshot 和文件系统 fallback 两段） |
| `packages/agent-service/src/backends/pi-tools/edit-file-tool.ts` | L19 | 移除 `import { compileConfigTs } from "@workbench/shared";` |
| 同上 | L648-708 | 移除 `editFile` 中的 `config.ts` 检测 + 自动编译 `config.schema.json` 钩子 |
| `packages/agent-service/src/backends/pi-tools/preview-validation.ts` | L3 | 移除 `import { compileConfigTs, ConfigCompileError } from '@workbench/shared';` |
| 同上 | L335-409 | 移除 `config.ts` 文件名的整段校验分支（编译 `config.ts` 并检查 `$preview` 字段） |
| `packages/agent-service/src/collab/workspace-file-persistence.ts` | L17 | 移除 `if (/^demos\/[^/]+\/config\.ts$/.test(normalized)) return "page-schema";` |
| `packages/agent-service/src/session/session-guard.ts` | L5 | `ALLOWED_FILES` 数组移除 `'config.ts'` |
| `packages/agent-service/src/backends/pi-tools/permissions.ts` | L14, L20 | 移除 `"demos/*/config.ts"` 和 `"config.ts"` 两个白名单条目 |

#### project-core（1 个）

| 文件 | 行号 | 变更 |
|------|------|------|
| `packages/project-core/src/workspace-resource-registry.ts` | L64 | 移除 `if (/^demos\/[^/]+\/config\.ts$/.test(normalized)) return { kind: "page-schema", text: true, maxBytes: TEXT_MAX_BYTES, validation: "text" };` |

#### author-site（1 个）

| 文件 | 变更 |
|------|------|
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | **23 处** `config.ts` → `config.schema.json`；**8 处** `project.config.ts` → `project.config.schema.json`；移除"不要创建 config.schema.json，它是编译产物"类指令；配置示例恢复 JSON Schema 格式；"符合 config.ts 配置定义格式"改为"符合 config.schema.json 格式" |

system-prompt.md 具体改动点：

| 行号 | 改动 |
|------|------|
| L116 | `config.ts`（空配置）→ `config.schema.json`（空 JSON Schema） |
| L136 | `project.config.ts` → `project.config.schema.json`；"加入新字段"→"在 properties 中加入新字段" |
| L141 | `config.ts` → `config.schema.json` |
| L145 | `project.config.ts` → `project.config.schema.json` |
| L148 | `project.config.ts` → `project.config.schema.json` |
| L152 | `project.config.ts` → `project.config.schema.json` |
| L157 | 两处：`project.config.ts` → `project.config.schema.json`，`config.ts` → `config.schema.json` |
| L159 | 两处：`config.ts` → `config.schema.json`，`project.config.ts` → `project.config.schema.json` |
| L163 | `config.ts` → `config.schema.json` |
| L168-169 | 两处：`config.ts` → `config.schema.json` |
| L174 | `config.ts` → `config.schema.json` |
| L177 | `config.ts` → `config.schema.json` |
| L208-210 | `config.ts` → `config.schema.json`；"符合 config.ts 配置定义格式"→"符合 config.schema.json 格式"；`properties` → `$schema` 标准字段 |
| L311 | `config.ts` → `config.schema.json` |
| L314 | `config.ts` / `project.config.ts` → `config.schema.json` / `project.config.schema.json` |
| L332 | `config.ts` → `config.schema.json` |
| L334 | `project.config.ts` → `project.config.schema.json` |
| L336 | `config.ts` → `config.schema.json` |

#### agent-service preinstalled skills（1 个）

| 文件 | 变更 |
|------|------|
| `packages/agent-service/src/preinstalled-skills/page-lifecycle/SKILL.md` | **9 处**改动：L3 description 移除编译产物声明；L17 `config.ts` → `config.schema.json`；L18 移除"不要创建 config.schema.json"指令；L24 `config.ts` → `config.schema.json`；L26-28 空配置模板改为 JSON Schema 格式；**L40-79 整段 TS 格式模板重写为 JSON Schema 格式**；L127 `config.ts` → `config.schema.json`；L131 `config.ts` → `config.schema.json`，`project.config.ts` → `project.config.schema.json` |

### 2.3 测试文件变更（2 个）

| 文件 | 行号 | 变更 |
|------|------|------|
| `packages/agent-service/tests/unit/permission-manager.test.ts` | L57-95 | 移除 4 个遮蔽保护测试：writeFile 拦截（L57-65）、editFile 拦截（L67-75）、不存在时放行（L77-84）、readFile 拦截（L86-95） |
| `packages/agent-service/tests/unit/file-tools-live-workspace.test.ts` | L158-214 | 移除 2 个隐藏测试：Authority snapshot 路径（L158-182）和文件系统 fallback（L184-214） |

### 2.4 数据迁移

**需删除的数据文件：**

| 类型 | 路径 | 数量 |
|------|------|------|
| 页面 config.ts | `data/projects/` 下 `demos/*/config.ts` | 30 |
| 页面 config.ts | `data/workspaces/` 下 `demos/*/config.ts` | 151 |
| 项目 project.config.ts | `data/projects/` 下 `project.config.ts` | 5 |
| 项目 project.config.ts | `data/workspaces/` 下 `project.config.ts` | 23 |
| 快照 project.config.ts | `data/snapshots/` 下 `project.config.ts` | 1 |
| **合计** | | **210** |

**迁移策略：**

由于编译器在每次写入 `config.ts` 时自动产出对应的 `*.config.schema.json`，每个 `config.ts` 都应有对应的 schema 文件。迁移脚本需要：

1. 遍历所有 `config.ts` 和 `project.config.ts`
2. 检查对应的 `config.schema.json` / `project.config.schema.json` 是否存在且为合法 JSON
3. 如缺失或 JSON 解析失败，调用 `decompileSchema`（编译器尚未删除前）从 config.ts 编译补回
4. 删除 `config.ts` / `project.config.ts`
5. 支持 `--dry-run` 预览

⚠️ **快照目录**（`data/snapshots/`）中的 `project.config.ts` 也需要删除，但快照中的文件不应影响运行时。

### 2.5 不受影响的文件（审计确认无需修改）

以下文件只消费 `config.schema.json`，不涉及 `config.ts`：

| 文件 | 验证 |
|------|------|
| `packages/demo-ui/src/schema-parser.ts` | 只解析 JSON Schema，`FieldConfig` 无 `fixed` 字段 |
| `packages/demo-ui/src/ArrayFieldGroup.tsx` | 无配置逻辑级 `fixed` 变更 |
| `packages/author-site/src/lib/fs-utils.ts` | 创建页面写 `config.schema.json`（L1810），已是原生行为 |
| `packages/author-site/src/lib/publish-manager.ts` | 读取 `config.schema.json` |
| `packages/author-site/src/lib/workspace-file-utils.ts` | 检测 schema 文件类型 |
| `packages/author-site/src/lib/workspace-meta.ts` | 读取 schema |
| `packages/author-site/src/lib/runtime-props.ts` | 编译预览使用 schema |
| `packages/agent-service/src/services/viewer-ai-context.ts` | 读取 schema |
| `packages/agent-service/src/backends/pi-tools/screenshot-tool.ts` | 读取 schema |
| `packages/agent-service/src/backends/pi-tools/canvas-layout-tool.ts` | 读取 schema |
| `packages/agent-service/src/backends/pi-tools/delete-page-tool.ts` | 仅引用 `config.schema.json`（L202, L268, L279, L679），无 `config.ts` 引用 |
| `packages/agent-service/src/backends/pi-tools/save-image-tool.ts` | 无 `config.ts` 引用 |
| `packages/agent-service/src/backends/pi-tools/schema-tool.ts` | 无 `config.ts` 引用（仅校验 JSON Schema 格式） |
| `packages/knowledge-service/src/` | 读取 schema 构建知识索引 |
| `packages/project-scaffold/src/` | 脚手架转换 |

## 3. 执行步骤

### 阶段一：数据迁移

1. 编写回退迁移脚本 `scripts/migration/revert-config-ts-to-schema-json.ts`：
   - 遍历 `data/projects/`、`data/workspaces/`、`data/snapshots/`
   - 对每个 `config.ts` / `project.config.ts`：
     - 检查对应 schema 文件是否存在且为合法 JSON
     - 如缺失/损坏，调用 `decompileSchema` 补回
   - 删除 `config.ts` / `project.config.ts`
   - 支持 `--dry-run` 和 `--verify`

2. 执行迁移

### 阶段二：代码回退

按 2.2 清单依次修改 14 个文件，顺序建议：
1. `shared` 包（依赖方向：移除编译器和导出，其他包才能通过 typecheck）
2. `agent-service` 的 pi-tools（file-tools、edit-file-tool、preview-validation）
3. `agent-service` 的 managers（permission-manager）
4. `agent-service` 的 collab、session、permissions
5. `project-core`
6. `contracts.ts`
7. 提示词和 Skill（system-prompt.md、SKILL.md）

### 阶段三：测试清理与验证

1. 移除 2.3 中的测试用例
2. 运行 `pnpm check:all`（全仓类型检查 + lint）
3. 运行 `pnpm --filter @workbench/agent-service test`
4. 运行 `pnpm --filter @workbench/shared typecheck`（确认编译器移除后无残留引用）
5. 运行 `pnpm --filter @workbench/project-core typecheck`

### 阶段四：清理

1. 删除 2.1 中的 4 个文件
2. 运行 `pnpm install` 清理 acorn 依赖
3. git grep `config\.ts` 确认无残留引用（排除 data/ 目录）
4. git grep `compileConfigTs\|decompileSchema\|ConfigCompileError` 确认无残留

## 4. 风险与验证

| 风险 | 缓解 |
|------|------|
| 部分 config.schema.json 未与 config.ts 同步（编译失败导致） | 迁移脚本先行验证，缺失的从 config.ts 编译补回（利用仍存在的编译器） |
| 用户正编辑 config.ts 时执行回退 | 先确认无活跃 agent session |
| permission-manager 移除遮蔽后，AI 可能直接编辑 config.schema.json | 这正是目标行为 — config.schema.json 是唯一源 |
| `workspace-file-persistence.ts` L323 的 `isAllowedResource` 只允许 `config.schema.json`，移除 `resolveCollabResourceKind` 的 `config.ts` 映射后协同无影响 | 确认，原本 `isAllowedResource("page-schema")` 就只接受 `config.schema.json`，移除 `config.ts` 映射后反而消除了不一致 |
| `_fixed` 逻辑残留 | 审计已确认 `schema-parser.ts` 和 `ArrayFieldGroup.tsx` 未落地 `fixed` 字段逻辑 |

## 5. 回退后的系统行为

- AI 直接读写 `config.schema.json`（标准 JSON Schema 格式）
- `permission-manager` 不再对任何文件做遮蔽保护
- `file-tools` / `edit-file-tool` 不再有任何自动编译钩子，写入即写入
- `schemaValidate` 工具原位校验 JSON Schema 格式
- `preview-validation.ts` 直接校验 `config.schema.json` 的 `$demo.previewSize` 字段（不再经过编译器中转）
- 前端配置面板行为不变（始终消费 JSON Schema）
- Pi Agent 系统提示词和 page-lifecycle skill 重新指向 JSON Schema 格式
- Agent 自主创建页面时写入的配置文件是 `config.schema.json`（与 `fs-utils.ts` L1810 行为一致）
