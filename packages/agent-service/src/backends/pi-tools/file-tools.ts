import * as fs from "fs";
import crypto from "crypto";
import * as path from "path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from "./permissions";
import { resolveVirtualKnowledgeFile } from "./virtual-knowledge";
import {
  formatRuntimeValidationInstruction,
  validatePreviewFileWrite,
} from "./preview-validation";
import { resolveLiveWorkspaceMutationContext } from "../../workspace/workspace-mutation-authority";

const ReadFileParams = Type.Object({
  path: Type.String({ description: "Relative path to the file to read" }),
});
type ReadFileParams = Static<typeof ReadFileParams>;

export function createReadFileTool(
  config: AgentConfig,
): AgentTool<typeof ReadFileParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: "readFile",
    label: "Read File",
    description: "Read the contents of a file in the workspace",
    parameters: ReadFileParams,
    execute: async (toolCallId: string, args: ReadFileParams) => {
      const filePath = path.resolve(config.workingDir || ".", args.path);

      if (!isPathAllowed(args.path, config.workingDir || "", permissions)) {
        logger.warn({ path: args.path }, "readFile denied by permissions");
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

      const virtualFile = resolveVirtualKnowledgeFile(
        args.path,
        config.workingDir || "",
      );
      if (virtualFile) {
        logger.debug(
          { path: virtualFile.path },
          "Virtual system knowledge file read successfully",
        );
        return {
          content: [{ type: "text", text: virtualFile.content }],
          details: {
            path: virtualFile.path,
            size: virtualFile.content.length,
            virtual: true,
          },
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
        const content = snapshot
          ? snapshot.resources[args.path]
          : await fs.promises.readFile(filePath, "utf-8");
        if (content === undefined) {
          return {
            content: [
              {
                type: "text",
                text: `Error reading file: ${args.path} is not a committed text resource`,
              },
            ],
            details: { path: args.path, error: "WORKSPACE_RESOURCE_NOT_FOUND" },
            isError: true,
          };
        }
        logger.debug({ path: args.path }, "File read successfully");
        return {
          content: [{ type: "text", text: content }],
          details: {
            path: args.path,
            size: content.length,
            ...(snapshot
              ? {
                  revision: snapshot.state.revision,
                  hash: snapshot.state.resourceHashes[args.path],
                }
              : {}),
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { path: args.path, error: message },
          "Failed to read file",
        );
        return {
          content: [{ type: "text", text: `Error reading file: ${message}` }],
          details: { path: args.path, error: message },
          isError: true,
        };
      }
    },
  };
}

const WriteFileParams = Type.Object({
  path: Type.String({ description: "Relative path to the file to write" }),
  content: Type.String({ description: "Content to write to the file" }),
});
type WriteFileParams = Static<typeof WriteFileParams>;

export function createWriteFileTool(
  config: AgentConfig,
): AgentTool<typeof WriteFileParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: "writeFile",
    label: "Write File",
    description: "Write content to a file in the workspace",
    parameters: WriteFileParams,
    execute: async (toolCallId: string, args: WriteFileParams) => {
      const filePath = path.resolve(config.workingDir || ".", args.path);
      const dir = path.dirname(filePath);

      if (!isPathAllowed(args.path, config.workingDir || "", permissions)) {
        logger.warn({ path: args.path }, "writeFile denied by permissions");
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
        const snapshot = liveWorkspace
          ? await liveWorkspace.authority.getSnapshot(
              liveWorkspace.projectId,
              liveWorkspace.workspaceId,
            )
          : null;
        const existing = snapshot
          ? (snapshot.resources[args.path] ?? null)
          : await fs.promises.readFile(filePath, "utf-8").catch(() => null);
        const receipt = liveWorkspace
          ? await liveWorkspace.authority.mutate({
              mutationId: crypto.randomUUID(),
              projectId: liveWorkspace.projectId,
              workspaceId: liveWorkspace.workspaceId,
              sessionId: config.sessionId,
              baseRevision: snapshot!.state.revision,
              actor: "ai",
              reason: "agent_write_file",
              operations: [
                {
                  type: "put_text",
                  path: args.path,
                  content: args.content,
                  ...(existing === null
                    ? { expectedAbsent: true }
                    : {
                        expectedHash: crypto
                          .createHash("sha256")
                          .update(existing)
                          .digest("hex"),
                      }),
                },
              ],
            })
          : (await fs.promises.mkdir(dir, { recursive: true }),
            await fs.promises.writeFile(filePath, args.content, "utf-8"),
            null);
        const runtimeValidation = validatePreviewFileWrite(
          args.path,
          args.content,
        );
        logger.debug({ path: args.path }, "File written successfully");
        const validationText =
          formatRuntimeValidationInstruction(runtimeValidation);
        return {
          content: [
            {
              type: "text",
              text: `Successfully wrote to ${args.path}${validationText}`,
            },
          ],
          details: {
            path: args.path,
            size: args.content.length,
            runtimeValidation,
            receipt,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { path: args.path, error: message },
          "Failed to write file",
        );
        return {
          content: [{ type: "text", text: `Error writing file: ${message}` }],
          details: { path: args.path, error: message },
          isError: true,
        };
      }
    },
  };
}

