import type { FastifyReply } from "fastify";

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export function sendApiSuccess<T>(reply: FastifyReply, data: T): FastifyReply {
  return reply.send({
    success: true,
    data,
  });
}

export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  error: ApiErrorPayload,
): FastifyReply {
  return reply.code(statusCode).send({
    success: false,
    error,
  });
}
