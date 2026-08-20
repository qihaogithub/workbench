import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, cp, mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const executablePath = process.env.PAGE_EXPORT_CHROMIUM_EXECUTABLE;
const fixtureUrl = process.env.PAGE_EXPORT_FIXTURE_URL ?? "http://127.0.0.1:4177/capture-page.html";
const automateBrowserShell = process.env.PAGE_EXPORT_E2E_AUTOMATE_BROWSER_SHELL === "1";
const payloadMegabytes = Number(process.env.PAGE_EXPORT_E2E_PAYLOAD_MB ?? "0");
const cancelOnce = process.env.PAGE_EXPORT_E2E_CANCEL_ONCE === "1";
const restartWorker = process.env.PAGE_EXPORT_E2E_RESTART_WORKER === "1";
const sidePanelSmoke = process.env.PAGE_EXPORT_E2E_SIDE_PANEL === "1";
const repackWorkspace = process.env.PAGE_EXPORT_E2E_REPACK === "1";
const sourceExtensionPath = resolve("dist");
const execFileAsync = promisify(execFile);

if (!executablePath) {
  throw new Error("PAGE_EXPORT_CHROMIUM_EXECUTABLE must point to an unbranded Chromium executable that supports --load-extension");
}
if (!Number.isInteger(payloadMegabytes) || payloadMegabytes < 0 || payloadMegabytes > 64) {
  throw new Error("PAGE_EXPORT_E2E_PAYLOAD_MB must be an integer between 0 and 64");
}
if (cancelOnce && restartWorker) throw new Error("Cancellation and service-worker restart are separate E2E scenarios");

await access(executablePath);
await access(join(sourceExtensionPath, "manifest.json"));

