---
name: opencode-project-admin
description: "Use when Codex needs to administer opencode-workbench创作端项目 through Project Admin MCP, including listing projects/templates, creating or editing projects, managing pages/folders/config, preparing templates, publishing checks, auditing changes, or installing/verifying the MCP workflow."
---

# OpenCode Project Admin

Use Project Admin MCP as the only project administration interface. Do not edit `data/`, `project.json`, `workspace-tree.json`, `.session.json`, or generated publish/screenshot/cache files directly.

## Required Start

1. Call `admin_capabilities` to confirm role, mode, and available tool groups.
2. For read-only context, call `project_list`, `template_list`, and then `project_get` for the target project.
3. For any write operation, call `edit_begin` first and keep the returned `editId`.

## Write Workflow

Use this sequence for page, folder, and config changes:

1. `edit_begin`
2. Read context with `page_list`, `page_get`, `config_get_project_schema`
3. Apply changes with `page_*`, `folder_*`, or `config_*`
4. Run `edit_validate`
5. Run `edit_diff`
6. Commit with `edit_commit`, or abandon with `edit_discard`

If `edit_commit` returns `EDIT_CONFLICT`, stop writing, report the conflict, and open a fresh transaction before retrying.

## High-Risk Operations

For destructive or externally visible actions, never jump directly to execution:

- Project deletion: `project_delete_preview` then `project_delete_execute`
- Template deletion: `template_delete_preview` then `template_delete_execute`
- Page deletion: `page_delete_preview` then `page_delete_execute`
- Folder deletion: `folder_delete_preview` then `folder_delete_execute`
- Publishing: `publish_check` before `publish_project`

Execution requires the plan id and `confirmToken` returned by the preview step. Ask the user before L3/L4 actions when intent is not explicit.

## Schema Rules

- After changing page Schema, call `config_validate_page_schema`.
- After changing project Schema, call `config_validate_merged_schema`.
- Treat `SCHEMA_CONFLICT` and `VALIDATION_BLOCKED` as blockers.
- `config_generate_from_code` produces candidates only; review before applying with `page_update_schema`.

## Templates

To prepare a reusable template:

1. `project_get`
2. `publish_check`
3. Fix blockers in an edit transaction
4. `template_create_from_project`
5. `template_get` to verify the snapshot

Do not treat templates as hidden projects. Use `template_*` tools only.

## Preview, Assets, AI, and Publishing Boundaries

Current local stdio MCP supports deterministic project operations first. If a tool returns a warning that an external service is required, report that boundary and use the existing Web/API flow for that capability:

- Asset writes may still need the Web configuration panel.
- Screenshots may still need screenshot-service.
- Full publish artifact compilation may still need the author-site publish API.
- AI sessions remain owned by author-site and agent-service unless the MCP tool reports otherwise.

## Final Response Checklist

When finishing a project administration task, report:

- Project id and affected page/template/config ids
- Whether changes were committed or discarded
- Validation commands or MCP validations run
- Any warnings, degraded tools, or remaining external-service steps
- Audit id when the MCP returned one
