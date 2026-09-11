import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  getFigmaOAuthHandoffSecret,
  redeemFigmaOAuthHandoff,
} from "@/lib/figma-oauth-handoff";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";

function addPrivateResponseHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function secretsMatch(received: string | null): boolean {
  if (!received) return false;
  const expected = Buffer.from(getFigmaOAuthHandoffSecret(), "utf8");
  const actual = Buffer.from(received, "utf8");
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!secretsMatch(request.headers.get("x-figma-oauth-handoff-secret"))) {
      return addPrivateResponseHeaders(
        NextResponse.json(
          createApiError("UNAUTHORIZED", "Figma OAuth handoff unauthorized"),
          { status: 401 },
        ),
      );
    }

    const body = await request.json().catch(() => null) as {
      ticket?: unknown;
      targetId?: unknown;
      nonce?: unknown;
    } | null;
    if (
      !body ||
      typeof body.ticket !== "string" ||
      typeof body.targetId !== "string" ||
      typeof body.nonce !== "string" ||
      !body.ticket ||
      !body.targetId ||
      !body.nonce
    ) {
      return addPrivateResponseHeaders(
        NextResponse.json(
          createApiError("INVALID_REQUEST", "Figma OAuth handoff 参数无效"),
          { status: 400 },
        ),
      );
    }

    const handoff = redeemFigmaOAuthHandoff({
      ticket: body.ticket,
      targetId: body.targetId,
      nonce: body.nonce,
    });
    return addPrivateResponseHeaders(
      NextResponse.json(createApiSuccess(handoff)),
    );
  } catch {
    return addPrivateResponseHeaders(
      NextResponse.json(
        createApiError("UNAUTHORIZED", "Figma OAuth handoff 无效或已过期"),
        { status: 401 },
      ),
    );
  }
}
