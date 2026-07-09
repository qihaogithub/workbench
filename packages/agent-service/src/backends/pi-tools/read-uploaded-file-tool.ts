import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";
import { readUploadedFileAttachment } from "../../utils/uploaded-file-attachments";

const ReadUploadedFileParams = Type.Object({
  attachmentId: Type.String({ description: "Uploaded file attachment id from the current user message" }),
  startLine: Type.Optional(Type.Number({ description: "Start line number (1-based, inclusive). Defaults to 1", minimum: 1 })),
  endLine: Type.Optional(Type.Number({ description: "End line number (1-based, inclusive). Defaults to last line", minimum: 1 })),
});
type ReadUploadedFileParams = Static<typeof ReadUploadedFileParams>;

export function createReadUploadedFileTool(
  config: AgentConfig,
): AgentTool<typeof ReadUploadedFileParams> {
  return {
    name: "readUploadedFile",
    label: "Read Uploaded File",
    description:
      "Read text extracted from a user-uploaded file attachment in the current AI session. Use this for PDFs, DOCX, CSV, markdown, JSON, code, and text files uploaded with the user's message.",
    parameters: ReadUploadedFileParams,
    execute: async (_toolCallId: string, args: ReadUploadedFileParams) => {
      if (!config.sessionId) {
        return {
          content: [{ type: "text", text: "Error: sessionId is required to read uploaded files." }],
          details: { error: "missing sessionId" },
          isError: true,
        };
      }

      try {
        const { metadata, text } = await readUploadedFileAttachment(
          config.sessionId,
          args.attachmentId,
        );
        if (!metadata.textExtracted || !text.trim()) {
          return {
            content: [{
              type: "text",
              text: `Error: uploaded file "${metadata.name}" does not have extractable text.`,
            }],
            details: { attachmentId: args.attachmentId, name: metadata.name, error: "no extracted text" },
            isError: true,
          };
        }

        const lines = text.split("\n");
        const totalLines = lines.length;
        const start = Math.max(1, args.startLine ?? 1);
        const end = Math.min(totalLines, args.endLine ?? totalLines);
        if (start > end) {
          return {
            content: [{
              type: "text",
              text: `Error: invalid line range (start=${args.startLine}, end=${args.endLine}). File has ${totalLines} lines.`,
            }],
            details: { attachmentId: args.attachmentId, totalLines, error: "invalid range" },
            isError: true,
          };
        }

        const selected = lines
          .slice(start - 1, end)
          .map((line, index) => `${start + index}->${line}`)
          .join("\n");
        const header = [
          `Uploaded file: ${metadata.name}`,
          `Attachment ID: ${metadata.id}`,
          `MIME: ${metadata.mimeType}`,
          `Lines: ${totalLines}, showing ${start}-${end}`,
          metadata.truncated ? "Note: extracted text was truncated during upload." : "",
        ].filter(Boolean).join("\n");

        logger.debug(
          { attachmentId: args.attachmentId, startLine: start, endLine: end },
          "Uploaded file attachment read successfully",
        );

        return {
          content: [{ type: "text", text: `${header}\n\n${selected}` }],
          details: {
            attachmentId: args.attachmentId,
            name: metadata.name,
            totalLines,
            startLine: start,
            endLine: end,
            truncated: metadata.truncated,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.warn({ attachmentId: args.attachmentId, error: message }, "Failed to read uploaded file");
        return {
          content: [{ type: "text", text: `Error reading uploaded file: ${message}` }],
          details: { attachmentId: args.attachmentId, error: message },
          isError: true,
        };
      }
    },
  };
}
