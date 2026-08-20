import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const output = resolve(packageRoot, "dist/test-harness");

await mkdir(output, { recursive: true });
await build({
  entryPoints: [resolve(packageRoot, "tests/fixtures/fidelity-harness.ts")],
  outfile: resolve(output, "fidelity-harness.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "chrome116",
  sourcemap: true,
  alias: {
    "@workbench/editable-snapshot-core": resolve(repoRoot, "packages/editable-snapshot-core/src/index.ts"),
  },
});
await cp(resolve(packageRoot, "tests/fixtures/fidelity-harness.html"), resolve(output, "fidelity-harness.html"));
console.log(`Built fidelity browser harness at ${output}`);
