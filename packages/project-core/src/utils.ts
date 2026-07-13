import fs from "node:fs";
import path from "node:path";

import { createDefaultSketchScene, type SketchSceneDocument } from "@workbench/sketch-core";
import type {
  DemoPageMeta,
  DemoPageRuntimeType,
  Project,
} from "@workbench/shared/contracts";

import { DEFAULT_PROJECT_CATEGORY } from "./constants.js";
import type { ProjectAdminResult } from "./types.js";

export function normalizeProjectCategory(category?: string): string {
  const normalized = category?.trim();
  return normalized || DEFAULT_PROJECT_CATEGORY;
}

export function normalizeProjectAuthoringPreferences(
  preferences?: Project["authoringPreferences"],
): Project["authoringPreferences"] | undefined {
  const sketchEditorEngine = preferences?.sketchEditorEngine;
  if (sketchEditorEngine === "native") {
    return { sketchEditorEngine };
  }
  return undefined;
}

export function nowId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function safeId(id: string, label: string): string {
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) {
    throw new Error(`INVALID_${label.toUpperCase()}_ID`);
  }
  return id;
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function resolvePageRuntimeType(page?: Pick<DemoPageMeta, "runtimeType"> | null): DemoPageRuntimeType {
  if (page?.runtimeType === "prototype-html-css") return "prototype-html-css";
  if (page?.runtimeType === "sketch-scene") return "sketch-scene";
  return "high-fidelity-react";
}

export function createDefaultSketchSceneText(): string {
  return JSON.stringify(createDefaultSketchScene(), null, 2);
}

export function parseSketchSceneText(text: string): SketchSceneDocument | null {
  try {
    return JSON.parse(text) as SketchSceneDocument;
  } catch {
    return null;
  }
}

export function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

export function copyWorkspace(source: string, target: string): void {
  fs.cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path.relative(source, sourcePath);
      if (!relative) return true;
      const segments = relative.split(path.sep);
      return !segments.some((segment) =>
        ["node_modules", ".next", ".workbench", ".git"].includes(segment),
      );
    },
  });
}

export function isWorkspaceMetadataPath(filePath: string): boolean {
  return [".workspace.json", ".session.json"].includes(path.basename(filePath));
}

export function copyWorkspaceWithoutRuntimeMetadata(source: string, target: string): void {
  fs.cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path.relative(source, sourcePath);
      if (!relative) return true;
      const segments = relative.split(path.sep);
      if (segments.some((segment) =>
        ["node_modules", ".next", ".workbench", ".git"].includes(segment),
      )) {
        return false;
      }
      return !isWorkspaceMetadataPath(relative);
    },
  });
}

export function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(dir, entry.name);
    count += entry.isDirectory() ? countFiles(entryPath) : 1;
  }
  return count;
}

export function generatePageSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20)
    .replace(/-$/, "");
  return slug || "page";
}

export function isValidRouteKey(routeKey: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(routeKey);
}

export function makeUniqueRouteKey(base: string, used: Set<string>): string {
  const normalizedBase = isValidRouteKey(base) ? base : generatePageSlug(base);
  let candidate = normalizedBase || "page";
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${normalizedBase || "page"}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function normalizePagesRouteKeys(pages: DemoPageMeta[]): DemoPageMeta[] {
  const used = new Set<string>();
  return pages.map((page) => {
    const current = typeof page.routeKey === "string" ? page.routeKey.trim() : "";
    if (current && isValidRouteKey(current) && !used.has(current)) {
      used.add(current);
      return page;
    }
    return {
      ...page,
      routeKey: makeUniqueRouteKey(current || page.name || page.id, used),
    };
  });
}

export function sortPages(pages: DemoPageMeta[]): DemoPageMeta[] {
  return [...pages].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

export function ok<T>(
  data: T,
  extras: Omit<ProjectAdminResult<T>, "ok" | "data"> = {},
): ProjectAdminResult<T> {
  return { ok: true, data, ...extras };
}

export function fail<T>(
  code: string,
  message: string,
  extras: Omit<ProjectAdminResult<T>, "ok" | "error"> = {},
): ProjectAdminResult<T> {
  return {
    ok: false,
    error: { code, message, recoverable: true },
    ...extras,
  };
}
