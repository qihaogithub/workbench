import { NextRequest, NextResponse } from "next/server";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { resolveUserWithSource } from "@/lib/comment-auth";
import { searchCommentParticipants, registerCommentParticipant } from "@/lib/comment-participants";
import { anonymousIpDigest, consumeAnonymousParticipantSearch } from "@/lib/dingtalk-comment-notifications";
type Params = { params: Promise<{ projectId: string }> };
export async function GET(request: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const resolved = await resolveUserWithSource(request);
  const isAuthorSession = resolved?.source === "cookie";
  const q = request.nextUrl.searchParams.get("q") || "";
  if (!isAuthorSession && q.trim().length < 1) return NextResponse.json(createApiError("VALIDATION_ERROR", "q 至少一个字符"), { status: 400 });
  if (!isAuthorSession && !consumeAnonymousParticipantSearch(projectId, anonymousIpDigest(request))) {
    return NextResponse.json(createApiError("RATE_LIMITED", "参与者搜索过于频繁或缺少可信客户端 IP"), { status: 429 });
  }
  return NextResponse.json(createApiSuccess({ participants: searchCommentParticipants(projectId, q, isAuthorSession) }));
}
export async function POST(request: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const resolved = await resolveUserWithSource(request);
  if (resolved?.source !== "cookie") return NextResponse.json(createApiError("FORBIDDEN", "需要创作端登录"), { status: 403 });
  const participant = registerCommentParticipant(projectId, resolved.user.userId);
  if (!participant) return NextResponse.json(createApiError("VALIDATION_ERROR", "未绑定钉钉身份"), { status: 400 });
  return NextResponse.json(createApiSuccess({ participant }));
}
