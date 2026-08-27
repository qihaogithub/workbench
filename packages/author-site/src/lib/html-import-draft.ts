import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DemoPageMeta, PagePresentationProfile, WorkspaceTree } from "@workbench/shared";
import type { HtmlImportAnalysis } from "@workbench/project-core";
import {
  normalizeHtmlImport,
  validateHtmlImportPrototypeCandidate,
} from "@workbench/project-core";
import { DATA_DIR } from "./paths";
import { appendServerEditorDiagnosticEvent } from "./editor-diagnostics/store";
import {
  createHtmlSandboxExecution,
  deleteHtmlSandboxExecution,
  persistHtmlSandboxArtifact,
  readHtmlSandboxArtifact,
  resolveHtmlSandboxPublicOrigin,
} from "./html-sandbox-execution";
import { findWorkspacePath } from "./fs-utils";
import { isLiveWorkspacePath } from "./live-workspace-route-context";
import {
  commitWorkspaceMutation,
  stageWorkspaceBinary,
  WorkspaceAuthorityClientError,
} from "./workspace-authority-client";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";

export const HTML_IMPORT_DRAFT_TTL_MS = 15 * 60 * 1000;
const DRAFT_ID_PATTERN = /^[a-f0-9]{32}$/;

export interface HtmlImportDraft {
  draftId: string;
  /** Stable Authority mutation key: retries must reuse it verbatim. */
  commitKey: string;
  projectId: string;
  userId: string;
  sessionId: string;
  workspaceId: string;
  filename: string;
  name: string;
  parentId: string | null;
  /** Private immutable receipt for the exact user-supplied bytes. */
  sourceArtifactRef: string;
  artifactRef: string;
  normalizedHash: string;
  analysis: HtmlImportAnalysis;
  presentation: PagePresentationProfile;
  execution?: {
    executionId: string;
    channelId: string;
    expiresAt: number;
    executionUrl: string;
  };
  commitState: "prepared" | "committing" | "committed";
  pendingPage?: DemoPageMeta;
  committedPage?: DemoPageMeta;
  createdAt: number;
  expiresAt: number;
}

function draftDir() {
  return path.join(DATA_DIR, "html-import-drafts");
}
function draftPath(id: string) {
  return DRAFT_ID_PATTERN.test(id) ? path.join(draftDir(), `${id}.json`) : null;
}
function hashText(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
function pageName(filename: string, name?: string) {
  const supplied = name?.trim();
  if (supplied) return supplied;
  return (
    (filename.replace(/\\/g, "/").split("/").pop() ?? filename)
      .replace(/\.html?$/i, "")
      .trim() || "导入的 HTML 页面"
  );
}
export function presentationForAnalysis(
  analysis: HtmlImportAnalysis,
): PagePresentationProfile {
  return analysis.presentation.profile;
}
function purgeExpired(now = Date.now()) {
  const dir = draftDir();
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const file = path.join(dir, entry);
    try {
      const value = JSON.parse(
        fs.readFileSync(file, "utf8"),
      ) as Partial<HtmlImportDraft>;
      if (typeof value.expiresAt !== "number" || value.expiresAt <= now) {
        if (value.execution?.executionId)
          deleteHtmlSandboxExecution(value.execution.executionId);
        fs.rmSync(file, { force: true });
        if (value.projectId && value.sessionId && value.workspaceId) {
          appendServerEditorDiagnosticEvent({
            level: "info",
            eventGroup: "project",
            eventType: "import.expired",
            projectId: value.projectId,
            sessionId: value.sessionId,
            workspaceId: value.workspaceId,
            payload: { commitState: value.commitState ?? "prepared" },
          });
        }
      }
    } catch {
      fs.rmSync(file, { force: true });
    }
  }
}
export function saveHtmlImportDraft(draft: HtmlImportDraft) {
  fs.mkdirSync(draftDir(), { recursive: true });
  purgeExpired(draft.createdAt);
  const target = draftPath(draft.draftId);
  if (!target) throw new Error("HTML_IMPORT_DRAFT_ID_INVALID");
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(draft) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(tmp, target);
}
export function readHtmlImportDraft(
  id: string,
  now = Date.now(),
): HtmlImportDraft | null {
  purgeExpired(now);
  const target = draftPath(id);
  if (!target || !fs.existsSync(target)) return null;
  try {
    const draft = JSON.parse(
      fs.readFileSync(target, "utf8"),
    ) as HtmlImportDraft;
    return draft.expiresAt > now ? draft : null;
  } catch {
    return null;
  }
}
export function deleteHtmlImportDraft(id: string) {
  const draft = readHtmlImportDraft(id);
  if (draft?.execution) deleteHtmlSandboxExecution(draft.execution.executionId);
  const target = draftPath(id);
  if (target) fs.rmSync(target, { force: true });
  if (draft) {
    appendServerEditorDiagnosticEvent({
      level: "info",
      eventGroup: "project",
      eventType: "import.cancelled",
      projectId: draft.projectId,
      sessionId: draft.sessionId,
      workspaceId: draft.workspaceId,
      payload: {
        runtimeType: draft.analysis.runtimeType,
        analysisVersion: draft.analysis.analysisVersion,
        commitState: draft.commitState,
      },
    });
  }
}

