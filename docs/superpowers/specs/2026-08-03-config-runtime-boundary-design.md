# 配置类型与运行时支持边界 - 原型页自动升级高保真设计

> 日期：2026-08-03
> 状态：已评审待实施

## 背景与目标

创作端页面配置系统支持 12 种配置类型（`string`、`number`、`integer`、`boolean`、`text`、`color`、`image`、`imageList`、`richtext`、`enum`、`cascade`、`array`）及若干 `$demo` 扩展。其中一部分类型只有高保真 React 页（`high-fidelity-react`）能消费，HTML 原型页（`prototype-html-css`）的绑定机制无法表达。

当前问题：agent 在原型页上添加复合类型配置项时，现有 prototype gate（`preview-validation.ts` 与 project-core `validateRuntime`）只检查 HTML/CSS 内容违规，对 `config.schema.json` 只查 `$demo.previewSize` 和 JSON 合法性，复合类型字段完全放行。agent 认为任务完成，用户在使用端发现配置不生效后才反馈，才升级为高保真页。

目标：agent 收到配置诉求时能识别"该类型原型页消费不了"，自动升级页面为高保真 React 页，而不是等用户反馈。保障分三层：

1. **预防**：skill / 提示词写清"配置类型与运行时支持边界"，agent 写 config 前主动升级
2. **兜底（确定性）**：扩展 prototype gate，`config.schema.json` 出现原型页不可消费的复合类型且页面为原型页时，返回 `upgrade_to_high_fidelity`，agent 收到指令后自动升级
3. **一致**：agent-service 写入拦截与 project-core（Web/CLI/publish check）校验行为一致

## 兼容性边界（核心规则）

依据 `packages/shared/src/demo/prototype-preview.ts` 的实际绑定能力（`{{fieldKey}}` 文本插值 + `data-bind-text` / `data-bind-src` / `data-bind-href` / `data-bind-style-color` / `data-bind-style-background-color` / `data-bind-style-border-color`）：

| 类别 | 配置类型 | 判定 |
| :--- | :--- | :--- |
| 原型页可消费（标量） | `string`、`number`、`integer`、`boolean`、`text`、`color`、`image`、`enum` 单选 | 保持原型页 |
| 必须升级高保真 | `array`（含 `variants` 模块数组、`$demo.sortable`、`$demo.maxItems`）、`imageList`、`richtext`、`cascade`、`enum`+`multiple:true`、`type:"position"`、`$demo.orderable` / `orderableHorizontal` / `positionable` | 触发 `upgrade_to_high_fidelity` |
| 不触发 | `visibleWhen`（仅面板显隐）、`$demo.previewSize`、`$demo.note`、`ui:widget` / `ui:options` / `format` 控件元数据 | 忽略 |

简化规则：**值为数组或对象、需要结构化消费的 → 升级；标量 → 保持**。`object` 作为分组容器时递归展开检查子字段，本身不报。

形态说明：`imageList` 既可作为 `type: "imageList"`，也可作为 `ui:widget: "imageList"`（Layer 1 控件覆盖）出现，两种形态均判定为复合类型；`ui:widget` / `format` 本身不触发，仅当 `ui:widget` 指向多值控件（如 `imageList`）时按复合类型处理。

升级门槛：只有用户诉求本质必须用复合类型时才升级；能用标量类型（`string`/`number`/`color`/`image`/`enum` 单选）表达的诉求保持原型页，不为升级而升级。

## 方案

三层保障，共享判定 + 两处 gate 接线 + 规则文档（已确认方案 1）。

### 1. 共享判定模块

新增 `packages/shared/src/demo/config-runtime-compatibility.ts`，纯函数无 IO：

```ts
checkConfigSchemaAgainstPrototype(schema: string | Record<string, unknown>): {
  supported: boolean;
  unsupportedFields: Array<{ path: string; type: string; reason: string }>;
}
```

