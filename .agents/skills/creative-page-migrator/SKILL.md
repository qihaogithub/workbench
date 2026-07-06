---
name: creative-page-migrator
description: Migrate pages from external projects into 创作端 projects with code-first implementation. Use when Codex is asked to recreate, migrate, port, import, or restore a page/activity/screen from another repo, Vue/React/HTML project, static site, design export, or screenshot-backed reference into 创作端 pages. Especially use when visual parity is required but the deliverable must be real page code, schemas, assets, and preview validation rather than screenshot substitution.
---

# Creative Page Migrator

## Non-Negotiable Rule

Migrate the page as executable creative-project content. Do not replace a page with one full-page screenshot, sliced screenshots, or a raster background that only looks correct.

Screenshots are allowed only as references or verification artifacts. If the source project provides only screenshots and no source code/assets/design structure, stop and report that a code migration is not possible from the available evidence.

## Workflow

1. Identify the source and target:
   - Source repo/page/component/route and all imported files.
   - Target project id, existing page ids, runtime types, project/page schemas, and assets.
   - Whether the target should be edited through Project Admin CLI/local project package or an existing transaction.

2. Read the source implementation before writing:
   - Components/templates, CSS/Less/Sass/Tailwind, assets, responsive breakpoints, state, event handlers, route params, and API/data dependencies.
   - Source page registry/config files when the user only names a page.
   - Existing target page code to decide whether it is a placeholder or a partial migration.

3. Choose the target runtime deliberately:
   - Use `prototype-html-css` for static/safe HTML/CSS pages where layout fidelity is the goal and arbitrary JS is not required.
   - Use `high-fidelity-react` when the page needs React state, event logic, data-driven behavior, lifecycle behavior, or unsupported prototype capabilities.
   - Use `sketch-scene` only for actual editable scene-document pages, not as a shortcut for web page migration.

4. Implement from structure, not pixels:
   - Translate layout hierarchy, CSS, typography, spacing, animation, and responsive behavior into page code.
   - Copy or register original assets as assets; do not capture the rendered page and use that image as the implementation.
   - Keep source asset images as normal image elements/backgrounds only when they are real design assets in the source project.
   - Recreate text and interactive controls as DOM/code so they remain configurable, accessible, and editable.

5. Map configuration explicitly:
   - Put cross-page/shared business values in project schema.
   - Put page-only values and `$demo.previewSize` in page schema.
   - Do not duplicate ordinary field names across project-level and page-level schemas.
   - Keep code fallbacks aligned with schema defaults.

6. Validate with code and preview evidence:
   - Run the smallest relevant project validation commands.
   - Use screenshots only after code renders, to compare visual parity and capture evidence.
   - If screenshot evidence is visually correct but the implementation relies on page screenshots, treat the migration as failed.

## Required Checks

Before finalizing, verify:

- The target page source contains real layout/code, not one image covering the page.
- Key source assets are referenced as assets, not generated from a browser screenshot.
- Text content is DOM text or config-bound data unless it was an image in the original source.
- Buttons, links, forms, animations, and visible states from the source have code equivalents or documented unsupported gaps.
- `config.schema.json` ownership matches the config boundary.
- Validation commands cover the changed runtime and target project.

## Repo-Specific Commands

Prefer Project Admin CLI and local project packages for real project changes:

```bash
corepack pnpm ow doctor --json
corepack pnpm ow project pull <projectId> <dir> --json
cd <dir>
corepack pnpm install
corepack pnpm validate -- --json
corepack pnpm diff -- --summary --json
corepack pnpm submit -- --json
```

For transaction-based edits:

```bash
corepack pnpm ow edit begin <projectId> --json
corepack pnpm ow edit validate <editId> --json
corepack pnpm ow project validate-runtime <projectId> --json
corepack pnpm ow preview compile <editId> --json
corepack pnpm ow publish check <projectId> --json
```

Use existing specialized skills when they fit:

- Use `opencode-project-admin` for project admin operations and CLI transactions.
- Use `playwright-cli` only for final rendered verification, not as an implementation source.

## Detailed Checklist

Read [references/code-first-migration-checklist.md](references/code-first-migration-checklist.md) when the migration touches more than one page, has unclear source behavior, or visual parity is the main risk.

## Final Response

Report:

- Source page/component paths inspected.
- Target project/page ids changed.
- Runtime selected and why.
- Code/schema/assets changed.
- Validation and preview evidence.
- Any behavior that could not be migrated as code.
