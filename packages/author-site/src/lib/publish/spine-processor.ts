import fs from "node:fs";
import path from "node:path";
import type { PublishContext } from "./types";

export interface SpineProcessResult { assetIds: string[]; errors: Array<{ assetId: string; reason: string }> }

function collectRefs(workspacePath: string): Set<string> {
  const refs = new Set<string>();
  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/config(?:\.values|\.schema)?\.json$/.test(entry.name) || entry.name === "project.config.values.json") {
        try {
          const text = fs.readFileSync(file, "utf8");
          for (const match of text.matchAll(/"assetId"\s*:\s*"(spine_[a-f0-9]{64})"/g)) refs.add(match[1]);
        } catch { /* malformed optional config is handled by the page compiler */ }
      }
    }
  };
  visit(workspacePath);
  return refs;
}

/** Copies referenced content-addressed Spine assets into a publication. */
export function processSpineAssetsForPublish(context: PublishContext): SpineProcessResult {
  const result: SpineProcessResult = { assetIds: [], errors: [] };
  const sourceRoot = path.join(context.workspacePath, "assets", "animations");
  const targetRoot = path.join(context.publishDir, "assets", "animations");
  for (const assetId of collectRefs(context.workspacePath)) {
    const source = path.join(sourceRoot, assetId);
    const target = path.join(targetRoot, assetId);
    const root = path.resolve(sourceRoot);
    if (!path.resolve(source).startsWith(`${root}${path.sep}`) || !fs.existsSync(path.join(source, "manifest.json"))) {
      result.errors.push({ assetId, reason: "MANIFEST_NOT_FOUND" });
      continue;
    }
    try {
      fs.mkdirSync(targetRoot, { recursive: true });
      fs.cpSync(source, target, { recursive: true, errorOnExist: false });
      result.assetIds.push(assetId);
    } catch (error) {
      result.errors.push({ assetId, reason: error instanceof Error ? error.message : "COPY_FAILED" });
    }
  }
  return result;
}
