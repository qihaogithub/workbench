import * as fs from "fs";
import crypto from "crypto";
import * as path from "path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from "./permissions";
import { resolveVirtualKnowledgeFile } from "./virtual-knowledge";
import { truncateHead, formatSize, type TruncationResult } from "./truncate";
import {
  formatRuntimeValidationInstruction,
  validatePreviewFileWrite,
} from "./preview-validation";
import {
  resolveLiveWorkspaceMutationContext,
  WorkspaceMutationAuthorityError,
} from "../../workspace/workspace-mutation-authority";
import { getHocuspocusCollabServer } from "../../collab/hocuspocus-server";
import { resolveCollabResourceKind } from "../../collab/workspace-file-persistence";

/**
 * 知识库文档路径正则：匹配 knowledge/ 下的 .md/.markdown/.mdown 文件
 */
const KNOWLEDGE_DOC_PATTERN = /^knowledge\/[^/]+\.(md|markdown|mdown)$/i;
const MANIFEST_PATH = "knowledge/manifest.json";

/**
 * 当 writeFile 创建新的 knowledge/*.md 文件时，透明同步 manifest.json。
 * 这是 writeFile 的副作用，AI 无需感知 manifest 更新。
 *
 * 返回 true 表示 manifest 同步成功，false 表示跳过（非知识库路径或非新建文件）。
 */
