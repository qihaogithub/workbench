import type { FastifyInstance } from "fastify";

import {
  AI_ATTACHMENT_MAX_FILE_SIZE,
  AttachmentUploadError,
  deleteUploadedFileAttachment,
  readUploadedFileAttachment,
  saveUploadedFileAttachment,
} from "../utils/uploaded-file-attachments";
import { getSessionAuthorizations } from "../config/session-authorizations";
import { sendApiError, sendApiSuccess } from "./api-response";

export async function registerAttachmentRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post<{ Params: { sessionId: string }; Querystring: { projectId?: string } }>(
    "/api/agent/:sessionId/attachments",
    async (request, reply) => {
      try {
        const projectId = request.query.projectId;
        if (!projectId) {
          return sendApiError(reply, 400, {
            code: "INVALID_REQUEST",
            message: "缺少 projectId 参数",
          });
        }
        const authorization = getSessionAuthorizations().get(
          request.params.sessionId,
          projectId,
        );
        if (!authorization) {
          return sendApiError(reply, 403, {
            code: "FORBIDDEN",
            message: "Session 未获得当前项目的附件上传授权",
          });
        }

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
          projectId,
          ownerUserId: authorization.userId,
          conversationId: request.params.sessionId,
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

  fastify.delete<{
    Params: { sessionId: string; attachmentId: string };
    Querystring: { projectId?: string };
  }>(
    "/api/agent/:sessionId/attachments/:attachmentId",
    async (request, reply) => {
      try {
        const projectId = request.query.projectId;
        if (!projectId) {
          return sendApiError(reply, 400, {
            code: "INVALID_REQUEST",
            message: "缺少 projectId 参数",
          });
        }
        const authorization = getSessionAuthorizations().get(
          request.params.sessionId,
          projectId,
        );
        if (!authorization) {
          return sendApiError(reply, 403, {
            code: "FORBIDDEN",
            message: "Session 未获得当前项目的附件删除授权",
          });
        }
        const stored = await readUploadedFileAttachment(
          projectId,
          request.params.attachmentId,
        );
        if (
          stored.metadata.ownerUserId !== authorization.userId ||
          stored.metadata.conversationId !== request.params.sessionId
        ) {
          return sendApiError(reply, 403, {
            code: "FORBIDDEN",
            message: "无权删除其他对话的附件",
          });
        }
        await deleteUploadedFileAttachment(projectId, request.params.attachmentId);
        return sendApiSuccess(reply, { deleted: true });
      } catch (error) {
        return sendApiError(reply, 500, {
          code: "ATTACHMENT_DELETE_FAILED",
          message: error instanceof Error ? error.message : "删除附件失败",
        });
      }
    },
  );
}
