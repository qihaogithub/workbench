import { optimizeStoredImages } from "../src/lib/image-store";

async function main() {
  const report = await optimizeStoredImages({
    dryRun: process.argv.includes("--dry-run"),
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`image-store optimisation failed: ${message}\n`);
  process.exitCode = 1;
});
