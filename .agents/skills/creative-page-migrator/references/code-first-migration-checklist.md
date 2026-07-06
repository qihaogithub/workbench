# Code-First Migration Checklist

Use this checklist for complex migrations or when a previous attempt produced screenshot-only pages.

## 1. Source Inventory

- Locate route/page registry entries, not only component files.
- Read root component plus child components used above the fold and in important states.
- Trace imported CSS, global styles, variables, mixins, fonts, and animation definitions.
- Trace assets by import path, public URL, CSS `url(...)`, and runtime config.
- List interactions: click/tap handlers, carousel timing, tabs, modals, forms, navigation, upload/update events, and API calls.
- Record intended viewport sizes and responsive breakpoints from source code or design config.

## 2. Target Inventory

- Read target project metadata, workspace tree, page metadata, runtime type, project schema, page schemas, and existing page code.
- Decide whether the existing target page is a placeholder, partial implementation, or previous migration attempt.
- If previous code uses full-page screenshots or source-screenshot slices, replace that strategy with structural code before claiming completion.

## 3. Runtime Decision

- Choose `prototype-html-css` when static HTML/CSS fidelity is enough and sanitizer rules allow the content.
- Choose `high-fidelity-react` when the source uses meaningful JS behavior, component state, dynamic data, nontrivial event logic, or unsupported embeds.
- Do not choose a screenshot-based implementation because it is faster or has better initial visual parity.

## 4. Code Translation

- Preserve DOM hierarchy where it affects layout, stacking, clipping, fixed positioning, or interaction.
- Translate source CSS values directly where exact visual parity matters.
- Keep repeated visual blocks as code/data, not baked into one bitmap.
- Recreate text, buttons, counters, labels, inputs, and active states as DOM elements.
- Use real image assets for logos, illustrations, photos, background textures, and icons that were assets in the source.
- Avoid adding abstractions until the translated page is correct.

## 5. Schema and Config

- Project-level schema is for shared fields across pages.
- Page-level schema is for page-only fields and `$demo.previewSize`.
- Never duplicate the same ordinary field at project and page level.
- Code fallbacks must match schema defaults.
- If the source has upload slots/events, map them to named config fields and asset references.

## 6. Verification

- Static validation: schemas parse, no config conflicts, target runtime validates.
- Build/compile validation: React/prototype source compiles through the repo validation path.
- Render validation: open the target page or generated local preview and inspect console/network errors.
- Screenshot validation: capture screenshots only after code renders; compare against source/reference screenshots for parity.
- Failure condition: visual parity achieved by full-page screenshot substitution is still a failed migration.

## 7. Final Evidence

The closeout must say which source files were read, which target files/pages changed, which runtime was selected, which commands passed, and what remains unsupported.