- 递归遍历 properties（含分组 `object`、`variants` / `oneOf`、嵌套对象），收集所有不可消费字段路径 + 类型 + 原因（如 `modules.items.imageUrl`）
- 非法 JSON / 非对象 schema 不崩溃，视为无不可消费字段（JSON 合法性由现有检查负责）
- 放 shared `demo/` 目录（与 `prototype-preview.ts` 同域），agent-service 与 project-core 都已依赖 shared

### 2. agent-service 接线（`preview-validation.ts`）

`config.schema.json` 写入分支（现仅查 previewSize / JSON）追加兼容性检查：

- 解析成功后调用 `checkConfigSchemaAgainstPrototype`
- 使用 `validatePreviewFileWrite` 已接收的 `runtimeType` 参数：`high-fidelity-react` 时跳过（React 页全类型支持）；`prototype-html-css` 或未知（目录尚无页面文件）时检查——未知按原型页保守处理，兜底"agent 先写 config 后建页面"场景
- 发现不可消费字段 → 每字段一条 issue，code `PROTOTYPE_CONFIG_TYPE_UNSUPPORTED`，归入 `upgradeReasonCodes` → gate 返回 `upgrade_to_high_fidelity`
- 指令文案复用现有 `formatRuntimeValidationInstruction` 的 upgrade 格式（"Regenerate this page as high-fidelity React: write index.tsx, keep config.schema.json valid..."），summary 列出具体字段与原因
- 写入顺序自然兼容：先建 `index.tsx` + 更新 runtimeType 再写 config → 跳过（预防路径）；先写 config → gate 兜底要求升级（兜底路径）

### 3. project-core 接线（`service.ts` `validateRuntime`）

- 找到 config.schema.json 校验入口，接入同一共享判定函数，同规则产出 `upgrade_to_high_fidelity`
- 使 Web API 校验、`ow validate-runtime`、publish check 与 agent 写入拦截行为一致

### 4. 规则文档（预防层）

- `packages/agent-service/src/preinstalled-skills/page-lifecycle/SKILL.md` 新增"配置类型与运行时支持边界"小节：12 类型分两类（上表），规则——给原型页添加复合类型配置项前应先升级为 `high-fidelity-react`（保留 `config.schema.json` 字段不变、按 `page-runtime-conversion` 规范重写 `index.tsx` 保留视觉、更新 `workspace-tree.json` 的 `runtimeType`）；标量诉求保持原型页
- `packages/agent-service/src/preinstalled-skills/react-high-fidelity/SKILL.md` 补一句：复合类型配置（`array`/`imageList`/`richtext`/`cascade`/多选/`position`）只能由高保真页消费
- `packages/author-site/src/lib/agent/prompts/system-prompt.md` 页面级配置章节（现"原型页的配置变更……不需要把原型页升级为高保真页"）加限定：仅指标量绑定场景，复合类型配置仍需先升级——自洽性检查点
- `.agents/skills/creative-page-migrator/SKILL.md` runtime 选择小节补一句：目标包含复合类型配置时选 `high-fidelity-react`

## 测试

- shared：判定函数单测——12 类型逐一、嵌套分组、`variants`、`$demo` 扩展字段、`visibleWhen` 不触发、非法 schema 不崩溃
- agent-service：`preview-validation` 测试——复合类型 config → upgrade；React runtimeType 跳过；纯标量 → accept；未知 runtimeType 按原型页
- project-core：`service.test.ts` 同场景
- 现有 `system-prompt.test.ts` / `scan-workspace.test.ts` 断言同步更新

## 验证命令

- `pnpm check:shared 相关`（check:author / check:agent / check:screenshot / check:viewer）
- `pnpm check:agent`
- `pnpm check:project-core`

## 范围外

- 创作端配置面板 UI 不拦截（用户手动在面板加复合类型到原型页不在本次范围）
- 不扩展原型页绑定机制（`position` 的 `data-pos-key` 等保持 React-only）
- 复用既有 `page-runtime-conversion` 规范，不新写转换逻辑
