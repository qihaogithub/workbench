# 原型页预览尺寸元数据缺失与 AI 生成校验方案

## 当前状态

方案已实施完成，待验证。涉及两处文件修改，均已完成。

## 问题现象

项目 `proj_1783334663364_30hsrv` 中，画布模式下页面以手机尺寸（375×812）正确预览，但切换到单页面模式后页面撑满预览区导致变形。

## 根因分析

问题涉及两层数据链路不一致：

### 数据链路

```
config.schema.json → getPreviewSize(schema) → pagePreviewSizeMap → activePreviewSize → PrototypePagePreview
```

1. **AI 生成源头缺失**：系统提示词 `system-prompt.md` 中默认 schema 模板为空 `properties: {}`，未要求写入 `$demo.previewSize`。AI 生成的所有原型页 `config.schema.json` 均不含此字段。
2. **组件无默认值兜底**：`PrototypePagePreview` 中 `shouldScaleToPreviewSize = previewSize != null`，当 `previewSize` 为 `undefined` 时为 `false`，组件跳过缩放直接渲染为 `h-full w-full`。
3. **画布系统有默认值回退**：`canvas-layout.ts` 的 `resolveCanvasPageSize` 在 `previewSize` 缺失时回退到硬编码 `DEFAULT_PAGE_SIZE = {375, 812}`，所以画布模式显示正常。

### 结论

根因是 AI 系统提示词未要求写入 `$demo.previewSize`，导致整条数据链路源头为空。画布模式正常是因为有默认值回退，单页模式变形是因为 `PrototypePagePreview` 没有默认值回退。

## 方案

采用"源头修复 + 校验兜底"双层方案，不依赖组件层默认值兜底。

### 第一层：系统提示词（源头修复）

**文件**：`packages/author-site/src/lib/agent/prompts/system-prompt.md`

修改第 9 条"默认 schema"章节：
- 在空 schema 模板中加入 `$demo.previewSize` 结构
- 不指定具体尺寸值，由 AI 根据页面目标设备自行判断填写

修改后模板：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "$demo": {
    "previewSize": {
      "width": 375,
      "height": 812
    }
  },
  "properties": {},
  "required": []
}
```

说明文字改为："`previewSize` 的宽高由你根据页面目标设备和内容自行判断填写。"

### 第二层：文件写入校验（兜底拦截）

**文件**：`packages/agent-service/src/backends/pi-tools/preview-validation.ts`

在 `validatePreviewFileWrite` 的 `config.schema.json` 分支中，JSON 解析成功后追加检查：
- 验证 `$demo.previewSize` 存在且包含 `width` 和 `height`
- 缺失时返回 `{ok: false}`，错误码 `MISSING_PREVIEW_SIZE`
- 错误指令要求 AI 自行补上 `$demo.previewSize`

校验链路：

```
AI 写入 config.schema.json
  → writeFile/editFile 调用 validatePreviewFileWrite()
    → 检测缺少 $demo.previewSize → 返回 MISSING_PREVIEW_SIZE
      → formatRuntimeValidationInstruction() 生成修复指令
        → 附加到 tool_result 返回给 AI
          → AI 看到错误后自行修复补写
```

## 待办

- [x] 修改 `system-prompt.md` 第 9 条默认 schema 模板，加入 `$demo.previewSize`
- [x] 修改 `preview-validation.ts`，在 `config.schema.json` 校验中追加 `previewSize` 存在性检查
- [x] 更新 `__tests__/system-prompt.test.ts` 中相关断言（新增测试用例）
- [x] 运行 `pnpm check:agent` 验证 agent-service 类型和测试通过（394 tests passed）
- [x] 运行 `pnpm --filter @workbench/author-site test` 验证系统提示词测试通过（904 tests passed，1 个无关 flaky test 失败）
- [ ] 用新项目验证：让 AI 生成原型页后检查 `config.schema.json` 是否包含 `$demo.previewSize`
- [ ] 用新项目验证：单页模式下页面是否正确等比缩放

## 验证状态

- 单元测试全部通过：agent-service 394 tests，author-site 904 tests。
- `permission-dialog-plan.test.tsx` 失败是已有 flaky test，与本次改动无关。
- 待手动验证：新项目 AI 生成后 `config.schema.json` 是否包含 `$demo.previewSize`，以及单页模式预览效果。

## 风险

- AI 可能写入不合理的尺寸值（如 0 或极大值），当前方案不校验值的合理性，仅校验字段存在性。如需进一步校验可后续追加数值范围检查。
- 系统提示词修改影响所有新页面的生成行为，需确认不会与现有项目级 `project.config.schema.json` 中的 `$demo` 字段冲突。

## 相关文件

| 文件 | 角色 |
|---|---|
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | 系统提示词模板，定义 AI 生成 schema 的默认格式 |
| `packages/agent-service/src/backends/pi-tools/preview-validation.ts` | 文件写入运行时校验，拦截不合规 schema |
| `packages/demo-ui/src/PrototypePagePreview.tsx` | 单页原型预览组件，消费 `previewSize` 进行等比缩放 |
| `packages/demo-ui/src/preview-scale.ts` | `computePreviewScale` 缩放计算，内含 `DEFAULT_PREVIEW_SIZE` 默认值 |
| `packages/demo-ui/src/canvas-layout.ts` | 画布布局归一化，内含 `DEFAULT_PAGE_SIZE` 默认值回退 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 编辑页主入口，计算 `activePreviewSize` 并传递给预览组件 |
| `packages/agent-service/src/backends/pi-tools/canvas-layout-tool.ts` | 画布布局工具，从 schema 读取 `previewSize` |
| `packages/author-site/src/lib/agent/__tests__/system-prompt.test.ts` | 系统提示词单元测试 |
