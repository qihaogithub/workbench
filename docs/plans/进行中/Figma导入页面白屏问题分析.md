# Figma 导入未生成代码问题分析

## 问题现象

用户通过创作端页面列表的「从 Figma 导入」功能上传代码后，页面预览白屏。页面已创建，但 Figma 导出的代码内容未写入文件系统，页面停留在默认空模板状态。

## 影响范围

通过「从 Figma 导入」创建的页面，如果文件写入步骤失败，页面保留默认空文件，预览白屏。

## 证据

### 1. 页面文件全部为默认模板，Figma 内容未写入

项目 `proj_1784130000259_espp0a` 中通过 Figma 导入创建的页面 `page_sk41`：

```
workspace/demos/page_sk41/
├── config.schema.json   (377 bytes, 默认模板)
├── prototype.css        (0 bytes, 空文件)
└── prototype.html       (13 bytes, "<main></main>")
```

关键证据：

- `prototype.html` 仅为 `<main></main>` — 这是页面创建时写入的默认占位内容（`demos/route.ts` 第 145 行）
- `config.schema.json` 是默认模板（含 `title`/`description`），**不是** Figma 导入应写入的空 schema `{"type":"object","properties":{}}`（定义于 `ImportFromFigmaDialog.tsx` 第 20-23 行 `EMPTY_FIGMA_CONFIG_SCHEMA`）
- 不存在 `index.tsx`

**结论**：页面创建步骤成功（写入了默认文件），但 Figma 内容写入步骤完全未生效。

### 2. Figma 导入两步流程分析

`ImportFromFigmaDialog.tsx` 第 119-173 行 `handleImport` 执行两步操作：

```
步骤 1: createDemoPage(projectId, name, sessionId, undefined, "prototype-html-css")
  → POST /api/projects/[projectId]/demos
  → 创建页面目录，写入默认占位文件
  → 在 workspace-tree.json 中注册页面条目
  → ✅ 成功（默认文件已写入）

步骤 2: updateDemoPageFiles(projectId, page.id, sessionId, {
          prototypeHtml, prototypeCss, prototypeMeta, schema: EMPTY_FIGMA_CONFIG_SCHEMA
        })
  → PUT /api/sessions/[sessionId]/files/[demoId]
  → 将 Figma 导出的 HTML/CSS 写入 prototype.html / prototype.css
  → ❌ 未生效（文件仍为默认模板）
```

`config.schema.json` 仍为默认模板而非 `EMPTY_FIGMA_CONFIG_SCHEMA`，是步骤 2 未执行的铁证 — 因为步骤 2 会同时写入 schema 和 prototype 文件。

### 3. 步骤 2 失败的可能原因

PUT `/api/sessions/[sessionId]/files/[demoId]` 处理链路中，以下环节可能阻断写入：

#### 3a. 原型页运行时校验阻断（最可能）

`sessions/[sessionId]/files/[demoId]/route.ts` 第 727-763 行，对原型页调用 `validateDemoPageFilesRuntime`。该校验（`packages/project-core/src/service.ts` 第 5593-5680 行）检查：

| 校验规则 | 触发条件 | Figma 导出 HTML 是否容易触发 |
|---------|---------|--------------------------|
| `PROTOTYPE_HTML_EMPTY` | HTML 为空 | 否（用户上传了内容） |
| `PROTOTYPE_HTML_TOO_LARGE` | HTML 超过 MVP 限制 | 可能（复杂页面） |
| `PROTOTYPE_SCRIPT_FORBIDDEN` | HTML 包含 `<script>` 标签 | **可能**（某些 Figma 导出插件会生成） |
| `PROTOTYPE_INLINE_EVENT_FORBIDDEN` | HTML 包含 `onclick` 等内联事件 | **可能**（交互组件导出） |
| `PROTOTYPE_JAVASCRIPT_URL_FORBIDDEN` | 包含 `javascript:` URL | 不太可能 |

如果 Figma 导出的 HTML 触发了任一校验规则，API 返回 422 错误，文件不写入。

#### 3b. Workspace Authority 冲突

`commitWorkspaceMutation`（第 812-821 行）可能因 workspace 写入权限冲突抛出 `WorkspaceAuthorityClientError`，导致文件未写入。

#### 3c. 前端错误处理不足

`handleImport` 的 catch 块（第 165-170 行）仅通过 toast 显示错误。toast 可能自动消失，用户未注意到。**关键问题：步骤 2 失败后，步骤 1 已创建的页面不会被回滚**，页面保留默认空文件，给用户「导入成功」的错觉。

## 根因总结

**Figma 导入流程的两步操作缺乏原子性**：步骤 1（创建页面）成功后，步骤 2（写入 Figma 内容）因校验失败或写入冲突而失败，但已创建的页面不会被回滚，导致页面处于「已创建但内容为空」的状态。

## 相关文件

| 文件 | 关注点 |
|------|--------|
| `packages/author-site/src/components/demo/ImportFromFigmaDialog.tsx` | Figma 导入对话框，两步操作缺乏原子性 |
| `packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts` | 文件更新 API，运行时校验可能阻断写入 |
| `packages/project-core/src/service.ts` | `validatePrototypePageSource` 校验规则（第 5593-5680 行） |
| `packages/author-site/src/app/api/projects/[projectId]/demos/route.ts` | 页面创建 API |

## 可能的修复方向

1. **导入原子性**：步骤 2 失败时自动删除步骤 1 创建的页面，避免留下空壳
2. **错误可见性**：步骤 2 失败后提供明确的错误提示，并提供「重试写入」或「删除空页面」选项
3. **校验前置**：在步骤 1 创建页面前，先对 Figma 内容做预校验，校验通过后再创建页面
4. **校验规则适配**：如果 Figma 导出 HTML 合理地包含 `<script>` 或内联事件，考虑放宽原型页校验规则或提供自动清理能力
