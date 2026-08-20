import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const rootEnvFile = fileURLToPath(new URL("../../../.env", import.meta.url));

if (existsSync(rootEnvFile)) {
  loadEnvFile(rootEnvFile);
}

await import("next/dist/bin/next");
