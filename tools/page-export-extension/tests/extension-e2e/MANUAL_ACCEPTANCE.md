# Loaded-extension acceptance

This checklist is the final browser-shell and signed-in acceptance after loading `tools/page-export-extension/dist` as an unpacked extension. The persistent-context E2E runner already sideloads the real MV3 build and covers capture, review, download, large-page cancellation/retry, Service Worker recovery and fixture ZIP contents. A Computer Use run also clicked the extension action without a permission overlay and proved the production `activeTab` grant. Playwright intercepted the download before the Save As dialog could remain visible, and the test profile had no existing author-site login, so those two checks remain manual.

## Setup

1. Run `corepack pnpm check:page-export-extension`.
   For the standalone browser renderer evidence, run `corepack pnpm --filter @workbench/page-export-extension build:fidelity-harness` and serve `dist/test-harness` on loopback.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the absolute `tools/page-export-extension/dist` directory.
3. Serve `tests/fixtures/capture-page.html` on an explicitly loopback-bound local server, then open it in a normal tab.
4. Open the extension Popup and Side Panel. Confirm the manifest does not request Cookie or history access.

The repeatable loaded-extension runner covers the main capture/download path and leaves only browser-shell gestures to the operator:

```bash
PAGE_EXPORT_CHROMIUM_EXECUTABLE=/absolute/path/to/Chromium \
  corepack pnpm --filter @workbench/page-export-extension test:extension-e2e
```

## Single-tab flow

- [x] Clicking Workbench Editable Snapshot from Chromium's extension menu grants production `activeTab`; no temporary host permission is present.
- [x] Automated loaded-extension run submits route/project/note through the Popup form and approves through the Popup review button.
- [ ] The Popup identifies the current page and explains activeTab degradation plus the scheme-and-host (not port-specific) optional permission before authorization; manually accept or deny the browser permission prompt.
- [x] Automated loaded-extension run preserves the fixture's current form values, expanded state, open Shadow DOM, readable canvas fallback, external/inline scripts, inline events, lazy-loaded asset and same-origin iframe workspace.
- [x] Automated run reaches `review_required`; no ZIP download starts before approval.
- [x] Review shows executable content, finding counts, missing/external dependency counts and fidelity status.
- [ ] Cancel at review removes the pending task and produces no download.
- [x] Automated run approves and verifies one completed Chrome ZIP download plus history metadata.
- [x] ZIP contains `bundle.json`, faithful/workspace/readable/reports, replay PNGs, preview/repack runners, README, AGENT guide, hashed image assets, the same-origin frame workspace, and `sources/original.ts` recovered through an externally fetched source map. `sources/` is otherwise emitted only when a source map yields sources.
- [x] `reports/fidelity-report.json` contains pixel metrics or an explicit `render-failed` reason; it never silently claims fidelity.

## Lifecycle and size

- [ ] Cancel during capture and during packaging; memory returns to idle/cancelled and the next capture succeeds.
- [x] Automated run stops/restarts the extension service worker during a task; state reports retry required, offscreen is closed and no partial download exists.
- [x] Automated/unit runs validate 10MB and 50MB captures; 50MB cancel/retry succeeds in one session, while checksum/sequence corruption is rejected and temporary data is cleared.

## Batch and rules

- [ ] Side Panel reads tabs only after optional `tabs` permission is granted; no tab is selected by default.
- [ ] Starting a batch requests only the distinct scheme-and-host patterns of checked HTTP/HTTPS tabs (Chrome host patterns cannot distinguish ports).
- [ ] The extension asks the user to activate each queued tab and never switches tabs automatically.
- [ ] Editable Fidelity and Compact Review produce distinct capture reports/options; a scheme-and-host rule is applied to a later Popup capture.
- [ ] History stores only capture metadata and supports confirmed deletion/clear.

## Author-site acceptance

- [ ] On an already signed-in representative author-site route, capture without `cookies` permission or storage export.
- [ ] Compare original viewport screenshot to faithful replay and faithful to workspace; record the agreed thresholds and actual metrics.
- [ ] Check console errors, failed requests, CSP differences, iframe limitations and scenario-specific interactions.
- [ ] Edit a first-party title, CSS rule and interaction in workspace, run offline preview, then run `runner/repack.mjs`; history gains one hash entry and faithful files remain unchanged.

Record evidence in a dated review note or test artifact. Do not check the plan's loaded-extension exit criteria without that artifact.