async function syncKnowledgeManifest(
  liveWorkspace: NonNullable<ReturnType<typeof resolveLiveWorkspaceMutationContext>>,
  snapshot: { resources: Record<string, string> },
  receiptRevision: number,
  docPath: string,
  docContent: string,
  sessionId?: string,
): Promise<boolean> {
  // 读取当前 manifest
  const manifestRaw = snapshot.resources[MANIFEST_PATH];
  let manifest: { version: number; items: Array<Record<string, unknown>> };
  try {
    manifest = manifestRaw
      ? JSON.parse(manifestRaw)
      : { version: 1, items: [] };
  } catch {
    manifest = { version: 1, items: [] };
  }

  const fileName = docPath.split("/").pop() || docPath;
  const title = fileName.replace(/\.(md|markdown|mdown)$/i, "");
  const now = new Date().toISOString();

  const newItem = {
    id: `kb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    source: "user",
    description: title,
    fileName,
    addedAt: now,
    updatedAt: now,
    sizeBytes: Buffer.byteLength(docContent, "utf-8"),
  };

  manifest.items.push(newItem);

  await liveWorkspace.authority.mutate({
    mutationId: crypto.randomUUID(),
    projectId: liveWorkspace.projectId,
    workspaceId: liveWorkspace.workspaceId,
    sessionId,
    baseRevision: receiptRevision,
    actor: "ai",
    reason: "knowledge_document_manifest_sync",
    operations: [
      {
        type: "put_text",
        path: MANIFEST_PATH,
        content: JSON.stringify(manifest, null, 2),
      },
    ],
  });

  return true;
}

const ReadFileParams = Type.Object({
  path: Type.String({ description: "Relative path to the file to read" }),
  offset: Type.Optional(
    Type.Number({
      description:
        "Line number to start reading from (1-based, default: 1). Use for paginating large files.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description:
        "Maximum number of lines to read (default: 2000). Use with offset to paginate.",
    }),
  ),
});
type ReadFileParams = Static<typeof ReadFileParams>;

/**
 * 从 workspace-tree.json 快照中解析指定页面文件的 runtimeType。
 * 用于 writeFile 校验时判断页面是否为原型页，非原型页运行时跳过原型校验。
 */
function resolvePageRuntimeType(
  filePath: string,
  resources: Record<string, string> | undefined,
): string | undefined {
  const match = filePath.match(/^demos\/([^/]+)\//u);
  if (!match) return undefined;
  const pageId = match[1];
  const treeContent = resources?.['workspace-tree.json'];
  if (!treeContent) return undefined;
  try {
    const tree = JSON.parse(treeContent) as { pages?: Array<{ id: string; runtimeType?: string }> };
    const page = tree.pages?.find((p) => p.id === pageId);
    return page?.runtimeType;
  } catch {
    return undefined;
  }
}

export function createReadFileTool(
  config: AgentConfig,
): AgentTool<typeof ReadFileParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: "readFile",
    label: "Read File",
    description:
      "Read the contents of a file in the workspace. Supports offset/limit for paginating large files. Output is automatically truncated to 2000 lines or 50KB (whichever is reached first); use offset to continue reading.",
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
        let snapshot: Awaited<
          ReturnType<
            NonNullable<typeof liveWorkspace>["authority"]["getSnapshot"]
          >
        > | null = null;
        let driftRetryCount = 0;
        for (;;) {
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
              driftRetryCount === 0
            ) {
              driftRetryCount++;
              logger.info(
                { path: args.path },
                "readFile: EXTERNAL_DRIFT detected, reconciling and retrying",
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
        let content: string | undefined;
        let fromAuthority = false;
        let authorityRevision: number | undefined;
        let authorityHash: string | undefined;
        if (snapshot) {
          content = snapshot.resources[args.path];
          if (content !== undefined) {
            fromAuthority = true;
            authorityRevision = snapshot.state.revision;
            authorityHash = snapshot.state.resourceHashes[args.path];
          }
        }
        if (content === undefined && !snapshot) {
          content = await fs.promises.readFile(filePath, "utf-8");
        }
        if (content === undefined) {
          // File not found in Authority snapshot; try filesystem as fallback
          try {
            content = await fs.promises.readFile(filePath, "utf-8");
            logger.debug(
              { path: args.path },
              "readFile: file not in Authority snapshot, read from filesystem",
            );
          } catch (fsError) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error reading file: ${args.path} is not found`,
                },
              ],
              details: { path: args.path, error: "WORKSPACE_RESOURCE_NOT_FOUND" },
              isError: true,
            };
          }
        }

        // Apply offset/limit pagination
        const offset = args.offset && args.offset > 0 ? args.offset : 1;
        const limit = args.limit && args.limit > 0 ? args.limit : 2000;
        const allLines = content.split("\n");
        // Remove trailing empty line from final newline
        if (content.endsWith("\n")) allLines.pop();
        const totalLines = allLines.length;
        const startIdx = Math.min(offset - 1, totalLines);
        const endIdx = Math.min(startIdx + limit, totalLines);
        const paginatedContent = allLines.slice(startIdx, endIdx).join("\n");

        // Apply truncation (head truncation — keep the beginning of the paginated range)
        const truncResult: TruncationResult = truncateHead(paginatedContent, {
          maxLines: limit,
        });

        let outputText: string;
        const startLineDisplay = startIdx + 1;
        const endLineDisplay = startIdx + truncResult.outputLines;

        if (truncResult.firstLineExceedsLimit) {
          outputText = `[Line ${startLineDisplay} is ${formatSize(Buffer.byteLength(allLines[startIdx] ?? "", "utf-8"))}, exceeds ${formatSize(truncResult.maxBytes)} limit. Use bash: sed -n '${startLineDisplay}p' ${args.path} | head -c ${truncResult.maxBytes}]`;
        } else {
          outputText = truncResult.content;
          if (truncResult.truncated || endIdx < totalLines) {
            const nextOffset = startIdx + truncResult.outputLines + 1;
            outputText += `\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalLines}. Use offset=${nextOffset} to continue.]`;
          }
        }

        logger.debug({ path: args.path }, "File read successfully");
        return {
          content: [{ type: "text", text: outputText }],
          details: {
            path: args.path,
            size: content.length,
            totalLines,
            offset: startLineDisplay,
            limit,
            outputLines: truncResult.outputLines,
            truncated: truncResult.truncated || endIdx < totalLines,
            ...(fromAuthority
              ? {
                  revision: authorityRevision!,
                  hash: authorityHash,
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
    description:
      "Create a new file or completely overwrite an existing file with the given content. The content parameter must be the full file content, not a combination of old and new content. Prefer editFile for targeted modifications to existing files.",
    parameters: WriteFileParams,
    execute: async (toolCallId: string, args: WriteFileParams) => {
      // 归一化路径：去除前导 ./ 或 /，确保后续所有路径处理（snapshot 查找、collab room、Authority）一致
      args = { ...args, path: args.path.replace(/^\.?\//, "") };
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
        let snapshot;
        let snapshotDriftRetry = 0;
        for (;;) {
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
                "writeFile getSnapshot: EXTERNAL_DRIFT, reconciling",
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
        const existing = snapshot
          ? (snapshot.resources[args.path] ?? null)
          : await fs.promises.readFile(filePath, "utf-8").catch(() => null);

        let receipt;
        if (liveWorkspace) {
          const resourceKind = resolveCollabResourceKind(args.path);
          let collabWriteSucceeded = false;
          if (resourceKind && config.sessionId) {
            // Yjs-First: route text writes through collab room for CRDT merging
            try {
              const writeResult = await getHocuspocusCollabServer().writeToResource(
                {
                  projectId: liveWorkspace.projectId,
                  workspaceId: liveWorkspace.workspaceId,
                  sessionId: config.sessionId,
                  resourcePath: args.path,
                  kind: resourceKind,
                },
                args.content,
              );
              receipt = {
                committed: true as const,
                mutationId: crypto.randomUUID(),
                projectId: liveWorkspace.projectId,
                workspaceId: liveWorkspace.workspaceId,
                baseRevision: snapshot!.state.revision,
                revision: writeResult.revision,
                rootHash: "",
                actor: "ai" as const,
                resources: [
                  {
                    path: args.path,
                    action: existing === null ? ("created" as const) : ("modified" as const),
                    beforeHash: existing
                      ? crypto.createHash("sha256").update(existing).digest("hex")
                      : null,
                    afterHash: writeResult.hash,
                  },
                ],
                committedAt: Date.now(),
              };
              collabWriteSucceeded = true;
            } catch (collabErr) {
              logger.warn(
                { path: args.path, err: String(collabErr) },
                "writeFile: collab room write failed, falling back to Authority",
              );
            }
          }
          if (!collabWriteSucceeded) {
            // Authority path (non-collab resource or collab room unavailable)
            let driftRetryCount = 0;
            for (;;) {
              try {
                receipt = await liveWorkspace.authority.mutate({
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
                });
                break;
              } catch (err) {
                if (
                  err instanceof WorkspaceMutationAuthorityError &&
                  err.code === "WORKSPACE_EXTERNAL_DRIFT" &&
                  driftRetryCount === 0
                ) {
                  driftRetryCount++;
                  logger.info(
                    { path: args.path },
                    "writeFile: EXTERNAL_DRIFT detected, reconciling and retrying",
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
          }
        } else {
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(filePath, args.content, "utf-8");
          receipt = null;
        }

        // 透明 manifest 同步：新建 knowledge/*.md 时自动更新 manifest.json
        let knowledgeDocumentCreated = false;
        if (
          liveWorkspace &&
          receipt &&
          existing === null &&
          KNOWLEDGE_DOC_PATTERN.test(args.path)
        ) {
          try {
            knowledgeDocumentCreated = await syncKnowledgeManifest(
              liveWorkspace,
              snapshot!,
              (receipt as { revision: number }).revision,
              args.path,
              args.content,
              config.sessionId,
            );
            if (knowledgeDocumentCreated) {
              logger.info(
                { path: args.path, manifestPath: MANIFEST_PATH },
                "writeFile: knowledge manifest synced",
              );
            }
          } catch (manifestErr) {
            logger.warn(
              { path: args.path, err: String(manifestErr) },
              "writeFile: knowledge manifest sync failed (non-fatal)",
            );
          }
        }

        const runtimeValidation = validatePreviewFileWrite(
          args.path,
          args.content,
          resolvePageRuntimeType(args.path, snapshot?.resources),
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
            knowledgeDocumentCreated,
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
        const reason =
          config.workingDir
            ? `path "${args.path || "."}" is not allowed by workspace permissions`
            : "working directory not configured; please open a project editing session first";
        logger.warn(
          { path: args.path || ".", hasWorkingDir: !!config.workingDir },
          `listFiles denied: ${reason}`,
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${reason}`,
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
        let snapshot;
        let driftRetryCount = 0;
        for (;;) {
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
              driftRetryCount === 0
            ) {
              driftRetryCount++;
              logger.info(
                { path: args.path || "." },
                "listFiles: EXTERNAL_DRIFT detected, reconciling and retrying",
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
          if (seen.size > 0) {
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
              content: [{ type: "text", text: result }],
              details: {
                path: args.path || ".",
                entries: seen.size,
                revision: snapshot.state.revision,
              },
            };
          }
          logger.debug(
            { path: args.path || "." },
            "Authority snapshot has no resources for this path, falling back to filesystem",
          );
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
