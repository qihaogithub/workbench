import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { resolvePagePresentation } from "@workbench/shared";
import type { WorkspaceMutationRequest } from "@workbench/shared/contracts";
import { Type, type Static } from "typebox";

import type { AgentConfig } from "../../core/types";
import {
  resolveLiveWorkspaceMutationContext,
  WorkspaceMutationAuthorityError,
} from "../../workspace/workspace-mutation-authority";
import { getHocuspocusCollabServer } from "../../collab/hocuspocus-server";
import { logger } from "../../utils/logger";
import {
  WORKSPACE_TREE_FILENAME,
  getPageEntryFileName,
  getPageDir,
  isSafePageId,
  readWorkspaceTree,
  type WorkspacePage,
  type WorkspaceTree,
} from "./workspace-page-utils";
import { aiMutationDeniedResult, assertAiMutationAllowed } from "./ai-mutation-policy";
import { validatePreviewFileWrite } from "./preview-validation";
import { validateConfigSchemaContract } from "./schema-contract-validation";
import { formatAuthorityCommitSummary } from "./authority-result-summary";

const MAX_PAGE_ID_LENGTH = 96;
const MAX_PAGE_NAME_LENGTH = 120;
const SUPPORTED_RUNTIME_TYPES = [
  "prototype-html-css",
  "high-fidelity-react",
] as const;

const CreatePageParams = Type.Object(
  {
    pageId: Type.String({
      minLength: 1,
      maxLength: MAX_PAGE_ID_LENGTH,
      description: "New stable page ID / directory name. Use one Unicode-safe path segment; do not use /, \\, . or ...",
    }),
    name: Type.String({
      minLength: 1,
      maxLength: MAX_PAGE_NAME_LENGTH,
      description: "Visible page name. Must not be blank after trimming.",
    }),
    parentId: Type.Union([Type.String({ minLength: 1 }), Type.Null()], {
      description: "Existing folder ID, or null for a root-level page.",
    }),
    order: Type.Integer({
      minimum: 0,
      description: "Non-negative display order within the page tree.",
    }),
    runtimeType: Type.Union([
      Type.Literal("prototype-html-css"),
      Type.Literal("high-fidelity-react"),
    ], {
      description: "Use prototype-html-css by default. Use high-fidelity-react only when the page needs executable React behavior.",
    }),
    source: Type.String({
      minLength: 1,
      maxLength: 2_000_000,
      description: "Complete runtime entry source: prototype.html or index.tsx, depending on runtimeType.",
    }),
    prototypeCss: Type.Optional(Type.String({
      maxLength: 120_000,
      description: "Complete prototype.css. Required when runtimeType is prototype-html-css; omit for high-fidelity-react.",
    })),
    configSchema: Type.String({
      minLength: 2,
      maxLength: 2_000_000,
      description: "Complete config.schema.json content, including a valid $demo.presentation.",
    }),
  },
  { additionalProperties: false },
);

type CreatePageParams = Static<typeof CreatePageParams>;

function errorResult(error: string, message: string, extra: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    details: { error, ...extra },
    isError: true,
  };
}

function parseAndValidateSchema(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "configSchema must be a JSON object.";
    }
    if (!resolvePagePresentation(parsed as Record<string, unknown>)) {
      return "configSchema must contain a valid $demo.presentation.";
    }
    const contractIssues = validateConfigSchemaContract(parsed);
    if (contractIssues.length > 0) {
      return contractIssues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
    }
    return null;
  } catch {
    return "configSchema must be valid JSON.";
  }
}

function parseWorkspaceTree(content: string): WorkspaceTree {
  const parsed = JSON.parse(content) as Partial<WorkspaceTree>;
  if (!Array.isArray(parsed.folders) || !Array.isArray(parsed.pages)) {
    throw new Error("workspace-tree.json must contain folders and pages arrays.");
  }
  return { folders: parsed.folders, pages: parsed.pages as WorkspacePage[] };
}

function validatePageInput(args: CreatePageParams, tree: WorkspaceTree): string | null {
  if (!isSafePageId(args.pageId) || args.pageId.length > MAX_PAGE_ID_LENGTH) {
    return "pageId must be one Unicode-safe path segment and must not contain separators, control characters, or path traversal.";
  }
  if (args.name.trim().length === 0) return "name must not be blank.";
  if (!Number.isSafeInteger(args.order) || args.order < 0) return "order must be a non-negative integer.";
  if (!SUPPORTED_RUNTIME_TYPES.includes(args.runtimeType)) return "runtimeType is not supported.";
  if (tree.pages.some((page) => page.id === args.pageId)) return `pageId \"${args.pageId}\" already exists.`;
  if (tree.pages.some((page) => page.order === args.order)) {
    return `order ${args.order} is already used by page \"${tree.pages.find((page) => page.order === args.order)!.id}\".`;
  }
  if (args.parentId !== null && !tree.folders.some((folder) => (
    typeof folder === "object" && folder !== null && (folder as { id?: unknown }).id === args.parentId
  ))) return `parentId \"${args.parentId}\" does not identify an existing folder.`;
  return null;
}

