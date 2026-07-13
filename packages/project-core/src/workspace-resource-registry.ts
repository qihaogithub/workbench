import crypto from "node:crypto";

import { validateSketchSceneDocument } from "@workbench/sketch-core";

export type WorkspaceResourceKind =
  | "page-code"
  | "page-prototype-html"
  | "page-prototype-css"
  | "page-prototype-meta"
  | "page-schema"
  | "page-sketch-scene"
  | "page-sketch-meta"
  | "project-schema"
  | "project-config-values"
  | "workspace-tree"
  | "canvas-layout"
  | "knowledge-document"
  | "knowledge-manifest"
  | "asset";

export interface WorkspaceResourceDescriptor {
  kind: WorkspaceResourceKind;
  text: boolean;
  maxBytes: number;
  validation: "text" | "json-object" | "workspace-tree" | "sketch-scene" | "binary";
}

export interface WorkspaceRootManifest {
  rootHash: string;
  resourceHashes: Record<string, string>;
  resources: Array<{
    path: string;
    kind: WorkspaceResourceKind;
    hash: string;
    size: number;
  }>;
}

const TEXT_MAX_BYTES = 2 * 1024 * 1024;

export function normalizeWorkspaceResourcePath(resourcePath: string): string | null {
  const normalized = resourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0") || normalized.split("/").includes("..")) return null;
  return normalized;
}

export function hashWorkspaceContent(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** Centralized resource policy for every durable active-Workspace write. */
export class WorkspaceResourceRegistry {
  describe(resourcePath: string): WorkspaceResourceDescriptor | null {
    const normalized = normalizeWorkspaceResourcePath(resourcePath);
    if (!normalized) return null;
    if (/^demos\/[^/]+\/index\.tsx$/.test(normalized)) return { kind: "page-code", text: true, maxBytes: TEXT_MAX_BYTES, validation: "text" };
    if (/^demos\/[^/]+\/prototype\.html$/.test(normalized)) return { kind: "page-prototype-html", text: true, maxBytes: TEXT_MAX_BYTES, validation: "text" };
    if (/^demos\/[^/]+\/prototype\.css$/.test(normalized)) return { kind: "page-prototype-css", text: true, maxBytes: TEXT_MAX_BYTES, validation: "text" };
    if (/^demos\/[^/]+\/prototype\.meta\.json$/.test(normalized)) return { kind: "page-prototype-meta", text: true, maxBytes: TEXT_MAX_BYTES, validation: "json-object" };
    if (/^demos\/[^/]+\/config\.schema\.json$/.test(normalized)) return { kind: "page-schema", text: true, maxBytes: TEXT_MAX_BYTES, validation: "json-object" };
    if (/^demos\/[^/]+\/sketch\.scene\.json$/.test(normalized)) return { kind: "page-sketch-scene", text: true, maxBytes: TEXT_MAX_BYTES, validation: "sketch-scene" };
    if (/^demos\/[^/]+\/sketch\.meta\.json$/.test(normalized)) return { kind: "page-sketch-meta", text: true, maxBytes: TEXT_MAX_BYTES, validation: "json-object" };
    if (normalized === "project.config.schema.json") return { kind: "project-schema", text: true, maxBytes: TEXT_MAX_BYTES, validation: "json-object" };
    if (normalized === "project.config.values.json") return { kind: "project-config-values", text: true, maxBytes: TEXT_MAX_BYTES, validation: "json-object" };
    if (normalized === "workspace-tree.json") return { kind: "workspace-tree", text: true, maxBytes: TEXT_MAX_BYTES, validation: "workspace-tree" };
    if (normalized === ".canvas-layout.json") return { kind: "canvas-layout", text: true, maxBytes: TEXT_MAX_BYTES, validation: "json-object" };
    if (/^knowledge\/[^/]+\.(md|markdown|mdown)$/i.test(normalized)) return { kind: "knowledge-document", text: true, maxBytes: TEXT_MAX_BYTES, validation: "text" };
    if (normalized === "knowledge/manifest.json") return { kind: "knowledge-manifest", text: true, maxBytes: TEXT_MAX_BYTES, validation: "json-object" };
    if (/^assets\/.+/.test(normalized)) return { kind: "asset", text: false, maxBytes: 20 * 1024 * 1024, validation: "binary" };
    return null;
  }

  assertTextWrite(resourcePath: string, content: string): WorkspaceResourceDescriptor {
    const descriptor = this.describe(resourcePath);
    if (!descriptor || !descriptor.text || Buffer.byteLength(content, "utf-8") > descriptor.maxBytes) {
      throw new Error("WORKSPACE_INVALID_OPERATION");
    }
    this.validateTextContent(descriptor, content);
    return descriptor;
  }

  assertBinaryWrite(resourcePath: string, content: Buffer): WorkspaceResourceDescriptor {
    const descriptor = this.describe(resourcePath);
    if (!descriptor || descriptor.text || content.length === 0 || content.length > descriptor.maxBytes) {
      throw new Error("WORKSPACE_INVALID_OPERATION");
    }
    return descriptor;
  }

  createRootManifest(resources: Record<string, string | Buffer>): WorkspaceRootManifest {
    const entries = Object.entries(resources).map(([resourcePath, content]) => {
      const normalized = normalizeWorkspaceResourcePath(resourcePath);
      const descriptor = normalized ? this.describe(normalized) : null;
      if (!normalized || !descriptor) throw new Error("WORKSPACE_INVALID_OPERATION");
      if (descriptor.text) {
        this.assertTextWrite(normalized, Buffer.isBuffer(content) ? content.toString("utf-8") : content);
      } else {
        if (!Buffer.isBuffer(content)) throw new Error("WORKSPACE_INVALID_OPERATION");
        this.assertBinaryWrite(normalized, content);
      }
      const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
      return {
        path: normalized,
        kind: descriptor.kind,
        hash: hashWorkspaceContent(bytes),
        size: bytes.length,
      };
    }).sort((a, b) => a.path.localeCompare(b.path));
    const resourceHashes = Object.fromEntries(entries.map((entry) => [entry.path, entry.hash]));
    const rootHash = hashWorkspaceContent(entries.map((entry) => `${entry.path}:${entry.hash}`).join("\n"));
    return { rootHash, resourceHashes, resources: entries };
  }

  private validateTextContent(descriptor: WorkspaceResourceDescriptor, content: string): void {
    if (descriptor.validation === "text") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("WORKSPACE_INVALID_OPERATION");
    }
    if (descriptor.validation === "sketch-scene") {
      if (!validateSketchSceneDocument(parsed).valid) throw new Error("WORKSPACE_INVALID_OPERATION");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("WORKSPACE_INVALID_OPERATION");
    }
    if (descriptor.validation === "workspace-tree") {
      const tree = parsed as { pages?: unknown; folders?: unknown };
      if (!Array.isArray(tree.pages) || !Array.isArray(tree.folders)) {
        throw new Error("WORKSPACE_INVALID_OPERATION");
      }
    }
  }
}

export function createWorkspaceResourceRegistry(): WorkspaceResourceRegistry {
  return new WorkspaceResourceRegistry();
}
