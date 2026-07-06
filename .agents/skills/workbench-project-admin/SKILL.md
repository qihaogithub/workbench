---
name: opencode-project-admin
description: "Use when Codex needs to administer opencode-workbench创作端项目 through the Project Admin CLI, including listing projects/templates, creating or editing projects, managing pages/folders/config, preparing templates, publishing checks, auditing changes, or verifying the CLI workflow."
---

# OpenCode Project Admin

Use Project Admin CLI as the project administration interface. Do not edit `data/`, `project.json`, `workspace-tree.json`, `.session.json`, or generated publish/screenshot/cache files directly.

## Required Start

1. Run `ow doctor --json` to confirm CLI, data directory, role, and next actions.
2. For read-only context, run `ow project list --json`, `ow template list --json`, and then `ow project get <projectId> --json`.
3. For any write operation, run `ow edit begin <projectId> --json` first and keep the returned `editId`.

## Write Workflow

Use this sequence for page, folder, and config changes:

1. `ow edit begin <projectId> --json`
2. Read context with `ow page list <editId> --json`, `ow page get <editId> <pageId> --json`, `ow config get-project-schema <editId> --json`
3. Apply changes with `ow page ...`, `ow folder ...`, or `ow config ...`
4. Run `ow edit validate <editId> --json`
5. Run `ow edit diff <editId> --json`
6. Commit with `ow edit commit <editId> --json`, or abandon with `ow edit discard <editId> --json`

If `ow edit commit` returns `EDIT_CONFLICT`, stop writing, report the conflict, and open a fresh transaction before retrying.

## High-Risk Operations

For destructive or externally visible actions, never jump directly to execution:

- Project deletion: `ow project delete-preview` then `ow project delete-execute`
- Template deletion: `ow template delete-preview` then `ow template delete-execute`
- Page deletion: `ow page delete-preview` then `ow page delete-execute`
- Folder deletion: `ow folder delete-preview` then `ow folder delete-execute`
- Publishing: `ow publish check` before `ow publish project`

Execution requires the plan id and `confirmToken` returned by the preview step. Ask the user before L3/L4 actions when intent is not explicit.

## Schema Rules

- After changing page Schema, run `ow config validate-page-schema`.
- After changing project Schema, run `ow config validate-merged-schema`.
- Treat `SCHEMA_CONFLICT` and `VALIDATION_BLOCKED` as blockers.
- `ow config generate-from-code` produces candidates only; review before applying with `ow page update-schema`.

## Templates

To prepare a reusable template:

1. `ow project get <projectId> --json`
2. `ow publish check <projectId> --json`
3. Fix blockers in an edit transaction
4. `ow template create-from-project --project-id <projectId> ... --json`
5. `ow template get <templateId> --json` to verify the snapshot

Do not treat templates as hidden projects. Use `template_*` tools only.

For local template development, use `ow template init <templateId> <dir> --json`, edit the generated project package, then run `ow template submit <dir> --category <category> --name <name> --description <description> --json`.

## Preview, AI, and Publishing Boundaries

Current CLI supports deterministic project operations first, including project package pull/diff/submit and asset changes inside submit. If a command returns a warning that an external service is required, report that boundary and use the existing Web/API flow for that capability:

- Screenshots may still need screenshot-service.
- Full publish artifact compilation uses the author-site publish API when `AUTHOR_SITE_URL` and `AUTHOR_SITE_AUTH_TOKEN` are configured; otherwise `ow publish` falls back to local publish status updates and returns a warning.
- AI sessions remain owned by author-site and agent-service unless the CLI command reports otherwise.

## Final Response Checklist

When finishing a project administration task, report:

- Project id and affected page/template/config ids
- Whether changes were committed or discarded
- Validation commands run
- Any warnings, degraded tools, or remaining external-service steps
- Audit id when the CLI returned one
