import { NextRequest, NextResponse } from "next/server";
import type { PageTransferResolution } from "@workbench/shared";

import {
  authorizeBrowser,
  authorizeInternal,
  type TransferAuthorization,
} from "./authorization";
import {
  executePageTransfer,
  getPageTransfer,
  preparePageTransfer,
  revokePageReference,
} from "./index";
import type { PageTransferPrepareInput } from "./types";

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

function errorStatus(code: string): number {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code.includes("NOT_FOUND")) return 404;
  if (code.includes("CONFLICT") || code === "WORKSPACE_STALE") return 409;
  return 400;
}

function bad(error: unknown) {
  const value = error as { code?: unknown; message?: unknown };
  const code =
    typeof value?.code === "string" ? value.code : "PAGE_TRANSFER_FAILED";
  const message =
    typeof value?.message === "string" ? value.message : "页面转移失败";
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status: errorStatus(code) },
  );
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json().catch(() => ({}));
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function authorized(
  value: TransferAuthorization | NextResponse,
): value is TransferAuthorization {
  return !(value instanceof NextResponse);
}

async function authorize(
  request: NextRequest,
  targetProjectId: string,
  internal: boolean,
) {
  return internal
    ? authorizeInternal(request, targetProjectId)
    : authorizeBrowser(request);
}

export async function prepareRoute(
  request: NextRequest,
  targetProjectId: string,
  internal: boolean,
) {
  const auth = await authorize(request, targetProjectId, internal);
  if (!authorized(auth)) return auth;
  const value = await requestBody(request);
  if (
    typeof value.sourceProjectId !== "string" ||
    !Array.isArray(value.sourcePageIds) ||
    (value.mode !== "copy" && value.mode !== "reference") ||
    typeof value.idempotencyKey !== "string"
  ) {
    return bad(
      Object.assign(
        new Error(
          "sourceProjectId、sourcePageIds、mode、idempotencyKey 参数无效",
        ),
        { code: "INVALID_REQUEST" },
      ),
    );
  }
  try {
    return ok(
      await preparePageTransfer({
        targetProjectId,
        actor: auth.actor,
        body: value as unknown as PageTransferPrepareInput,
      }),
      201,
    );
  } catch (error) {
    return bad(error);
  }
}

export async function executeRoute(
  request: NextRequest,
  targetProjectId: string,
  internal: boolean,
  transferId?: string,
) {
  const auth = await authorize(request, targetProjectId, internal);
  if (!authorized(auth)) return auth;
  const value = await requestBody(request);
  const jobId =
    transferId ??
    (typeof value.transferId === "string" ? value.transferId : undefined);
  if (!jobId)
    return bad(
      Object.assign(new Error("transferId 参数必填"), {
        code: "INVALID_REQUEST",
      }),
    );
  try {
    return ok(
      await executePageTransfer({
        transferId: jobId,
        targetProjectId,
        actor: auth.actor,
        sessionId:
          typeof value.sessionId === "string"
            ? value.sessionId
            : (request.headers.get("x-agent-session-id") ?? undefined),
        resolutions: Array.isArray(value.resolutions)
          ? (value.resolutions as PageTransferResolution[])
          : [],
      }),
    );
  } catch (error) {
    return bad(error);
  }
}

export async function statusRoute(
  request: NextRequest,
  targetProjectId: string,
  transferId: string,
  internal: boolean,
) {
  const auth = await authorize(request, targetProjectId, internal);
  if (!authorized(auth)) return auth;
  try {
    return ok(
      await getPageTransfer({ transferId, targetProjectId, actor: auth.actor }),
    );
  } catch (error) {
    return bad(error);
  }
}

export async function revokeRoute(
  request: NextRequest,
  targetProjectId: string,
  grantId: string,
  internal: boolean,
) {
  const auth = await authorize(request, targetProjectId, internal);
  if (!authorized(auth)) return auth;
  try {
    return ok(
      revokePageReference({ grantId, targetProjectId, actor: auth.actor }),
    );
  } catch (error) {
    return bad(error);
  }
}