export function prepareHtmlImportDraft(input: {
  projectId: string;
  userId: string;
  sessionId: string;
  workspaceId: string;
  filename: string;
  name?: string;
  parentId?: string | null;
  html: string;
  requestOrigin: string;
}): { draft: HtmlImportDraft; normalizedHtml: string } {
  const normalized = normalizeHtmlImport(input.html);
  if (normalized.analysis.outcome.status === "rejected")
    throw new Error(normalized.analysis.outcome.code);
  const runtimeType = normalized.analysis.outcome.runtimeType;
  if (
    runtimeType === "prototype-html-css" &&
    !validateHtmlImportPrototypeCandidate(normalized.normalizedHtml ?? "", "")
      .ok
  )
    throw new Error("HTML_IMPORT_CAPABILITY_RESTRICTED");
  const normalizedHtml = normalized.normalizedHtml ?? "";
  const now = Date.now();
  const draftId = crypto.randomBytes(16).toString("hex");
  const draft: HtmlImportDraft = {
    draftId,
    commitKey: crypto.randomUUID(),
    projectId: input.projectId,
    userId: input.userId,
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    filename: input.filename,
    name: pageName(input.filename, input.name),
    parentId: input.parentId ?? null,
    sourceArtifactRef: persistHtmlSandboxArtifact(input.html),
    artifactRef: persistHtmlSandboxArtifact(normalizedHtml),
    normalizedHash: hashText(normalizedHtml),
    analysis: normalized.analysis,
    presentation: presentationForAnalysis(normalized.analysis),
    commitState: "prepared",
    createdAt: now,
    expiresAt: now + HTML_IMPORT_DRAFT_TTL_MS,
  };
  const publicOrigin = resolveHtmlSandboxPublicOrigin(input.requestOrigin);
  if (publicOrigin) {
    const execution = createHtmlSandboxExecution(normalizedHtml, now, {
      projectId: input.projectId,
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
    });
    draft.execution = {
      ...execution,
      executionUrl: `${publicOrigin}/api/html-sandbox/executions/${execution.executionId}`,
    };
  }
  saveHtmlImportDraft(draft);
  appendServerEditorDiagnosticEvent({
    level: "info",
    eventGroup: "project",
    eventType: "import.prepare.completed",
    projectId: input.projectId,
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    payload: {
      runtimeType: normalized.analysis.runtimeType,
      compatibility: normalized.analysis.compatibility,
      analysisVersion: normalized.analysis.analysisVersion,
      resourceCount: normalized.analysis.resourceReferences.length,
      capabilityCount: normalized.analysis.unsupportedCapabilities.length,
      sourceHashPrefix: normalized.analysis.sourceHash.slice(0, 12),
    },
  });
  return { draft, normalizedHtml };
}

