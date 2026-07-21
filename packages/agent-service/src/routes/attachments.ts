import type { FastifyInstance } from "fastify";

import {
  AI_ATTACHMENT_MAX_FILE_SIZE,
  AttachmentUploadError,
  saveUploadedFileAttachment,
} from "../utils/save-uploaded-file-attachment";
import { sendApiError, sendApiSuccess } from "./api-response";

export async function registerAttachmentRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post<{ Params: { sessionId: string } }>(
    "/api/agent/:sessionId/attachments",
    async (request, reply) => {
      try {
        const file = await request.file({
          limits: { files: 1, fileSize: AI_ATTACHMENT_MAX_FILE_SIZE },
        });
        if (!file) {
          return sendApiError(reply, 400, {
            code: "INVALID_REQUEST",
            message: "请提供文件",
          });
        }
        const attachment = await saveUploadedFileAttachment({
          sessionId: request.params.sessionId,
          filename: file.filename,
          mimeType: file.mimetype,
          buffer: await file.toBuffer(),
        });
        return sendApiSuccess(reply, attachment);
      } catch (error) {
        if (error instanceof AttachmentUploadError) {
          return sendApiError(reply, error.status, {
            code: error.code,
            message: error.message,
          });
        }
        const errorCode =
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : "";
        const isLimitError =
          errorCode === "FST_REQ_FILE_TOO_LARGE" ||
          (error instanceof Error && error.message.toLowerCase().includes("file too large"));
        return sendApiError(reply, isLimitError ? 413 : 500, {
          code: isLimitError ? "FILE_TOO_LARGE" : "ATTACHMENT_UPLOAD_FAILED",
          message: isLimitError ? "文件大小超过 20MB 限制" : "文件上传失败",
        });
      }
    },
  );
}
