import { resolveDataDir } from "@workbench/runtime-config/paths";

/** Canonical Agent Service data root; environment loading happens in bootstrap-env. */
export function getDataDir(cwd: string = process.cwd()): string {
  return resolveDataDir({ cwd });
}
