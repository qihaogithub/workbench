# UIWeb Page Migration Checklist

## Reference Extraction

- Locate the Vue entry component, usually under `uiweb-vue/src/components/{page-name}/`.
- Read both phone and pad variants when present.
- Record:
  - default asset imports and remote OSS URLs
  - default text values
  - event names such as `updateImage1`, `updateButtonText1`, `updateShowText`
  - root dimensions and preview target size
  - overlay/background behavior
  - whether optional sections are shown by default

## Schema Mapping

| Vue concept | Target schema placement |
| --- | --- |
| Shared image across phone/pad | project `popupImage` or domain-specific image field |
| Shared button text | project-level field |
| Phone-only copy/layout option | phone demo schema |
| Pad-only copy/layout option | pad demo schema |
| Preview dimensions | page schema `$demo.previewSize` |
| Sortable/layout controls | page schema `$demo.orderable`, `$demo.orderableHorizontal`, `$demo.positionable` |

Avoid declaring the same ordinary property in both project and page schema. Move shared fields up to project schema and remove them from page schemas.

## TSX Conversion Rules

- Define a `DemoProps` interface that matches the final merged props.
- Destructure props with defaults matching the schema defaults.
- Avoid `as any`, `@ts-ignore`, and `@ts-expect-error`.
- Keep imported or remote image URLs as strings unless the target project already stores assets locally.
- If Vue `showText` defaults to `false`, do not render that text block unless the user asks for it as a configurable option.
- For full-screen pages, set the root element height explicitly, for example `style={{ height: '100vh' }}`. The preview iframe root uses `min-height: 100vh`; Tailwind `h-full` on the component root can compute to `0px` and make absolute-positioned content look blank.
- Keep phone and pad visual differences explicit rather than over-abstracting one-off project demos.

## Documentation

- For migrations that change platform rules, update `docs/项目文档/` with `doc-maintainer`.
- For project-only visual/config changes, maintain the task plan in `docs/plans/进行中/` and record validation.
- Do not update `docs/项目文档/INDEX.md` for plan documents.

## Validation

Run:

```powershell
node .agents\skills\uiweb-page-migrator\scripts\validate-migrated-project.mjs {projectId}
```

Then choose a repo check:

- Project data only: script validation plus static inspection is sufficient.
- author-site runtime changes: `corepack pnpm check:author`.
- viewer-site runtime changes: `corepack pnpm check:viewer`.

If a repo check fails on unrelated existing dirty-state problems, quote the first relevant failing file group and explain that the migration-specific validation passed.
