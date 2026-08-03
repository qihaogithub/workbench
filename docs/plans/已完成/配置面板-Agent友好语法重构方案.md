# 配置面板 Agent 友好语法重构方案

> **创建日期**: 2026-07-30
> **状态**: ⛔ 已废弃（2026-08-02 决定回退为 config.schema.json 单源方案）
> **回退方案**: [配置面板-回退config.ts回归schema.json方案.md](./配置面板-回退config.ts回归schema.json方案.md)
> **目标**: AI 用自然的 TS 对象字面量书写配置，编译器自动产出 `config.schema.json`，所有运行时消费者零改动

---

## 1. 实施状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| 阶段一 | `packages/shared/src/config-compiler.ts` 编译器 | ✅ 完成，41 个单元测试 |
| 阶段二 | `file-tools.ts` / `edit-file-tool.ts` 写入钩子集成 | ✅ 完成（阶段六补充实现） |
| 阶段三 | `demo-ui` `_fixed` 适配 | ✅ 完成 |
| 阶段四 | `system-prompt.md` / `page-lifecycle/SKILL.md` 更新 | ✅ 完成 |
| 阶段五 | 集成测试 | ✅ 400 个 agent-service 测试通过 |
| 阶段六 | 存量迁移 | ✅ 完成（2026-07-31），228 个 schema 文件已迁移为 config.ts |

---

## 2. 新增文件清单

| 文件 | 说明 |
|------|------|
| `packages/shared/src/config-compiler.ts` | config.ts → JSON Schema 编译器（acorn AST）+ 反向编译器 `decompileSchema` |
| `packages/shared/vitest.config.ts` | 测试配置 |
| `scripts/migration/migrate-config-schema-to-config-ts.ts` | 存量迁移脚本 |

## 3. 修改文件清单

### 编译器集成
| 文件 | 变更 |
|------|------|
| `packages/shared/src/index.ts` | 导出 `compileConfigTs`、`ConfigCompileError`、`decompileSchema` |
| `packages/shared/package.json` | 添加 `acorn` 依赖 |

### 写入钩子（阶段六实现）
| 文件 | 变更 |
|------|------|
| `packages/agent-service/src/backends/pi-tools/file-tools.ts` | writeFile 写入 `config.ts` 后自动编译产出 `config.schema.json` |
| `packages/agent-service/src/backends/pi-tools/edit-file-tool.ts` | editFile 写入 `config.ts` 后自动编译产出 `config.schema.json` |
| `packages/agent-service/src/backends/pi-tools/preview-validation.ts` | 新增 `config.ts` 校验分支（编译 + previewSize 检查） |

### Authority 资源注册
| 文件 | 变更 |
|------|------|
| `packages/shared/src/contracts.ts` | `isManagedWorkspaceResource` 正则加入 `config\.ts` |
| `packages/project-core/src/workspace-resource-registry.ts` | `config.ts` 注册为 `page-schema` 资源类型 |
| `packages/agent-service/src/collab/workspace-file-persistence.ts` | `config.ts` 映射到 `page-schema` 协作房间 |
| `packages/agent-service/src/session/session-guard.ts` | `ALLOWED_FILES` 加入 `config.ts` |
| `packages/agent-service/src/backends/pi-tools/permissions.ts` | 显式添加 `config.ts` 路径白名单 |

### UI 适配
| 文件 | 变更 |
|------|------|
| `packages/demo-ui/src/schema-parser.ts` | `FieldConfig` 新增 `fixed` 字段，从 `ui:options.fixed` 解析 |
| `packages/demo-ui/src/ArrayFieldGroup.tsx` | `fixed=true` 时隐藏添加/删除按钮，保留拖拽排序 |

### Prompt 更新
| 文件 | 变更 |
|------|------|
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | 配置书写示例从 JSON Schema 迁移为 `config.ts` 格式 |
| `packages/agent-service/src/preinstalled-skills/page-lifecycle/SKILL.md` | 默认模板改为 `config.ts` |

---

## 4. 已知问题

无已知问题。

## 5. 迁移统计（2026-07-31）

- 扫描目录：`data/projects/`、`data/workspaces/`（跳过 snapshots 和 .workbench/undo）
- 总计 240 个 `config.schema.json` 文件
- 9 个已存在 `config.ts`，跳过
- 228 个成功迁移为 `config.ts`
- 3 个失败（空文件或损坏的 JSON）

## 6. 编译器规格摘要

### config.ts → JSON Schema 类型映射

| config.ts `type` | JSON Schema 输出 |
|---|---|
| `"string"` | `{ type: "string" }` |
| `"text"` | `{ type: "string", maxLength: 1000 }` |
| `"number"` | `{ type: "number" }` |
| `"integer"` | `{ type: "integer" }` |
| `"boolean"` | `{ type: "boolean" }` |
| `"color"` | `{ type: "string", format: "color" }` |
| `"image"` | `{ type: "string", format: "image" }` |
| `"imageList"` | `{ type: "array", items: { type: "string" } }` |
| `"richtext"` | `{ type: "string", ui:widget: "richtext" }` |
| `"enum"` | `{ type: "string" }` + `enum`/`enumNames` |
| `"array"` | `{ type: "array" }` + children/variants |

### 元数据映射

| config.ts | JSON Schema |
|---|---|
| `$preview` | `$demo.previewSize` |
| `$positionable` | `$demo.positionable` |
| 分组 key | `ui:options.group` |
| `_fixed`（数组） | `ui:options.fixed` |
| `_maxItems`（variant） | `$demo.maxItems` |
