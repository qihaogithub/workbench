import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(packageRoot, "dist");

for (const path of [
  "manifest.json",
  "PRIVACY.md",
  "SBOM.spdx.json",
  "SOURCE_AND_LICENSE.md",
  "THIRD_PARTY_NOTICES.md",
  "LICENSE-SINGLEFILE-AGPL-3.0.txt",
  "LICENSE-HTML2CANVAS-MIT.txt",
]) {
  await access(resolve(dist, path));
}

const manifest = JSON.parse(await readFile(resolve(dist, "manifest.json"), "utf8"));
for (const forbidden of ["cookies", "history"]) {
  assert.equal(manifest.permissions.includes(forbidden), false, `manifest must not request ${forbidden}`);
}
assert.equal("host_permissions" in manifest, false, "manifest must not declare permanent host permissions");
assert.deepEqual(
  [...manifest.permissions].sort(),
  ["activeTab", "downloads", "offscreen", "scripting", "sidePanel", "storage"].sort(),
  "manifest permissions changed; review the minimum-permission contract",
);
assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);

const sbom = JSON.parse(await readFile(resolve(dist, "SBOM.spdx.json"), "utf8"));
assert.equal(sbom.spdxVersion, "SPDX-2.3");
const packages = new Map(sbom.packages.map((item) => [item.name, item]));
for (const [name, version, license] of [
  ["single-file-cli", "2.0.83", "AGPL-3.0-or-later"],
  ["single-file-core", "1.5.68", "AGPL-3.0-or-later"],
  ["html2canvas", "1.4.1", "MIT"],
]) {
  const item = packages.get(name);
  assert.ok(item, `SBOM must describe ${name}`);
  assert.equal(item.versionInfo, version);
  assert.equal(item.licenseDeclared, license);
}

const sourceNotice = await readFile(resolve(dist, "SOURCE_AND_LICENSE.md"), "utf8");
assert.match(sourceNotice, /No external distribution is authorized/);
assert.match(sourceNotice, /single-file-cli\/tree\/v2\.0\.83/);
console.log("Verified unpacked-extension privacy, permission, SBOM, and license materials.");
