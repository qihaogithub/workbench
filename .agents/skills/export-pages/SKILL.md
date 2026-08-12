---
name: export-pages
description: Export pages from a development project (Next.js/Vite/React SPA) as static prototype pages into 创作端 projects, connecting the 创作端 canvas review workflow. Use when Codex or an agent needs to sync development project pages into 创作端 for visual review, or dogfood the page-export tool by exporting the author-site's own (often JWT-protected) pages and importing them as a new prototype project.
---

# Export Pages

Sync a development project's pages into 创作端 as static `prototype-html-css` pages by rendering them and importing through Project Admin CLI. This makes pages reviewable in the 创作端 canvas and leaves `data-route` anchors for review opinion backflow.

## Non-Negotiable Rules

- The import path reuses the existing `ow project import-prototype` workflow. Do not hand-edit `data/` project files.
- Exported pages are static prototypes. They must pass `prototypeGate` (`accept_prototype`). Verify with `--dry-run` before importing.
- Do not ship the rendered page as a screenshot. The tool exports real HTML/CSS structure, not raster captures.

## Prerequisites

- Target dev server running (the tool renders, it does not start the server).
- System Chrome installed (`CHROME_BIN` override allowed).
- `single-file-cli` installed (declared in `tools/page-export/package.json`, present in repo `node_modules/`).
- `ow` CLI available (`corepack pnpm ow ...` from repo root).

## Workflow

1. Identify source and target:
   - Dev project root, `app/` or `pages/` dir, base URL, and login credentials if pages are protected.
   - Target import name; whether to only dry-run or actually import/commit.

2. Run the export orchestrator:

```bash
node tools/page-export/bin/export.mjs \
  --root <project-root> \
  --base-url http://localhost:4200 \
  --app-dir <project>/src/app \
  --username <user> --password <pass> \
  --output out-export \
  --import-name "<项目名>" \
  --dry-run
```

   - For protected pages the tool logs in via `POST /api/auth/login` and forwards the JWT as a browser cookie so middleware does not redirect rendering to `/login`.
   - For public pages add `--no-login`.
   - To override discovered routes, pass `--routes routeKey:file,...`.

3. Inspect the dry-run result: check `prototypeGate.decision === "accept_prototype"` (or repair items auto-fixable). Read `normalize-report.json` for red-line warnings and size issues.

4. Import and commit:

```bash
node tools/page-export/bin/export.mjs ... --commit
```

   Or import manually with the generated manifest:

```bash
cd <normalized-out>
corepack pnpm ow project import-prototype --source . --manifest @./manifest.json --assets images:assets/images --json
```

5. Verify in 创作端: prototype page preview + `corepack pnpm ow project visual-check <projectId> --json` screenshots.

## Manual / partial steps

- Discover routes only: `node tools/page-export/bin/discover-routes.mjs --root <app-dir> --base-url <url>`
- Normalize only: `node tools/page-export/bin/normalize.mjs --html-dir <raw> --output <out> --routes k:file[,...]`
- Manifest only (no import): add `--manifest-only`.

## Common Failures & Fixes

| Symptom | Fix |
| --- | --- |
| All pages render as login page | Login failed or cookie not forwarded; check credentials and `--login-url`. |
| `prototypeGate` = `upgrade_to_high_fidelity` | Rendering kept scripts/events/iframe; increase `--browser-wait-until-delay` or pre-set state, then re-normalize. |
| HTML > 2MB | Images balloon the HTML; images are extracted to `out/images/` by normalize — confirm they route via `--assets`. |
| `PROTOTYPE_GLOBAL_SELECTOR_FORBIDDEN` | normalize should localize `html/body/:root`; if it reappears, report it. |
| Missing Chrome | Set `CHROME_BIN` or install Chrome. |

## Review Opinion Backflow (P1)

The 创作端 annotation→AI review loop now works end-to-end for exported prototype pages:

- **批注闭环**：创作端单页预览原型页（`PrototypePagePreview`）已接通批注交互（批注图钉 + 输入浮层），批注模式和发送给 AI 已挂载到预览工具栏；AI prompt 按页面运行时类型分流到 `prototype.html` / `prototype.css`。
- **意见回流**：用 `export-opinions.mjs` 读 `data/projects/<projectId>/comments.json`，按 `routeKey`（来自 `data-route` 锚点 / 项目 demoPages）导出评审意见 JSON：
  ```bash
  node tools/page-export/bin/export-opinions.mjs --project <projectId> --data-dir <repo>/data --output opinions.json
  ```
  单条意见：`{ pageId, routeKey, threadId, anchor: { domPath, pin }, text, createdAt, resolved, status }`。

**消费流程（agent 在开发项目执行）**：
1. 读取 `opinions.json`，按 `routeKey` 定位开发项目对应路由源码。
2. 逐条消费意见：`anchor.domPath` 是创作端快照 DOM 定位，仅作视觉参考；`text` 是评审正文；据此定位源码并落地修改。
3. 处理完一条后，把该条 `threadId` 标记为已回写（可回写 `resolved: true`），与下次导出形成循环。

`data-route` 锚点由 normalize 注入，是回流主键；不要在开发项目侧剥离。

## Final Response

## Final Response

Report:
- Routes exported and which failed.
- `prototypeGate` decisions.
- Imported project id / edit id / commit status.
- Warnings and size issues.
- Any pages that could not be exported as static HTML.