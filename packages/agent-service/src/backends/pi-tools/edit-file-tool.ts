import * as fs from "fs";
import crypto from "crypto";
import * as path from "path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from "./permissions";
import {
  formatRuntimeValidationInstruction,
  validatePreviewFileWrite,
} from "./preview-validation";
import {
  resolveLiveWorkspaceMutationContext,
  WorkspaceMutationAuthorityError,
} from "../../workspace/workspace-mutation-authority";

const EditFileParams = Type.Object({
  path: Type.String({ description: "Relative path to the file to edit" }),
  old_string: Type.String({
    description:
      "The exact text to find and replace. Must match exactly, including whitespace and indentation.",
  }),
  new_string: Type.String({
    description:
      "The text to replace old_string with. Use empty string to delete the matched text.",
  }),
});
type EditFileParams = Static<typeof EditFileParams>;

export function createEditFileTool(
  config: AgentConfig,
): AgentTool<typeof EditFileParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: "editFile",
    label: "Edit File",
    description:
      "Make a precise edit to a file by replacing an exact text match. Finds old_string in the file and replaces it with new_string. The old_string must match exactly (including whitespace and indentation). Prefer this over writeFile for making targeted changes to existing files, as it preserves the rest of the file and reduces token usage.",
    parameters: EditFileParams,
    execute: async (toolCallId: string, args: EditFileParams) => {
      const filePath = path.resolve(config.workingDir || ".", args.path);

      if (!isPathAllowed(args.path, config.workingDir || "", permissions)) {
        logger.warn({ path: args.path }, "editFile denied by permissions");
        return {
          content: [
            {
              type: "text",
              text: `Error: path "${args.path}" is not allowed by workspace permissions`,
            },
          ],
          details: { path: args.path, error: "permission denied" },
          isError: true,
        };
      }

      try {
        const liveWorkspace = config.workingDir
          ? resolveLiveWorkspaceMutationContext(config.workingDir)
          : null;
        let snapshot;
        let snapshotDriftRetry = 0;
        while (true) {
          try {
            snapshot = liveWorkspace
              ? await liveWorkspace.authority.getSnapshot(
                  liveWorkspace.projectId,
                  liveWorkspace.workspaceId,
                )
              : null;
            break;
          } catch (err) {
            if (
              err instanceof WorkspaceMutationAuthorityError &&
              err.code === "WORKSPACE_EXTERNAL_DRIFT" &&
              liveWorkspace &&
              snapshotDriftRetry === 0
            ) {
              snapshotDriftRetry++;
              logger.info(
                { path: args.path },
                "editFile getSnapshot: EXTERNAL_DRIFT, reconciling",
              );
              await liveWorkspace.authority.reconcileAdopt(
                liveWorkspace.projectId,
                liveWorkspace.workspaceId,
              );
              continue;
            }
            throw err;
          }
        }
        const content = snapshot
          ? snapshot.resources[args.path]
          : await fs.promises.readFile(filePath, "utf-8");
        if (content === undefined) {
          return {
            content: [
              {
                type: "text",
                text: `Error editing file: ${args.path} is not a committed text resource`,
              },
            ],
            details: { path: args.path, error: "WORKSPACE_RESOURCE_NOT_FOUND" },
            isError: true,
          };
        }

        const matchIndex = content.indexOf(args.old_string);
        if (matchIndex === -1) {
          // Provide helpful context: show nearby content if possible
          const lines = content.split("\n");
          const totalLines = lines.length;
          const previewLines = lines.slice(0, Math.min(20, totalLines));
          const preview = previewLines
            .map((line, i) => `${i + 1}→${line}`)
            .join("\n");

          logger.warn({ path: args.path }, "editFile: old_string not found");
          return {
            content: [
              {
                type: "text",
                text: `Error: old_string not found in ${args.path}. Ensure the text matches exactly, including whitespace and indentation. File has ${totalLines} lines. First 20 lines:\n${preview}`,
              },
            ],
            details: { path: args.path, error: "old_string not found" },
            isError: true,
          };
        }

        // Check for multiple matches
        const secondMatchIndex = content.indexOf(
          args.old_string,
          matchIndex + 1,
        );
        if (secondMatchIndex !== -1) {
          // Calculate line numbers for the matches
          const beforeFirst = content.substring(0, matchIndex);
          const lineNum1 = beforeFirst.split("\n").length;
          const beforeSecond = content.substring(0, secondMatchIndex);
          const lineNum2 = beforeSecond.split("\n").length;

          logger.warn(
            { path: args.path },
            "editFile: old_string has multiple matches",
          );
          return {
            content: [
              {
                type: "text",
                text: `Error: old_string appears multiple times in ${args.path} (found at lines ${lineNum1} and ${lineNum2}). Provide more surrounding context in old_string to make the match unique.`,
              },
            ],
            details: {
              path: args.path,
              error: "multiple matches",
              lineNum1,
              lineNum2,
            },
            isError: true,
          };
        }

        // Perform the replacement
        const newContent =
          content.substring(0, matchIndex) +
          args.new_string +
          content.substring(matchIndex + args.old_string.length);

        const receipt = liveWorkspace
          ? await (async () => {
              let mutateDriftRetry = 0;
              while (true) {
                try {
                  return await liveWorkspace.authority.mutate({
                    mutationId: crypto.randomUUID(),
                    projectId: liveWorkspace.projectId,
                    workspaceId: liveWorkspace.workspaceId,
                    sessionId: config.sessionId,
                    baseRevision: snapshot!.state.revision,
                    actor: "ai",
                    reason: "agent_edit_file",
                    operations: [
                      {
                        type: "put_text",
                        path: args.path,
                        content: newContent,
                        expectedHash: crypto
                          .createHash("sha256")
                          .update(content)
                          .digest("hex"),
                      },
                    ],
                  });
                } catch (err) {
                  if (
                    err instanceof WorkspaceMutationAuthorityError &&
                    err.code === "WORKSPACE_EXTERNAL_DRIFT" &&
                    mutateDriftRetry === 0
                  ) {
                    mutateDriftRetry++;
                    logger.info(
                      { path: args.path },
                      "editFile mutate: EXTERNAL_DRIFT, reconciling",
                    );
                    await liveWorkspace.authority.reconcileAdopt(
                      liveWorkspace.projectId,
                      liveWorkspace.workspaceId,
                    );
                    snapshot = await liveWorkspace.authority.getSnapshot(
                      liveWorkspace.projectId,
                      liveWorkspace.workspaceId,
                    );
                    continue;
                  }
                  throw err;
                }
              }
            })()
          : (await fs.promises.writeFile(filePath, newContent, "utf-8"), null);

        // Calculate line number of the edit
        const beforeMatch = content.substring(0, matchIndex);
        const lineNumber = beforeMatch.split("\n").length;

        const oldLineCount = args.old_string.split("\n").length;
        const newLineCount = args.new_string.split("\n").length;

        const runtimeValidation = validatePreviewFileWrite(
          args.path,
          newContent,
        );
        logger.debug(
          { path: args.path, lineNumber },
          "File edited successfully",
        );
        const validationText =
          formatRuntimeValidationInstruction(runtimeValidation);
        return {
          content: [
            {
              type: "text",
              text: `Successfully edited ${args.path} at line ${lineNumber} (${oldLineCount} line(s) replaced with ${newLineCount} line(s))${validationText}`,
            },
          ],
          details: {
            path: args.path,
            lineNumber,
            oldLineCount,
            newLineCount,
            runtimeValidation,
            receipt,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { path: args.path, error: message },
          "Failed to edit file",
        );
        return {
          content: [{ type: "text", text: `Error editing file: ${message}` }],
          details: { path: args.path, error: message },
          isError: true,
        };
      }
    },
  };
}