const runRoot = await mkdtemp(join(tmpdir(), "page-export-extension-e2e-"));
const extensionPath = join(runRoot, "extension");
const userDataDir = join(runRoot, "profile");
const downloadDir = join(runRoot, "downloads");
await cp(sourceExtensionPath, extensionPath, { recursive: true });
await mkdir(downloadDir);
if (automateBrowserShell) {
  const manifestPath = join(extensionPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  // This temporary copy grants only the fixture's exact origin. It substitutes
  // for the toolbar gesture and optional permission prompt that automation
  // cannot reliably operate, while still exercising exact-origin source fetch.
  const fixturePermission = new URL(fixtureUrl);
  manifest.host_permissions = [`${fixturePermission.protocol}//${fixturePermission.hostname}/*`];
  if (sidePanelSmoke) manifest.permissions = [...new Set([...manifest.permissions, "tabs"])];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const backgroundPath = join(extensionPath, "background", "background.js");
  const backgroundSource = await readFile(backgroundPath, "utf8");
  const saveAsMarker = "saveAs: true";
  assert.equal(backgroundSource.split(saveAsMarker).length, 2, "temporary build must contain exactly one Save As marker");
  await writeFile(backgroundPath, backgroundSource.replace(saveAsMarker, "saveAs: false"));
}

function emit(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ event, at: new Date().toISOString(), ...fields })}\n`);
}

async function eventually(action, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    try {
      lastValue = await action();
      if (predicate(lastValue)) return lastValue;
    } catch (error) {
      lastValue = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`${label} timed out; last value: ${lastValue instanceof Error ? lastValue.message : JSON.stringify(lastValue)}`);
}

async function startOfflinePreview(extractedRoot) {
  const preview = spawn(process.execPath, [join(extractedRoot, "runner", "serve.mjs")], {
    cwd: extractedRoot,
    env: { ...process.env, SNAPSHOT_NETWORK: "offline" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const url = await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => reject(new Error(`offline preview did not report its URL: ${output}`)), 10_000);
    preview.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
      if (match) { clearTimeout(timeout); resolvePromise(match[0]); }
    });
    preview.stderr.on("data", (chunk) => { output += chunk.toString(); });
    preview.on("error", (error) => { clearTimeout(timeout); reject(error); });
    preview.on("exit", (code) => {
      if (!/http:\/\/127\.0\.0\.1:\d+/.test(output)) {
        clearTimeout(timeout);
        reject(new Error(`offline preview exited before becoming ready (${code}): ${output}`));
      }
    });
  });
  return { preview, url };
}

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath,
  headless: false,
  acceptDownloads: true,
  downloadsPath: downloadDir,
  viewport: null,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--window-size=1280,900",
  ],
});

let closed = false;
async function close() {
  if (closed) return;
  closed = true;
  await context.close();
}
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());

try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
  const extensionId = new URL(worker.url()).host;
  const page = context.pages()[0];
  await page.goto(fixtureUrl, { waitUntil: "load" });
  if (payloadMegabytes) {
    await page.evaluate((megabytes) => {
      const payload = document.createElement("pre");
      payload.id = "extension-e2e-payload";
      payload.textContent = "x".repeat(megabytes * 1024 * 1024);
      document.body.append(payload);
    }, payloadMegabytes);
  }
  const controlPage = await context.newPage();
  await controlPage.goto(`chrome-extension://${extensionId}/ui/popup.html`, { waitUntil: "load" });
  await page.bringToFront();

  const fixtureState = await page.evaluate(() => ({
    input: document.querySelector("#current-value")?.value,
    loaded: document.body.dataset.loaded,
    shadow: document.querySelector("#shadow-host")?.shadowRoot?.textContent,
    frame: document.querySelector("iframe")?.contentDocument?.querySelector("#frame-state")?.textContent,
    canvasPixel: Array.from(document.querySelector("canvas")?.getContext("2d")?.getImageData(10, 10, 1, 1).data ?? []),
    externalScript: document.documentElement.dataset.externalScript,
    externalImageLoaded: document.querySelector("#external-image")?.complete,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
  }));
  assert.equal(fixtureState.input, "runtime-value");
  assert.equal(fixtureState.loaded, "true");
  assert.match(fixtureState.shadow ?? "", /shadow preserved/);
  assert.equal(fixtureState.frame, "frame preserved");
  assert.equal(fixtureState.canvasPixel[3], 255);
  assert.equal(fixtureState.externalScript, "loaded");
  assert.equal(fixtureState.externalImageLoaded, true);
  assert.equal(fixtureState.backgroundColor, "rgb(246, 248, 252)");

  const [tab] = await worker.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }));
  assert.equal(typeof tab.id, "number");

  if (automateBrowserShell) {
    const fixturePermission = new URL(fixtureUrl);
    const originPattern = `${fixturePermission.protocol}//${fixturePermission.hostname}/*`;
    assert.equal(
      await worker.evaluate((origins) => chrome.permissions.contains({ origins }), [originPattern]),
      true,
      "temporary fixture host permission must satisfy Chrome's exact match-pattern check",
    );
    emit("browser_shell_overlay", {
      extensionId,
      fixtureUrl,
      limitation: "The temporary manifest grants only the fixture origin for captureVisibleTab and suppresses Save As; production files are unchanged.",
    });
  } else {
    emit("awaiting_action_click", {
      extensionId,
      fixtureUrl,
      instruction: "Click Workbench Editable Snapshot from Chromium's extensions toolbar menu.",
    });

    await eventually(
      () => worker.evaluate(async (tabId) => {
        try {
          await chrome.scripting.executeScript({ target: { tabId }, func: () => true });
          return true;
        } catch {
          return false;
        }
      }, tab.id),
      Boolean,
      120_000,
      "activeTab grant",
    );
    emit("active_tab_granted");
  }
  const grantedTab = await worker.evaluate((tabId) => chrome.tabs.get(tabId), tab.id);
  assert.equal(grantedTab.url, fixtureUrl);

  const downloadsBeforeReview = await worker.evaluate(() => chrome.downloads.search({}));
  assert.equal(downloadsBeforeReview.length, 0, "fresh E2E profile must not contain downloads before review");

  captureFlow: {
  const captureRequest = {
    target: "background",
    type: "START_CAPTURE",
    routeKey: "/capture-page",
    sourceProjectKey: "extension-e2e",
    pageStateNote: `runtime input, open details, Shadow DOM, canvas and srcdoc iframe prepared; payload=${payloadMegabytes}MB`,
  };
  await controlPage.locator("#route-key").fill(captureRequest.routeKey);
  await controlPage.locator("#project-key").fill(captureRequest.sourceProjectKey);
  await controlPage.locator("#page-note").fill(captureRequest.pageStateNote);
  if (!automateBrowserShell) {
    emit("awaiting_origin_permission", {
      origin: new URL(fixtureUrl).origin,
      instruction: "Approve or deny the optional exact-origin permission requested after submitting the Popup form.",
    });
  }
  await controlPage.locator("#capture").click();
  const startedState = await eventually(
    () => controlPage.evaluate(() => chrome.runtime.sendMessage({ target: "background", type: "GET_STATE" })),
    (current) => current.phase !== "idle",
    30_000,
    "Popup capture submission",
  );
  assert.notEqual(startedState.phase, "failed", startedState.error);

  if (restartWorker) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("ServiceWorker.enable");
    await cdp.send("ServiceWorker.stopAllWorkers");
    await cdp.detach();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 11_000));
    const failedState = await eventually(
      () => controlPage.evaluate(() => chrome.runtime.sendMessage({ target: "background", type: "GET_STATE" })),
      (current) => current.phase === "failed",
      30_000,
      "service-worker restart recovery state",
    );
    assert.equal(failedState.error, "CAPTURE_STATE_LOST_RETRY_REQUIRED");
    await eventually(
      async () => {
        const currentWorker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker", { timeout: 5_000 });
        return currentWorker.evaluate(() => chrome.offscreen.hasDocument());
      },
      (hasDocument) => hasDocument === false,
      30_000,
      "offscreen cleanup after service-worker restart",
    );
    assert.equal((await (context.serviceWorkers()[0] ?? worker).evaluate(() => chrome.downloads.search({}))).length, 0);
    const failedHistory = await controlPage.evaluate(async () => (await chrome.storage.local.get("editableSnapshotHistory")).editableSnapshotHistory ?? []);
    assert.equal(failedHistory[0]?.captureId, failedState.captureId);
    assert.equal(failedHistory[0]?.status, "failed");
    emit("service_worker_recovery_passed", { captureId: failedState.captureId, error: failedState.error, payloadMegabytes });
    break captureFlow;
  }

  if (cancelOnce) {
    const cancelResponse = await controlPage.evaluate(() => chrome.runtime.sendMessage({ target: "background", type: "CANCEL_CAPTURE" }));
    assert.equal(cancelResponse?.error, undefined, cancelResponse?.error);
    const cancelledState = await eventually(
      () => controlPage.evaluate(() => chrome.runtime.sendMessage({ target: "background", type: "GET_STATE" })),
      (current) => current.phase === "cancelled" || current.phase === "failed",
      30_000,
      "cancelled state",
    );
    assert.equal(cancelledState.phase, "cancelled", cancelledState.error);
    await eventually(
      () => worker.evaluate(() => chrome.offscreen.hasDocument()),
      (hasDocument) => hasDocument === false,
      30_000,
      "offscreen cleanup after cancellation",
    );
    assert.equal((await worker.evaluate(() => chrome.downloads.search({}))).length, 0);
    emit("cancel_cleanup_passed", { captureId: cancelledState.captureId, payloadMegabytes });
    const retryResponse = await controlPage.evaluate((request) => chrome.runtime.sendMessage(request), captureRequest);
    assert.equal(retryResponse?.error, undefined, retryResponse?.error);
  }

  let priorStatus;
  const reviewState = await eventually(
    async () => {
      const current = await controlPage.evaluate(() => chrome.runtime.sendMessage({ target: "background", type: "GET_STATE" }));
      const status = `${current.phase}:${current.message}`;
      if (status !== priorStatus) {
        priorStatus = status;
        emit("task_phase", { phase: current.phase, progress: current.progress, message: current.message, error: current.error });
      }
      return current;
    },
    (current) => current.phase === "review_required" || current.phase === "failed",
    180_000,
    "review state",
  );
  assert.notEqual(reviewState.phase, "failed", reviewState.error);
  assert.equal(reviewState.review?.executableContent, true);
  assert.ok(reviewState.captureId);
  assert.match(reviewState.filename ?? "", /^editable-snapshot-.*\.zip$/);
  assert.equal((await worker.evaluate(() => chrome.downloads.search({}))).length, 0, "download must not start before approval");
  emit("review_required", { captureId: reviewState.captureId, filename: reviewState.filename, review: reviewState.review });

  await controlPage.locator("#approve-download").click();
  if (!automateBrowserShell) {
    emit("awaiting_save_dialog", {
      suggestedPath: join(downloadDir, reviewState.filename),
      instruction: "Choose the suggested /tmp path in Chromium's Save dialog and confirm.",
    });
  }

  const readyState = await eventually(
    () => controlPage.evaluate(() => chrome.runtime.sendMessage({ target: "background", type: "GET_STATE" })),
    (current) => current.phase === "ready" || current.phase === "failed",
    120_000,
    "approved download",
  );
  assert.notEqual(readyState.phase, "failed", readyState.error);
  assert.equal(readyState.captureId, reviewState.captureId);

  const downloadItem = await eventually(
    async () => (await worker.evaluate(() => chrome.downloads.search({ orderBy: ["-startTime"], limit: 10 })))
      .find((item) => item.state === "complete" || item.state === "interrupted"),
    (item) => item?.state === "complete" || item?.state === "interrupted",
    120_000,
    "ZIP download completion",
  );
  assert.equal(downloadItem.state, "complete", downloadItem.error);
  const [downloadedName] = await eventually(
    () => readdir(downloadDir),
    (names) => names.length === 1,
    30_000,
    "intercepted download file",
  );
  const downloadedPath = join(downloadDir, downloadedName);
  const downloadedStat = await stat(downloadedPath);
  assert.ok(downloadedStat.size > 0);
  const zipBytes = await readFile(downloadedPath);
  for (const expectedName of [
    "bundle.json",
    "faithful/snapshot.html",
    "workspace/index.html",
    "workspace/assets/images/",
    "workspace/frames/frame-001/index.html",
    "sources/original.ts",
    "reports/capture-report.json",
    "reports/fidelity-report.json",
  ]) {
    assert.ok(zipBytes.includes(Buffer.from(expectedName)), `ZIP directory does not contain ${expectedName}`);
  }

  const history = await worker.evaluate(async () => (await chrome.storage.local.get("editableSnapshotHistory")).editableSnapshotHistory ?? []);
  assert.equal(history[0]?.captureId, reviewState.captureId);
  assert.equal(history[0]?.status, "ready");
  assert.equal(history[0]?.filename, reviewState.filename);

  if (repackWorkspace) {
    const extractedRoot = join(runRoot, "editable-workspace");
    const repackedZip = join(runRoot, "editable-workspace-repacked.zip");
    await mkdir(extractedRoot);
    await execFileAsync("unzip", ["-q", downloadedPath, "-d", extractedRoot]);
    const workspacePath = join(extractedRoot, "workspace", "index.html");
    const faithfulPath = join(extractedRoot, "faithful", "snapshot.html");
    const faithfulBefore = await readFile(faithfulPath);
    await writeFile(workspacePath, `${await readFile(workspacePath, "utf8")}\n<!-- extension-e2e workspace edit -->\n`);
    const { preview, url: previewUrl } = await startOfflinePreview(extractedRoot);
    try {
      const [workspaceResponse, faithfulResponse] = await Promise.all([
        fetch(previewUrl),
        fetch(`${previewUrl}/%2e%2e/faithful/snapshot.html`),
      ]);
      assert.equal(workspaceResponse.status, 200, "offline preview must serve workspace index");
      assert.match(await workspaceResponse.text(), /extension-e2e workspace edit/);
      assert.equal(faithfulResponse.status, 404, "offline preview must not expose faithful baseline outside workspace");
    } finally {
      preview.kill();
      await new Promise((resolvePromise) => preview.once("exit", resolvePromise));
    }
    await execFileAsync(process.execPath, [join(extractedRoot, "runner", "repack.mjs"), repackedZip], {
      cwd: extractedRoot,
      env: { ...process.env, SNAPSHOT_CHANGE_NOTE: "Extension E2E workspace edit" },
    });
    assert.deepEqual(await readFile(faithfulPath), faithfulBefore, "repacking must not change faithful baseline bytes");
    assert.ok((await stat(repackedZip)).size > 0, "repack must produce a non-empty ZIP");
    const workspaceHistory = JSON.parse(await readFile(join(extractedRoot, "reports", "workspace-history.json"), "utf8"));
    assert.equal(workspaceHistory.entries.length, 2, "repack must append exactly one workspace history entry");
    assert.equal(workspaceHistory.entries[1]?.note, "Extension E2E workspace edit");
    assert.notEqual(
      workspaceHistory.entries[1]?.files["workspace/index.html"]?.hash,
      workspaceHistory.entries[0]?.files["workspace/index.html"]?.hash,
      "workspace edit must change its recorded content hash",
    );
    emit("workspace_repack_smoke_passed", { repackedZip, bytes: (await stat(repackedZip)).size });
  }

  if (sidePanelSmoke) {
    const queuedPage = await context.newPage();
    await queuedPage.goto(new URL("frame.html", fixtureUrl).href, { waitUntil: "load" });
    const [queuedTab] = await worker.evaluate(async (url) => (await chrome.tabs.query({ currentWindow: true })).filter((item) => item.url === url), queuedPage.url());
    assert.equal(typeof queuedTab?.id, "number", "fixture queue tab must be visible to the extension");

    const sidePanelPage = await context.newPage();
    await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, { waitUntil: "load" });
    await page.bringToFront();
    await sidePanelPage.locator("#load").click();
    await eventually(
      () => sidePanelPage.locator("input[type=checkbox]").count(),
      (count) => count >= 2,
      15_000,
      "Side Panel HTTP tab list",
    );
    assert.equal(await sidePanelPage.locator("input[type=checkbox]:checked").count(), 0, "Side Panel must not select tabs by default");
    await sidePanelPage.locator(`#tab-${queuedTab.id}`).check();
    await sidePanelPage.locator("#start").click();
    const queuedState = await eventually(
      () => controlPage.evaluate(() => chrome.runtime.sendMessage({ target: "background", type: "GET_STATE" })),
      (current) => current.phase === "batch_queued" || current.phase === "failed",
      15_000,
      "batch activation prompt",
    );
    assert.equal(queuedState.phase, "batch_queued", queuedState.error);
    assert.match(queuedState.message, /切换到选中的标签页/);
    assert.equal((await worker.evaluate(() => chrome.downloads.search({}))).length, 1, "batch queue must not create a download before user activation");
    await controlPage.evaluate(() => chrome.runtime.sendMessage({ target: "background", type: "CANCEL_CAPTURE" }));
    emit("side_panel_batch_smoke_passed", { queuedTabId: queuedTab.id, selectedCount: 1 });
    await sidePanelPage.close();
    await queuedPage.close();
  }

  emit("passed", {
    extensionId,
    captureId: reviewState.captureId,
    downloadedPath,
    bytes: downloadedStat.size,
    payloadMegabytes,
    runRoot,
    fixtureState,
    review: reviewState.review,
  });
  }
} finally {
  await close();
}
