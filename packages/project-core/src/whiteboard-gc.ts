import fs from "node:fs";
import path from "node:path";

import { isWhiteboardBinding, isWhiteboardDocument } from "./shared-runtime.js";

export const WHITEBOARD_GC_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface WhiteboardGarbageCollectionPlan {
  documentPaths: string[];
  assetPaths: string[];
}

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function containsAssetReference(value: unknown, assetPath: string): boolean {
  if (typeof value === "string") return value === assetPath;
  if (Array.isArray(value)) return value.some((item) => containsAssetReference(item, assetPath));
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((item) => containsAssetReference(item, assetPath));
}

function whiteboardPngHashForAttachedAsset(document: Extract<import("@workbench/shared").WhiteboardDocument, { version: 2 }>): Set<string> {
  const hashes = new Set<string>();
  for (const [nodeId, semantics] of Object.entries(document.nodeSemantics)) {
    if (!semantics.assetRef) continue;
    const node = document.scene.nodes.find((candidate) => candidate.id === nodeId);
    if (node?.type !== "image" || typeof node.src !== "string") continue;
    const match = node.src.match(/^\/?assets\/whiteboards\/([a-f0-9]{64})\.png$/);
    if (match) hashes.add(match[1]);
  }
  return hashes;
}

/**
 * Produces a deliberately conservative cleanup plan. It never removes a bound
 * document, and it only removes an orphan PNG when no current config value
 * references it. Callers choose the transactional delete mechanism.
 */
export function planWhiteboardGarbageCollection(
  workspacePath: string,
  now = Date.now(),
  graceMs = WHITEBOARD_GC_GRACE_MS,
): WhiteboardGarbageCollectionPlan {
  const whiteboardsDir = path.join(workspacePath, "whiteboards");
  const bindingsPath = path.join(whiteboardsDir, "bindings.json");
  if (fs.existsSync(whiteboardsDir) && !fs.existsSync(bindingsPath)) {
    return { documentPaths: [], assetPaths: [] };
  }
  const bindingsRaw = readJson(bindingsPath) as { bindings?: unknown } | null;
  // GC must fail closed: a missing index means no references are known yet,
  // while a present but malformed index could hide a live binding.
  if (fs.existsSync(bindingsPath) && (!Array.isArray(bindingsRaw?.bindings) || bindingsRaw.bindings.some((entry) => !isWhiteboardBinding(entry)))) {
    return { documentPaths: [], assetPaths: [] };
  }
  const bindings = Array.isArray(bindingsRaw?.bindings) ? bindingsRaw.bindings : [];
  const boundDocumentIds = new Set(bindings.map((binding) => binding.whiteboardId));
  const protectedHashes = new Set(bindings.map((binding) => binding.outputAssetHash));
  if (!fs.existsSync(whiteboardsDir)) return { documentPaths: [], assetPaths: [] };

  const documentPaths: string[] = [];
  for (const entry of fs.readdirSync(whiteboardsDir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === "bindings.json" || !entry.name.endsWith(".json")) continue;
    const relativePath = `whiteboards/${entry.name}`;
    const document = readJson(path.join(whiteboardsDir, entry.name));
    // Documents may own attached input assets even if they are not currently
    // bound. An unreadable document means those references cannot be verified,
    // so no cleanup plan is safe.
    if (!isWhiteboardDocument(document)) return { documentPaths: [], assetPaths: [] };
    if (document.version === 2) {
      for (const hash of whiteboardPngHashForAttachedAsset(document)) protectedHashes.add(hash);
    }
    if (boundDocumentIds.has(document.id)) continue;
    if (now - document.updatedAt < graceMs) continue;
    documentPaths.push(relativePath);
  }

  // Bindings normally disappear with replacement/deletion, so collect former
  // hashes from no-longer-bound documents only when their value is unreferenced.
  const configValues: unknown[] = [];
  const projectValues = readJson(path.join(workspacePath, "project.config.values.json"));
  if (projectValues) configValues.push(projectValues);
  const demosDir = path.join(workspacePath, "demos");
  if (fs.existsSync(demosDir)) {
    for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const values = readJson(path.join(demosDir, entry.name, "config.values.json"));
      if (values) configValues.push(values);
    }
  }
  // The directory is whiteboard-owned. A PNG is removable only when no live
  // binding, valid document attachment, or config value references it. This
  // also collects a crashed prior commit's orphan even if no document happens
  // to age out in the same run.
  const assetDir = path.join(workspacePath, "assets", "whiteboards");
  const assetPaths = !fs.existsSync(assetDir)
    ? []
    : fs.readdirSync(assetDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.png$/.test(entry.name))
      .map((entry) => ({
        hash: entry.name.slice(0, -4),
        path: `assets/whiteboards/${entry.name}`,
        mtimeMs: fs.statSync(path.join(assetDir, entry.name)).mtimeMs,
      }))
      .filter(({ hash, path: assetPath, mtimeMs }) => now - mtimeMs >= graceMs
        && !protectedHashes.has(hash)
        && !configValues.some((values) => containsAssetReference(values, assetPath)))
      .map(({ path: assetPath }) => assetPath);
  return { documentPaths: documentPaths.sort(), assetPaths: assetPaths.sort() };
}

export function whiteboardGcPathsToDelete(plan: WhiteboardGarbageCollectionPlan): string[] {
  return [...plan.documentPaths, ...plan.assetPaths];
}
