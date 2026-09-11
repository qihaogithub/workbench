import fs from "node:fs";
import path from "node:path";
import {
  decodeMarkdownReferenceUri,
  type InventoryEvidenceRef,
  type InventoryGenerationJobStatus,
} from "@workbench/shared";
import { WorkspaceMutationAuthority } from "../workspace/workspace-mutation-authority";
import { getDefaultDataDir } from "../collab/workspace-file-persistence";

const MAX_EVIDENCE_BYTES = 8 * 1024;

export class InventoryEvidenceError extends Error {
  constructor(
    public readonly code: "STALE_EVIDENCE" | "INVALID_EVIDENCE" | "AUTHORITY_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "InventoryEvidenceError";
  }
}

export interface InventoryEvidenceJobIdentity {
  projectId: string;
  workspaceId: string;
  generationId: number;
  status?: InventoryGenerationJobStatus;
}

export class InventoryEvidenceReader {
  private readonly authority: WorkspaceMutationAuthority;

  constructor(private readonly dataDir = getDefaultDataDir()) {
    this.authority = new WorkspaceMutationAuthority({
      dataDir,
      resolveWorkspacePath: (workspaceId) => findWorkspacePath(dataDir, workspaceId),
    });
  }

  async read(reference: InventoryEvidenceRef, job: InventoryEvidenceJobIdentity): Promise<string> {
    const target = decodeMarkdownReferenceUri(reference.sourceUri);
    if (!target || target.projectId !== job.projectId) {
      throw new InventoryEvidenceError("INVALID_EVIDENCE", "清单证据引用不属于当前项目");
    }

    let snapshot;
    try {
      snapshot = await this.authority.getSnapshot(job.projectId, job.workspaceId);
    } catch {
      throw new InventoryEvidenceError("AUTHORITY_UNAVAILABLE", "Workspace Authority 不可用");
    }

    const relativePath = evidencePath(target, reference);
    if (relativePath === "__project_metadata__") {
      if (reference.contentHash !== snapshot.state.rootHash) {
        throw new InventoryEvidenceError("STALE_EVIDENCE", "Workspace Authority 版本已变化");
      }
      return JSON.stringify({
        projectId: job.projectId,
        workspaceId: job.workspaceId,
        revision: snapshot.state.revision,
        rootHash: snapshot.state.rootHash,
        resourceCount: Object.keys(snapshot.state.resourceHashes).length,
      });
    }

    const content = snapshot.resources[relativePath];
    const actualHash = snapshot.state.resourceHashes[relativePath];
    if (content === undefined || !actualHash) {
      throw new InventoryEvidenceError("INVALID_EVIDENCE", "清单证据来源不存在");
    }
    if (actualHash !== reference.contentHash) {
      throw new InventoryEvidenceError("STALE_EVIDENCE", "清单证据内容已变化");
    }
    if (Buffer.byteLength(content, "utf8") > MAX_EVIDENCE_BYTES) {
      throw new InventoryEvidenceError("INVALID_EVIDENCE", "清单证据超出大小限制");
    }
    return content;
  }
}

function evidencePath(
  target: NonNullable<ReturnType<typeof decodeMarkdownReferenceUri>>,
  reference: InventoryEvidenceRef,
): string {
  if (target.kind === "project" && reference.sourceKind === "project-metadata" && reference.selector === "project-metadata") {
    return "__project_metadata__";
  }
  if (target.kind === "page") {
    if (reference.sourceKind === "page-schema" && reference.selector === "schema") return `demos/${target.pageId}/config.schema.json`;
    if (reference.sourceKind === "page-requirements" && reference.selector === "document") return `demos/${target.pageId}/requirements.md`;
    if (reference.sourceKind === "page-convention" && reference.selector === "document") return `demos/${target.pageId}/convention.md`;
  }
  throw new InventoryEvidenceError("INVALID_EVIDENCE", "清单证据类型或选择器不受支持");
}

function findWorkspacePath(dataDir: string, workspaceId: string): string | null {
  const root = path.join(dataDir, "workspaces");
  if (!fs.existsSync(root)) return null;
  const visit = (directory: string, depth: number): string | null => {
    if (depth > 5) return null;
    const direct = path.join(directory, workspaceId);
    if (fs.existsSync(path.join(direct, ".workspace.json"))) return direct;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const candidate = path.join(directory, entry.name);
      const metadataPath = path.join(candidate, ".workspace.json");
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as { workspaceId?: unknown };
        if (metadata.workspaceId === workspaceId) return candidate;
      } catch {
        // Continue searching nested project/workspace directories.
      }
      const nested = visit(candidate, depth + 1);
      if (nested) return nested;
    }
    return null;
  };
  return visit(root, 0);
}
