import fs from "fs";
import path from "path";

import { getDataDir } from "@/lib/fs-utils";

const modules = new Map<string, string>();
const MAX_MODULES = 200;
const MODULE_TTL_MS = 30 * 60 * 1000;

function getPreviewModulesDir(): string {
  return path.join(getDataDir(), "preview-modules");
}

function getPreviewModulePath(hash: string): string {
  return path.join(getPreviewModulesDir(), `${hash}.js`);
}

function ensurePreviewModulesDir(): void {
  fs.mkdirSync(getPreviewModulesDir(), { recursive: true });
}

function pruneFileCache(): void {
  const dir = getPreviewModulesDir();
  if (!fs.existsSync(dir)) return;

  const now = Date.now();
  const files = fs
    .readdirSync(dir)
    .filter((name) => /^[a-f0-9]{64}\.js$/u.test(name))
    .map((name) => {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const [index, file] of files.entries()) {
    if (index < MAX_MODULES && now - file.mtimeMs <= MODULE_TTL_MS) continue;
    fs.rmSync(file.filePath, { force: true });
  }
}

export function registerPreviewModule(hash: string, code: string): void {
  if (modules.has(hash)) {
    modules.delete(hash);
  }
  modules.set(hash, code);
  ensurePreviewModulesDir();
  const modulePath = getPreviewModulePath(hash);
  const tempPath = `${modulePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, code, "utf-8");
  fs.renameSync(tempPath, modulePath);
  pruneFileCache();

  while (modules.size > MAX_MODULES) {
    const firstKey = modules.keys().next().value;
    if (firstKey === undefined) break;
    modules.delete(firstKey);
  }
}

export function readPreviewModule(hash: string): string | null {
  let code = modules.get(hash);
  if (!code) {
    const modulePath = getPreviewModulePath(hash);
    if (!fs.existsSync(modulePath)) return null;
    code = fs.readFileSync(modulePath, "utf-8");
  }
  modules.delete(hash);
  modules.set(hash, code);
  return code;
}

export function isValidPreviewModuleHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/u.test(hash);
}
