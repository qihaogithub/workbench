---
name: uiweb-page-migrator
description: Migrate pages from the sibling uiweb-vue project into opencode-workbench project data. Use when Codex is asked to recreate, migrate, or configure a uiweb-vue page/component in a target project under data/projects, especially when copying Vue page behavior into React TSX demos with project/page config schema fields, preview sizes, assets, or visual parity requirements.
---

# UIWeb Page Migrator

## Core Workflow

1. Confirm the target project id, target demo pages, and reference page/component path. If the user only names a page, search the sibling `uiweb-vue/src` tree with PowerShell if `rg` is unavailable or blocked.
2. Follow the repository `AGENTS.md` rules:
   - Use `doc-maintainer` before creating or updating `docs/` files.
   - Create a plan in the repo's in-progress plans directory when the migration touches multiple pages, project config, visual behavior, or unclear reference behavior.
   - Read the project documentation index, then the relevant configuration/preview module docs before changing feature behavior.
3. Read the reference Vue component(s), imported assets, emitted update events, default values, CSS dimensions, and background assets.
4. Read the target project files:
   - `data/projects/{projectId}/project.json`
   - `workspace/project.config.schema.json`
   - each `workspace/demos/{demoId}/config.schema.json`
   - each `workspace/demos/{demoId}/index.tsx`
   - `workspace/workspace-tree.json` and `.canvas-layout.json` only when page names, route keys, or canvas placement may change.
5. Decide schema ownership before editing:
   - Put cross-page shared values in `project.config.schema.json`.
   - Put page-only values and `$demo.previewSize` in the page `config.schema.json`.
   - Do not duplicate ordinary field names across project-level and page-level schema; author runtime treats that as a conflict.
6. Convert Vue to TSX conservatively:
   - Preserve visual hierarchy, sizes, overlay behavior, image URLs, and default text.
   - Replace Vue refs/events with typed React props and schema defaults.
   - Keep fallback defaults inside the component matching schema defaults.
   - Give full-screen root elements an explicit inline `height: '100vh'`; do not rely on Tailwind `h-full` inside the preview iframe.
   - Prefer existing Tailwind utilities and inline styles only for exact values.
7. Update long-term docs only when behavior or schema rules change. For one-off project content changes, the plan document may be enough.
8. Validate with the bundled script and the smallest relevant repo command.

## Reference Routing

Read [references/migration-checklist.md](references/migration-checklist.md) for the detailed checklist and common mappings.

Use [scripts/validate-migrated-project.mjs](scripts/validate-migrated-project.mjs) after edits:

```powershell
node .agents\skills\uiweb-page-migrator\scripts\validate-migrated-project.mjs proj_1779608460372
```

The script checks JSON parseability, project/page schema conflicts, preview sizes, and TSX transpilation when the local TypeScript package is available.

## Visual Verification

If a local author-site server is already running, open:

```text
http://localhost:3200/viewer/{projectId}/{demoId}
```

If the route times out or requires login, do not change authentication just for verification. Report the limitation and rely on schema/TSX validation plus targeted static inspection.

## Output Expectations

In the final response, list:

- target project and demo ids changed
- which fields are project-level vs page-level config
- validation commands and results
- any existing repo failures unrelated to the migration
