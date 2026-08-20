# Privacy notice (internal prototype)

Workbench Editable Snapshot processes captures locally in Chrome/Edge. It does not upload page data to Workbench or a third-party service.

## Data handled

- The visible page DOM, scripts, styles, frames and embedded resources selected by the user.
- A screenshot of the visible viewport.
- Capture metadata such as URL, title, route key, time, viewport and non-sensitive status history.

The extension does not intentionally read or export Cookie databases, browsing history, localStorage, sessionStorage or IndexedDB. Data already rendered into the DOM, scripts or URLs can still contain personal information or credentials; the generated security report flags likely matches before download approval.

## Permissions

- `activeTab`, `scripting`: capture only a user-invoked tab.
- `downloads`: save the approved ZIP.
- `storage`: retain task state, exact-origin capture-profile rules and non-content capture history.
- `offscreen`: process large captures and ZIP files locally.
- `sidePanel`: show explicit batch selection and status.
- Optional `tabs`: list HTTP/HTTPS tabs only after the user requests batch selection.
- Optional host access: only the selected page's scheme and host, requested from a user gesture. Chrome host match patterns cannot distinguish ports; capture-profile rules remain exact-origin.

No `cookies` or `history` permission is requested. Clearing extension storage removes task metadata, site rules and history; downloaded ZIP files remain under the user's control.

This package is not approved for store publication or external distribution while the SingleFile licensing decision remains open.
