import path from "node:path";

import { applyWorkspaceEnv } from "@workbench/runtime-config/env";
import { findWorkspaceRoot } from "@workbench/runtime-config/paths";

let workspaceRoot = process.cwd();
try {
  workspaceRoot = findWorkspaceRoot();
} catch {
  // Bundled Docker runtimes receive their environment from the process.
}

applyWorkspaceEnv({
  rootEnvPath: path.join(workspaceRoot, ".env"),
  serviceEnvPath: path.join(workspaceRoot, "packages/screenshot-service/.env"),
});
