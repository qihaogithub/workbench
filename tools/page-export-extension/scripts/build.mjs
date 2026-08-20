import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { hookScript, script as singleFileScript } from "single-file-cli/lib/single-file-bundle.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const dist = resolve(packageRoot, "dist");

await rm(dist, { recursive: true, force: true });
await Promise.all([
  mkdir(resolve(dist, "background"), { recursive: true }),
  mkdir(resolve(dist, "content"), { recursive: true }),
  mkdir(resolve(dist, "offscreen"), { recursive: true }),
  mkdir(resolve(dist, "ui"), { recursive: true }),
  mkdir(resolve(dist, "sidepanel"), { recursive: true }),
  mkdir(resolve(dist, "vendor"), { recursive: true }),
]);

const common = {
  bundle: true,
  platform: "browser",
  target: "chrome116",
  sourcemap: true,
  logLevel: "info",
  alias: {
    "@workbench/editable-snapshot-core": resolve(repoRoot, "packages/editable-snapshot-core/src/index.ts"),
  },
};

await Promise.all([
  build({ ...common, entryPoints: [resolve(packageRoot, "src/background/background.ts")], outfile: resolve(dist, "background/background.js"), format: "esm" }),
  build({ ...common, entryPoints: [resolve(packageRoot, "src/offscreen/offscreen.ts")], outfile: resolve(dist, "offscreen/offscreen.js"), format: "esm" }),
  build({ ...common, entryPoints: [resolve(packageRoot, "src/ui/popup.ts")], outfile: resolve(dist, "ui/popup.js"), format: "esm" }),
  build({ ...common, entryPoints: [resolve(packageRoot, "src/sidepanel/sidepanel.ts")], outfile: resolve(dist, "sidepanel/sidepanel.js"), format: "esm" }),
]);

const captureBuild = await build({
  ...common,
  entryPoints: [resolve(packageRoot, "src/content/capture.ts")],
  format: "iife",
  write: false,
  sourcemap: false,
});
const captureCode = captureBuild.outputFiles[0]?.text;
if (!captureCode) throw new Error("capture content-script build produced no JavaScript");

const singleFileGlobalMarker = "var singlefile=";
if (singleFileScript.split(singleFileGlobalMarker).length !== 2) {
  throw new Error("SingleFile bundle format changed: expected exactly one global declaration");
}
// executeScript runs this file again on retries. Reuse the initialized core so
// cancelled large captures do not retain a second copy of SingleFile's runtime.
const idempotentSingleFileScript = singleFileScript.replace(singleFileGlobalMarker, "globalThis.singlefile||=");
const idempotentHookScript = `if (!globalThis.__workbenchSingleFileHookInstalled) { globalThis.__workbenchSingleFileHookInstalled = true; ${hookScript}\n}`;

await Promise.all([
  writeFile(resolve(dist, "content/capture.js"), `${idempotentSingleFileScript}\n${captureCode}`),
  writeFile(resolve(dist, "vendor/single-file-hook.js"), idempotentHookScript),
  cp(resolve(packageRoot, "manifest.json"), resolve(dist, "manifest.json")),
  cp(resolve(packageRoot, "src/ui/popup.html"), resolve(dist, "ui/popup.html")),
  cp(resolve(packageRoot, "src/ui/popup.css"), resolve(dist, "ui/popup.css")),
  cp(resolve(packageRoot, "src/offscreen/offscreen.html"), resolve(dist, "offscreen/offscreen.html")),
  cp(resolve(packageRoot, "src/sidepanel/sidepanel.html"), resolve(dist, "sidepanel/sidepanel.html")),
  cp(resolve(packageRoot, "src/sidepanel/sidepanel.css"), resolve(dist, "sidepanel/sidepanel.css")),
  cp(resolve(packageRoot, "THIRD_PARTY_NOTICES.md"), resolve(dist, "THIRD_PARTY_NOTICES.md")),
  cp(resolve(packageRoot, "PRIVACY.md"), resolve(dist, "PRIVACY.md")),
  cp(resolve(packageRoot, "SOURCE_AND_LICENSE.md"), resolve(dist, "SOURCE_AND_LICENSE.md")),
  cp(resolve(packageRoot, "SBOM.spdx.json"), resolve(dist, "SBOM.spdx.json")),
  cp(resolve(repoRoot, "node_modules/single-file-cli/LICENSE"), resolve(dist, "LICENSE-SINGLEFILE-AGPL-3.0.txt")),
  cp(resolve(repoRoot, "node_modules/html2canvas/LICENSE"), resolve(dist, "LICENSE-HTML2CANVAS-MIT.txt")),
]);

const manifest = JSON.parse(await readFile(resolve(dist, "manifest.json"), "utf8"));
if (manifest.permissions.includes("cookies") || manifest.permissions.includes("history") || manifest.host_permissions) {
  throw new Error("manifest violates the P0 minimum-permission contract");
}
console.log(`Built unpacked extension at ${dist}`);
