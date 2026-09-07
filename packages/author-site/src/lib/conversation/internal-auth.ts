import crypto from "crypto";
import { NextResponse } from "next/server";
import { createApiError } from "@/lib/fs-utils";

function tokenMatches(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function requireConversationInternalToken(request: Request): NextResponse | null {
  const expected = process.env.INTERNAL_API_TOKEN?.trim();
  const received = request.headers.get("x-internal-token")?.trim() ?? "";
  if (!expected) {
    return NextResponse.json({
      success: false as const,
      error: { code: "INTERNAL_API_UNAVAILABLE", message: "内部服务令牌未配置" },
    }, { status: 503 });
  }
  if (!received || !tokenMatches(received, expected)) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "内部服务令牌无效"), { status: 401 });
  }
  return null;
}