const ListFilesParams = Type.Object({
  path: Type.Optional(
    Type.String({
      description:
        "Relative path to the directory (default: current directory)",
    }),
  ),
});
type ListFilesParams = Static<typeof ListFilesParams>;

export function createListFilesTool(
  config: AgentConfig,
): AgentTool<typeof ListFilesParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: "listFiles",
    label: "List Files",
    description: "List files and directories in the workspace",
    parameters: ListFilesParams,
    execute: async (toolCallId: string, args: ListFilesParams) => {
      const dirPath = path.resolve(config.workingDir || ".", args.path || ".");

      if (
        !isPathAllowed(args.path || ".", config.workingDir || "", permissions)
      ) {
        logger.warn(
          { path: args.path || "." },
          "listFiles denied by permissions",
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: path "${args.path || "."}" is not allowed by workspace permissions`,
            },
          ],
          details: { path: args.path || ".", error: "permission denied" },
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

        if (snapshot) {
          const prefix = args.path ? `${args.path.replace(/\/+$/, "")}/` : "";
          const seen = new Set<string>();
          for (const resourcePath of Object.keys(snapshot.resources)) {
            if (prefix && !resourcePath.startsWith(prefix)) continue;
            const remainder = prefix
              ? resourcePath.slice(prefix.length)
              : resourcePath;
            if (!remainder) continue;
            const slashIndex = remainder.indexOf("/");
            const name =
              slashIndex < 0 ? remainder : remainder.slice(0, slashIndex);
            if (name) seen.add(name);
          }
          const result = Array.from(seen)
            .sort()
            .map((name) => {
              const entryPath = prefix ? `${prefix}${name}` : name;
              const type =
                snapshot.resources[entryPath] !== undefined
                  ? "file"
                  : "directory";
              return `${type}: ${name}`;
            })
            .join("\n");
          logger.debug(
            { path: args.path || ".", revision: snapshot.state.revision },
            "Directory listed from Authority snapshot",
          );
          return {
            content: [{ type: "text", text: result || "Directory is empty" }],
            details: {
              path: args.path || ".",
              entries: seen.size,
              revision: snapshot.state.revision,
            },
          };
        }

        const entries = await fs.promises.readdir(dirPath, {
          withFileTypes: true,
        });
        const result = entries
          .map((entry) => {
            const type = entry.isDirectory() ? "directory" : "file";
            return `${type}: ${entry.name}`;
          })
          .join("\n");

        logger.debug(
          { path: args.path || "." },
          "Directory listed successfully",
        );
        return {
          content: [{ type: "text", text: result || "Directory is empty" }],
          details: { path: args.path || ".", entries: entries.length },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { path: args.path || ".", error: message },
          "Failed to list directory",
        );
        return {
          content: [
            { type: "text", text: `Error listing directory: ${message}` },
          ],
          details: { path: args.path || ".", error: message },
          isError: true,
        };
      }
    },
  };
}