function validateRuntimeFiles(args: CreatePageParams): string | null {
  if (args.runtimeType === "prototype-html-css" && args.prototypeCss === undefined) {
    return "prototypeCss is required when runtimeType is prototype-html-css.";
  }
  if (args.runtimeType === "high-fidelity-react" && args.prototypeCss !== undefined) {
    return "prototypeCss must be omitted when runtimeType is high-fidelity-react.";
  }
  const entryPath = `demos/${args.pageId}/${getPageEntryFileName(args.runtimeType)}`;
  const sourceValidation = validatePreviewFileWrite(entryPath, args.source, args.runtimeType);
  if (sourceValidation && !sourceValidation.ok) {
    return sourceValidation.issues.map((issue) => issue.message).join("; ");
  }
  if (args.runtimeType === "prototype-html-css") {
    const cssValidation = validatePreviewFileWrite(
      `demos/${args.pageId}/prototype.css`,
      args.prototypeCss!,
      args.runtimeType,
    );
    if (cssValidation && !cssValidation.ok) {
      return cssValidation.issues.map((issue) => issue.message).join("; ");
    }
  }
  const schemaValidation = validatePreviewFileWrite(
    `demos/${args.pageId}/config.schema.json`,
    args.configSchema,
    args.runtimeType,
  );
  if (schemaValidation && !schemaValidation.ok) {
    return schemaValidation.issues.map((issue) => issue.message).join("; ");
  }
  return parseAndValidateSchema(args.configSchema);
}

function buildTree(tree: WorkspaceTree, args: CreatePageParams): WorkspaceTree {
  const page: WorkspacePage = {
    id: args.pageId,
    name: args.name.trim(),
    parentId: args.parentId,
    order: args.order,
    runtimeType: args.runtimeType,
  };
  return { ...tree, pages: [...tree.pages, page] };
}

/**
 * A page tree is also a live Yjs resource.  The Authority transaction is the
 * publication boundary, but a connected room may still retain the tree from
 * before that transaction.  Push the committed tree into that room straight
 * away so its next flush cannot overwrite the just-created page with stale
 * content.
 */
async function syncCommittedTreeToCollab(
  liveWorkspace: NonNullable<ReturnType<typeof resolveLiveWorkspaceMutationContext>>,
  sessionId: string | undefined,
  tree: WorkspaceTree,
): Promise<void> {
  if (!sessionId) return;
  await getHocuspocusCollabServer().writeToResource(
    {
      projectId: liveWorkspace.projectId,
      workspaceId: liveWorkspace.workspaceId,
      sessionId,
      resourcePath: WORKSPACE_TREE_FILENAME,
      kind: "workspace-tree",
    },
    JSON.stringify(tree, null, 2),
  );
}

function pageOperations(args: CreatePageParams, tree: WorkspaceTree): WorkspaceMutationRequest["operations"] {
  const prefix = `demos/${args.pageId}`;
  const operations: WorkspaceMutationRequest["operations"] = [
    {
      type: "put_text" as const,
      path: `${prefix}/${getPageEntryFileName(args.runtimeType)}`,
      content: args.source,
      expectedAbsent: true,
    },
    ...(args.runtimeType === "prototype-html-css"
      ? [{
          type: "put_text" as const,
          path: `${prefix}/prototype.css`,
          content: args.prototypeCss!,
          expectedAbsent: true,
        }]
      : []),
    {
      type: "put_text" as const,
      path: `${prefix}/config.schema.json`,
      content: args.configSchema,
      expectedAbsent: true,
    },
    {
      type: "put_text" as const,
      path: WORKSPACE_TREE_FILENAME,
      content: JSON.stringify(buildTree(tree, args), null, 2),
    },
  ];
  return operations;
}