export async function commitHtmlImportDraft(
  draft: HtmlImportDraft,
  presentation: PagePresentationProfile,
) {
  if (draft.commitState === "committed" && draft.committedPage) {
    appendServerEditorDiagnosticEvent({
      level: "info",
      eventGroup: "project",
      eventType: "import.commit.idempotent_replay",
      projectId: draft.projectId,
      sessionId: draft.sessionId,
      workspaceId: draft.workspaceId,
      pageId: draft.committedPage.id,
      payload: {
        runtimeType: draft.committedPage.runtimeType,
        analysisVersion: draft.analysis.analysisVersion,
      },
    });
    return draft.committedPage;
  }
  const html = readHtmlSandboxArtifact(draft.artifactRef);
  const sourceHtml = readHtmlSandboxArtifact(draft.sourceArtifactRef);
  if (
    html === null ||
    sourceHtml === null ||
    hashText(html) !== draft.normalizedHash ||
    hashText(sourceHtml) !== draft.analysis.sourceHash
  )
    throw new Error("HTML_IMPORT_DRAFT_HASH_MISMATCH");
  const workspacePath = findWorkspacePath(draft.workspaceId);
  if (!workspacePath) throw new Error("工作空间路径不存在");
  const live = isLiveWorkspacePath(workspacePath);
  // HTML import changes a page tree plus several runtime files. The old branch
  // staging/swap path has no revision or receipt and can overwrite another
  // writer, so this workflow is deliberately Authority-only.
  if (!live) throw new Error("WORKSPACE_AUTHORITY_REQUIRED");
  const treePath = path.join(workspacePath, "workspace-tree.json");
  const runtimeType =
    draft.analysis.outcome.status === "accepted"
      ? draft.analysis.outcome.runtimeType
      : "sandboxed-html";
  // Only the Authority allocates page identity and tree position. Persisting
  // the stable key before dispatch still makes an HTTP timeout replay-safe.
  draft.commitState = "committing";
  saveHtmlImportDraft(draft);
  const staged = await stageWorkspaceBinary({
    projectId: draft.projectId,
    workspaceId: draft.workspaceId,
    sessionId: draft.sessionId,
    content: Buffer.from(sourceHtml, "utf8"),
  });
  const operations: WorkspaceMutationOperation[] = [{
    type: "commit_html_import",
    path: "",
    from: "",
    to: "",
    stagingId: staged.stagingId,
    hash: staged.hash,
    size: staged.size,
    name: draft.name,
    parentId: draft.parentId,
    runtimeType,
    analysisVersion: draft.analysis.analysisVersion,
    sourceHash: draft.analysis.sourceHash,
    normalizedHash: draft.normalizedHash,
    presentation,
  }];
  const receipt = await commitWorkspaceMutation({
    // The Authority stores the durable receipt under this key. Never generate
    // a new key for a retry: a client timeout may have happened after commit.
    mutationId: draft.commitKey,
    projectId: draft.projectId,
    workspaceId: draft.workspaceId,
    sessionId: draft.sessionId,
    baseRevision: 0,
    actor: "author-site",
    reason: "commit_html_import_draft",
    operations,
  });
  const committedPageId = receipt.resources
    .map((resource) => /^demos\/([^/]+)\/(?:sandbox|prototype)\.html$/.exec(resource.path)?.[1])
    .find(Boolean);
  const committedTree = JSON.parse(fs.readFileSync(treePath, "utf8")) as WorkspaceTree;
  const committedPage = committedTree.pages.find((candidate) => candidate.id === committedPageId);
  if (!committedPage) throw new Error("HTML_IMPORT_COMMIT_RECEIPT_INVALID");
  saveHtmlImportDraft({
    ...draft,
    commitState: "committed",
    pendingPage: committedPage,
    committedPage,
    execution: undefined,
  });
  if (draft.execution) deleteHtmlSandboxExecution(draft.execution.executionId);
  appendServerEditorDiagnosticEvent({
    level: "info",
    eventGroup: "project",
    eventType: "import.commit.completed",
    projectId: draft.projectId,
    sessionId: draft.sessionId,
    workspaceId: draft.workspaceId,
    pageId: committedPage.id,
    payload: {
      runtimeType,
      compatibility: draft.analysis.compatibility,
      analysisVersion: draft.analysis.analysisVersion,
      resourceCount: draft.analysis.resourceReferences.length,
      capabilityCount: draft.analysis.unsupportedCapabilities.length,
      idempotentReplay: false,
    },
  });
  return committedPage;
}

export { WorkspaceAuthorityClientError };
export type { PagePresentationProfile };
