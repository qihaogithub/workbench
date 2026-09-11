import { existsSync, statSync } from "node:fs";
import path from "node:path";

export class WorkspaceRootNotFoundError extends Error {
  constructor(startPath: string) {
    super(`Could not find pnpm-workspace.yaml from ${startPath}`);
    this.name = "WorkspaceRootNotFoundError";
  }
}

function asDirectory(startPath: string): string {
  const resolved = path.resolve(startPath);
  try {
    return statSync(resolved).isFile() ? path.dirname(resolved) : resolved;
  } catch {
    return resolved;
  }
}

export function findWorkspaceRoot(startPath: string = process.cwd()): string {
  let current = asDirectory(startPath);

  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;

    const parent = path.dirname(current);
    if (parent === current) {
      throw new WorkspaceRootNotFoundError(startPath);
    }
    current = parent;
  }
}

export interface ResolveDataDirOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly dataDir?: string;
}

/**
 * Resolves DATA_DIR relative to the workspace root, so callers do not depend
 * on the process working directory or compiled __dirname.
 */
export function resolveDataDir(options: ResolveDataDirOptions = {}): string {
  const explicit =
    options.dataDir ?? (options.env ?? process.env).DATA_DIR;

  if (explicit !== undefined && explicit.length > 0) {
    if (path.isAbsolute(explicit)) return path.normalize(explicit);
    const root = findWorkspaceRoot(options.cwd ?? process.cwd());
    return path.resolve(root, explicit);
  }
  const root = findWorkspaceRoot(options.cwd ?? process.cwd());
  return path.join(root, "data");
}
