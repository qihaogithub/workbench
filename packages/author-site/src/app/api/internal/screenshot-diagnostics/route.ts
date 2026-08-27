import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { appendServerEditorDiagnosticEvent } from "@/lib/editor-diagnostics/store";

function tokenMatches(received: string | null, expected: string): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export async function POST(request: NextRequest) {
  if (!tokenMatches(request.headers.get("x-screenshot-diagnostics-token"), process.env.SCREENSHOT_DIAGNOSTICS_TOKEN ?? "")) {
    return NextResponse.json(createApiError("FORBIDDEN"), { status: 403 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.projectId !== "string" ||
    typeof body.batchId !== "string" ||
    !["completed", "cancelled"].includes(String(body.status)) ||
    !isCount(body.total) || !isCount(body.completed) || !isCount(body.failed) || !isCount(body.cached) || !isCount(body.sandboxPageCount)
  ) {
    return NextResponse.json(createApiError("INVALID_REQUEST"), { status: 400 });
  }
  const errorsByCode = body.errorsByCode && typeof body.errorsByCode === "object"
    ? Object.fromEntries(Object.entries(body.errorsByCode).filter(([, count]) => isCount(count)))
    : {};
  appendServerEditorDiagnosticEvent({
    level: body.failed > 0 || body.status === "cancelled" ? "warn" : "info",
    eventGroup: "preview",
    eventType: body.failed > 0 || body.status === "cancelled" ? "sandbox.screenshot.failed" : "sandbox.screenshot.completed",
    projectId: body.projectId,
    payload: {
      batchIdHash: crypto.createHash("sha256").update(body.batchId).digest("hex"),
      total: body.total,
      completed: body.completed,
      failed: body.failed,
      cached: body.cached,
      sandboxPageCount: body.sandboxPageCount,
      errorsByCode,
    },
  });
  return NextResponse.json(createApiSuccess({ recorded: true }));
}
