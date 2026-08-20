# Workbench Editable Snapshot Extension

Chrome / Edge Manifest V3 internal prototype for exporting the active tab as an Editable Snapshot Bundle v1.

## Build and install

```bash
corepack pnpm --filter @workbench/page-export-extension build
```

`corepack pnpm check:page-export-extension` also verifies the unpacked build's minimum permissions, privacy notice, SPDX SBOM, source notice, and bundled AGPL/MIT license texts.

Open `chrome://extensions`, enable developer mode, choose “Load unpacked”, and select `tools/page-export-extension/dist`.

Prepare the page state, click the extension, confirm the route key, then capture. The ZIP is created locally in an offscreen extension document; no Cookie or browser storage database is exported.

The Popup handles one active tab. The Side Panel adds explicit multi-tab selection, capture profiles, scheme-and-host site rules and non-content export history. Optional `tabs` and host permissions are requested only from the corresponding user gesture. Chrome match patterns cannot distinguish ports, so a granted rule never broadens the scheme or host but covers all ports of that host. Batch capture never switches tabs automatically: activate the prompted tab and click Continue.

After packaging, the task pauses at `review_required`. Inspect the executable-content, sensitive finding, missing/external resource and fidelity summary, then approve or cancel the download. No ZIP is downloaded before approval; an unreviewed in-memory ZIP expires and is revoked after 30 minutes.

## Current fidelity boundary

P0 uses `activeTab`, so SingleFile hooks are injected only when the user clicks Capture. The current DOM, form state, scripts, inline events, iframe descriptors and visible screenshot are retained, but state that required hooks at `document_start` may be incomplete. The capture report records this limitation.

The fidelity report compares script-disabled, offline faithful/workspace replays rendered by html2canvas. This stable DOM/CSS approximation catches split/serialization regressions but is not a browser-native screenshot and does not prove interaction equivalence.

Extracted bundles include an offline/read-only/original-network preview runner and a dependency-free repack runner. `SNAPSHOT_NETWORK=read-only` permits only credential-free GET/HEAD through localhost. After editing workspace files, run `SNAPSHOT_CHANGE_NOTE="..." node runner/repack.mjs` to append content hashes and produce a new ZIP.

## License gate

This package embeds SingleFile code licensed under AGPL-3.0-or-later. It is an internal prototype and must not be published or externally distributed until the project chooses an AGPL-compatible release model or obtains a commercial license.

The unpacked build also includes `PRIVACY.md`, `SBOM.spdx.json`, `SOURCE_AND_LICENSE.md` and bundled license texts. These are review materials, not authorization to distribute.

## Loaded-extension E2E

The persistent-context runner exercises the real MV3 service worker, `activeTab` grant, capture, review gate, Save dialog, Chrome download state and ZIP contents. It requires an unbranded Chromium executable because current branded Chrome builds ignore command-line sideload flags.

```bash
PAGE_EXPORT_CHROMIUM_EXECUTABLE=/absolute/path/to/Chromium \
  corepack pnpm --filter @workbench/page-export-extension test:extension-e2e
```

When the runner prints `awaiting_action_click`, click **Workbench Editable Snapshot** in Chromium's extensions toolbar menu. When it prints `awaiting_save_dialog`, save to the suggested temporary path. All browser profile and download data stays under a fresh system temporary directory, whose path is printed with the final result.

CI or locked-screen diagnostics may set `PAGE_EXPORT_E2E_AUTOMATE_BROWSER_SHELL=1`. The runner then modifies only its temporary extension copy: it grants the fixture's scheme-and-host permission so Chrome permits `captureVisibleTab` without an action click, and suppresses the Save As dialog. This proves the MV3 capture/review/download and original-screenshot fidelity chain but does not count as evidence for the production permission prompt or Save dialog gestures.

Set `PAGE_EXPORT_E2E_PAYLOAD_MB=50 PAGE_EXPORT_E2E_CANCEL_ONCE=1` to inject a 50MB DOM payload, cancel the first transfer, assert offscreen cleanup, and repeat the complete capture in the same browser session.

Set `PAGE_EXPORT_E2E_PAYLOAD_MB=10 PAGE_EXPORT_E2E_RESTART_WORKER=1` to stop the MV3 Service Worker during capture and assert the explicit retry-required state, offscreen cleanup and absence of a partial download. Cancellation and worker-restart modes are intentionally separate scenarios.

Set `PAGE_EXPORT_E2E_SIDE_PANEL=1` together with browser-shell automation to exercise the Side Panel against two fixture tabs. The temporary copy additionally pregrants `tabs`; the test proves an empty initial selection, one explicit selection, and the activation prompt without an automatic tab switch or download.

Set `PAGE_EXPORT_E2E_REPACK=1` to unzip the downloaded bundle, make a workspace-only edit, start its emitted offline preview (which serves workspace but not faithful), run `runner/repack.mjs`, and verify that the faithful baseline remains byte-identical while workspace history and the repacked ZIP change.

The fixture also loads same-origin CSS, JavaScript, an external source map/source, a lazy image and an iframe. A passing normal run confirms that these inputs were live before capture and that the generated ZIP contains hashed image assets, recovered source material and an independent frame workspace.