async function createPageInFilesystem(workingDir: string, args: CreatePageParams, tree: WorkspaceTree): Promise<void> {
  const pageDir = getPageDir(workingDir, args.pageId);
  if (fs.existsSync(pageDir)) throw new Error(`page directory \"demos/${args.pageId}\" already exists.`);

  const demosDir = path.join(workingDir, "demos");
  const stagingDir = path.join(demosDir, `.create-page-${crypto.randomUUID()}`);
  const treePath = path.join(workingDir, WORKSPACE_TREE_FILENAME);
  const treeBefore = fs.readFileSync(treePath, "utf-8");
  const nextTree = JSON.stringify(buildTree(tree, args), null, 2);
  const entryPath = path.join(stagingDir, getPageEntryFileName(args.runtimeType));
  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(entryPath, args.source, "utf-8");
    if (args.runtimeType === "prototype-html-css") {
      fs.writeFileSync(path.join(stagingDir, "prototype.css"), args.prototypeCss!, "utf-8");
    }
    fs.writeFileSync(path.join(stagingDir, "config.schema.json"), args.configSchema, "utf-8");
    fs.renameSync(stagingDir, pageDir);
    fs.writeFileSync(treePath, nextTree, "utf-8");
  } catch (error) {
    // The fallback cannot offer Authority's cross-file transaction, so clean up
    // any unpublished directory and restore the only publication boundary.
    if (fs.existsSync(pageDir)) fs.rmSync(pageDir, { recursive: true, force: true });
    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.writeFileSync(treePath, treeBefore, "utf-8");
    throw error;
  }
}

export function createCreatePageTool(config: AgentConfig): AgentTool<typeof CreatePageParams> {
  return {
    name: "createPage",
    label: "Create Page",
    description: "Atomically create one complete page. For multi-page work, call this once per completed page so each page becomes visible immediately; do not write page files and workspace-tree.json separately.",
    parameters: CreatePageParams,
    execute: async (_toolCallId, args) => {
      const workingDir = config.workingDir ? path.resolve(config.workingDir) : null;
      if (!workingDir) return errorResult("working_dir_required", "workingDir is required to create a page.");

      try {
        const liveWorkspace = resolveLiveWorkspaceMutationContext(workingDir);
        const snapshot = liveWorkspace
          ? await liveWorkspace.authority.getSnapshot(liveWorkspace.projectId, liveWorkspace.workspaceId)
          : null;
        const treeContent = snapshot?.resources[WORKSPACE_TREE_FILENAME]
          ?? fs.readFileSync(path.join(workingDir, WORKSPACE_TREE_FILENAME), "utf-8");
        const tree = parseWorkspaceTree(treeContent);
        const inputError = validatePageInput(args, tree) ?? validateRuntimeFiles(args);
        if (inputError) return errorResult("invalid_create_page_input", inputError, { pageId: args.pageId });

        const pageDir = getPageDir(workingDir, args.pageId);
        if (liveWorkspace && (`demos/${args.pageId}/${getPageEntryFileName(args.runtimeType)}` in snapshot!.resources || `demos/${args.pageId}/config.schema.json` in snapshot!.resources)) {
          return errorResult("page_resources_exist", `page resources for \"${args.pageId}\" already exist.`, { pageId: args.pageId });
        }
        if (!liveWorkspace && fs.existsSync(pageDir)) {
          return errorResult("page_resources_exist", `page directory \"demos/${args.pageId}\" already exists.`, { pageId: args.pageId });
        }

        const nextTree = buildTree(tree, args);
        const mutationDecision = assertAiMutationAllowed(config, WORKSPACE_TREE_FILENAME, {
          content: JSON.stringify(nextTree),
        });
        if (!mutationDecision.allowed) return aiMutationDeniedResult(mutationDecision, WORKSPACE_TREE_FILENAME);
        const operations = pageOperations(args, tree);
        let receipt: unknown = null;
        if (liveWorkspace) {
          receipt = await liveWorkspace.authority.mutate({
            mutationId: crypto.randomUUID(),
            projectId: liveWorkspace.projectId,
            workspaceId: liveWorkspace.workspaceId,
            sessionId: config.sessionId,
            baseRevision: snapshot!.state.revision,
            actor: "ai",
            reason: "agent_create_page",
            operations,
          });
          try {
            await syncCommittedTreeToCollab(liveWorkspace, config.sessionId, nextTree);
          } catch (error) {
            // The Authority receipt has already published a complete page.
            // Do not turn a best-effort collaboration fan-out failure into a
            // false tool failure; the editor's Authority polling still
            // converges the projection.
            logger.warn(
              { pageId: args.pageId, error: error instanceof Error ? error.message : String(error) },
              "Created page but could not synchronize workspace tree to collaboration room",
            );
          }
        } else {
          await createPageInFilesystem(workingDir, args, tree);
        }

        const createdPage = nextTree.pages.find((page) => page.id === args.pageId)!;
        return {
          content: [{ type: "text", text: `Created page \"${createdPage.name}\" (${createdPage.id}) as ${createdPage.runtimeType}.${formatAuthorityCommitSummary(receipt)}` }],
          details: { createdPage, receipt },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error({ pageId: args.pageId, error: message }, "Failed to create page");
        return errorResult(
          error instanceof WorkspaceMutationAuthorityError ? error.code : "create_page_failed",
          message,
          { pageId: args.pageId },
        );
      }
    },
  };
}
