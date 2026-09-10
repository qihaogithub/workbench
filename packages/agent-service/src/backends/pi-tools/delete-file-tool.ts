import * as fs from "fs";
import crypto from "crypto";
import * as path from "path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from "./permissions";
import { resolveLiveWorkspaceMutationContext } from "../../workspace/workspace-mutation-authority";
import { aiMutationDeniedResult, assertAiMutationAllowed } from "./ai-mutation-policy";
import { formatAuthorityCommitSummary } from "./authority-result-summary";
import { createManagedDocumentProposalResult } from "./document-proposal-tool";

const WORKSPACE_TREE_FILENAME = "workspace-tree.json";

/** 禁止通过 deleteFile 删除的关键文件，页面删除应走 deletePage 工具 */
const PROTECTED_FILES = new Set([
  WORKSPACE_TREE_FILENAME,
  "demos",
]);

/** 禁止删除的页面主文件模式 */
function isProtectedPath(relativePath: string): boolean {
  if (PROTECTED_FILES.has(relativePath)) return true;
  // 禁止删除页面主入口文件 index.tsx（页面删除走 deletePage）
  if (/^demos\/[^/]+\/index\.tsx$/.test(relativePath)) return true;
  return false;
}

const DeleteFileParams = Type.Object({
  path: Type.String({ description: "Relative path to the file to delete" }),
});
type DeleteFileParams = Static<typeof DeleteFileParams>;

export function createDeleteFileTool(
  config: AgentConfig,
): AgentTool<typeof DeleteFileParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: "deleteFile",
    label: "Delete File",
    description:
      "Delete a single file from the workspace. Cannot delete workspace-tree.json or page index.tsx (use deletePage for page removal).",
    parameters: DeleteFileParams,
    execute: async (toolCallId: string, args: DeleteFileParams) => {
      const relativePath = args.path;
      const filePath = path.resolve(config.workingDir || ".", relativePath);

      if (!isPathAllowed(relativePath, config.workingDir || "", permissions)) {
        logger.warn({ path: relativePath }, "deleteFile denied by permissions");
        return {
          content: [
            {
              type: "text",
              text: `Error: path "${relativePath}" is not allowed by workspace permissions`,
            },
          ],
          details: { path: relativePath, error: "permission denied" },
          isError: true,
        };
      }

      const mutationDecision = assertAiMutationAllowed(config, relativePath, { operation: "delete" });
      if (!mutationDecision.allowed) return aiMutationDeniedResult(mutationDecision, relativePath);

      if (isProtectedPath(relativePath)) {
        logger.warn(
          { path: relativePath },
          "deleteFile denied: protected file",
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: "${relativePath}" cannot be deleted directly. Use deletePage to remove a page, or delete non-essential files only.`,
            },
          ],
          details: { path: relativePath, error: "PROTECTED_FILE" },
          isError: true,
        };
      }

      try {
        const liveWorkspace = config.workingDir
          ? resolveLiveWorkspaceMutationContext(config.workingDir)
          : null;

        const snapshot = liveWorkspace
          ? await liveWorkspace.authority.getSnapshot(
              liveWorkspace.projectId,
              liveWorkspace.workspaceId,
            )
          : null;

        // 检查文件是否存在
        const existingContent = snapshot
          ? (snapshot.resources[relativePath] ?? null)
          : await fs.promises.readFile(filePath, "utf-8").catch(() => null);

        if (existingContent === null) {
          return {
            content: [
              {
                type: "text",
                text: `File "${relativePath}" does not exist, nothing to delete.`,
              },
            ],
            details: { path: relativePath, error: "FILE_NOT_FOUND" },
            isError: true,
          };
        }

        if (liveWorkspace && snapshot) {
          const proposalResult = createManagedDocumentProposalResult({
            config, dataDir: liveWorkspace.dataDir, projectId: liveWorkspace.projectId,
            workspaceId: liveWorkspace.workspaceId, snapshot, resourcePath: relativePath,
            operationIntent: "delete", baseContent: existingContent, proposedContent: null,
          });
          if (proposalResult) return proposalResult;
        }

        let receipt = null;
        if (liveWorkspace) {
          receipt = await liveWorkspace.authority.mutate({
                mutationId: crypto.randomUUID(),
                projectId: liveWorkspace.projectId,
                workspaceId: liveWorkspace.workspaceId,
                sessionId: config.sessionId,
                ...(config.runId ? { runId: config.runId } : {}),
                baseRevision: snapshot!.state.revision,
                actor: config.mutationActor ?? "ai",
                reason: "agent_delete_file",
                operations: [
                  {
                    type: "delete_path",
                    path: relativePath,
                    expectedHash: crypto
                      .createHash("sha256")
                      .update(existingContent)
                      .digest("hex"),
                  },
                ],
              });
        } else {
          await fs.promises.unlink(filePath);
        }

        logger.debug({ path: relativePath }, "File deleted successfully");
        return {
          content: [
            { type: "text", text: `Successfully deleted ${relativePath}${formatAuthorityCommitSummary(receipt)}` },
          ],
          details: { path: relativePath, receipt },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { path: relativePath, error: message },
          "Failed to delete file",
        );
        return {
          content: [
            { type: "text", text: `Error deleting file: ${message}` },
          ],
          details: { path: relativePath, error: message },
          isError: true,
        };
      }
    },
  };
}
